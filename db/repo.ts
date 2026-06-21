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
  }
): Promise<void> {
  await sql`insert into decisions (sku, part_name, match_type, confidence, outcome, bare_part_number)
    values (${d.sku}, ${d.partName}, ${d.matchType}, ${d.confidence}, ${d.outcome}, ${d.barePartNumber})`;
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
