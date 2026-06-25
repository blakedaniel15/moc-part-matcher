import type { Part } from "../engine/types";

export function computeGap(parts: Part[], knownSkus: Set<string>): { gap: Part[]; knownCount: number } {
  const norm = (s: string) => s.trim().toUpperCase();
  const known = new Set([...knownSkus].map(norm));
  const gap = parts.filter((p) => !known.has(norm(p.sku)));
  return { gap, knownCount: parts.length - gap.length };
}
