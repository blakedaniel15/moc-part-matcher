import { describe, it, expect } from "vitest";
import { computeStats, bucketOf, type DecisionRow } from "./stats";

const d = (sku: string, matchType: string | null, confidence: string | null, outcome: string, ts: string, runId = "r1"): DecisionRow => ({
  sku,
  matchType,
  confidence,
  outcome,
  runId,
  dealer: "Demo Dealer",
  ts,
});

describe("bucketOf", () => {
  it("classifies buckets", () => {
    expect(bucketOf({ matchType: "EXACT", confidence: "EXACT" })).toBe("matched");
    expect(bucketOf({ matchType: "AI", confidence: "MEDIUM" })).toBe("matched");
    expect(bucketOf({ matchType: "AI", confidence: "LOW" })).toBe("review");
    expect(bucketOf({ matchType: "UNMATCHED", confidence: null })).toBe("unmatched");
  });
});

describe("computeStats", () => {
  it("10 hits + 2 rescued => 10/12 identification rate", () => {
    const decisions: DecisionRow[] = [];
    for (let i = 0; i < 10; i++) decisions.push(d("M" + i, "EXACT", "EXACT", "approve", "2026-06-21T00:00:0" + i + "Z"));
    decisions.push(d("R1", "AI", "LOW", "approve", "2026-06-21T00:01:00Z")); // rescued from review
    decisions.push(d("U1", "UNMATCHED", null, "correct", "2026-06-21T00:02:00Z")); // rescued from unmatched
    const { overall, runs } = computeStats(decisions);
    expect(overall.hits).toBe(10);
    expect(overall.denominator).toBe(12);
    expect(overall.rate).toBeCloseTo(10 / 12);
    expect(runs).toHaveLength(1);
    expect(runs[0].rate).toBeCloseTo(10 / 12);
  });

  it("latest decision per sku wins; matched reject is a false positive", () => {
    const decisions: DecisionRow[] = [
      d("A", "FUZZY", "HIGH", "approve", "2026-06-21T00:00:00Z"),
      d("A", "FUZZY", "HIGH", "reject", "2026-06-21T00:05:00Z"), // changed mind -> reject wins
    ];
    const { overall } = computeStats(decisions);
    expect(overall.hits).toBe(0);
    expect(overall.falsePositives).toBe(1);
    expect(overall.denominator).toBe(0);
  });
});
