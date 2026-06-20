import { neon } from "@neondatabase/serverless";
import { requireEnv } from "../lib/config";
import { SCHEMA_SQL } from "./schema";

async function main() {
  const sql = neon(requireEnv("DATABASE_URL"));
  await sql.query(SCHEMA_SQL);
  console.log("Migration applied.");
}

main();
