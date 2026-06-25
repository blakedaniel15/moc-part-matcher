import * as XLSX from "xlsx";

export interface KnownList {
  skus: Set<string>;
  mappings: { sku: string; moc: string; name?: string }[];
}

export function knownListFromRows(rows: any[][]): KnownList {
  const headers = (rows[0] || []).map((h) => String(h).toUpperCase());
  const skuIdx = headers.findIndex((h) => h.includes("SKU"));
  const mocIdx = headers.findIndex((h) => h.includes("MOC") || h.includes("BARE"));
  const nameIdx = headers.findIndex((h) => h.includes("NAME") || h.includes("PRODUCT"));
  const skus = new Set<string>();
  const mappings: { sku: string; moc: string; name?: string }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const sku = skuIdx >= 0 ? String(rows[i]?.[skuIdx] ?? "").trim() : "";
    if (!sku) continue;
    skus.add(sku);
    const moc = mocIdx >= 0 ? String(rows[i]?.[mocIdx] ?? "").trim() : "";
    if (moc) {
      const name = nameIdx >= 0 ? String(rows[i]?.[nameIdx] ?? "").trim() : "";
      mappings.push(name ? { sku, moc, name } : { sku, moc });
    }
  }
  return { skus, mappings };
}

export function parseKnownFile(file: File): Promise<KnownList> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(knownListFromRows(XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]));
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Couldn't read the known-list file."));
      }
    };
    reader.onerror = () => reject(new Error("Couldn't read the file."));
    reader.readAsBinaryString(file);
  });
}
