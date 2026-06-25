import { describe, it, expect } from "vitest";
import { computeGap } from "./gap";
import type { Part } from "../engine/types";

const p = (sku: string): Part => ({
  sku,
  partName: "X",
  makeCode: null,
  barePartNumber: sku,
  dmsType: "CDK",
  structural: { score: 1, label: "POSSIBLE", detail: "" },
});

describe("computeGap", () => {
  it("returns only SKUs not in the known set (case-insensitive)", () => {
    const { gap, knownCount } = computeGap([p("A1"), p("b2"), p("C3")], new Set(["a1", "B2"]));
    expect(gap.map((g) => g.sku)).toEqual(["C3"]);
    expect(knownCount).toBe(2);
  });
  it("empty known set => everything is gap (setup mode)", () => {
    const { gap } = computeGap([p("A1"), p("A2")], new Set());
    expect(gap).toHaveLength(2);
  });
});
