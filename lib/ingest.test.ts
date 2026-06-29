import { describe, it, expect } from "vitest";
import { validateIngest, distinctSkus, flattenParts, countParts } from "./ingest";

const good = {
  store: { id: "S1" },
  period: { start: "2026-05-16", end: "2026-06-16" },
  opLines: [
    { ro: "50863", line: "1", opCode: "10KSYN", opDescription: "10K SERVICE", parts: [{ dealerSku: "A1", partName: "OIL FILTER" }] },
    { ro: "50863", line: "2", opCode: "BR01", opDescription: "BRAKE FLUSH" },
  ],
};

describe("validateIngest", () => {
  it("accepts a well-formed nested body", () => {
    expect(validateIngest(good).ok).toBe(true);
  });
  it("requires store.id, period, and opLines", () => {
    expect(validateIngest({ opLines: [] }).ok).toBe(false);
    expect(validateIngest({ store: { id: "S1" }, period: { start: "a", end: "b" }, opLines: [] }).ok).toBe(false);
  });
  it("requires ro, line, opCode on each op line", () => {
    const r = validateIngest({ store: { id: "S1" }, period: { start: "a", end: "b" }, opLines: [{ ro: "1", line: "1" }] });
    expect(r.ok).toBe(false);
  });
  it("requires a dealerSku on each part", () => {
    const r = validateIngest({ store: { id: "S1" }, period: { start: "a", end: "b" }, opLines: [{ ro: "1", line: "1", opCode: "X", parts: [{ partName: "no sku" }] }] });
    expect(r.ok).toBe(false);
  });
});

describe("countParts / flattenParts", () => {
  it("counts parts across op lines", () => {
    expect(countParts(good.opLines as any)).toBe(1);
  });
  it("flattens parts and carries the parent op description", () => {
    const parts = flattenParts(good.opLines as any);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ dealerSku: "A1", skuDescription: "OIL FILTER", opDescription: "10K SERVICE" });
  });
});

describe("distinctSkus", () => {
  it("collapses duplicate SKUs, keeping the richest line", () => {
    const out = distinctSkus([
      { dealerSku: "A1" },
      { dealerSku: "a1", skuDescription: "FULL", opDescription: "BRAKE FLUSH" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].skuDescription).toBe("FULL");
  });
});
