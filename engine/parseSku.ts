import type { DmsType } from "./types";

export const RR_MAKE_CODES: ReadonlySet<string> = new Set([
  "SU", "TO", "MB", "FO", "HP", "GN", "CH", "KI", "GM", "LE",
]);

export function parseSku(
  rawSku: string,
  fileDmsType: DmsType
): { makeCode: string | null; barePartNumber: string; dmsType: DmsType } {
  const sku = String(rawSku).trim().toUpperCase();

  // CDK: zero stripping, ever. Full SKU is the part number exactly as exported.
  if (fileDmsType === "CDK") {
    return { makeCode: null, barePartNumber: sku, dmsType: "CDK" };
  }

  // R&R: try each known make code as a prefix.
  for (const code of RR_MAKE_CODES) {
    if (!sku.startsWith(code)) continue;
    const afterCode = sku.slice(code.length);

    // Standard: MAKE + digits only (e.g. TO01071).
    if (/^\d+$/.test(afterCode)) {
      return { makeCode: code, barePartNumber: afterCode.padStart(5, "0"), dmsType: "R&R" };
    }
    // Branded: MAKE + "MP" + digits only (e.g. TOMP01071).
    if (afterCode.startsWith("MP") && /^\d+$/.test(afterCode.slice(2))) {
      return { makeCode: code + "MP", barePartNumber: afterCode.slice(2).padStart(5, "0"), dmsType: "R&R" };
    }
  }

  // No known make code matched — preserve the full SKU for structural analysis.
  return { makeCode: null, barePartNumber: sku, dmsType: "R&R" };
}

export function detectDms(skus: string[]): DmsType {
  let rrVotes = 0;
  let cdkVotes = 0;
  for (const raw of skus.slice(0, 20)) {
    const s = String(raw).trim().toUpperCase();
    if (/^[A-Z]+\d/.test(s)) rrVotes++;
    else cdkVotes++;
  }
  return rrVotes > cdkVotes ? "R&R" : "CDK";
}
