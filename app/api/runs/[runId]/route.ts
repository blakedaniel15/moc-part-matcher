import { NextResponse } from "next/server";
import { db } from "../../../../db/client";
import { loadRunSnapshot } from "../../../../db/repo";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { runId: string } }) {
  try {
    const sql: any = db();
    const run = await loadRunSnapshot(sql, params.runId);
    if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
    return NextResponse.json(run);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load run." }, { status: 500 });
  }
}
