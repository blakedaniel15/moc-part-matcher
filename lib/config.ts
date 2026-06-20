export const config = {
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
  batchSize: 30,
};

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
