import { NextResponse } from "next/server";
import { runMatch } from "./core";
import { AnthropicAdjudicator } from "../../../engine/anthropicAdjudicator";
import type { AdjudicationVerdict } from "../../../engine/adjudicator";
import { db } from "../../../db/client";
import { loadCatalog, loadApproved, loadBlockedSkus } from "../../../db/repo";
import { config, requireEnv } from "../../../lib/config";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json();
  const sql: any = db();
  const [catalog, approved, blockedSkus] = await Promise.all([loadCatalog(sql), loadApproved(sql), loadBlockedSkus(sql)]);

  // Teach the AI from your "Yes" decisions: dealer naming (aliases) + few-shot examples.
  const aliases: Record<string, string[]> = {};
  const examples: { name: string; barePartNumber: string }[] = [];
  const seenExample = new Set<string>();
  for (const a of approved) {
    if (!a.dmsPartName) continue;
    (aliases[a.barePartNumber] ||= []).push(a.dmsPartName);
    if (!seenExample.has(a.barePartNumber) && examples.length < 14) {
      examples.push({ name: a.dmsPartName, barePartNumber: a.barePartNumber });
      seenExample.add(a.barePartNumber);
    }
  }

  // Catalog version invalidates cached verdicts when the catalog changes.
  const catalogVersion = `v${catalog.length}`;

  // DB-backed verdict cache so re-running the same parts costs no tokens.
  const cache = {
    async get(h: string): Promise<AdjudicationVerdict | null> {
      try {
        const rows = await sql`select verdict from ai_verdict_cache where content_hash = ${h}`;
        return rows[0]?.verdict ?? null;
      } catch {
        return null;
      }
    },
    async set(h: string, v: AdjudicationVerdict): Promise<void> {
      try {
        await sql`insert into ai_verdict_cache (content_hash, verdict, model, catalog_version)
          values (${h}, ${JSON.stringify(v)}::jsonb, ${config.anthropicModel}, ${catalogVersion})
          on conflict (content_hash) do nothing`;
      } catch {
        /* cache write is best-effort */
      }
    },
  };

  const adjudicator = new AnthropicAdjudicator({
    apiKey: requireEnv("ANTHROPIC_API_KEY"),
    model: config.anthropicModel,
    catalog,
    aliases,
    examples,
    catalogVersion,
    cache,
  });

  const results = await runMatch(body, { catalog, approved, blockedSkus, dealerRejections: [], adjudicator });
  return NextResponse.json(results);
}
