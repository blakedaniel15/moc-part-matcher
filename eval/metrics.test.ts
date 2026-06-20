import { describe, it, expect } from "vitest";
import { computeMetrics } from "./metrics";

describe("computeMetrics", () => {
  it("computes precision/recall/f1 on bare-number agreement", () => {
    const labels = [
      { sku: "A", partName: "", expectedBare: "01071" },
      { sku: "B", partName: "", expectedBare: "04461" },
      { sku: "C", partName: "", expectedBare: null },
    ];
    const predicted = [
      { sku: "A", predictedBare: "01071" }, // TP
      { sku: "B", predictedBare: null }, // FN
      { sku: "C", predictedBare: "06002" }, // FP
    ];
    const m = computeMetrics(predicted, labels);
    expect(m.truePos).toBe(1);
    expect(m.falseNeg).toBe(1);
    expect(m.falsePos).toBe(1);
    expect(m.precision).toBeCloseTo(0.5);
    expect(m.recall).toBeCloseTo(0.5);
  });
});
