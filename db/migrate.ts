import { neon } from "@neondatabase/serverless";
import { requireEnv, dbUrl } from "../lib/config";
import { SCHEMA_SQL } from "./schema";

async function main() {
  const sql = neon(dbUrl());
  await sql.query(SCHEMA_SQL);
  console.log("Migration applied.");
}

main();
