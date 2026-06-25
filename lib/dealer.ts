export function normalizeDealerKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, "_");
}

// Mirror the legacy filename parsing: everything before "_warranty", underscores → spaces.
export function dealerNameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  const m = base.match(/^(.+?)_warranty/i);
  return (m ? m[1] : base).replace(/_/g, " ").trim();
}

export function matchDealer(
  key: string,
  existingKeys: string[]
): { status: "match"; key: string } | { status: "new"; key: string } {
  return existingKeys.includes(key) ? { status: "match", key } : { status: "new", key };
}
