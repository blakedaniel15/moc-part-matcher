import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { requireEnv, dbUrl } from "../../../../lib/config";
import { SCHEMA_SQL } from "../../../../db/schema";
import { archetypeRows, approvedRows, blockedRows } from "../../../../db/transforms";
import archetypes from "../../../../data/archetypes.json";
import exportData from "../../../../eval/ground-truth/moc-export.json";

export const runtime = "nodejs";

// Run N async tasks in parallel chunks so a one-time seed finishes well under the
// function timeout without flooding the connection.
async function inChunks<T>(items: T[], fn: (t: T) => Promise<unknown>, size = 50) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

export async function POST(req: Request) {
  let secret = "";
  try {
    secret = (await req.json())?.secret ?? "";
  } catch {
    /* no body */
  }
  if (secret !== requireEnv("ADMIN_SECRET")) {
    return NextResponse.json({ error: "Incorrect admin secret." }, { status: 401 });
  }

  const sql = neon(dbUrl());
  await sql.query(SCHEMA_SQL);

  const aRows = archetypeRows(archetypes as any[]);
  const pRows = approvedRows(exportData as any);
  const bRows = blockedRows(exportData as any);

  await inChunks(aRows, (r) =>
    sql`insert into archetypes (bare_part_number, manufacturer_part, incentive, components, source, official_name)
      values (${r.bare_part_number}, ${r.manufacturer_part}, ${r.incentive}, ${r.components}, ${r.source}, ${r.official_name})
      on conflict (bare_part_number) do update set manufacturer_part = excluded.manufacturer_part,
        incentive = excluded.incentive, components = excluded.components, source = excluded.source,
        official_name = excluded.official_name`
  );
  await inChunks(pRows, (r) =>
    sql`insert into approved_mappings (dms_sku, dms_part_name, bare_part_number, manufacturer_part, incentive)
      values (${r.dms_sku}, ${r.dms_part_name}, ${r.bare_part_number}, ${r.manufacturer_part}, ${r.incentive})
      on conflict (dms_sku) do update set bare_part_number = excluded.bare_part_number,
        dms_part_name = excluded.dms_part_name, manufacturer_part = excluded.manufacturer_part, incentive = excluded.incentive`
  );
  await inChunks(bRows, (r) =>
    sql`insert into blocked_skus (sku, part_name) values (${r.sku}, ${r.part_name})
      on conflict (sku) do update set part_name = excluded.part_name`
  );

  return NextResponse.json({ ok: true, archetypes: aRows.length, approved: pRows.length, blocked: bRows.length });
}
