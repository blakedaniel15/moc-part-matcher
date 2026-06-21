import { createHash } from "node:crypto";
import type { Part } from "./types";
import type { Adjudicator, AdjudicationVerdict } from "./adjudicator";

export interface AdjudicatorDeps {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  catalogVersion?: string;
  cache?: { get(h: string): Promise<AdjudicationVerdict | null>; set(h: string, v: AdjudicationVerdict): Promise<void> };
}

export function contentHash(part: Part, catalogVersion: string): string {
  return createHash("sha256").update(`${part.sku}|${part.partName}|${catalogVersion}`).digest("hex");
}

// Structured tool-use schema — the model is forced to call `classify` and return a
// typed array, so we never parse free-form text or strip ``` fences.
const TOOL = {
  name: "classify",
  description: "Return a classification verdict for each part.",
  input_schema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer" },
            matched: { type: "boolean" },
            mocPartNumber: { type: ["string", "null"] },
            confidence: { type: ["string", "null"], enum: ["HIGH", "MEDIUM", "LOW", null] },
            reason: { type: "string" },
          },
          required: ["index", "matched", "reason"],
        },
      },
    },
    required: ["results"],
  },
};

export class AnthropicAdjudicator implements Adjudicator {
  constructor(private deps: AdjudicatorDeps) {}

  async adjudicate(parts: Part[]): Promise<AdjudicationVerdict[]> {
    const cv = this.deps.catalogVersion ?? "v1";
    const out: (AdjudicationVerdict | null)[] = new Array(parts.length).fill(null);
    const toAsk: { i: number; part: Part }[] = [];

    if (this.deps.cache) {
      for (let i = 0; i < parts.length; i++) {
        const hit = await this.deps.cache.get(contentHash(parts[i], cv));
        if (hit) out[i] = { ...hit, sku: parts[i].sku };
        else toAsk.push({ i, part: parts[i] });
      }
    } else {
      parts.forEach((part, i) => toAsk.push({ i, part }));
    }

    if (toAsk.length) {
      const verdicts = await this.callApi(toAsk.map((t) => t.part));
      for (let k = 0; k < toAsk.length; k++) {
        const v = verdicts.find((x) => x.index === k + 1);
        const part = toAsk[k].part;
        const verdict: AdjudicationVerdict = v
          ? {
              sku: part.sku,
              matched: !!v.matched,
              mocPartNumber: v.mocPartNumber ?? null,
              confidence: v.confidence ?? null,
              reason: v.reason ?? "",
            }
          : { sku: part.sku, matched: false, mocPartNumber: null, confidence: null, reason: "No verdict returned" };
        out[toAsk[k].i] = verdict;
        if (this.deps.cache && v) await this.deps.cache.set(contentHash(part, cv), verdict);
      }
    }

    return out.map(
      (v, i) => v ?? { sku: parts[i].sku, matched: false, mocPartNumber: null, confidence: null, reason: "No verdict" }
    );
  }

  private async callApi(parts: Part[]): Promise<any[]> {
    const f = this.deps.fetchImpl ?? fetch;
    const partsList = parts
      .map((p, idx) => `${idx + 1}. SKU: ${p.sku} | Bare#: ${p.barePartNumber} | Structure: ${p.structural.label} | DMS Name: ${p.partName}`)
      .join("\n");
    const prompt =
      "You are an automotive parts matching expert for MOC Products. For each part, decide if it matches a MOC product archetype. " +
      "Part number is the primary signal (~70%); the name supports it (~30%). A matching name on a wrong number is UNMATCHED. " +
      "Use the classify tool. Use a 1-based index per part.\n\nPARTS:\n" + partsList;

    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await f("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": this.deps.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: this.deps.model,
            max_tokens: 4000,
            tools: [TOOL],
            tool_choice: { type: "tool", name: "classify" },
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!(res as any).ok) throw new Error(`HTTP ${(res as any).status}`);
        const data = await (res as any).json();
        const block = (data.content || []).find((c: any) => c.type === "tool_use");
        return block?.input?.results ?? [];
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      }
    }
    throw lastErr;
  }
}
