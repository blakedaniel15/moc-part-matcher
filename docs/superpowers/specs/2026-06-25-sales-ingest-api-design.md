# Sales Ingest API + New-Part Notifications (Design Spec)

**Date:** 2026-06-25
**Status:** Approved for planning
**Author:** Blake + Claude

## Goal

Accept weekly per-store sales data over an authenticated API, detect the **new
parts not yet set up** (the gap), match them, store the candidates, return a
summary, and **open a ClickUp task for the onboarding team** when a dealer has
new parts. This is the automated layer that replaces manual file uploads; the
in-tool review stays (decisions move to Easy Wins later).

## Scale target

Worst case (all stores weekly): 250 → 300 (EOY) → 600 (next EOY) stores,
~1,000 sale lines each per week.

| Stores | Lines/wk | Lines/yr |
|--------|----------|----------|
| 250 | 250k | ~13M |
| 600 | 600k | ~31M |

~50–80M rows over a few years — a medium Postgres dataset, well within Neon.
**Key principle: separate the high-volume raw firehose from the small matching
workload.** Raw sales are partitioned and append-only; matching only ever touches
the *distinct new* SKUs (dozens/store/week), so AI/compute cost scales with new
parts, not sales volume.

## API contract (hand to the dev team)

```
POST  https://<domain>/api/v1/sales
Authorization: Bearer <API_KEY>
Content-Type: application/json
Idempotency-Key: <uuid per weekly batch>     # safe retries
```

**Request body:**
```jsonc
{
  "store":  { "id": "STORE-1234", "name": "Modesto Toyota", "dmsType": "R&R" },
  "period": { "start": "2026-06-16", "end": "2026-06-22" },   // ISO dates, inclusive
  "knownSkus": ["8888804461", "A01071"],   // optional: SKUs already set up in Easy Wins
  "lines": [                               // one object per INDIVIDUAL SALE
    {
      "dealerSku":      "FA2031",                 // required
      "skuDescription": "ELEMENT ASY - AIR CLE",
      "opCode":         "BR01",
      "opDescription":  "BRAKE FLUSH SERVICE",
      "vehicleMake":    "TOYOTA",
      "quantitySold":   1,
      "saleDate":       "2026-06-18",
      "cost":           12.34,                    // optional
      "sale":           24.99                     // optional
    }
  ]
}
```

**Response (200):**
```jsonc
{ "ok": true, "batchId": "uuid", "received": 1000, "distinctSkus": 240, "newParts": 7 }
```

**Errors:** `401` bad token · `400` validation · `409` duplicate idempotency key ·
`413` too large · `429` rate-limited.

Required fields: `store.id`, `period`, and each line's `dealerSku`. Everything
else is best-effort. Dates ISO `YYYY-MM-DD`. ≤ ~5,000 lines/request.

## Processing flow

1. **Authenticate** (bearer token) + check `store.id` is allowed.
2. **Idempotency:** if `Idempotency-Key` already processed, return the prior result.
3. **Store raw lines** in `sales_lines` (append-only) under a new `batchId`.
4. **Dedupe** to distinct SKUs (keep the richest line per SKU for name/op/make).
5. **Update known set:** upsert any delivered `knownSkus` into `dealer_known_skus`.
   **Gap** = distinct SKUs − `dealer_known_skus(dealer)` (fed by deliveries + in-tool decisions).
6. **Match** the gap through the existing engine (catalog + dealer profile + AI).
7. **Store** the gap candidates as a run (reuse `run_snapshots`), tagged to the dealer.
8. **Return** the summary; if `newParts > 0`, **create a ClickUp task** (below).

## Op-code conviction (supporting only — never boosts)

`opCode` / `opDescription` / `vehicleMake` are passed into the **AI pass** as
extra context, with a strict rule: they may **lower** confidence or push a match
to **Review** when the service clearly contradicts the matched product (matched to
a brake fluid but the op says "OIL CHANGE"), and they **never raise** confidence.
Neutral or missing op data has no effect. Deterministic passes (exact/fuzzy) are
unaffected.

