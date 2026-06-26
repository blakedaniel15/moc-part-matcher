# Sales Ingest API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build `POST /api/v1/sales` — authenticated, idempotent ingest of weekly per-store sales that stores the raw lines, maintains a per-dealer known-SKU set, matches only the new parts (the gap), opens a ClickUp task when new parts are found, and returns a summary.

**Architecture:** Pure units (auth, payload parse/dedupe, ingest-line→Part, ClickUp markdown, ingest orchestration core) are unit-tested in CI. They wire into a route that adds DB + the live adjudicator + the real ClickUp call. Reuses the existing engine, dealers, decisions, and run_snapshots.

**Tech Stack:** Next.js route handlers, TypeScript, Vitest, `@neondatabase/serverless`.

## Global Constraints

- Pure logic in `/lib` and `/engine`, no React/DB/network; unit-tested in CI (`npm test`).
- Auth: `Authorization: Bearer <INGEST_API_KEY>` (single rotatable env key).
- Idempotency: `Idempotency-Key` header → a repeated batch returns the prior result, no re-insert.
- Gap baseline is the stored `dealer_known_skus` set; delivered `knownSkus` and in-tool decisions both upsert into it. `gap = distinct sold − dealer_known_skus(dealer)`.
- op-code/op-description/vehicle-make are **downgrade-only** conviction in the AI pass; never raise confidence; deterministic passes unaffected.
- ClickUp: one task per dealer per run when `newParts > 0`, in list `CLICKUP_LIST_ID`, via `CLICKUP_API_TOKEN`. Best-effort — a ClickUp failure never fails the ingest.
- A ClickUp/DB error in notification must not fail the stored ingest.
- TypeScript strict. Node 20+.

---

### Task 1: Bearer-token auth (pure)

**Files:**
- Create: `lib/api-auth.ts`
- Test: `lib/api-auth.test.ts`

**Interfaces:**
- Produces: `export function checkBearer(authHeader: string | null, expected: string): boolean;`

- [ ] **Step 1: Write the failing test** `lib/api-auth.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { checkBearer } from "./api-auth";

describe("checkBearer", () => {
  it("accepts the exact bearer token", () => {
    expect(checkBearer("Bearer abc123", "abc123")).toBe(true);
  });
  it("rejects wrong/missing token or empty expected", () => {
    expect(checkBearer("Bearer nope", "abc123")).toBe(false);
    expect(checkBearer(null, "abc123")).toBe(false);
    expect(checkBearer("Bearer abc123", "")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npm test -- api-auth` → FAIL (module not found).

- [ ] **Step 3: Write `lib/api-auth.ts`**

```ts
export function checkBearer(authHeader: string | null, expected: string): boolean {
  if (!expected) return false;
  const m = (authHeader || "").match(/^Bearer\s+(.+)$/i);
  return !!m && m[1] === expected;
}
```

- [ ] **Step 4: Run to verify it passes** — `npm test -- api-auth` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/api-auth.ts lib/api-auth.test.ts
git commit -m "feat: bearer-token auth check"
```

---

### Task 2: Ingest payload parse + dedupe (pure)

**Files:**
- Create: `lib/ingest.ts`
- Test: `lib/ingest.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SaleLine { dealerSku: string; skuDescription?: string; opCode?: string; opDescription?: string; vehicleMake?: string; quantitySold?: number; saleDate?: string; cost?: number; sale?: number }
  export interface IngestBody { store: { id: string; name?: string; dmsType?: string }; period: { start: string; end: string }; knownSkus?: string[]; lines: SaleLine[] }
  export function validateIngest(body: any): { ok: true; body: IngestBody } | { ok: false; error: string };
  export function distinctSkus(lines: SaleLine[]): SaleLine[]; // one richest line per SKU (case-insensitive)
  ```

- [ ] **Step 1: Write the failing test** `lib/ingest.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { validateIngest, distinctSkus } from "./ingest";

describe("validateIngest", () => {
  it("requires store.id, period, and lines", () => {
    expect(validateIngest({ lines: [] }).ok).toBe(false);
    const good = validateIngest({ store: { id: "S1" }, period: { start: "2026-06-16", end: "2026-06-22" }, lines: [{ dealerSku: "A1" }] });
    expect(good.ok).toBe(true);
  });
  it("rejects a line with no dealerSku", () => {
    const r = validateIngest({ store: { id: "S1" }, period: { start: "a", end: "b" }, lines: [{ skuDescription: "x" }] });
    expect(r.ok).toBe(false);
  });
});

