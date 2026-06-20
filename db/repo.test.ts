import { describe, it, expect, vi } from "vitest";
import { loadCatalog, loadApproved, recordDecision } from "./repo";

const fakeSql = (rows: any[]) => vi.fn(async () => rows) as any;

describe("repo", () => {
  it("loadCatalog maps rows to Archetype", async () => {
    const sql = fakeSql([{ bare_part_number: "01071", manufacturer_part: "01071 - E-SHIELD, 8OZ", incentive: 5 }]);
    const cat = await loadCatalog(sql);
    expect(cat[0]).toEqual({ barePartNumber: "01071", manufacturerPart: "01071 - E-SHIELD, 8OZ", incentive: 5 });
  });
  it("loadApproved maps rows to ApprovedMapping", async () => {
    const sql = fakeSql([{ dms_sku: "Z9", dms_part_name: "E-SHIELD", bare_part_number: "01071", manufacturer_part: "x", incentive: 5 }]);
    const a = await loadApproved(sql);
    expect(a[0]).toMatchObject({ dmsSku: "Z9", barePartNumber: "01071" });
  });
  it("recordDecision executes without throwing", async () => {
    const sql = fakeSql([]);
    await expect(
      recordDecision(sql, { sku: "A", partName: "", matchType: "AI", confidence: "LOW", outcome: "approve", barePartNumber: "04461" })
    ).resolves.toBeUndefined();
  });
});
