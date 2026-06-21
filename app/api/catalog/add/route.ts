import { NextResponse } from "next/server";
import { db } from "../../../../db/client";
import { upsertArchetype, upsertApprovedMapping, recordDecision } from "../../../../db/repo";

export const runtime = "nodejs";

// Add a new product found in a dealer file to the catalog, and capture the DMS
// info that revealed it: the new archetype goes into `archetypes`, and the dealer
// SKU -> archetype mapping goes into `approved_mappings` so it auto-matches next run.
export async function POST(req: Request) {
  try {
    const { sku, partName, barePartNumber, productName } = await req.json();
    const bare = String(barePartNumber || "").trim();
    const name = String(productName || "").trim();
    if (!bare || !name) {
      return NextResponse.json({ error: "A MOC part number and product name are required." }, { status: 400 });
    }
    const manufacturerPart = `${bare} - ${name}`;
    const sql: any = db();

    await upsertArchetype(sql, { barePartNumber: bare, manufacturerPart });
    if (sku) {
      await upsertApprovedMapping(sql, {
        dmsSku: sku,
        dmsPartName: partName ?? "",
        barePartNumber: bare,
        manufacturerPart,
      });
      await recordDecision(sql, {
        sku,
        partName: partName ?? "",
        matchType: "CATALOG_ADD",
        confidence: null,
        outcome: "correct",
        barePartNumber: bare,
      });
    }

    return NextResponse.json({ ok: true, barePartNumber: bare, manufacturerPart });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't add to catalog." }, { status: 500 });
  }
}
