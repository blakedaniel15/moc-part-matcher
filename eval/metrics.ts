import type { LabeledExample } from "./labels";

export interface Metrics {
  precision: number;
  recall: number;
  f1: number;
  truePos: number;
  falsePos: number;
  falseNeg: number;
}

export function computeMetrics(
  predicted: { sku: string; predictedBare: string | null }[],
  labels: LabeledExample[]
): Metrics {
  const predBy = new Map(predicted.map((p) => [p.sku, p.predictedBare]));
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const lab of labels) {
    const pred = predBy.get(lab.sku) ?? null;
    if (lab.expectedBare != null) {
      if (pred === lab.expectedBare) tp++;
      else fn++;
      if (pred != null && pred !== lab.expectedBare) fp++;
    } else {
      if (pred != null) fp++;
    }
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1, truePos: tp, falsePos: fp, falseNeg: fn };
}
