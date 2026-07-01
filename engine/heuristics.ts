// MOC product names that contain ambiguous words (GEAR, GLASS, SENSOR, CALIPER).
// If ANY safe phrase matches, the mechanical check is skipped entirely.
export const MOC_SAFE_PHRASES: string[] = [
  "GEAR GUARD", "GEAR PLUS", "75W90 GEAR", "CALIPER LUBE", "BRAKE CALIPER LUBE",
  "SENSOR CLEANER", "FLOW SENSOR", "GLASS TREAT", "GLASS KIT", "VISION GLASS",
  "MP VISION GLASS", "MOC VISION GLASS", "GLASS TREATMENT",
];

// Multi-word OEM patterns. A name must match one of these compounds to be flagged
// mechanical — single words like GEAR or GLASS alone are NOT sufficient.
export const MECHANICAL_COMPOUNDS: string[] = [
  // GEAR in OEM context
  "RING GEAR", "GEAR BOX", "GEAR ASSY", "GEAR ASSEMBLY", "GEAR SHAFT", "GEAR SET",
  "GEAR CASE", "BEVEL GEAR", "GEAR RATIO", "GEAR OIL",
  // GLASS in OEM context
  "DOOR GLASS", "WINDOW GLASS", "GLASS ASSY", "GLASS ASSEMBLY", "SIDE GLASS",
  "REAR GLASS", "FRONT GLASS", "BACK GLASS", "WINDSHIELD GLASS",
  // SENSOR in OEM context
  "SPEED SENSOR", "ABS SENSOR", "O2 SENSOR", "OXYGEN SENSOR", "MAP SENSOR",
  "CAM SENSOR", "CRANK SENSOR", "TEMP SENSOR", "KNOCK SENSOR", "PRESSURE SENSOR",
  "SENSOR ASSY", "SENSOR ASSEMBLY", "PARK SENSOR", "REVERSE SENSOR",
  // CALIPER in OEM context
  "CALIPER ASSY", "CALIPER ASSEMBLY", "BRAKE CALIPER", "CALIPER BRACKET",
  // LAMP / LIGHT always OEM
  "LAMP:", "PARK LAMP", "TAIL LAMP", "HEAD LAMP", "HEADLAMP", "FOG LAMP",
  "STOP LAMP", "TURN LAMP", "BACK LAMP", "LAMP ASSY", "LAMP ASSEMBLY",
  "SIGNAL LAMP", "MARKER LAMP", "LICENSE LAMP", "LIGHT ASSY", "LIGHT ASSEMBLY",
  // Other unambiguous OEM compounds
  "WIPER BLADE", "WIPER ARM", "WIPER MOTOR", "BLADE ASSY",
  "BRAKE PAD", "PAD KIT", "PAD SET", "DISC PAD",
  "AIR FILTER", "OIL FILTER", "FUEL FILTER", "FILTER ASSY", "CABIN FILTER",
  // Air cleaner / filter elements (OEM) — incl. truncated DMS forms
  "AIR CLEANER", "AIR CLE", "FILTER ELEMENT", "ELEMENT ASSY", "ELEMENT ASY", "CLEANER ELEMENT",
  "TIMING BELT", "DRIVE BELT", "SERPENTINE BELT", "V-BELT", "BELT ASSY",
  "WATER PUMP", "FUEL PUMP", "OIL PUMP", "PUMP ASSY",
  "CONTROL ARM", "UPPER ARM", "LOWER ARM", "ARM ASSY",
  "CV AXLE", "AXLE SHAFT", "AXLE ASSY", "HALF SHAFT",
  "SHOCK ABSORBER", "STRUT ASSY", "COIL SPRING", "LEAF SPRING",
  "DOOR MIRROR", "SIDE MIRROR", "MIRROR ASSY", "MIRROR GLASS",
  "TRIM PANEL", "BODY TRIM", "TRIM ASSY", "MOLDING TRIM",
  "VALVE COVER", "VALVE BODY", "VALVE ASSY", "EGR VALVE", "PCV VALVE",
  "SEAL KIT", "SEAL ASSY", "OIL SEAL", "GASKET KIT", "HEAD GASKET",
  "HUB ASSY", "WHEEL HUB", "BEARING KIT", "WHEEL BEARING",
];

// Strips all non-digit characters then removes leading zeros. Used to compare numeric
// cores regardless of dashes, suffixes, or formatting. e.g. "01-071A" → "1071".
export function numericCore(s: string): string {
  return String(s).replace(/[^0-9]/g, "").replace(/^0+/, "") || "0";
}

// Scores SKU complexity — determines the confidence ceiling for fuzzy matches.
export function skuComplexity(sku: string): "clean" | "moderate" | "suspect" {
  const s = sku.toUpperCase();
  // All-numeric (store prefix formats like 8888804461).
  if (/^\d+$/.test(s)) return "clean";
  // Single letter or known make code prefix + pure digits (A04211, TO04181, TOMP01071).
  if (/^[A-Z]{1,4}\d+$/.test(s)) return "clean";
  // Letters on BOTH ends surrounding digits — sandwich pattern (68004181AC).
  if (/^[A-Z]+\d+[A-Z]+$/i.test(s)) return "suspect";
  // Long (8+ chars) with mixed letters and digits.
  if (s.length >= 8 && /[A-Z]/.test(s) && /\d/.test(s)) return "suspect";
  return "moderate";
}

export function isMechanicalName(name: string): boolean {
  if (!name) return false;
  const upper = name.toUpperCase();
  // If any MOC-safe phrase matches, this is a known MOC product name — skip the check.
  if (MOC_SAFE_PHRASES.some((p) => upper.includes(p))) return false;
  return MECHANICAL_COMPOUNDS.some((p) => upper.includes(p));
}

// Packaging / size / filler tokens that don't corroborate a product identity on
// their own. Everything else (OIL, BRAKE, ATF, CONDITIONER, INJECTOR, …) counts.
const CORROB_STOP = new Set([
  "OZ", "GAL", "GALLON", "PK", "QT", "ML", "LB", "PC", "PCS",
  "KIT", "PREMIUM", "PLUS", "LV", "HP", "MOC", "MP", "NEW", "SET", "PART", "PARTS",
  "THE", "AND", "FOR", "WITH", "OF", "IN", "A", "SERV", "SERVICE",
]);

function corrobTokens(s: string): string[] {
  return String(s || "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .filter((t) => !/^\d+$/.test(t)) // pure numbers
    .filter((t) => !/^\d+(OZ|GAL|PK|QT|ML|LB)$/.test(t)) // size codes like 12OZ
    .filter((t) => !CORROB_STOP.has(t));
}

// Strong name corroboration between a dealer part name and an archetype's
// manufacturerPart (which is like "01211 - MOTOR OIL CONDITIONER"). Returns how many
// MEANINGFUL tokens they share and whether any shared token is distinctive (long).
// A single generic overlap (e.g. only "OIL") is intentionally weak.
export function nameCorroboration(partName: string, manufacturerPart: string): { shared: number; distinctive: boolean } {
  const archName = String(manufacturerPart || "").replace(/^\s*\d{4,5}\s*-\s*/, "");
  const a = new Set(corrobTokens(archName));
  let shared = 0;
  let distinctive = false;
  const counted = new Set<string>();
  for (const t of corrobTokens(partName)) {
    if (a.has(t) && !counted.has(t)) {
      counted.add(t);
      shared++;
      if (t.length >= 7) distinctive = true;
    }
  }
  return { shared, distinctive };
}
