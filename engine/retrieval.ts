// Discriminative retrieval over "the well" — the retained embeddings of every
// confirmed variation, keyed by product (bare#). Two roles:
//   decideRetrieval  — a standalone positive matcher (confident fit -> match).
//   validateAgainst  — a veto: does a candidate resemble a PROPOSED product's
//                      members? If we have a well for it and the candidate is far
//                      from all of them, it's an off-distribution lookalike -> reject.
// Thresholds are calibrated on the eval set against the false-positive rate.

export interface Neighbor {
  barePartNumber: string; // which product this well-member belongs to
  similarity: number; // cosine similarity to the candidate, in [-1, 1]
}

export interface RetrievalConfig {
  floor: number; // min similarity for a member to count (tight neighborhood)
  strong: number; // best similarity at/above this (+ margin) => confident match
  margin: number; // required gap between the best product and the runner-up
}

export type RetrievalVerdict =
  | { decision: "match"; barePartNumber: string; confidence: "HIGH" | "MEDIUM"; score: number; margin: number }
  | { decision: "ambiguous"; candidates: { barePartNumber: string; score: number }[] } // -> AI, grounded
  | { decision: "none" }; // nothing resembles any known member -> defer to the existing path

// Best similarity per product among members that clear the floor, ranked.
export function rankProducts(neighbors: Neighbor[], floor: number): { barePartNumber: string; score: number }[] {
  const best = new Map<string, number>();
  for (const n of neighbors) {
    if (n.similarity < floor) continue;
    if (n.similarity > (best.get(n.barePartNumber) ?? -Infinity)) best.set(n.barePartNumber, n.similarity);
  }
  return [...best.entries()]
    .map(([barePartNumber, score]) => ({ barePartNumber, score }))
    .sort((a, b) => b.score - a.score);
}

export function decideRetrieval(neighbors: Neighbor[], cfg: RetrievalConfig): RetrievalVerdict {
  const ranked = rankProducts(neighbors, cfg.floor);
  if (ranked.length === 0) return { decision: "none" };
  const best = ranked[0];
  const margin = best.score - (ranked[1]?.score ?? 0);
  if (best.score >= cfg.strong && margin >= cfg.margin) {
    const conf: "HIGH" | "MEDIUM" = best.score >= cfg.strong + (1 - cfg.strong) / 2 ? "HIGH" : "MEDIUM";
    return { decision: "match", barePartNumber: best.barePartNumber, confidence: conf, score: best.score, margin };
  }
  return { decision: "ambiguous", candidates: ranked.slice(0, 3) };
}

// Validate a proposed match (from a fuzzy pass or the AI) against the proposed
// product's own well:
//   "unknown" — we have no confirmed members for that product yet; can't judge, don't veto.
//   "fits"    — the candidate is close to at least one confirmed member.
//   "outlier" — we DO have members and the candidate is far from all of them:
//               "we know what this product looks like, and this isn't it" -> veto.
export function validateAgainst(neighbors: Neighbor[], proposed: string, cfg: RetrievalConfig): "fits" | "outlier" | "unknown" {
  const forProduct = neighbors.filter((n) => n.barePartNumber === proposed);
  if (forProduct.length === 0) return "unknown";
  const bestForProduct = Math.max(...forProduct.map((n) => n.similarity));
  return bestForProduct >= cfg.floor ? "fits" : "outlier";
}
