import { describe, it, expect } from "vitest";
import { buildDealerProfile } from "./dealer-profile";

describe("buildDealerProfile", () => {
  it("builds aliases + examples from named mappings", () => {
    const { aliases, examples } = buildDealerProfile([
      { sku: "X1", moc: "04461", name: "TRANS SERV" },
      { sku: "X2", moc: "01071", name: "E-SHIELD" },
      { sku: "X3", moc: "01071" }, // no name -> contributes nothing
    ]);
    expect(aliases["04461"]).toEqual(["TRANS SERV"]);
    expect(examples).toContainEqual({ name: "TRANS SERV", barePartNumber: "04461" });
    expect(examples.find((e) => (e as any).name === undefined)).toBeUndefined();
  });
});
