import type { Structural } from "./types";

// MOC parts are almost always 5-digit numeric, often with a leading zero.
// This is a weighted prior on the part-number shape, NOT a match verdict.
export function analyzeStructure(barePartNumber: string): Structural {
  const s = String(barePartNumber).trim();
  const allDigits = /^\d+$/.test(s);

  // Single-letter prefix + 5-digit number = R&R make-code format (e.g. M02421, A04461).
  const singleLetterPrefix = /^[A-Z](\d{5})$/i.exec(s);
  if (singleLetterPrefix) {
    const digits = singleLetterPrefix[1];
    return digits.startsWith("0")
      ? { score: 2, label: "STRONG", detail: "Single-letter prefix + 5-digit number — R&R make-code format with leading zero (e.g. M02421, A04461)" }
      : { score: 1, label: "POSSIBLE", detail: "Single-letter prefix + 5-digit number — R&R make-code format (e.g. M02421)" };
  }

  if (!allDigits)
    return { score: 0, label: "UNLIKELY", detail: "Mixed alphanumeric — OEM part number, not MOC format" };
  if (s.length === 5 && s.startsWith("0"))
    return { score: 2, label: "STRONG", detail: "5-digit numeric with leading zero — matches MOC pattern closely" };
  if (s.length === 5)
    return { score: 1, label: "POSSIBLE", detail: "5-digit numeric — consistent with MOC part structure" };
  if (s.length === 4)
    return { score: 1, label: "POSSIBLE", detail: "4-digit numeric — likely MOC number with dropped leading zero (e.g. 2301 → 02301)" };
  return { score: 0, label: "UNLIKELY", detail: s.length + "-digit numeric — MOC parts are 5 digits" };
}
