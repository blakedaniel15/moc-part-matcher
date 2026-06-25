import type { Part } from "../engine/types";
import type { SaleLine } from "./ingest";
import { parseSku, detectDms } from "../engine/parseSku";
import { analyzeStructure } from "../engine/structural";

export function partsFromLines(lines: SaleLine[]): Part[] {
  const dms = detectDms(lines.map((l) => l.dealerSku));
  return lines.map((l) => {
    const parsed = parseSku(l.dealerSku, dms);
    return {
      sku: l.dealerSku,
      partName: (l.skuDescription || "").replace(/[™®©]/g, "").trim(),
      makeCode: parsed.makeCode,
      barePartNumber: parsed.barePartNumber,
      dmsType: dms,
      structural: analyzeStructure(parsed.barePartNumber),
      opDescription: l.opDescription || undefined,
      vehicleMake: l.vehicleMake || undefined,
    };
  });
}
