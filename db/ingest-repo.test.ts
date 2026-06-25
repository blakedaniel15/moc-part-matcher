import { describe, it, expect, vi } from "vitest";
import { loadKnownSkus } from "./repo";

describe("loadKnownSkus", () => {
  it("returns an uppercased Set of skus for the dealer", async () => {
    const sql = vi.fn(async () => [{ sku: "a1" }, { sku: "B2" }]) as any;
    const set = await loadKnownSkus(sql, "demo");
    expect(set.has("A1")).toBe(true);
    expect(set.has("B2")).toBe(true);
  });
});
