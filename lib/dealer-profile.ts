export function buildDealerProfile(
  mappings: { sku: string; moc: string; name?: string }[]
): { aliases: Record<string, string[]>; examples: { name: string; barePartNumber: string }[] } {
  const aliases: Record<string, string[]> = {};
  const examples: { name: string; barePartNumber: string }[] = [];
  for (const m of mappings) {
    if (!m.name || !m.moc) continue;
    (aliases[m.moc] ||= []).push(m.name);
    if (examples.length < 14) examples.push({ name: m.name, barePartNumber: m.moc });
  }
  return { aliases, examples };
}
