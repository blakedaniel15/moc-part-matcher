import type { Part, Archetype, Confidence } from "./types";
import { numericCore, skuComplexity, isMechanicalName } from "./heuristics";
import { nameOverlap } from "./exact";

// A "store-like" prefix is what dealers prepend before the full MOC number:
// all-identical digits (88888, 00000) or a short run (≤4). An OEM part segment
// (e.g. 94188, or a dash-segmented catalog number) is NOT store-like — guarding
// against it stops OEM numbers that coincidentally end in a MOC number from matching.
function isStoreLikePrefix(prefix: string): boolean {
  if (prefix.length === 0) return true;
  if (prefix.length <= 4) return true;
  return /^(\d)\1*$/.test(prefix); // all identical digits
}

// Fuzzy numeric match with three sub-strategies:
//   2a numeric-core    — strips non-digits and compares cores
//   2b trailing-suffix — last 5 digits match a MOC archetype (store-prefix formats)
//   2c zero-pad        — 4-digit number, prepend "0" and check (dropped leading zero)
// Confidence is then derived from SKU complexity, the sub-pass, and the name.
export function fuzzyMatch(
  part: Part,
  catalog: Archetype[]
): { archetype: Archetype; confidence: Confidence; reason: string; matchPass: "2a" | "2b" | "2c" | "2d" } | null {
  const digits = part.barePartNumber.replace(/[^0-9]/g, "");
  const core = numericCore(part.barePartNumber);
  const stripped = part.barePartNumber.replace(/-/g, "");
  const hasMidLetters = /\d[A-Z]+\d/i.test(stripped);

  let archetype: Archetype | null = null;
  let matchPass: "2a" | "2b" | "2c" | "2d" | null = null;
  let reason = "";

  // 2a: numeric core — only valid if no letters embedded between digits.
  if (!hasMidLetters && core !== "0") {
    const m = catalog.find((a) => numericCore(a.barePartNumber) === core);
    if (m) {
      archetype = m;
      matchPass = "2a";
      reason = "Numeric core matches MOC " + m.barePartNumber + " after stripping formatting";
    }
  }
  // 2d: MOC brand number — the dealer catalogued the MOC part by its own number:
  // "M" + the 5-digit MOC bare number + an optional trailing size digit
  // (e.g. M012110 -> 01211, M025310 -> 02531). The leading zero is part of the bare
  // number (first 5 digits), which the numeric-core (strips leading zeros) and
  // trailing-suffix (takes the LAST 5) passes both miss.
  if (!archetype) {
    const mocPrefix = part.sku.toUpperCase().trim().match(/^M(\d{5})\d*$/);
    if (mocPrefix) {
      const m = catalog.find((a) => a.barePartNumber === mocPrefix[1]);
      if (m) {
        archetype = m;
        matchPass = "2d";
        reason = "MOC catalog number " + mocPrefix[1] + " recognized from M-prefixed SKU " + part.sku;
      }
    }
  }
  // 2b: trailing suffix — last 5 digits exactly match a MOC archetype, but ONLY when
  // the leading digits look like a store number (not an OEM part segment), and the
  // SKU is not a dash-segmented OEM catalog number.
  if (!archetype && !hasMidLetters && digits.length > 5) {
    const dashSegmented = /\d{3,}-\d{3,}/.test(part.barePartNumber);
    const tail5 = digits.slice(-5);
    const prefix = digits.slice(0, -5);
    if (!dashSegmented && isStoreLikePrefix(prefix)) {
      const m = catalog.find((a) => a.barePartNumber === tail5);
      if (m) {
        archetype = m;
        matchPass = "2b";
        reason = "MOC number " + m.barePartNumber + " found as trailing suffix (store prefix stripped)";
      }
    }
  }
  // 2c: zero-pad — if bare number is exactly 4 digits, prepend "0" and check.
  if (!archetype && /^\d{4}$/.test(part.barePartNumber)) {
    const padded = "0" + part.barePartNumber;
    const m = catalog.find((a) => a.barePartNumber === padded);
    if (m) {
      archetype = m;
      matchPass = "2c";
      reason = "4-digit number zero-padded to " + padded + " — dealer likely dropping MOC leading zero";
    }
  }

  if (!archetype || !matchPass) return null;

  const complexity = skuComplexity(part.sku);
  const mechName = isMechanicalName(part.partName);

  // NAME-COROBBORATION GUARD: a number-only match to a clearly-OEM/mechanical part
  // whose name shares NO words with the MOC product is almost always a coincidental
  // number collision (e.g. "ELEMENT ASY - AIR CLE" → 02031 transmission kit). Reject
  // it from the deterministic fuzzy pass — the AI pass can still adjudicate it.
  if (mechName && nameOverlap(part.partName, archetype.manufacturerPart) === 0) {
    return null;
  }

  let confidence: Confidence;
  if (complexity === "suspect") {
    confidence = "LOW";
  } else if (matchPass === "2d") {
    // MOC's own catalog number — a strong, near-exact signal. HIGH unless the name
    // reads mechanical (then MEDIUM, still matched + reviewed).
    confidence = mechName ? "MEDIUM" : "HIGH";
  } else if (matchPass === "2b") {
    // Tail5 is inherently MEDIUM — MOC number is buried, more coincidence risk.
    confidence = mechName ? "LOW" : "MEDIUM";
  } else if (matchPass === "2c") {
    // Zero-pad — clean transformation, start MEDIUM. Name can't raise it to HIGH.
    confidence = mechName ? "LOW" : "MEDIUM";
  } else {
    // 2a numeric core.
    confidence = complexity === "clean" ? (mechName ? "MEDIUM" : "HIGH") : mechName ? "LOW" : "MEDIUM";
  }

  if (mechName) reason += " (name contains mechanical terms — confidence lowered)";
  if (complexity === "suspect") reason += " (SKU structure suspect — letters on both ends or complex mixed format)";

  return { archetype, confidence, reason, matchPass };
}
