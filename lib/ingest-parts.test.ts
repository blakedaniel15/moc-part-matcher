import { describe, it, expect } from "vitest";
import { partsFromLines } from "./ingest-parts";

describe("partsFromLines", () => {
  it("builds Parts with name + op description, dms detected from skus", () => {
    const parts = partsFromLines([
      { dealerSku: "8888804461", skuDescription: "TRANS SERV", opDescription: "TRANSMISSION SERVICE" },
    ]);
    expect(parts[0]).toMatchObject({ sku: "8888804461", partName: "TRANS SERV", opDescription: "TRANSMISSION SERVICE" });
    expect(parts[0].barePartNumber).toBe("8888804461");
  });
});
