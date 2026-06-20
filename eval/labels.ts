export interface LabeledExample {
  sku: string;
  partName: string;
  expectedBare: string | null; // null = "not MOC"
}

export function labelsFromExport(exp: any): LabeledExample[] {
  const out: LabeledExample[] = [];
  for (const a of exp.approvedMappings ?? []) {
    out.push({ sku: a.dmsSku, partName: a.dmsPartName ?? "", expectedBare: a.barePartNumber });
  }
  for (const b of exp.blockedSkus ?? []) {
    // Carry the part name through — the engine needs it to REASON about negatives
    // in cold mode (e.g. mechanical-name detection), not just memorize the block list.
    out.push({
      sku: typeof b === "string" ? b : b.sku,
      partName: typeof b === "string" ? "" : b.partName ?? "",
      expectedBare: null,
    });
  }
  for (const skus of Object.values(exp.dealerRejections ?? {})) {
    for (const sku of skus as string[]) out.push({ sku, partName: "", expectedBare: null });
  }
  // Dedupe by SKU (the real store re-approves the same SKU multiple times; a DB
  // unique constraint collapses these later). Last write wins.
  const bySku = new Map<string, LabeledExample>();
  for (const ex of out) bySku.set(ex.sku.toUpperCase(), ex);
  return [...bySku.values()];
}

// Deterministic LCG shuffle keyed by seed — no Math.random (reproducible).
export function splitHeldOut(labels: LabeledExample[], fraction: number, seed: number) {
  const arr = [...labels];
  let s = seed >>> 0;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (1664525 * s + 1013904223) >>> 0;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const cut = Math.round(arr.length * fraction);
  return { heldOut: arr.slice(0, cut), train: arr.slice(cut) };
}
