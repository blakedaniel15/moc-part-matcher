import { NextResponse } from "next/server";
import { runMatch } from "./core";
import { AnthropicAdjudicator } from "../../../engine/anthropicAdjudicator";
import { db } from "../../../db/client";
import { loadCatalog, loadApproved, loadBlockedSkus } from "../../../db/repo";
import { config, requireEnv } from "../../../lib/config";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json();
  const sql: any = db();
  const [catalog, approved, blockedSkus] = await Promise.all([
    loadCatalog(sql),
    loadApproved(sql),
    loadBlockedSkus(sql),
  ]);
  const adjudicator = new AnthropicAdjudicator({
    apiKey: requireEnv("ANTHROPIC_API_KEY"),
    model: config.anthropicModel,
  });
  const results = await runMatch(body, { catalog, approved, blockedSkus, dealerRejections: [], adjudicator });
  return NextResponse.json(results);
}
