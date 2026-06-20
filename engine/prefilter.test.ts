import { describe, it, expect } from "vitest";
import { prefilterSkip } from "./prefilter";
import type { Part, StructuralLabel } from "./types";

const mk = (sku: string, name: string, label: StructuralLabel): Part => ({
  sku,
  partName: name,
  makeCode: null,
  barePartNumber: sku,
  dmsType: "CDK",
  structural: {
    score: label === "UNLIKELY" ? 0 : label === "POSSIBLE" ? 1 : 2,
    label,
    detail: "",
  },
});

describe("prefilterSkip", () => {
  it("Nissan 999MP OEM => skip", () => {
    expect(prefilterSkip(mk("999MP1234", "WHATEVER", "POSSIBLE"), { dealerBrand: "all" })).toMatch(/Nissan/);
  });
  it("CR2032 battery+key name => skip", () => {
    expect(prefilterSkip(mk("CR2032", "KEY FOB BATTERY", "POSSIBLE"), { dealerBrand: "all" })).toMatch(/coin cell|2032/i);
  });
  it("UNLIKELY + mechanical name => skip", () => {
    expect(prefilterSkip(mk("ABC123XYZ", "ABS SPEED SENSOR", "UNLIKELY"), { dealerBrand: "all" })).toBeTruthy();
  });
  it("chemical name, POSSIBLE => goes to AI (null)", () => {
    expect(prefilterSkip(mk("12345", "ATF FLUSH", "POSSIBLE"), { dealerBrand: "all" })).toBeNull();
  });
});
