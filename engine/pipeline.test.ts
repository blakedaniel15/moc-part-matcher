import { describe, it, expect } from "vitest";
import { runPipeline } from "./pipeline";
import { RecordedAdjudicator } from "./adjudicator";
import type { Part, Archetype, StructuralLabel } from "./types";

const catalog: Archetype[] = [
  { barePartNumber: "01071", manufacturerPart: "01071 - E-SHIELD, 8OZ", incentive: 5 },
  { barePartNumber: "04461", manufacturerPart: "04461 - SHYFT, 12OZ", incentive: 10 },
];
const mk = (sku: string, bare: string, name: string, score: 0 | 1 | 2 = 1): Part => ({
  sku,
  partName: name,
  makeCode: null,
  barePartNumber: bare,
  dmsType: "CDK",
  structural: {
    score,
    label: (score === 2 ? "STRONG" : score === 1 ? "POSSIBLE" : "UNLIKELY") as StructuralLabel,
    detail: "",
  },
});

const ctx = (adj = new RecordedAdjudicator({})) => ({
  catalog,
  approved: [],
  blockedSkus: [],
  dealerRejections: [],
  dealerBrand: "all" as const,
  adjudicator: adj,
});

describe("runPipeline", () => {
  it("canonical exact match", async () => {
    const [r] = await runPipeline([mk("01071", "01071", "E-SHIELD", 2)], ctx());
    expect(r).toMatchObject({ matchType: "EXACT", matchedPartNumber: "01071", confidence: "EXACT" });
  });
  it("fuzzy trailing suffix", async () => {
    const [r] = await runPipeline([mk("8888804461", "8888804461", "SHYFT")], ctx());
    expect(r).toMatchObject({ matchType: "FUZZY", matchedPartNumber: "04461" });
  });
  it("blocked SKU => UNMATCHED, never fuzzy", async () => {
    const c = { ...ctx(), blockedSkus: ["8888804461"] };
    const [r] = await runPipeline([mk("8888804461", "8888804461", "SHYFT")], c);
    expect(r.matchType).toBe("UNMATCHED");
  });
  it("AI verdict applied from adjudicator", async () => {
    const adj = new RecordedAdjudicator({
      CUSTOM9: { sku: "CUSTOM9", matched: true, mocPartNumber: "04461", confidence: "MEDIUM", reason: "name says shyft" },
    });
    const [r] = await runPipeline([mk("CUSTOM9", "CUSTOM9", "SHYFT ATF")], ctx(adj));
    expect(r).toMatchObject({ matchType: "AI", confidence: "MEDIUM", matchedPartNumber: "04461" });
  });
});
