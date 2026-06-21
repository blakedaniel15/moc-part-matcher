import { describe, it, expect, vi } from "vitest";
import { AnthropicAdjudicator, contentHash } from "./anthropicAdjudicator";
import type { Part } from "./types";

const part = (sku: string, name: string): Part => ({
  sku,
  partName: name,
  makeCode: null,
  barePartNumber: sku,
  dmsType: "CDK",
  structural: { score: 1, label: "POSSIBLE", detail: "" },
});

// Fake fetch returning a tool_use block the way the Messages API does.
const fakeFetch = (verdicts: any[]) =>
  vi.fn(async () => ({
    ok: true,
    json: async () => ({ content: [{ type: "tool_use", name: "classify", input: { results: verdicts } }] }),
  })) as any;

describe("AnthropicAdjudicator", () => {
  it("parses tool-use verdicts and maps by index", async () => {
    const adj = new AnthropicAdjudicator({
      apiKey: "k",
      model: "m",
      fetchImpl: fakeFetch([{ index: 1, matched: true, mocPartNumber: "04461", confidence: "HIGH", reason: "shyft" }]),
    });
    const out = await adj.adjudicate([part("X1", "SHYFT ATF")]);
    expect(out[0]).toMatchObject({ sku: "X1", matched: true, mocPartNumber: "04461", confidence: "HIGH" });
  });

  it("uses the cache when present (no fetch call)", async () => {
    const f = fakeFetch([]);
    const cached = { sku: "X1", matched: true, mocPartNumber: "04461", confidence: "HIGH" as const, reason: "c" };
    const cache = { get: vi.fn(async () => cached), set: vi.fn(async () => {}) };
    const adj = new AnthropicAdjudicator({ apiKey: "k", model: "m", fetchImpl: f, cache });
    const out = await adj.adjudicate([part("X1", "SHYFT")]);
    expect(out[0]).toMatchObject({ mocPartNumber: "04461" });
    expect(f).not.toHaveBeenCalled();
  });

  it("contentHash is stable for same input", () => {
    expect(contentHash(part("X1", "SHYFT"), "v1")).toBe(contentHash(part("X1", "SHYFT"), "v1"));
  });
});
