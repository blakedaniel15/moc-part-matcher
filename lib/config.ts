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
  const v =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NO_SSL;
  if (!v) throw new Error("No database URL env var found (looked for DATABASE_URL / POSTGRES_URL / *_NON_POOLING).");
  return v;
}