## ClickUp notification

When a dealer's run yields `newParts > 0`, create **one task per dealer per run**
in the **Support Requests** list (`list_id 901106848667`):

- **Title:** `New MOC parts — <Dealer> (<N> to set up)`
- **Description (markdown):** a table of the new parts: Dealer SKU · DMS Name ·
  Suggested MOC # · Suggested MOC Product · Confidence, plus the run date.
- Created via the ClickUp REST API (`POST /api/v2/list/{listId}/task`) using
  env vars **`CLICKUP_API_TOKEN`** and **`CLICKUP_LIST_ID`**.
- Best-effort: a ClickUp failure must not fail the ingest (log + continue).

## Data model

- **`sales_lines`** (raw, high-volume, **partitioned by month** on `sale_date`):
  `id, batch_id, store_id, dealer_sku, sku_description, op_code, op_description,
  vehicle_make, quantity_sold, sale_date, cost, sale, ingested_at`.
  Indexes: `(store_id, dealer_sku)`, `(store_id, sale_date)`.
- **`ingest_batches`:** `batch_id (pk), idempotency_key (unique), store_id,
  period_start, period_end, line_count, distinct_skus, new_parts, status,
  received_at`. Drives idempotency + audit.
- **`dealer_known_skus`:** `(dealer_key, sku) pk, source ('easywins'|'decided'),
  updated_at`. The persistent gap baseline; upserted from deliveries and from
  in-tool decisions.
- **Reused:** `dealers`, `decisions`, `run_snapshots`, `archetypes`,
  `approved_mappings`, `ai_verdict_cache`.

`store.id` maps to a dealer (`dealers.key`), auto-created on first ingest.

## Security

- **Bearer API key** (`Authorization: Bearer …`), stored as env var, rotatable;
  per-store keys optional later.
- **HTTPS only** (Vercel).
- **Idempotency key** per batch → no double-insert on retry.
- **Body size cap** + **rate limiting** (Vercel WAF).
- **Store allowlist** — reject unknown `store.id`.
- (Later, optional) **HMAC signature** of the body for tamper/replay protection.

## Scaling notes

- Partition `sales_lines` monthly so old data archives cheaply and queries stay
  fast; index by `(store_id, sku)` and `(store_id, sale_date)`.
- Matching/AI cost tracks **new parts**, not total volume (gap is tiny).
- Ingest is small per request (~1k lines); bursty weekly load is fine without a
  queue at this scale. Revisit a queue only past ~thousands of stores.

## Resolved decisions

- **API key:** a single shared, rotatable key (`Authorization: Bearer …`). Rotation
  is infrequent (a couple times a year), so no per-store keys or auto-rotation.
- **ClickUp:** `CLICKUP_API_TOKEN` (and `CLICKUP_LIST_ID`) are set as Vercel env
  vars by Blake; the app just reads them.
- **Known SKUs (gap baseline) — STORED.** A persistent per-dealer known set
  (`dealer_known_skus`) is the single gap baseline. Both sources feed it: SKUs
  **decided in this tool** (manual review) and **`knownSkus` delivered by Easy
  Wins** are upserted into it. So `gap = sold − dealer_known_skus(dealer)`, and a
  batch never has to re-send the full known list — the stored set persists and a
  delivered list just refreshes/extends it. **The exact Easy-Wins decision-
  verification mechanism is pending Blake** but does NOT block the build.

## Out of scope

- Cron scheduling on our side (Easy Wins pushes on its cadence).
- Moving decisions out of the tool (transition keeps in-tool review).
- The `$` analytics on cost/sale (stored now, surfaced later).

## Open items for the plan

- Partitioning mechanism: start with a single `sales_lines` table + indexes;
  convert to declarative monthly partitions as a later migration when row counts
  warrant. (Not required for the first version.)
- Exact ClickUp task description format / whether to assign a default user.
