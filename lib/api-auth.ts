export function checkBearer(authHeader: string | null, expected: string): boolean {
  if (!expected) return false;
  const m = (authHeader || "").match(/^Bearer\s+(.+)$/i);
  return !!m && m[1] === expected;
}
