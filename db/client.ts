import { neon } from "@neondatabase/serverless";
import { dbUrl } from "../lib/config";

let _sql: ReturnType<typeof neon> | null = null;

// Lazily construct the Neon HTTP client. dbUrl() only runs when db() is first
// called (at request time), so importing this module never needs the connection string.
export function db() {
  if (!_sql) _sql = neon(dbUrl());
  return _sql;
}