describe("distinctSkus", () => {
  it("collapses duplicate SKUs, keeping the line with the most fields", () => {
    const out = distinctSkus([
      { dealerSku: "A1" },
      { dealerSku: "a1", skuDescription: "FULL", opDescription: "BRAKE FLUSH" },
      { dealerSku: "B2", skuDescription: "B" },
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((l) => l.dealerSku.toUpperCase() === "A1")?.skuDescription).toBe("FULL");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npm test -- ingest` → FAIL.

- [ ] **Step 3: Write `lib/ingest.ts`**

```ts
export interface SaleLine {
  dealerSku: string;
  skuDescription?: string;
  opCode?: string;
  opDescription?: string;
  vehicleMake?: string;
  quantitySold?: number;
  saleDate?: string;
  cost?: number;
  sale?: number;
}
export interface IngestBody {
  store: { id: string; name?: string; dmsType?: string };
  period: { start: string; end: string };
  knownSkus?: string[];
  lines: SaleLine[];
}

export function validateIngest(body: any): { ok: true; body: IngestBody } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be a JSON object." };
  if (!body.store?.id) return { ok: false, error: "store.id is required." };
  if (!body.period?.start || !body.period?.end) return { ok: false, error: "period.start and period.end are required." };
  if (!Array.isArray(body.lines) || body.lines.length === 0) return { ok: false, error: "lines must be a non-empty array." };
  for (const l of body.lines) {
    if (!l?.dealerSku || typeof l.dealerSku !== "string") return { ok: false, error: "every line needs a dealerSku." };
  }
  if (body.lines.length > 5000) return { ok: false, error: "max 5000 lines per request." };
  return { ok: true, body: body as IngestBody };
}

const fieldCount = (l: SaleLine) => Object.values(l).filter((v) => v !== undefined && v !== null && v !== "").length;

export function distinctSkus(lines: SaleLine[]): SaleLine[] {
  const best = new Map<string, SaleLine>();
  for (const l of lines) {
    const key = l.dealerSku.trim().toUpperCase();
    const cur = best.get(key);
    if (!cur || fieldCount(l) > fieldCount(cur)) best.set(key, l);
  }
  return [...best.values()];
}
```

- [ ] **Step 4: Run to verify it passes** — `npm test -- ingest` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ingest.ts lib/ingest.test.ts
git commit -m "feat: ingest payload validation + SKU dedupe"
```

---

### Task 3: Ingest line → Part (with op fields)

**Files:**
- Modify: `engine/types.ts` (add optional op fields to `Part`)
- Create: `lib/ingest-parts.ts`
- Test: `lib/ingest-parts.test.ts`

**Interfaces:**
- Consumes: `parseSku`, `analyzeStructure`, `detectDms`, `SaleLine`.
- Produces: `export function partsFromLines(lines: SaleLine[]): Part[];`

- [ ] **Step 1: Add optional op fields to `Part`** in `engine/types.ts`:

```ts
export interface Part {
  sku: string;
  partName: string;
  makeCode: string | null;
  barePartNumber: string;
  dmsType: DmsType;
  structural: Structural;
  opDescription?: string; // service operation (downgrade-only AI signal)
  vehicleMake?: string;
}
```

- [ ] **Step 2: Write the failing test** `lib/ingest-parts.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { partsFromLines } from "./ingest-parts";

describe("partsFromLines", () => {
  it("builds Parts with name + op fields, dms detected from skus", () => {
    const parts = partsFromLines([
      { dealerSku: "8888804461", skuDescription: "TRANS SERV", opDescription: "TRANSMISSION SERVICE", vehicleMake: "TOYOTA" },
    ]);
    expect(parts[0]).toMatchObject({ sku: "8888804461", partName: "TRANS SERV", opDescription: "TRANSMISSION SERVICE", vehicleMake: "TOYOTA" });
    expect(parts[0].barePartNumber).toBe("8888804461");
  });
});
```

- [ ] **Step 3: Run to verify it fails** — `npm test -- ingest-parts` → FAIL.

- [ ] **Step 4: Write `lib/ingest-parts.ts`**

```ts
import type { Part } from "../engine/types";
import type { SaleLine } from "./ingest";
import { parseSku, detectDms } from "../engine/parseSku";
import { analyzeStructure } from "../engine/structural";

export function partsFromLines(lines: SaleLine[]): Part[] {
  const dms = detectDms(lines.map((l) => l.dealerSku));
  return lines.map((l) => {
    const parsed = parseSku(l.dealerSku, dms);
    return {
      sku: l.dealerSku,
      partName: (l.skuDescription || "").replace(/[™®©]/g, "").trim(),
      makeCode: parsed.makeCode,
      barePartNumber: parsed.barePartNumber,
      dmsType: dms,
      structural: analyzeStructure(parsed.barePartNumber),
      opDescription: l.opDescription || undefined,
      vehicleMake: l.vehicleMake || undefined,
    };
  });
}
```

- [ ] **Step 5: Run to verify it passes** — `npm test -- ingest-parts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add engine/types.ts lib/ingest-parts.ts lib/ingest-parts.test.ts
git commit -m "feat: build Parts from ingest lines (with op fields)"
```

---

### Task 4: op-code downgrade-only conviction in the adjudicator

**Files:**
- Modify: `engine/anthropicAdjudicator.ts`

**Interfaces:**
- The per-part prompt line now includes op/vehicle when present; the instructions add the downgrade-only rule. No interface change.

- [ ] **Step 1: In `engine/anthropicAdjudicator.ts`, add the rule to `buildContext()`** — insert into the instruction lines (before "Return mocPartNumber…"):

```ts
      "A service operation or vehicle make may be given per part. Use it ONLY to LOWER confidence (or move a match to LOW/Review) when the service clearly contradicts the product (e.g. matched to a brake fluid but the service is OIL CHANGE). Never raise confidence based on it.",
```

- [ ] **Step 2: Include op fields in the parts list** — change the `partsList` map in `callApi`:

```ts
    const partsList = parts
      .map((p, idx) => {
        const op = p.opDescription ? ` | Service: ${p.opDescription}` : "";
        const mk = p.vehicleMake ? ` | Make: ${p.vehicleMake}` : "";
        return `${idx + 1}. SKU: ${p.sku} | Bare#: ${p.barePartNumber} | Structure: ${p.structural.label} | DMS Name: ${p.partName}${op}${mk}`;
      })
      .join("\n");
```

- [ ] **Step 3: Run the adjudicator tests** — `npm test -- anthropicAdjudicator` → PASS (response parsing unaffected).

- [ ] **Step 4: Commit**

```bash
git add engine/anthropicAdjudicator.ts
git commit -m "feat: op-code downgrade-only conviction in the AI prompt"
```

---

### Task 5: ClickUp task markdown + client

**Files:**
- Create: `lib/clickup.ts`
- Test: `lib/clickup.test.ts`

**Interfaces:**
- Consumes: `MatchResult`.
- Produces:
  ```ts
  export function newPartsTask(dealer: string, results: MatchResult[]): { name: string; markdown: string };
  export function createClickUpTask(deps: { token: string; listId: string; fetchImpl?: typeof fetch }, task: { name: string; markdown: string }): Promise<void>;
  ```

- [ ] **Step 1: Write the failing test** `lib/clickup.test.ts`

```ts
import { describe, it, expect, vi } from "vitest";
import { newPartsTask, createClickUpTask } from "./clickup";
import type { MatchResult } from "../engine/types";

const r = (sku: string, moc: string): MatchResult => ({
  sku, partName: "TRANS SERV", makeCode: null, barePartNumber: sku, dmsType: "CDK",
  structural: { score: 1, label: "POSSIBLE", detail: "" },
  matchType: "FUZZY", matchedArchetype: `${moc} - SHYFT`, matchedPartNumber: moc, confidence: "MEDIUM", reason: "", incentive: null,
});

describe("newPartsTask", () => {
  it("titles with dealer + count and lists parts", () => {
    const t = newPartsTask("Modesto Toyota", [r("8888804461", "04461")]);
    expect(t.name).toContain("Modesto Toyota");
    expect(t.name).toContain("1");
    expect(t.markdown).toContain("8888804461");
    expect(t.markdown).toContain("04461");
  });
});

describe("createClickUpTask", () => {
  it("POSTs to the ClickUp list endpoint with the token", async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ id: "t1" }) })) as any;
    await createClickUpTask({ token: "tok", listId: "901", fetchImpl: f }, { name: "n", markdown: "m" });
    expect(f).toHaveBeenCalledWith("https://api.clickup.com/api/v2/list/901/task", expect.objectContaining({ method: "POST" }));
    expect(f.mock.calls[0][1].headers.Authorization).toBe("tok");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npm test -- clickup` → FAIL.

- [ ] **Step 3: Write `lib/clickup.ts`**

```ts
import type { MatchResult } from "../engine/types";

