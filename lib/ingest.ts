// ---- v2 ingest: one feed, two grains (op lines → parts) --------------------

export interface PartLine {
  dealerSku: string;
  partName?: string;
  qty?: number;
  sale?: number;
  cost?: number;
}

export interface OpLine {
  ro: string;
  line: string;
  opCode: string;
  opDescription?: string;
  correction?: string;
  payType?: string;
  laborSale?: number;
  techHours?: number;
  saleDate?: string;
  parts?: PartLine[];
}

export interface IngestBody {
  store: { id: string; name?: string; dmsType?: string };
  period: { start: string; end: string };
  initial?: boolean; // first (onboarding) sync — affects the ClickUp wording
  knownSkus?: string[]; // optional parts gap baseline
  opLines: OpLine[];
}

// The parts matcher's per-part input: a flattened part carrying its op-line's
// description as a matching signal.
export interface SaleLine {
  dealerSku: string;
  skuDescription?: string;
  opDescription?: string;
  saleDate?: string;
  cost?: number;
  sale?: number;
}

export function validateIngest(body: any): { ok: true; body: IngestBody } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be a JSON object." };
  if (!body.store?.id) return { ok: false, error: "store.id is required." };
  if (!body.period?.start || !body.period?.end) return { ok: false, error: "period.start and period.end are required." };
  if (!Array.isArray(body.opLines) || body.opLines.length === 0) return { ok: false, error: "opLines must be a non-empty array." };
  if (body.opLines.length > 5000) return { ok: false, error: "max 5000 op lines per request." };
  for (const ol of body.opLines) {
    if (!ol?.ro || !ol?.line) return { ok: false, error: "every op line needs ro and line." };
    if (!ol?.opCode || typeof ol.opCode !== "string") return { ok: false, error: "every op line needs an opCode." };
    if (ol.parts != null && !Array.isArray(ol.parts)) return { ok: false, error: "op line parts must be an array." };
    for (const p of ol.parts ?? []) {
      if (!p?.dealerSku || typeof p.dealerSku !== "string") return { ok: false, error: "every part needs a dealerSku." };
    }
  }
  return { ok: true, body: body as IngestBody };
}

export function countParts(opLines: OpLine[]): number {
  return opLines.reduce((a, ol) => a + (ol.parts?.length ?? 0), 0);
}

// Flatten op lines into the parts matcher's input, carrying each part's parent op
// description as a matching signal.
export function flattenParts(opLines: OpLine[]): SaleLine[] {
  const out: SaleLine[] = [];
  for (const ol of opLines) {
    for (const p of ol.parts ?? []) {
      out.push({
        dealerSku: p.dealerSku,
        skuDescription: p.partName,
        opDescription: ol.opDescription,
        saleDate: ol.saleDate,
        cost: p.cost,
        sale: p.sale,
      });
    }
  }
  return out;
}

const fieldCount = (l: SaleLine) => Object.values(l).filter((v) => v !== undefined && v !== null && v !== "").length;

export function distinctSkus(lines: SaleLine[]): SaleLine[] {
  const best = new Map<string, SaleLine>();
  for (const l of lines) {
    const key = l.dealerSku.trim().toUpperCase();
    const cur = best.get(key);
    if (!cur || fieldCount(l) > fieldCount(cur)) best.set(key, l);
  }
  return [...best.values()];
}
