import { NextResponse } from "next/server";
import { db } from "../../../db/client";
import { recordDecision, upsertApprovedMapping, addDealerRejection } from "../../../db/repo";

export const runtime = "nodejs";

// Persist a human Yes/No on a match. Always logs to `decisions` (audit + labeled set);
// "approve" also saves the dealer-SKU mapping, "reject" records a per-dealer skip.
export async function POST(req: Request) {
  try {
    const { dealer, outcome, row } = await req.json();
    if (outcome !== "approve" && outcome !== "reject") {
      return NextResponse.json({ error: "outcome must be 'approve' or 'reject'." }, { status: 400 });
    }
    const sql: any = db();

    await recordDecision(sql, {
      sku: row.sku,
      partName: row.partName ?? "",
      matchType: row.matchType ?? null,
      confidence: row.confidence ?? null,
      outcome,
      barePartNumber: row.matchedPartNumber ?? null,
    });

    if (outcome === "approve" && row.matchedPartNumber) {
      await upsertApprovedMapping(sql, {
        dmsSku: row.sku,
        dmsPartName: row.partName ?? "",
        barePartNumber: row.matchedPartNumber,
        manufacturerPart: row.matchedArchetype ?? row.matchedPartNumber,
      });
    } else if (outcome === "reject") {
      await addDealerRejection(sql, dealer || "unknown", row.sku);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to save decision." }, { status: 500 });
  }
}