export function newPartsTask(dealer: string, results: MatchResult[]): { name: string; markdown: string } {
  const name = `New MOC parts — ${dealer} (${results.length} to set up)`;
  const header = "| Dealer SKU | DMS Name | Suggested MOC # | Product | Confidence |\n|---|---|---|---|---|";
  const rows = results.map(
    (r) =>
      `| ${r.sku} | ${r.partName || "—"} | ${r.matchedPartNumber || "—"} | ${r.matchedArchetype ? r.matchedArchetype.replace(/^\d+\s*-\s*/, "") : "—"} | ${r.confidence || "—"} |`
  );
  const markdown = `**${results.length} new part(s)** found for **${dealer}** — set up in Easy Wins.\n\n${header}\n${rows.join("\n")}`;
  return { name, markdown };
}

export async function createClickUpTask(
  deps: { token: string; listId: string; fetchImpl?: typeof fetch },
  task: { name: string; markdown: string }
): Promise<void> {
  const f = deps.fetchImpl ?? fetch;
  const res = await f(`https://api.clickup.com/api/v2/list/${deps.listId}/task`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: deps.token },
    body: JSON.stringify({ name: task.name, markdown_description: task.markdown }),
  });
  if (!(res as any).ok) throw new Error(`ClickUp HTTP ${(res as any).status}`);
}
```

- [ ] **Step 4: Run to verify it passes** — `npm test -- clickup` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/clickup.ts lib/clickup.test.ts
git commit -m "feat: ClickUp new-parts task markdown + REST client"
```

