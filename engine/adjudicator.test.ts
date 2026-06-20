import { describe, it, expect } from "vitest";
import { RecordedAdjudicator } from "./adjudicator";
import type { Part } from "./types";

const p = (sku: string): Part => ({
  sku,
  partName: "X",
  makeCode: null,
  barePartNumber: sku,
  dmsType: "CDK",
  structural: { score: 1, label: "POSSIBLE", detail: "" },
});

describe("RecordedAdjudicator", () => {
  it("returns recorded verdict by sku", async () => {
    const adj = new RecordedAdjudicator({
      A1: { sku: "A1", matched: true, mocPartNumber: "04461", confidence: "HIGH", reason: "rec" },
    });
    const out = await adj.adjudicate([p("A1")]);
    expect(out[0]).toMatchObject({ matched: true, mocPartNumber: "04461" });
  });
  it("defaults to unmatched when no record exists", async () => {
    const adj = new RecordedAdjudicator({});
    const out = await adj.adjudicate([p("ZZ")]);
    expect(out[0]).toMatchObject({ matched: false, mocPartNumber: null });
  });
});
