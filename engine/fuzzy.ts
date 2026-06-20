import type { Part, Archetype, Confidence } from "./types";
import { numericCore, skuComplexity, isMechanicalName } from "./heuristics";

// Fuzzy numeric match with three sub-strategies:
//   2a numeric-core    — strips non-digits and compares cores
//   2b trailing-suffix — last 5 digits match a MOC archetype (store-prefix formats)
//   2c zero-pad        — 4-digit number, prepend "0" and check (dropped leading zero)
// Confidence is then derived from SKU complexity, the sub-pass, and the name.
export function fuzzyMatch(
  part: Part,
  catalog: Archetype[]
): { archetype: Archetype; confidence: Confidence; reason: string; matchPass: "2a" | "2b" | "2c" } | null {
  const digits = part.barePartNumber.replace(/[^0-9]/g, "");
  const core = numericCore(part.barePartNumber);
  const stripped = part.barePartNumber.replace(/-/g, "");
  const hasMidLetters = /\d[A-Z]+\d/i.test(stripped);

  let archetype: Archetype | null = null;
  let matchPass: "2a" | "2b" | "2c" | null = null;
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
  // 2b: trailing suffix — last 5 digits exactly match a MOC archetype.
  if (!archetype && !hasMidLetters && digits.length > 5) {
    const tail5 = digits.slice(-5);
    const m = catalog.find((a) => a.barePartNumber === tail5);
    if (m) {
      archetype = m;
      matchPass = "2b";
      reason = "MOC number " + m.barePartNumber + " found as trailing suffix (store prefix stripped)";
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

  let confidence: Confidence;
  if (complexity === "suspect") {
    confidence = "LOW";
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
