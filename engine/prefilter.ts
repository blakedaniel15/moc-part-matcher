import type { Part } from "./types";
import { skuComplexity, isMechanicalName } from "./heuristics";

// Pre-AI filter: hard-exclude confirmed OEM formats and parts whose evidence is so
// clearly negative that sending them to the AI would waste batch slots. Returns a
// skip reason string if the part should NOT go to AI, else null.
export function prefilterSkip(part: Part, ctx: { dealerBrand: "toyota" | "all" }): string | null {
  const raw = part.sku.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const isNissanOEM = raw.startsWith("999MP");
  const isCR2032 =
    /^(CR)?2032$/i.test(part.sku.trim().replace(/\s/g, "")) &&
    /(BATTERY|BATT|KEY|FOB)/i.test(part.partName || "");

  const isUnlikely = (part.structural?.score ?? 0) === 0;
  const isSuspect = skuComplexity(part.sku) === "suspect";
  const isMech = isMechanicalName(part.partName);
  const hasMidLet = /\d[A-Z]+\d/i.test(part.sku.replace(/-/g, ""));

  const skipOEM = isNissanOEM || isCR2032;
  const skipSegment = hasMidLet;
  const skipUnlikely = isUnlikely && isMech;
  const skipSuspect = isSuspect && isUnlikely;
  const toyotaDash = ctx.dealerBrand === "toyota" && /\d{4,}-\d{4,}/.test(part.sku) && isMech;

  if (!(skipOEM || skipSegment || skipUnlikely || skipSuspect || toyotaDash)) return null;

  return skipOEM
    ? isNissanOEM
      ? "Nissan OEM 999MP-format part — confirmed OEM product line, not MOC"
      : "CR2032 / 2032 coin cell battery with battery/key name — confirmed OEM key fob battery, not a MOC product"
    : skipSegment
    ? "OEM segment-format part number (letters between digit groups) — not MOC format"
    : toyotaDash
    ? "Toyota catalog format (####-####) with mechanical name — OEM sub-assembly, not MOC"
    : skipUnlikely
    ? "Non-MOC structure with mechanical part name — pre-filtered before AI"
    : "Suspect SKU format with non-MOC structure — pre-filtered before AI";
}
