import { describe, it, expect, vi } from "vitest";
import { saveRunSnapshot, loadRunSummaries, loadRunDecisions } from "./repo";

describe("saveRunSnapshot", () => {
  it("defaults status to in_progress and passes an explicit status through", async () => {
    const calls: any[][] = [];
    const sql = vi.fn(async (_s: any, ...vals: any[]) => {
      calls.push(vals);
      return [];
    }) as any;
    await saveRunSnapshot(sql, { runId: "r1", dealer: "D", fileName: "f", total: 1, matched: 1, review: 0, unmatched: 0, snapshot: [] });
    expect(calls[0]).toContain("in_progress");
    await saveRunSnapshot(sql, { runId: "r1", dealer: "D", fileName: "f", total: 1, matched: 1, review: 0, unmatched: 0, snapshot: [], status: "reviewed" });
    expect(calls[1]).toContain("reviewed");
  });
});

describe("loadRunSummaries", () => {
  it("maps status and the decided count", async () => {
    const sql = vi.fn(async () => [
      { run_id: "r1", dealer: "D", file_name: "f", total: 12, matched: 10, review: 1, unmatched: 1, status: "in_progress", decided: "5", ran_at: "2026-06-25T00:00:00Z" },
    ]) as any;
    const out = await loadRunSummaries(sql);
    expect(out[0]).toMatchObject({ status: "in_progress", decided: 5, total: 12 });
  });
});

describe("loadRunDecisions", () => {
  it("returns the outcome per sku as a map", async () => {
    const sql = vi.fn(async () => [
      { sku: "A1", outcome: "approve" },
      { sku: "B2", outcome: "reject" },
    ]) as any;
    const map = await loadRunDecisions(sql, "r1");
    expect(map).toEqual({ A1: "approve", B2: "reject" });
  });
});
