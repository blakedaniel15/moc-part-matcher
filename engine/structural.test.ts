import { describe, it, expect } from "vitest";
import { analyzeStructure } from "./structural";

describe("analyzeStructure", () => {
  it("5-digit with leading zero => STRONG", () => {
    expect(analyzeStructure("01071")).toMatchObject({ score: 2, label: "STRONG" });
  });
  it("single-letter prefix + 5 digits leading zero => STRONG", () => {
    expect(analyzeStructure("A04461")).toMatchObject({ score: 2, label: "STRONG" });
  });
  it("5-digit no leading zero => POSSIBLE", () => {
    expect(analyzeStructure("16501")).toMatchObject({ score: 1, label: "POSSIBLE" });
  });
  it("4-digit numeric => POSSIBLE", () => {
    expect(analyzeStructure("2301")).toMatchObject({ score: 1, label: "POSSIBLE" });
  });
  it("mixed alphanumeric => UNLIKELY", () => {
    expect(analyzeStructure("76620-T20-A01")).toMatchObject({ score: 0, label: "UNLIKELY" });
  });
  it("wrong digit count => UNLIKELY", () => {
    expect(analyzeStructure("123")).toMatchObject({ score: 0, label: "UNLIKELY" });
  });
});
