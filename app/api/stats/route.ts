import { NextResponse } from "next/server";
import { db } from "../../../db/client";
import { loadDecisions, loadRunSummaries } from "../../../db/repo";
import { computeStats } from "../../../lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sql: any = db();
    const [decisions, runs] = await Promise.all([loadDecisions(sql), loadRunSummaries(sql)]);
    const summaries = runs.map((r) => ({ runId: r.runId, dealer: r.dealer, review: r.review, total: r.total, ranAt: r.ranAt }));
    return NextResponse.json(computeStats(decisions, summaries));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load stats." }, { status: 500 });
  }
}
