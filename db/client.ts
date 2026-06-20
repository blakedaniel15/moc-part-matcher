import { neon } from "@neondatabase/serverless";
import { requireEnv } from "../lib/config";

let _sql: ReturnType<typeof neon> | null = null;

// Lazily construct the Neon HTTP client. requireEnv only runs when db() is first
// called (at request time), so importing this module never needs DATABASE_URL.
export function db() {
  if (!_sql) _sql = neon(requireEnv("DATABASE_URL"));
  return _sql;
}
