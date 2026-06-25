import { describe, it, expect } from "vitest";
import { candidateRows } from "./candidate-export";
import type { MatchResult } from "../engine/types";

const r = (over: Partial<MatchResult>): MatchResult => ({
  sku: "S",
  partName: "N",
  makeCode: null,
  barePartNumber: "S",
  dmsType: "CDK",
  structural: { score: 1, label: "POSSIBLE", detail: "" },
  matchType: "FUZZY",
  matchedArchetype: "04461 - SHYFT, 12OZ",
  matchedPartNumber: "04461",
  confidence: "MEDIUM",
  reason: "",
  incentive: null,
  ...over,
});

describe("candidateRows", () => {
  it("shapes a row with the decision status", () => {
    const rows = candidateRows([r({ sku: "8888804461" })], { "8888804461": "approve" });
    expect(rows[0]).toMatchObject({
      "Dealer SKU": "8888804461",
      "Suggested MOC #": "04461",
      "Match Type": "FUZZY",
      Confidence: "MEDIUM",
      Status: "approved",
    });
  });
  it("uses 'needs review' when no decision", () => {
    expect(candidateRows([r({})], {})[0].Status).toBe("needs review");
  });
});
