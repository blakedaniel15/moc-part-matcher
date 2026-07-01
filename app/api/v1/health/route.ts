import { NextResponse } from "next/server";
import { checkBearer } from "../../../../lib/api-auth";
import { config } from "../../../../lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The ingest contract, reflected so integrators can verify reachability + payload
// shape + their API key without creating any data. No DB, no side effects.
const CONTRACT = {
  service: "moc service-data ingest",
  version: "v2",
  endpoint: "POST /api/v1/sales",
  shape: "nested: opLines[] each with its own parts[]",
  required: ["store.id", "store.name", "period.start", "period.end", "opLines[].ro", "opLines[].line", "opLines[].opCode", "opLines[].parts[].dealerSku"],
  optional: [
    "store.dmsType",
    "knownSkus",
    "initial",
    "opLines[].opDescription",
    "opLines[].correction",
    "opLines[].payType",
    "opLines[].laborSale",
    "opLines[].techHours",
    "opLines[].saleDate",
    "opLines[].parts[].partName",
    "opLines[].parts[].qty",
    "opLines[].parts[].sale",
    "opLines[].parts[].cost",
  ],
  maxOpLines: 5000,
  dryRun: "POST /api/v1/sales?dryRun=1 — validates a payload without storing/matching/notifying",
};

export async function GET(req: Request) {
  const header = req.headers.get("authorization");
  const expected = process.env.INGEST_API_KEY || "";
  // "none" = no key sent · "ok" = valid · "invalid" = wrong key.
  const auth = !header ? "none" : checkBearer(header, expected) ? "ok" : "invalid";
  return NextResponse.json({ ok: true, auth, model: config.anthropicModel, ...CONTRACT });
}
