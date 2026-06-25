export interface SaleLine {
  dealerSku: string;
  skuDescription?: string;
  opCode?: string;
  opDescription?: string;
  vehicleMake?: string;
  quantitySold?: number;
  saleDate?: string;
  cost?: number;
  sale?: number;
}
export interface IngestBody {
  store: { id: string; name?: string; dmsType?: string };
  period: { start: string; end: string };
  knownSkus?: string[];
  initial?: boolean; // true for a store's first (onboarding) sync — affects the ClickUp task wording
  lines: SaleLine[];
}

export function validateIngest(body: any): { ok: true; body: IngestBody } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be a JSON object." };
  if (!body.store?.id) return { ok: false, error: "store.id is required." };
  if (!body.period?.start || !body.period?.end) return { ok: false, error: "period.start and period.end are required." };
  if (!Array.isArray(body.lines) || body.lines.length === 0) return { ok: false, error: "lines must be a non-empty array." };
  for (const l of body.lines) {
    if (!l?.dealerSku || typeof l.dealerSku !== "string") return { ok: false, error: "every line needs a dealerSku." };
  }
  if (body.lines.length > 5000) return { ok: false, error: "max 5000 lines per request." };
  return { ok: true, body: body as IngestBody };
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
