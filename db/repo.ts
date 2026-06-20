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