---

### Task 6: DB — sales_lines, ingest_batches, dealer_known_skus

**Files:**
- Modify: `db/schema.ts` (add three tables to `runMigration`)
- Modify: `db/repo.ts` (add repo functions)
- Test: `db/ingest-repo.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function loadKnownSkus(sql: SqlExec, dealerKey: string): Promise<Set<string>>;
  export function upsertKnownSkus(sql: SqlExec, dealerKey: string, skus: string[], source: string): Promise<void>;
  export function getBatchByIdempotency(sql: SqlExec, key: string): Promise<any | null>;
  export function insertBatch(sql: SqlExec, b: { batchId: string; idempotencyKey: string; storeId: string; periodStart: string; periodEnd: string; lineCount: number; distinctSkus: number; newParts: number }): Promise<void>;
  export function insertSalesLines(sql: SqlExec, batchId: string, storeId: string, lines: any[]): Promise<void>;
  ```

- [ ] **Step 1: Add tables** to `runMigration` in `db/schema.ts` (after `dealers`):

```ts
  await sql`create table if not exists ingest_batches (
    batch_id text primary key,
    idempotency_key text unique,
    store_id text not null,
    period_start date null,
    period_end date null,
    line_count integer not null default 0,
    distinct_skus integer not null default 0,
    new_parts integer not null default 0,
    status text not null default 'done',
    received_at timestamptz not null default now()
  )`;
  await sql`create table if not exists sales_lines (
    id bigserial primary key,
    batch_id text not null,
    store_id text not null,
    dealer_sku text not null,
    sku_description text null,
    op_code text null,
    op_description text null,
    vehicle_make text null,
    quantity_sold integer null,
    sale_date date null,
    cost numeric null,
    sale numeric null,
    ingested_at timestamptz not null default now()
  )`;
  await sql`create index if not exists sales_lines_store_sku on sales_lines (store_id, dealer_sku)`;
  await sql`create index if not exists sales_lines_store_date on sales_lines (store_id, sale_date)`;
  await sql`create table if not exists dealer_known_skus (
    dealer_key text not null,
    sku text not null,
    source text not null default 'decided',
    updated_at timestamptz not null default now(),
    primary key (dealer_key, sku)
  )`;
```

