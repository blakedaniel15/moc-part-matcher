import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { requireEnv } from "../lib/config";
import { archetypeRows, approvedRows, blockedRows } from "./transforms";

async function main() {
  const sql = neon(requireEnv("DATABASE_URL"));
  const catalog = JSON.parse(readFileSync("data/archetypes.json", "utf8"));
  const exp = JSON.parse(readFileSync("eval/ground-truth/moc-export.json", "utf8"));

  for (const r of archetypeRows(catalog)) {
    await sql`insert into archetypes (bare_part_number, manufacturer_part, incentive, components, source, official_name)
      values (${r.bare_part_number}, ${r.manufacturer_part}, ${r.incentive}, ${r.components}, ${r.source}, ${r.official_name})
      on conflict (bare_part_number) do update set manufacturer_part = excluded.manufacturer_part,
        incentive = excluded.incentive, components = excluded.components, source = excluded.source,
        official_name = excluded.official_name`;
  }
  for (const r of approvedRows(exp)) {
    await sql`insert into approved_mappings (dms_sku, dms_part_name, bare_part_number, manufacturer_part, incentive)
      values (${r.dms_sku}, ${r.dms_part_name}, ${r.bare_part_number}, ${r.manufacturer_part}, ${r.incentive})
      on conflict (dms_sku) do update set bare_part_number = excluded.bare_part_number,
        dms_part_name = excluded.dms_part_name, manufacturer_part = excluded.manufacturer_part, incentive = excluded.incentive`;
  }
  for (const r of blockedRows(exp)) {
    await sql`insert into blocked_skus (sku, part_name) values (${r.sku}, ${r.part_name})
      on conflict (sku) do update set part_name = excluded.part_name`;
  }
  console.log("Seed complete.");
}

main();
