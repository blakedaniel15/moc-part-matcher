export const config = {
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
  batchSize: 30,
};

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

// The Neon Vercel integration injects the connection string under various names
// (DATABASE_URL, POSTGRES_URL, *_NON_POOLING, *_UNPOOLED). Accept any of them so
// setup/matching work regardless of which the integration provided.
export function dbUrl(): string {
  // On preview deployments, prefer an explicit preview database so testing never
  // touches production data. Set PREVIEW_DATABASE_URL (Preview scope) to a Neon
  // branch connection string; production (VERCEL_ENV=production) is unaffected and
  // keeps using the integration's DATABASE_URL/POSTGRES_URL.
  if (process.env.VERCEL_ENV === "preview" && process.env.PREVIEW_DATABASE_URL) {
    return process.env.PREVIEW_DATABASE_URL;
  }
  const v =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NO_SSL;
  if (!v) throw new Error("No database URL env var found (looked for DATABASE_URL / POSTGRES_URL / *_NON_POOLING).");
  return v;
}
