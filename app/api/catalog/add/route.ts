import { NextResponse } from "next/server";
import { db } from "../../../../db/client";
import { upsertArchetype, upsertApprovedMapping, recordDecision } from "../../../../db/repo";

export const runtime = "nodejs";

// Add a new product found in a dealer file to the catalog, and capture the DMS
// info that revealed it. Records the decision against the original bucket so it
// counts as a rescued MOC part in the identification rate.
export async function POST(req: Request) {
  try {
    const { row, barePartNumber, productName, runId, dealer } = await req.json();
    const bare = String(barePartNumber || "").trim();
    const name = String(productName || "").trim();
    if (!bare || !name) {
      return NextResponse.json({ error: "A MOC part number and product name are required." }, { status: 400 });
    }
    const manufacturerPart = `${bare} - ${name}`;
    const sql: any = db();

    await upsertArchetype(sql, { barePartNumber: bare, manufacturerPart });
    if (row?.sku) {
      await upsertApprovedMapping(sql, { dmsSku: row.sku, dmsPartName: row.partName ?? "", barePartNumber: bare, manufacturerPart });
      await recordDecision(sql, {
        sku: row.sku,
        partName: row.partName ?? "",
        matchType: row.matchType ?? "UNMATCHED",
        confidence: row.confidence ?? null,
        outcome: "correct",
        barePartNumber: bare,
        runId: runId ?? null,
        dealer: dealer ?? null,
      });
    }

    return NextResponse.json({ ok: true, barePartNumber: bare, manufacturerPart });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't add to catalog." }, { status: 500 });
  }
}