- [ ] **Step 2: Write the failing test** `db/ingest-repo.test.ts`

```ts
import { describe, it, expect, vi } from "vitest";
import { loadKnownSkus } from "./repo";

describe("loadKnownSkus", () => {
  it("returns an uppercased Set of skus for the dealer", async () => {
    const sql = vi.fn(async () => [{ sku: "a1" }, { sku: "B2" }]) as any;
    const set = await loadKnownSkus(sql, "demo");
    expect(set.has("A1")).toBe(true);
    expect(set.has("B2")).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify it fails** — `npm test -- ingest-repo` → FAIL.

- [ ] **Step 4: Add to `db/repo.ts`**

```ts
export async function loadKnownSkus(sql: SqlExec, dealerKey: string): Promise<Set<string>> {
  const rows = await sql`select sku from dealer_known_skus where dealer_key = ${dealerKey}`;
  return new Set(rows.map((r) => String(r.sku).trim().toUpperCase()));
}

export async function upsertKnownSkus(sql: SqlExec, dealerKey: string, skus: string[], source: string): Promise<void> {
  for (const sku of skus) {
    await sql`insert into dealer_known_skus (dealer_key, sku, source) values (${dealerKey}, ${sku}, ${source})
      on conflict (dealer_key, sku) do update set source = excluded.source, updated_at = now()`;
  }
}

export async function getBatchByIdempotency(sql: SqlExec, key: string): Promise<any | null> {
  const rows = await sql`select batch_id, distinct_skus, new_parts, line_count from ingest_batches where idempotency_key = ${key}`;
  return rows[0] ?? null;
}

export async function insertBatch(
  sql: SqlExec,
  b: { batchId: string; idempotencyKey: string; storeId: string; periodStart: string; periodEnd: string; lineCount: number; distinctSkus: number; newParts: number }
): Promise<void> {
  await sql`insert into ingest_batches (batch_id, idempotency_key, store_id, period_start, period_end, line_count, distinct_skus, new_parts)
    values (${b.batchId}, ${b.idempotencyKey}, ${b.storeId}, ${b.periodStart}, ${b.periodEnd}, ${b.lineCount}, ${b.distinctSkus}, ${b.newParts})`;
}

