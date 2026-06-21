import { NextResponse } from "next/server";
import { db } from "../../../db/client";
import { loadCatalogFull } from "../../../db/repo";

export const runtime = "nodejs";

export async function GET() {
  try {
    const sql: any = db();
    const catalog = await loadCatalogFull(sql);
    return NextResponse.json(catalog);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load catalog." }, { status: 500 });
  }
}
