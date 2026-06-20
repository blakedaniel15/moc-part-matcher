import { describe, it, expect } from "vitest";
import { numericCore, skuComplexity, isMechanicalName } from "./heuristics";

describe("numericCore", () => {
  it("strips formatting and leading zeros", () => {
    expect(numericCore("01-071A")).toBe("1071");
    expect(numericCore("06002")).toBe("6002");
  });
});

describe("skuComplexity", () => {
  it("all-numeric => clean", () => expect(skuComplexity("8888804461")).toBe("clean"));
  it("make-code + digits => clean", () => expect(skuComplexity("TO04181")).toBe("clean"));
  it("letters on both ends => suspect", () => expect(skuComplexity("68004181AC")).toBe("suspect"));
});

describe("isMechanicalName", () => {
  it("safe phrase wins over compound", () => expect(isMechanicalName("GEAR GUARD 75W-90")).toBe(false));
  it("OEM compound flagged", () => expect(isMechanicalName("ABS SPEED SENSOR")).toBe(true));
  it("plain chemical name not flagged", () => expect(isMechanicalName("ATF FLUSH")).toBe(false));
});
