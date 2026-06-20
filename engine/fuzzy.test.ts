import { describe, it, expect } from "vitest";
import { fuzzyMatch } from "./fuzzy";
import type { Part, Archetype } from "./types";

const catalog: Archetype[] = [
  { barePartNumber: "04461", manufacturerPart: "04461 - SHYFT, 12OZ", incentive: 10 },
  { barePartNumber: "02301", manufacturerPart: "02301 - X", incentive: 0 },
];
const part = (sku: string, bare: string, name = "SHYFT"): Part => ({
  sku,
  partName: name,
  makeCode: null,
  barePartNumber: bare,
  dmsType: "CDK",
  structural: { score: 1, label: "POSSIBLE", detail: "" },
});

describe("fuzzyMatch", () => {
  it("2b trailing suffix on store-prefixed number => MEDIUM", () => {
    const r = fuzzyMatch(part("8888804461", "8888804461"), catalog);
    expect(r).toMatchObject({ matchPass: "2b", confidence: "MEDIUM" });
    expect(r!.archetype.barePartNumber).toBe("04461");
  });
  it("4-digit dropped-zero number resolves to the zero-padded archetype", () => {
    // "2301" → "02301". Resolved via the 2a numeric-core path, which shadows the
    // 2c zero-pad path: numericCore collapses the leading zero either way, so 2a
    // matches first. (Faithful to the original pipeline.)
    const r = fuzzyMatch(part("2301", "2301", "ATF FLUSH"), catalog);
    expect(r!.archetype.barePartNumber).toBe("02301");
    expect(r!.confidence).toBe("HIGH");
  });
  it("2a clean numeric core => HIGH", () => {
    const r = fuzzyMatch(part("04461", "4461"), catalog);
    expect(r).toMatchObject({ matchPass: "2a", confidence: "HIGH" });
  });
  it("mid-letter OEM number => no fuzzy match", () => {
    expect(fuzzyMatch(part("76620-T20-A01", "76620-T20-A01"), catalog)).toBeNull();
  });
});
