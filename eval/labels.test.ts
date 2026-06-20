import { describe, it, expect } from "vitest";
import { labelsFromExport, splitHeldOut } from "./labels";

describe("labelsFromExport", () => {
  it("derives positive labels from approvedMappings", () => {
    const exp = {
      approvedMappings: [{ dmsSku: "Z9", dmsPartName: "E-SHIELD", barePartNumber: "01071" }],
      blockedSkus: [],
      dealerRejections: {},
    };
    const labels = labelsFromExport(exp);
    expect(labels).toContainEqual({ sku: "Z9", partName: "E-SHIELD", expectedBare: "01071" });
  });
  it("derives negative labels from blockedSkus", () => {
    const exp = { approvedMappings: [], blockedSkus: [{ sku: "BAD1" }], dealerRejections: {} };
    const labels = labelsFromExport(exp);
    expect(labels).toContainEqual({ sku: "BAD1", partName: "", expectedBare: null });
  });
});

describe("splitHeldOut", () => {
  it("is deterministic for a fixed seed", () => {
    const labels = Array.from({ length: 10 }, (_, i) => ({ sku: "S" + i, partName: "", expectedBare: "01071" }));
    const a = splitHeldOut(labels, 0.2, 42);
    const b = splitHeldOut(labels, 0.2, 42);
    expect(a.heldOut.map((x) => x.sku)).toEqual(b.heldOut.map((x) => x.sku));
    expect(a.heldOut.length).toBe(2);
  });
});
