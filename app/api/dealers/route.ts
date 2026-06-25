import { NextResponse } from "next/server";
import { db } from "../../../db/client";
import { loadDealerKeys, upsertDealer } from "../../../db/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sql: any = db();
    return NextResponse.json(await loadDealerKeys(sql));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load dealers." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { key, name, dmsType } = await req.json();
    if (!key || !name) return NextResponse.json({ error: "key and name required." }, { status: 400 });
    const sql: any = db();
    await upsertDealer(sql, { key, name, dmsType: dmsType ?? null });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to save dealer." }, { status: 500 });
  }
}
