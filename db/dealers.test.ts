import { describe, it, expect, vi } from "vitest";
import { loadDealerKeys } from "./repo";

describe("loadDealerKeys", () => {
  it("maps rows to keys", async () => {
    const sql = vi.fn(async () => [{ key: "demontrond_kia" }, { key: "vegas_auto" }]) as any;
    expect(await loadDealerKeys(sql)).toEqual(["demontrond_kia", "vegas_auto"]);
  });
});
