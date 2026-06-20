// Pure transforms from the exported JSON + catalog into DB row shapes.
// No DB access here so CI can test them with zero secrets.

export function archetypeRows(catalog: any[]) {
  return catalog.map((a) => ({
    bare_part_number: a.barePartNumber,
    manufacturer_part: a.manufacturerPart,
    incentive: a.incentive ?? 0,
    components: Array.isArray(a.components) ? a.components : null,
    source: a.source ?? "official",
    official_name: a.officialName ?? null,
  }));
}

export function approvedRows(exp: any) {
  // Dedupe by dms_sku (last wins) to satisfy the primary key.
  const bySku = new Map<string, any>();
  for (const a of exp.approvedMappings ?? []) {
    bySku.set(String(a.dmsSku).toUpperCase(), {
      dms_sku: a.dmsSku,
      dms_part_name: a.dmsPartName ?? "",
      bare_part_number: a.barePartNumber,
      manufacturer_part: a.manufacturerPart ?? a.barePartNumber,
      incentive: a.incentive ?? 0,
    });
  }
  return [...bySku.values()];
}

export function blockedRows(exp: any) {
  return (exp.blockedSkus ?? []).map((b: any) => ({
    sku: typeof b === "string" ? b : b.sku,
    part_name: typeof b === "string" ? "" : b.partName ?? "",
  }));
}
