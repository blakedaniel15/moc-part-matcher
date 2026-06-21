import { neon } from "@neondatabase/serverless";
import { requireEnv, dbUrl } from "../lib/config";
import { runMigration } from "./schema";

async function main() {
  const sql = neon(dbUrl());
  await runMigration(sql);
  console.log("Migration applied.");
}

main();
