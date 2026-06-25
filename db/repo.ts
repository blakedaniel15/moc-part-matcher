import type { Archetype, ApprovedMapping } from "../engine/types";

// A tagged-template SQL executor (the shape of @neondatabase/serverless's `neon()`).
// Injected so the data-access layer is unit-testable without a real database.
export type SqlExec = (strings: TemplateStringsArray, ...vals: any[]) => Promise<any[]>;

export async function loadCatalog(sql: SqlExec): Promise<Archetype[]> {
  const rows = await sql`select bare_part_number, manufacturer_part, incentive from archetypes`;
  return rows.map((r) => ({
    barePartNumber: r.bare_part_number,
    manufacturerPart: r.manufacturer_part,
    incentive: r.incentive,
  }));
}

export async function loadApproved(sql: SqlExec): Promise<ApprovedMapping[]> {
  const rows = await sql`select dms_sku, dms_part_name, bare_part_number, manufacturer_part, incentive from approved_mappings`;
  return rows.map((r) => ({
    dmsSku: r.dms_sku,
    dmsPartName: r.dms_part_name,
    barePartNumber: r.bare_part_number,
    manufacturerPart: r.manufacturer_part,
    incentive: r.incentive,
  }));
}

export async function loadBlockedSkus(sql: SqlExec): Promise<string[]> {
  const rows = await sql`select sku from blocked_skus`;
  return rows.map((r) => r.sku);
}

export async function recordDecision(
  sql: SqlExec,
  d: {
    sku: string;
    partName: string;
    matchType: string | null;
    confidence: string | null;
    outcome: string;
    barePartNumber: string | null;
    runId?: string | null;
    dealer?: string | null;
  }
): Promise<void> {
  await sql`insert into decisions (sku, part_name, match_type, confidence, outcome, bare_part_number, run_id, dealer)
    values (${d.sku}, ${d.partName}, ${d.matchType}, ${d.confidence}, ${d.outcome}, ${d.barePartNumber}, ${d.runId ?? null}, ${d.dealer ?? null})`;
}

// Full catalog for the picker and the Catalog browser.
export async function loadCatalogFull(sql: SqlExec): Promise<{ barePartNumber: string; manufacturerPart: string; source: string }[]> {
  const rows = await sql`select bare_part_number, manufacturer_part, source from archetypes order by bare_part_number`;
  return rows.map((r) => ({ barePartNumber: r.bare_part_number, manufacturerPart: r.manufacturer_part, source: r.source }));
}

// Save a finished file's results snapshot (the run history).
export async function saveRunSnapshot(
  sql: SqlExec,
  r: { runId: string; dealer: string; fileName: string; total: number; matched: number; review: number; unmatched: number; snapshot: unknown }
): Promise<void> {
  await sql`insert into run_snapshots (run_id, dealer, file_name, total, matched, review, unmatched, snapshot)
    values (${r.runId}, ${r.dealer}, ${r.fileName}, ${r.total}, ${r.matched}, ${r.review}, ${r.unmatched}, ${JSON.stringify(r.snapshot)}::jsonb)
    on conflict (run_id) do update set dealer = excluded.dealer, file_name = excluded.file_name, total = excluded.total,
      matched = excluded.matched, review = excluded.review, unmatched = excluded.unmatched, snapshot = excluded.snapshot, ran_at = now()`;
}

export async function loadRunSummaries(
  sql: SqlExec
): Promise<{ runId: string; dealer: string; fileName: string; total: number; matched: number; review: number; unmatched: number; ranAt: string }[]> {
  const rows = await sql`select run_id, dealer, file_name, total, matched, review, unmatched, ran_at from run_snapshots order by ran_at desc limit 200`;
  return rows.map((r) => ({
    runId: r.run_id,
    dealer: r.dealer ?? "",
    fileName: r.file_name ?? "",
    total: r.total,
    matched: r.matched,
    review: r.review,
    unmatched: r.unmatched,
    ranAt: typeof r.ran_at === "string" ? r.ran_at : new Date(r.ran_at).toISOString(),
  }));
}

export async function loadRunSnapshot(sql: SqlExec, runId: string): Promise<{ runId: string; dealer: string; fileName: string; snapshot: any } | null> {
  const rows = await sql`select run_id, dealer, file_name, snapshot from run_snapshots where run_id = ${runId}`;
  if (!rows[0]) return null;
  return { runId: rows[0].run_id, dealer: rows[0].dealer ?? "", fileName: rows[0].file_name ?? "", snapshot: rows[0].snapshot };
}

export async function loadDealerKeys(sql: SqlExec): Promise<string[]> {
  const rows = await sql`select key from dealers order by name`;
  return rows.map((r) => r.key);
}

