import { NextResponse } from "next/server";
import { checkBearer } from "../../../../lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The ingest contract, reflected so integrators can verify reachability + payload
// shape + their API key without creating any data. No DB, no side effects.
const CONTRACT = {
  service: "moc-part-matcher ingest",
  version: "v1",
  endpoint: "POST /api/v1/sales",
  required: ["store.id", "period.start", "period.end", "lines[].dealerSku"],
  optional: [
    "store.name",
    "store.dmsType",
    "knownSkus",
    "lines[].skuDescription",
    "lines[].opCode",
    "lines[].opDescription",
    "lines[].vehicleMake",
    "lines[].quantitySold",
    "lines[].saleDate",
    "lines[].cost",
    "lines[].sale",
  ],
  maxLines: 5000,
  dryRun: "POST /api/v1/sales?dryRun=1 — validates a payload without storing/matching/notifying",
};

export async function GET(req: Request) {
  const header = req.headers.get("authorization");
  const expected = process.env.INGEST_API_KEY || "";
  // "none" = no key sent · "ok" = valid · "invalid" = wrong key.
  const auth = !header ? "none" : checkBearer(header, expected) ? "ok" : "invalid";
  return NextResponse.json({ ok: true, auth, ...CONTRACT });
}
