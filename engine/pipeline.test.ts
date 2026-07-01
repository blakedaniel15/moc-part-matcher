import { describe, it, expect, vi } from "vitest";
import { runPipeline } from "./pipeline";
import { RecordedAdjudicator } from "./adjudicator";
import { RecordedEmbedder } from "./embedder";
import { WellRetriever } from "./retriever";
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

  it("retrieval fast-paths a confident semantic match, skipping the AI", async () => {
    // Candidate embeds identical to a confirmed 04461 well-member -> retrieval match,
    // and the AI is never consulted (it would have said no).
    const embedder = new RecordedEmbedder({ "SHYFT TRANSMISSION ADDITIVE": [1, 0, 0] });
    const well = [{ barePartNumber: "04461", embedding: [1, 0, 0] }];
    const retriever = new WellRetriever({ embedder, well, config: { floor: 0.6, strong: 0.8, margin: 0.1 } });
    const adj = new RecordedAdjudicator({}); // no verdicts -> would be UNMATCHED without retrieval
    const adjSpy = vi.spyOn(adj, "adjudicate");
    const [r] = await runPipeline([mk("NOVEL1", "NOVEL1", "SHYFT TRANSMISSION ADDITIVE")], { ...ctx(adj), retriever });
    expect(r).toMatchObject({ matchType: "AI", matchedPartNumber: "04461", confidence: "HIGH" });
    expect(adjSpy).not.toHaveBeenCalled(); // fast-pathed before the AI
  });

  it("AI-uncertain unmatched (chemical) => review; confident/mechanical unmatched clears its confidence", async () => {
    const adj = new RecordedAdjudicator({
      Z1: { sku: "Z1", matched: false, mocPartNumber: null, confidence: "MEDIUM", reason: "unsure" }, // hesitated
      Z2: { sku: "Z2", matched: false, mocPartNumber: null, confidence: "HIGH", reason: "clearly not" }, // confident no
    });
    const res = await runPipeline([mk("Z1", "Z1", "FUEL SYSTEM TREATMENT"), mk("Z2", "Z2", "WIPER BLADE")], ctx(adj));
    const z1 = res.find((r) => r.sku === "Z1")!;
    const z2 = res.find((r) => r.sku === "Z2")!;
    expect(z1).toMatchObject({ matchType: "AI", confidence: "LOW" }); // surfaced as a possible miss
    expect(z2).toMatchObject({ matchType: "UNMATCHED", confidence: null }); // no misleading score
  });
});
