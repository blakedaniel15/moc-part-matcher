import { describe, it, expect } from "vitest";
import { archetypeRows, approvedRows, blockedRows } from "./transforms";

describe("seed transforms", () => {
  it("maps archetype fields incl components", () => {
    const rows = archetypeRows([
      { barePartNumber: "02321", manufacturerPart: "02321 - Air Intake & Emission Cleaner Kit", incentive: 10, components: ["01201"], source: "official" },
    ]);
    expect(rows[0]).toMatchObject({ bare_part_number: "02321", incentive: 10, components: ["01201"] });
  });
  it("dedupes approved by dms_sku (last wins)", () => {
    const exp = {
      approvedMappings: [
        { dmsSku: "A16501", dmsPartName: "OPT", barePartNumber: "16501", manufacturerPart: "x", incentive: 10 },
        { dmsSku: "A16501", dmsPartName: "OPT", barePartNumber: "16501", manufacturerPart: "x", incentive: 10 },
      ],
    };
    expect(approvedRows(exp)).toHaveLength(1);
  });
  it("maps blocked rows", () => {
    const exp = { blockedSkus: [{ sku: "TO48068-02301", partName: "ARM SUB-ASSY" }] };
    expect(blockedRows(exp)[0]).toMatchObject({ sku: "TO48068-02301", part_name: "ARM SUB-ASSY" });
  });
});
