import { describe, it, expect } from "vitest";
import { exactMatch, nameOverlap } from "./exact";
import type { Part, Archetype, ApprovedMapping } from "./types";

const catalog: Archetype[] = [{ barePartNumber: "01071", manufacturerPart: "01071 - E-SHIELD, 8OZ", incentive: 5 }];
const part = (sku: string, bare: string, name: string): Part => ({
  sku,
  partName: name,
  makeCode: null,
  barePartNumber: bare,
  dmsType: "CDK",
  structural: { score: 2, label: "STRONG", detail: "" },
});

describe("exactMatch", () => {
  it("canonical bare-number match", () => {
    const r = exactMatch(part("01071", "01071", "E-SHIELD"), catalog, []);
    expect(r).toMatchObject({ kind: "canonical" });
  });
  it("approved SKU with overlapping name", () => {
    const ap: ApprovedMapping = { dmsSku: "Z9", dmsPartName: "E-SHIELD COAT", barePartNumber: "01071", manufacturerPart: "01071 - E-SHIELD, 8OZ", incentive: 5 };
    const r = exactMatch(part("Z9", "Z9", "E-SHIELD"), catalog, [ap]);
    expect(r).toMatchObject({ kind: "approved" });
  });
  it("approved SKU with zero name overlap => divergence", () => {
    const ap: ApprovedMapping = { dmsSku: "Z9", dmsPartName: "E-SHIELD COAT", barePartNumber: "01071", manufacturerPart: "x", incentive: 5 };
    const r = exactMatch(part("Z9", "Z9", "BRAKE ROTOR"), catalog, [ap]);
    expect(r).toMatchObject({ kind: "divergence" });
  });
});

describe("nameOverlap", () => {
  it("counts shared significant tokens", () => {
    expect(nameOverlap("E-SHIELD COAT", "E-SHIELD SPRAY")).toBeGreaterThan(0);
  });
});
