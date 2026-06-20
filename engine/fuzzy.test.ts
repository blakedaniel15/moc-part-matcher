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
  it("2c zero-pad on 4-digit => MEDIUM", () => {
    const r = fuzzyMatch(part("2301", "2301", "ATF FLUSH"), catalog);
    expect(r).toMatchObject({ matchPass: "2c", confidence: "MEDIUM" });
  });
  it("2a clean numeric core => HIGH", () => {
    const r = fuzzyMatch(part("04461", "4461"), catalog);
    expect(r).toMatchObject({ matchPass: "2a", confidence: "HIGH" });
  });
  it("mid-letter OEM number => no fuzzy match", () => {
    expect(fuzzyMatch(part("76620-T20-A01", "76620-T20-A01"), catalog)).toBeNull();
  });
});
