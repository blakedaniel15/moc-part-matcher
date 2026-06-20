import type { Part, Archetype, ApprovedMapping } from "./types";

const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "for", "with", "is", "it", "as", "at", "by", "kit", "moc",
]);

function nameTokens(name: string): Set<string> {
  return new Set(
    String(name)
      .toUpperCase()
      .split(/[\s\/,\-&.]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w.toLowerCase()) && !/^\d+$/.test(w))
  );
}

export function nameOverlap(n1: string, n2: string): number {
  const t1 = nameTokens(n1);
  const t2 = nameTokens(n2);
  if (!t1.size || !t2.size) return 1; // if either name is empty, don't penalise
  return [...t1].filter((w) => t2.has(w)).length;
}

export function exactMatch(
  part: Part,
  catalog: Archetype[],
  approved: ApprovedMapping[]
):
  | { kind: "approved"; archetype: Archetype | null; mapping: ApprovedMapping }
  | { kind: "canonical"; archetype: Archetype }
  | { kind: "divergence"; mapping: ApprovedMapping }
  | null {
  const approvedMatch = approved.find((a) => a.dmsSku.toUpperCase() === part.sku.toUpperCase());
  if (approvedMatch) {
    // NAME DIVERGENCE GUARD: zero shared words = wrong part on the same SKU number.
    if (nameOverlap(part.partName || "", approvedMatch.dmsPartName || "") === 0) {
      return { kind: "divergence", mapping: approvedMatch };
    }
    const archetype = catalog.find((m) => m.barePartNumber === approvedMatch.barePartNumber) ?? null;
    return { kind: "approved", archetype, mapping: approvedMatch };
  }
  const canonical = catalog.find((m) => m.barePartNumber === part.barePartNumber);
  if (canonical) return { kind: "canonical", archetype: canonical };
  return null;
}
