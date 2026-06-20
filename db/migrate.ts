import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { requireEnv } from "../lib/config";

async function main() {
  const sql = neon(requireEnv("DATABASE_URL"));
  const ddl = readFileSync("db/schema.sql", "utf8");
  // neon http supports multiple statements via the `query` form; run as one batch.
  await sql.query(ddl);
  console.log("Migration applied.");
}

main();
