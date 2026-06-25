import { describe, it, expect, vi } from "vitest";
import { newPartsTask, createClickUpTask } from "./clickup";
import type { MatchResult } from "../engine/types";

const r = (sku: string, moc: string): MatchResult => ({
  sku, partName: "TRANS SERV", makeCode: null, barePartNumber: sku, dmsType: "CDK",
  structural: { score: 1, label: "POSSIBLE", detail: "" },
  matchType: "FUZZY", matchedArchetype: `${moc} - SHYFT`, matchedPartNumber: moc, confidence: "MEDIUM", reason: "", incentive: null,
});

describe("newPartsTask", () => {
  it("titles with dealer + count and lists parts", () => {
    const t = newPartsTask("Modesto Toyota", [r("8888804461", "04461")]);
    expect(t.name).toContain("Modesto Toyota");
    expect(t.name).toContain("1");
    expect(t.markdown).toContain("8888804461");
    expect(t.markdown).toContain("04461");
  });
});

describe("createClickUpTask", () => {
  it("POSTs to the ClickUp list endpoint with the token", async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ id: "t1" }) })) as any;
    await createClickUpTask({ token: "tok", listId: "901", fetchImpl: f }, { name: "n", markdown: "m" });
    expect(f).toHaveBeenCalledWith("https://api.clickup.com/api/v2/list/901/task", expect.objectContaining({ method: "POST" }));
    expect(f.mock.calls[0][1].headers.Authorization).toBe("tok");
  });
});