export async function upsertDealer(sql: SqlExec, d: { key: string; name: string; dmsType: string | null }): Promise<void> {
  await sql`insert into dealers (key, name, dms_type) values (${d.key}, ${d.name}, ${d.dmsType})
    on conflict (key) do update set name = excluded.name, dms_type = coalesce(excluded.dms_type, dealers.dms_type), last_seen_at = now()`;
}

// All decisions (oldest first) for the Stats identification-rate computation.
export async function loadDecisions(
  sql: SqlExec
): Promise<{ sku: string; matchType: string | null; confidence: string | null; outcome: string; runId: string | null; dealer: string | null; ts: string }[]> {
  const rows = await sql`select sku, match_type, confidence, outcome, run_id, dealer, ts from decisions order by ts asc`;
  return rows.map((r) => ({
    sku: r.sku,
    matchType: r.match_type,
    confidence: r.confidence,
    outcome: r.outcome,
    runId: r.run_id,
    dealer: r.dealer,
    ts: typeof r.ts === "string" ? r.ts : new Date(r.ts).toISOString(),
  }));
}

// "Yes" on a match — remember this dealer SKU → archetype so it auto-matches next run.
export async function upsertApprovedMapping(
  sql: SqlExec,
  m: { dmsSku: string; dmsPartName: string; barePartNumber: string; manufacturerPart: string }
): Promise<void> {
  await sql`insert into approved_mappings (dms_sku, dms_part_name, bare_part_number, manufacturer_part, incentive)
    values (${m.dmsSku}, ${m.dmsPartName}, ${m.barePartNumber}, ${m.manufacturerPart}, 0)
    on conflict (dms_sku) do update set bare_part_number = excluded.bare_part_number,
      dms_part_name = excluded.dms_part_name, manufacturer_part = excluded.manufacturer_part`;
}

// "No" on a match — skip this SKU for this dealer on future runs.
export async function addDealerRejection(sql: SqlExec, dealer: string, sku: string): Promise<void> {
  await sql`insert into dealer_rejections (dealer, sku) values (${dealer}, ${sku})
    on conflict (dealer, sku) do nothing`;
}

// ---- Sales ingest (see /api/v1/sales) -------------------------------------

// The persistent per-dealer known-SKU set — the gap baseline.
export async function loadKnownSkus(sql: SqlExec, dealerKey: string): Promise<Set<string>> {
  const rows = await sql`select sku from dealer_known_skus where dealer_key = ${dealerKey}`;
  return new Set(rows.map((r) => String(r.sku).trim().toUpperCase()));
}

export async function upsertKnownSkus(sql: SqlExec, dealerKey: string, skus: string[], source: string): Promise<void> {
  for (const sku of skus) {
    await sql`insert into dealer_known_skus (dealer_key, sku, source) values (${dealerKey}, ${sku}, ${source})
      on conflict (dealer_key, sku) do update set source = excluded.source, updated_at = now()`;
  }
}

export async function getBatchByIdempotency(sql: SqlExec, key: string): Promise<any | null> {
  const rows = await sql`select batch_id, distinct_skus, new_parts, line_count from ingest_batches where idempotency_key = ${key}`;
  return rows[0] ?? null;
}

export async function insertBatch(
  sql: SqlExec,
  b: { batchId: string; idempotencyKey: string; storeId: string; periodStart: string; periodEnd: string; lineCount: number; distinctSkus: number; newParts: number }
): Promise<void> {
  await sql`insert into ingest_batches (batch_id, idempotency_key, store_id, period_start, period_end, line_count, distinct_skus, new_parts)
    values (${b.batchId}, ${b.idempotencyKey}, ${b.storeId}, ${b.periodStart}, ${b.periodEnd}, ${b.lineCount}, ${b.distinctSkus}, ${b.newParts})`;
}

export async function insertSalesLines(sql: SqlExec, batchId: string, storeId: string, lines: any[]): Promise<void> {
  for (const l of lines) {
    await sql`insert into sales_lines (batch_id, store_id, dealer_sku, sku_description, op_code, op_description, vehicle_make, quantity_sold, sale_date, cost, sale)
      values (${batchId}, ${storeId}, ${l.dealerSku}, ${l.skuDescription ?? null}, ${l.opCode ?? null}, ${l.opDescription ?? null}, ${l.vehicleMake ?? null}, ${l.quantitySold ?? null}, ${l.saleDate ?? null}, ${l.cost ?? null}, ${l.sale ?? null})`;
  }
}

// Add a new MOC product to the catalog (source 'custom' so it's distinguishable
// from the official import).
export async function upsertArchetype(
  sql: SqlExec,
  a: { barePartNumber: string; manufacturerPart: string }
): Promise<void> {
  await sql`insert into archetypes (bare_part_number, manufacturer_part, incentive, source)
    values (${a.barePartNumber}, ${a.manufacturerPart}, 0, 'custom')
    on conflict (bare_part_number) do update set manufacturer_part = excluded.manufacturer_part, source = 'custom'`;
}
