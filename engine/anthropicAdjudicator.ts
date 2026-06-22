import { createHash } from "node:crypto";
import type { Part, Archetype } from "./types";
import type { Adjudicator, AdjudicationVerdict } from "./adjudicator";

export interface AdjudicatorDeps {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  catalogVersion?: string;
  cache?: { get(h: string): Promise<AdjudicationVerdict | null>; set(h: string, v: AdjudicationVerdict): Promise<void> };
  // Context that makes the model smarter — all sent as a CACHED prompt prefix.
  catalog?: Archetype[]; // the real MOC products to choose from
  aliases?: Record<string, string[]>; // bare# -> dealer names (from approved mappings)
  examples?: { name: string; barePartNumber: string }[]; // few-shot: dealer name -> bare#
}

export function contentHash(part: Part, catalogVersion: string): string {
  return createHash("sha256").update(`${part.sku}|${part.partName}|${catalogVersion}`).digest("hex");
}

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
          ? { sku: part.sku, matched: !!v.matched, mocPartNumber: v.mocPartNumber ?? null, confidence: v.confidence ?? null, reason: v.reason ?? "" }
          : { sku: part.sku, matched: false, mocPartNumber: null, confidence: null, reason: "No verdict returned" };
        out[toAsk[k].i] = verdict;
        if (this.deps.cache && v) await this.deps.cache.set(contentHash(part, cv), verdict);
      }
    }

    return out.map(
      (v, i) => v ?? { sku: parts[i].sku, matched: false, mocPartNumber: null, confidence: null, reason: "No verdict" }
    );
  }

  // Static context (instructions + catalog + aliases + examples). Sent as a cached
  // prefix so the big catalog block is billed at ~10% after the first call.
  private buildContext(): string {
    const catalog = this.deps.catalog ?? [];
    const aliases = this.deps.aliases ?? {};
    const examples = this.deps.examples ?? [];

    const catLines = catalog
      .map((a) => {
        const al = aliases[a.barePartNumber];
        const alStr = al && al.length ? ` | dealers call it: ${al.slice(0, 6).join(" / ")}` : "";
        return `${a.barePartNumber} | ${a.manufacturerPart}${alStr}`;
      })
      .join("\n");

    const exLines = examples
      .slice(0, 14)
      .map((e) => `"${e.name}" → ${e.barePartNumber}`)
      .join("\n");

    return [
      "You are an automotive parts matching expert for MOC Products (a distributor of automotive chemicals, fluids, cleaners and service kits).",
      "For each dealer DMS part, decide if it is one of the MOC PRODUCTS listed below.",
      "The part number is the primary signal (~70%); the DMS name supports it (~30%). A matching name on a clearly-wrong number is UNMATCHED.",
      "Dealers use their own short/abbreviated names — use the aliases and examples to recognize them.",
      "If a part is a mechanical/OEM component (sensor, element, bracket, filter, assembly, lamp, gasket, bearing, valve, etc.) it is NOT a MOC product unless both the number AND the name clearly match a chemical/kit product.",
      "Return mocPartNumber as the exact bare number from the catalog, or null if there is no good match. Prefer null over a low-confidence guess.",
      "",
      catalog.length ? "MOC PRODUCTS (bare# | name | aliases):\n" + catLines : "",
      exLines ? "\nEXAMPLES (dealer DMS name → MOC bare#):\n" + exLines : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private async callApi(parts: Part[]): Promise<any[]> {
    const f = this.deps.fetchImpl ?? fetch;
    const partsList = parts
      .map((p, idx) => `${idx + 1}. SKU: ${p.sku} | Bare#: ${p.barePartNumber} | Structure: ${p.structural.label} | DMS Name: ${p.partName}`)
      .join("\n");

    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await f("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": this.deps.apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: this.deps.model,
            max_tokens: 4000,
            tools: [TOOL],
            tool_choice: { type: "tool", name: "classify" },
            // Cached prefix: instructions + catalog + aliases + examples.
            system: [{ type: "text", text: this.buildContext(), cache_control: { type: "ephemeral" } }],
            messages: [{ role: "user", content: "PARTS TO CLASSIFY (1-based index):\n" + partsList }],
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