export async function insertSalesLines(sql: SqlExec, batchId: string, storeId: string, lines: any[]): Promise<void> {
  for (const l of lines) {
    await sql`insert into sales_lines (batch_id, store_id, dealer_sku, sku_description, op_code, op_description, vehicle_make, quantity_sold, sale_date, cost, sale)
      values (${batchId}, ${storeId}, ${l.dealerSku}, ${l.skuDescription ?? null}, ${l.opCode ?? null}, ${l.opDescription ?? null}, ${l.vehicleMake ?? null}, ${l.quantitySold ?? null}, ${l.saleDate ?? null}, ${l.cost ?? null}, ${l.sale ?? null})`;
  }
}
```

- [ ] **Step 5: Run to verify it passes** — `npm test -- ingest-repo` → PASS.

- [ ] **Step 6: Commit** (re-run `/setup` after deploy to create the tables)

```bash
git add db/schema.ts db/repo.ts db/ingest-repo.test.ts
git commit -m "feat: ingest tables (sales_lines, ingest_batches, dealer_known_skus) + repo"
```

---

### Task 7: `/api/v1/sales` route

**Files:**
- Create: `app/api/v1/sales/route.ts`

**Interfaces:**
- Consumes everything above + `partsFromLines`, `computeGap`, `runPipeline`, `AnthropicAdjudicator`, `saveRunSnapshot`, dealer helpers.

- [ ] **Step 1: Write `app/api/v1/sales/route.ts`**

```ts
import { NextResponse } from "next/server";
import { checkBearer } from "../../../../lib/api-auth";
import { validateIngest, distinctSkus } from "../../../../lib/ingest";
import { partsFromLines } from "../../../../lib/ingest-parts";
import { computeGap } from "../../../../lib/gap";
import { normalizeDealerKey } from "../../../../lib/dealer";
import { newPartsTask, createClickUpTask } from "../../../../lib/clickup";
import { runPipeline } from "../../../../engine/pipeline";
import { AnthropicAdjudicator } from "../../../../engine/anthropicAdjudicator";
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

    // Dealer
    const dealerName = body.store.name || body.store.id;
    const dealerKey = normalizeDealerKey(dealerName);
    await upsertDealer(sql, { key: dealerKey, name: dealerName, dmsType: body.store.dmsType ?? null });

    // Store raw + a batch id
    const batchId = (globalThis.crypto?.randomUUID?.() ?? `batch-${Date.now()}`) as string;
    await insertSalesLines(sql, batchId, body.store.id, body.lines);

    // Known set: fold in delivered knownSkus, then diff
    if (body.knownSkus?.length) await upsertKnownSkus(sql, dealerKey, body.knownSkus, "easywins");
    const known = await loadKnownSkus(sql, dealerKey);
    const distinct = distinctSkus(body.lines);
    const { gap } = computeGap(partsFromLines(distinct), known);

    // Match the gap
    let results: any[] = [];
    if (gap.length) {
      const [catalog, approved, blockedSkus] = await Promise.all([loadCatalog(sql), loadApproved(sql), loadBlockedSkus(sql)]);
      const adjudicator = new AnthropicAdjudicator({
        apiKey: requireEnv("ANTHROPIC_API_KEY"), model: config.anthropicModel, catalog, catalogVersion: `v${catalog.length}`,
      });
      results = await runPipeline(gap, { catalog, approved, blockedSkus, dealerRejections: [], dealerBrand: "all", adjudicator });
    }

    // Persist a run snapshot for the in-tool review
    const matched = results.filter((r) => r.matchedPartNumber).length;
    await saveRunSnapshot(sql, {
      runId: batchId, dealer: dealerName, fileName: `ingest ${body.period.start}..${body.period.end}`,
      total: gap.length, matched, review: 0, unmatched: gap.length - matched, snapshot: results,
    });
    await insertBatch(sql, {
      batchId, idempotencyKey: idempotencyKey || batchId, storeId: body.store.id,
      periodStart: body.period.start, periodEnd: body.period.end,
      lineCount: body.lines.length, distinctSkus: distinct.length, newParts: gap.length,
    });

    // ClickUp — best-effort
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
```

- [ ] **Step 2: Build locally** — `npm run build` → "✓ Compiled successfully".

- [ ] **Step 3: Full suite** — `npm test` → PASS.

- [ ] **Step 4: Verify in preview** (needs env: `INGEST_API_KEY`, DB, `ANTHROPIC_API_KEY`, optional ClickUp): `curl -X POST .../api/v1/sales -H "Authorization: Bearer <key>" -d @sample.json` returns the summary; re-POST with same `Idempotency-Key` returns `idempotent:true`; a new part opens a ClickUp task.

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/sales/
git commit -m "feat: /api/v1/sales ingest route (auth, idempotent, gap, ClickUp)"
```

---

## Self-Review

**Spec coverage:** API contract + auth → Tasks 1,7. Idempotency → Task 7. Raw storage (partition deferred) → Task 6. Dedupe → Task 2. Known set stored + gap → Tasks 6,7. op-code downgrade-only → Tasks 3,4. ClickUp task → Tasks 5,7. Summary response → Task 7. ✓

**Placeholder scan:** No TBD/"handle errors"; preview-only step labeled. ✓

**Type consistency:** `SaleLine`/`IngestBody`, `validateIngest`/`distinctSkus`, `partsFromLines`, `Part` op fields, `newPartsTask`/`createClickUpTask`, and the repo signatures are used consistently in Task 7. ✓

## Notes
- After deploy, **re-run `/setup`** to create `ingest_batches`, `sales_lines`, `dealer_known_skus`.
- Env vars to add in Vercel: `INGEST_API_KEY` (the bearer key for the dev team), `CLICKUP_API_TOKEN`, `CLICKUP_LIST_ID` (901114015118 — Internal Requests).
- Partitioning `sales_lines` is a later migration when volume warrants.
