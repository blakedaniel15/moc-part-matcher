import { NextResponse } from "next/server";
import { db } from "../../../../db/client";
import { loadRunSnapshot, loadRunDecisions } from "../../../../db/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { runId: string } }) {
  try {
    const sql: any = db();
    const run = await loadRunSnapshot(sql, params.runId);
    if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
    // Prior decisions so reopening restores the Yes/No state (best-effort).
    let decisions: Record<string, string> = {};
    try {
      decisions = await loadRunDecisions(sql, params.runId);
    } catch {
      /* reopen falls back to blank decisions */
    }
    return NextResponse.json({ ...run, decisions });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load run." }, { status: 500 });
  }
}
