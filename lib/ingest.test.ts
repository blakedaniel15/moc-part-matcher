import { describe, it, expect } from "vitest";
import { validateIngest, distinctSkus } from "./ingest";

describe("validateIngest", () => {
  it("requires store.id, period, and lines", () => {
    expect(validateIngest({ lines: [] }).ok).toBe(false);
    const good = validateIngest({ store: { id: "S1" }, period: { start: "2026-06-16", end: "2026-06-22" }, lines: [{ dealerSku: "A1" }] });
    expect(good.ok).toBe(true);
  });
  it("rejects a line with no dealerSku", () => {
    const r = validateIngest({ store: { id: "S1" }, period: { start: "a", end: "b" }, lines: [{ skuDescription: "x" }] });
    expect(r.ok).toBe(false);
  });
});

describe("distinctSkus", () => {
  it("collapses duplicate SKUs, keeping the line with the most fields", () => {
    const out = distinctSkus([
      { dealerSku: "A1" },
      { dealerSku: "a1", skuDescription: "FULL", opDescription: "BRAKE FLUSH" },
      { dealerSku: "B2", skuDescription: "B" },
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((l) => l.dealerSku.toUpperCase() === "A1")?.skuDescription).toBe("FULL");
  });
});
