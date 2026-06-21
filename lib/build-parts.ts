import * as XLSX from "xlsx";
import { parseSku, detectDms } from "../engine/parseSku";
import { analyzeStructure } from "../engine/structural";
import type { Part } from "../engine/types";

export interface ParsedFile {
  parts: Part[];
  dms: "R&R" | "CDK";
  dealerName: string;
}

// Client-side: turn a dealer Excel export into Part[] using the same pure engine
// functions the server uses (parseSku / detectDms / analyzeStructure). Mirrors the
// legacy parser: first sheet, find SKU + Part Name columns, detect DMS once, dedupe.
export function parseWorkbook(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        const headers = (rows[0] || []).map((h) => String(h).toUpperCase());
        const skuIdx = headers.findIndex((h) => h.includes("SKU"));
        const nameIdx = headers.findIndex((h) => h.includes("PART NAME"));
        if (skuIdx === -1) {
          reject(new Error("Couldn't find a SKU column in that file."));
          return;
        }

        const sample: string[] = [];
        for (let i = 1; i < rows.length && sample.length < 20; i++) {
          const s = rows[i]?.[skuIdx];
          if (s) sample.push(String(s).trim());
        }
        const dms = detectDms(sample);

        const seen = new Set<string>();
        const parts: Part[] = [];
        for (let i = 1; i < rows.length; i++) {
          const skuRaw = rows[i]?.[skuIdx];
          if (!skuRaw) continue;
          const sku = String(skuRaw).trim();
          if (seen.has(sku)) continue;
          seen.add(sku);
          const name = nameIdx >= 0 ? rows[i]?.[nameIdx] : "";
          const parsed = parseSku(sku, dms);
          parts.push({
            sku,
            partName: name ? String(name).trim().replace(/[™®©]/g, "").trim() : "",
            makeCode: parsed.makeCode,
            barePartNumber: parsed.barePartNumber,
            dmsType: dms,
            structural: analyzeStructure(parsed.barePartNumber),
          });
        }

        const base = file.name.replace(/\.[^.]+$/, "");
        const m = base.match(/^(.+?)_warranty/i);
        const dealerName = (m ? m[1] : base).replace(/_/g, " ").trim();
        resolve({ parts, dms, dealerName });
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Couldn't read that workbook."));
      }
    };
    reader.onerror = () => reject(new Error("Couldn't read the file."));
    reader.readAsBinaryString(file);
  });
}
