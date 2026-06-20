import { describe, it, expect } from "vitest";
import { runMatch } from "./core";
import type { Part } from "../../../engine/types";
import { RecordedAdjudicator } from "../../../engine/adjudicator";

const part = (sku: string, bare: string): Part => ({
  sku,
  partName: "E-SHIELD",
  makeCode: null,
  barePartNumber: bare,
  dmsType: "CDK",
  structural: { score: 2, label: "STRONG", detail: "" },
});

describe("runMatch (handler core)", () => {
  it("runs the pipeline with injected deps", async () => {
    const out = await runMatch(
      { parts: [part("01071", "01071")], dealerBrand: "all" },
      {
        catalog: [{ barePartNumber: "01071", manufacturerPart: "01071 - E-SHIELD, 8OZ", incentive: 5 }],
        approved: [],
        blockedSkus: [],
        dealerRejections: [],
        adjudicator: new RecordedAdjudicator({}),
      }
    );
    expect(out[0]).toMatchObject({ matchType: "EXACT", matchedPartNumber: "01071" });
  });
});
