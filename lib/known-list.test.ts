import { describe, it, expect } from "vitest";
import { knownListFromRows } from "./known-list";

describe("knownListFromRows", () => {
  it("reads SKU (required) + optional MOC#/Name columns", () => {
    const rows = [
      ["SKU", "MOC#", "Name"],
      ["8888804461", "04461", "SHYFT"],
      ["A01071", "01071", ""],
      ["", "", ""],
    ];
    const k = knownListFromRows(rows);
    expect([...k.skus]).toEqual(["8888804461", "A01071"]);
    expect(k.mappings[0]).toEqual({ sku: "8888804461", moc: "04461", name: "SHYFT" });
  });
  it("works with only a SKU column", () => {
    const k = knownListFromRows([["SKU"], ["3381"], ["6002"]]);
    expect([...k.skus]).toEqual(["3381", "6002"]);
    expect(k.mappings).toEqual([]);
  });
});
