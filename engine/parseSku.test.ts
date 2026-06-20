import { describe, it, expect } from "vitest";
import { parseSku, detectDms } from "./parseSku";

describe("parseSku", () => {
  it("CDK: never strips, keeps full SKU", () => {
    expect(parseSku("01071", "CDK")).toEqual({ makeCode: null, barePartNumber: "01071", dmsType: "CDK" });
    expect(parseSku("48068-02301", "CDK").barePartNumber).toBe("48068-02301");
  });
  it("R&R: strips known make code, pads to 5", () => {
    expect(parseSku("TO01071", "R&R")).toEqual({ makeCode: "TO", barePartNumber: "01071", dmsType: "R&R" });
    expect(parseSku("SU6002", "R&R").barePartNumber).toBe("06002");
  });
  it("R&R: handles MP-branded make code", () => {
    expect(parseSku("TOMP01071", "R&R")).toEqual({ makeCode: "TOMP", barePartNumber: "01071", dmsType: "R&R" });
  });
  it("R&R: unknown prefix is preserved (not a make code)", () => {
    expect(parseSku("XY01071", "R&R")).toEqual({ makeCode: null, barePartNumber: "XY01071", dmsType: "R&R" });
  });
});

describe("detectDms", () => {
  it("alphabetic-prefixed majority => R&R", () => {
    expect(detectDms(["TO01071", "SU06002", "01071"])).toBe("R&R");
  });
  it("pure-numeric majority => CDK", () => {
    expect(detectDms(["01071", "06002", "TO01071"])).toBe("CDK");
  });
});
