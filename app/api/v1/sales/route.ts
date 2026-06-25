import { NextResponse } from "next/server";
import { checkBearer } from "../../../../lib/api-auth";
import { validateIngest, distinctSkus } from "../../../../lib/ingest";
import { partsFromLines } from "../../../../lib/ingest-parts";
import { computeGap } from "../../../../lib/gap";
import { normalizeDealerKey } from "../../../../lib/dealer";
import { newPartsTask, createClickUpTask } from "../../../../lib/clickup";
import { runPipeline } from "../../../../engine/pipeline";
import { AnthropicAdjudicator } from "../../../../engine/anthropicAdjudicator";
import type { AdjudicationVerdict } from "../../../../engine/adjudicator";
import type { MatchResult } from "../../../../engine/types";
import { db } from "../../../../db/client";
import {
  loadCatalog, loadApproved, loadBlockedSkus, upsertDealer, loadKnownSkus, upsertKnownSkus,
  getBatchByIdempotency, insertBatch, insertSalesLines, saveRunSnapshot,
} from "../../../../db/repo";
import { config, requireEnv } from "../../../../lib/config";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    if (!checkBearer(req.headers.get("authorization"), process.env.INGEST_API_KEY || "")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const raw = await req.json();
    const v = validateIngest(raw);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    const body = v.body;

    const sql: any = db();
    const idempotencyKey = req.headers.get("idempotency-key") || "";
    if (idempotencyKey) {
      const prior = await getBatchByIdempotency(sql, idempotencyKey);
      if (prior) {
        return NextResponse.json({ ok: true, batchId: prior.batch_id, received: prior.line_count, distinctSkus: prior.distinct_skus, newParts: prior.new_parts, idempotent: true });
      }
    }

    // Dealer (auto-created on first ingest).
    const dealerName = body.store.name || body.store.id;
    const dealerKey = normalizeDealerKey(dealerName);
    await upsertDealer(sql, { key: dealerKey, name: dealerName, dmsType: body.store.dmsType ?? null });

    // Store the raw firehose under a new batch id.
    const batchId = (globalThis.crypto?.randomUUID?.() ?? `batch-${dealerKey}-${body.period.start}`) as string;
    await insertSalesLines(sql, batchId, body.store.id, body.lines);

    // Known set: fold in any delivered knownSkus, then diff against the persistent set.
    if (body.knownSkus?.length) await upsertKnownSkus(sql, dealerKey, body.knownSkus, "easywins");
    const known = await loadKnownSkus(sql, dealerKey);
    const distinct = distinctSkus(body.lines);
    const { gap } = computeGap(partsFromLines(distinct), known);

    // Match only the gap (the new parts).
    let results: MatchResult[] = [];
    if (gap.length) {
      const [catalog, approved, blockedSkus] = await Promise.all([loadCatalog(sql), loadApproved(sql), loadBlockedSkus(sql)]);

      // Teach the AI from approved decisions: dealer naming (aliases) + few-shot examples.
      const aliases: Record<string, string[]> = {};
      const examples: { name: string; barePartNumber: string }[] = [];
      const seen = new Set<string>();
      for (const a of approved) {
        if (!a.dmsPartName) continue;
        (aliases[a.barePartNumber] ||= []).push(a.dmsPartName);
        if (!seen.has(a.barePartNumber) && examples.length < 14) {
          examples.push({ name: a.dmsPartName, barePartNumber: a.barePartNumber });
          seen.add(a.barePartNumber);
        }
      }

      const catalogVersion = `v${catalog.length}`;
      const cache = {
        async get(h: string): Promise<AdjudicationVerdict | null> {
          try {
            const rows = await sql`select verdict from ai_verdict_cache where content_hash = ${h}`;
            return rows[0]?.verdict ?? null;
          } catch {
            return null;
          }
        },
        async set(h: string, val: AdjudicationVerdict): Promise<void> {
          try {
            await sql`insert into ai_verdict_cache (content_hash, verdict, model, catalog_version)
              values (${h}, ${JSON.stringify(val)}::jsonb, ${config.anthropicModel}, ${catalogVersion})
              on conflict (content_hash) do nothing`;
          } catch {
            /* best-effort */
          }
        },
      };

      const adjudicator = new AnthropicAdjudicator({
        apiKey: requireEnv("ANTHROPIC_API_KEY"), model: config.anthropicModel,
        catalog, aliases, examples, catalogVersion, cache,
      });
      results = await runPipeline(gap, { catalog, approved, blockedSkus, dealerRejections: [], dealerBrand: "all", adjudicator });
    }

    // Persist a run snapshot for the in-tool review.
    const isMatchedR = (r: MatchResult) =>
      r.matchType === "EXACT" || r.matchType === "FUZZY" || (r.matchType === "AI" && (r.confidence === "HIGH" || r.confidence === "MEDIUM"));
    const matched = results.filter(isMatchedR).length;
    const review = results.filter((r) => r.matchType === "AI" && r.confidence === "LOW").length;
    const unmatched = results.filter((r) => r.matchType === "UNMATCHED").length;
    await saveRunSnapshot(sql, {
      runId: batchId, dealer: dealerName, fileName: `ingest ${body.period.start}..${body.period.end}`,
      total: gap.length, matched, review, unmatched, snapshot: results,
      status: "in_progress", // new parts await the team's review in-tool
    });
    await insertBatch(sql, {
      batchId, idempotencyKey: idempotencyKey || batchId, storeId: body.store.id,
      periodStart: body.period.start, periodEnd: body.period.end,
      lineCount: body.lines.length, distinctSkus: distinct.length, newParts: gap.length,
    });

    // ClickUp — best-effort; a failure must never fail the ingest.
    const token = process.env.CLICKUP_API_TOKEN, listId = process.env.CLICKUP_LIST_ID;
    if (gap.length && token && listId) {
      try {
        await createClickUpTask({ token, listId }, newPartsTask(dealerName, results));
      } catch (e) {
        console.error("ClickUp notify failed:", e);
      }
    }

    return NextResponse.json({ ok: true, batchId, received: body.lines.length, distinctSkus: distinct.length, newParts: gap.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ingest failed." }, { status: 500 });
  }
}
