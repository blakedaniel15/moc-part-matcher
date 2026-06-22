import { NextResponse } from "next/server";
import { db } from "../../../db/client";
import { loadDecisions } from "../../../db/repo";
import { computeStats } from "../../../lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sql: any = db();
    const decisions = await loadDecisions(sql);
    return NextResponse.json(computeStats(decisions));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load stats." }, { status: 500 });
  }
}
