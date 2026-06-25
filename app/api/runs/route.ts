import { NextResponse } from "next/server";
import { db } from "../../../db/client";
import { saveRunSnapshot, loadRunSummaries } from "../../../db/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sql: any = db();
    return NextResponse.json(await loadRunSummaries(sql));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load runs." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const r = await req.json();
    if (!r.runId) return NextResponse.json({ error: "runId is required." }, { status: 400 });
    const sql: any = db();
    await saveRunSnapshot(sql, {
      runId: r.runId,
      dealer: r.dealer ?? "",
      fileName: r.fileName ?? "",
      total: r.total ?? 0,
      matched: r.matched ?? 0,
      review: r.review ?? 0,
      unmatched: r.unmatched ?? 0,
      snapshot: r.snapshot ?? [],
      status: r.status ?? "in_progress",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to save run." }, { status: 500 });
  }
}
