import { NextResponse } from "next/server";
import { db } from "../../../db/client";
import { recordDecision, upsertApprovedMapping, addDealerRejection } from "../../../db/repo";

export const runtime = "nodejs";

// Persist a human verdict on a part.
//  - approve: confirm the system's match (counts toward the identification numerator)
//  - correct: rescue a part to a chosen existing archetype (denominator, manual)
//  - reject:  the match is wrong / not MOC
// Every decision records the ORIGINAL bucket (row.matchType + confidence) and a
// run_id so Stats can compute the MOC identification rate per file and overall.
export async function POST(req: Request) {
  try {
    const { dealer, outcome, row, runId, chosenBare, chosenName } = await req.json();
    if (!["approve", "reject", "correct"].includes(outcome)) {
      return NextResponse.json({ error: "outcome must be approve, reject, or correct." }, { status: 400 });
    }
    const sql: any = db();

    const targetBare = outcome === "approve" ? row.matchedPartNumber : outcome === "correct" ? chosenBare : null;
    const targetName = outcome === "approve" ? row.matchedArchetype : outcome === "correct" ? chosenName : null;

    await recordDecision(sql, {
      sku: row.sku,
      partName: row.partName ?? "",
      matchType: row.matchType ?? null,
      confidence: row.confidence ?? null,
      outcome,
      barePartNumber: targetBare ?? null,
      runId: runId ?? null,
      dealer: dealer ?? null,
    });

    if ((outcome === "approve" || outcome === "correct") && targetBare) {
      await upsertApprovedMapping(sql, {
        dmsSku: row.sku,
        dmsPartName: row.partName ?? "",
        barePartNumber: targetBare,
        manufacturerPart: targetName ?? targetBare,
      });
    } else if (outcome === "reject") {
      await addDealerRejection(sql, dealer || "unknown", row.sku);
    }

    return NextResponse.json({ ok: true, barePartNumber: targetBare, manufacturerPart: targetName });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to save decision." }, { status: 500 });
  }
}
