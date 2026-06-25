import { describe, it, expect } from "vitest";
import { normalizeDealerKey, dealerNameFromFile, matchDealer } from "./dealer";

describe("normalizeDealerKey", () => {
  it("folds punctuation/spacing to a stable key", () => {
    expect(normalizeDealerKey("Vegas Auto Gallery - Lotus Las Vegas")).toBe("vegas_auto_gallery_lotus_las_vegas");
    expect(normalizeDealerKey("  DeMontrond  Kia ")).toBe("demontrond_kia");
  });
});
describe("dealerNameFromFile", () => {
  it("strips extension and the _warranty… suffix", () => {
    expect(dealerNameFromFile("vegas_auto_gallery_lotus_las_vegas_warranty_uplift_report_2026_06_22.xlsx")).toBe(
      "vegas auto gallery lotus las vegas"
    );
  });
});
describe("matchDealer", () => {
  it("matches an existing key, else new", () => {
    expect(matchDealer("demontrond_kia", ["demontrond_kia"])).toEqual({ status: "match", key: "demontrond_kia" });
    expect(matchDealer("new_shop", ["demontrond_kia"])).toEqual({ status: "new", key: "new_shop" });
  });
});
