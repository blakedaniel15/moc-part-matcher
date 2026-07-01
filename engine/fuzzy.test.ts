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

  it("2d MOC brand number: M + bare + trailing size digit => HIGH", () => {
    // M012110 -> 01211 (leading zero preserved, trailing 0 dropped).
    const cat: Archetype[] = [{ barePartNumber: "01211", manufacturerPart: "01211 - MOTOR OIL CONDITIONER", incentive: 0 }];
    const r = fuzzyMatch(part("M012110", "M012110", "ENGINE OIL CONDITIONER"), cat);
    expect(r).toMatchObject({ matchPass: "2d", confidence: "HIGH" });
    expect(r!.archetype.barePartNumber).toBe("01211");
  });
  it("2d only fires when the embedded 5 digits are a real archetype", () => {
    expect(fuzzyMatch(part("M999990", "M999990", "MYSTERY GOO"), catalog)).toBeNull();
  });
});

describe("fuzzyMatch 2b store-prefix guard", () => {
  const cat2b: Archetype[] = [
    { barePartNumber: "04461", manufacturerPart: "04461 - SHYFT, 12OZ", incentive: 10 },
    { barePartNumber: "02301", manufacturerPart: "02301 - COOLING KIT", incentive: 0 },
    { barePartNumber: "01201", manufacturerPart: "01201 - DOUBLE CLEAN", incentive: 0 },
  ];
  const p2b = (sku: string, bare: string, name: string): Part => ({
    sku, partName: name, makeCode: null, barePartNumber: bare, dmsType: "R&R",
    structural: { score: 0, label: "UNLIKELY", detail: "" },
  });

  it("keeps legit store-prefixed match (repeated-digit prefix)", () => {
    const r = fuzzyMatch(p2b("8888804461", "8888804461", "TRANSMISSION SERV"), cat2b);
    expect(r?.archetype.barePartNumber).toBe("04461");
  });
  it("rejects dash-segmented OEM number", () => {
    expect(fuzzyMatch(p2b("TO48068-02301", "TO48068-02301", "ARM SUB-ASSY"), cat2b)).toBeNull();
  });
  it("rejects make-code + non-store-like prefix (NUT LOCK != DOUBLE CLEAN)", () => {
    expect(fuzzyMatch(p2b("SU9418801201", "9418801201", "NUT LOCK"), cat2b)).toBeNull();
  });
});

describe("fuzzyMatch name-corroboration guard", () => {
  const cat = [{ barePartNumber: "02031", manufacturerPart: "02031 - KIT, TRANSMISSION SERVICE, 2-PART", incentive: 0 }];
  const p = (sku: string, bare: string, name: string): Part => ({
    sku, partName: name, makeCode: null, barePartNumber: bare, dmsType: "CDK",
    structural: { score: 0, label: "UNLIKELY", detail: "" },
  });

  it("rejects OEM mechanical name that coincidentally shares a number", () => {
    // FA2031 (core 2031) numerically matches 02031, but the name is an air-cleaner element.
    expect(fuzzyMatch(p("FA2031", "FA2031", "ELEMENT ASY - AIR CLE"), cat)).toBeNull();
  });
  it("keeps a chemical cross-name match (different name, not mechanical)", () => {
    const r = fuzzyMatch(p("2031", "2031", "TRANS SERVICE KIT"), cat);
    expect(r?.archetype.barePartNumber).toBe("02031");
  });
});
