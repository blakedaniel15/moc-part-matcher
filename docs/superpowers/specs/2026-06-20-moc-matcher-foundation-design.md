# MOC Part Matcher — Foundation Rebuild (Design Spec)

**Date:** 2026-06-20
**Status:** Approved for planning
**Author:** Blake + Claude

## Goal

Rebuild the MOC Part Matcher from a single-file Claude Artifact into a durable,
testable Next.js app on Vercel, whose **matching engine and learned data are
extracted into a tested, measurable core**. The defining acceptance criterion is
not "it's deployed" — it is:

> A skeptical dev team can clone the repo, run `npm test` (green) and
> `npm run eval` (an accuracy report), read the engine in isolation, and decide
> to trust it — without touching production data or spending an API token.

## Context

Today the entire system is one ~2,400-line `.jsx` file running in the Claude.ai
Artifacts runtime. Two ambient dependencies: `window.storage` (browser-local
persistence — the **only** copy of all learned mappings) and a keyless `fetch`
to the Anthropic API (auth injected by the runtime). It matches dealer DMS part
exports against MOC's canonical product catalog through a layered cascade:
exact → fuzzy numeric → structural prior → LLM adjudication, with a
human-in-the-loop approval queue that feeds learned mappings back in.

### Problems this milestone fixes
1. **Crown-jewels risk** — all learned data lives in one browser, unbacked,
   saved fire-and-forget (`catch {}`). One cache-clear wipes it.
2. **Unmeasurable accuracy** — no ground truth, no eval, no way to know if a
   change helps or hurts. Critical because the long-term goal is an *unattended*
   weekly sweep.
3. **Untestable logic** — pure classification functions buried in a 600-line
   `runMatching`, zero tests.
4. **Runtime lock-in / security** — keyless fetch depends on the Artifacts
   runtime; admin PIN `2115` hardcoded in client source.

### Long-term north star (NOT built in this milestone)
Integrate the engine into the EZ Wins SaaS to run an automated **weekly sweep**
of dealer parts. This milestone makes the engine *ready* for that (callable
without a human, deterministic, measured) but does not build the integration or
the cron.

## Users
1–2 internal MOC people today, sharing **one** set of learned mappings. No
external/customer access yet. Protect the deployment; full multi-tenant auth is
out of scope.

## Architecture

```
   ┌─────────────── Matching Engine (pure TypeScript, tested) ─────────────┐
   │  parseSku · structural · fuzzy · prefilter · pipeline                  │
   │  adjudicator (INTERFACE — injected, never calls network itself)        │
   └──────────────────────────────┬────────────────────────────────────────┘
                                  │ reads/writes
                         ┌────────┴────────┐
                         │  Neon Postgres  │  mappings · aliases · decisions · cache
                         └────────┬────────┘
              ┌───────────────────┼───────────────────────┐
        Review UI (now)     /api/match route       Weekly sweep + SaaS (future)
```

**The key design decision:** the engine never performs network I/O. The AI step
is an injected `Adjudicator` interface. This makes the deterministic passes
(exact/structural/fuzzy ≈ 70% of decisions) runnable offline, fast, and
identically every time — which is what makes tests and the accuracy report
reproducible.

### Repo shape

```
/engine
   types.ts          shared types (Part, MatchResult, Confidence, etc.)
   parseSku.ts       from parseSKU + RR_MAKE_CODES
   structural.ts     from analyzeMOCStructure
   fuzzy.ts          from Pass 2a/2b/2c + skuComplexity + isMechanicalName
   prefilter.ts      from Pass 3 skip rules
   adjudicator.ts    Adjudicator interface + AnthropicAdjudicator + RecordedAdjudicator
   pipeline.ts       pass ordering / orchestration (the only order-aware module)
   __tests__/        Vitest specs, one per pass, real-format fixtures
/eval
   ground-truth/     labeled set (seeded from exported decisions) + held-out split
   recorded/         canned AI verdicts for deterministic eval
   run.ts            `npm run eval` harness
   report.md         committed output (numbers visible in PRs)
/app                 Next.js App Router UI (thin client) + /api routes
/db
   schema.sql        Neon Postgres schema + migrations
   seed.ts           idempotent seed from moc-export.json
/data
   archetypes.ts     MOC_MAPPINGS + custom (data, not logic) — or DB-sourced
   aliases.ts        DEALER_ALIASES seed
```

## Components

### 1. Matching engine (faithful port)
Each pass lifted verbatim from `runMatching` into a typed pure function:

| Module | Lifted from | Signature (conceptual) |
|--------|-------------|------------------------|
| `parseSku` | `parseSKU`, `RR_MAKE_CODES` | `(rawSku, dmsType) → {makeCode, barePartNumber}` |
| `structural` | `analyzeMOCStructure` | `(bareNumber) → {score, label}` |
| `fuzzy` | Pass 2a/2b/2c, `skuComplexity`, `isMechanicalName` | `(part, catalog) → {match, confidence} \| null` |
| `prefilter` | Pass 3 skip rules | `(part, ctx) → skipReason \| null` |
| `pipeline` | orchestration | `(parts, catalog, aliases, adjudicator) → results[]` |

**Behavior is preserved exactly** — same passes, same heuristics, same
confidence rules (see "Two axes" below). This is a relocation + typing exercise,
not a retune. Heuristic improvements come in a later milestone, guided by the
eval harness.

**Two axes preserved (do not conflate):**
- *Structural signal* (`STRONG`/`POSSIBLE`/`UNLIKELY`) — a prior on part-number
  shape only; never a verdict by itself.
- *Match outcome* — `matchType` (`EXACT`/`FUZZY`/`AI`/`UNMATCHED`) ×
  `confidence` (`EXACT`/`HIGH`/`MEDIUM`/`LOW`).

### 2. Adjudicator (the AI step)
- `Adjudicator` interface: `adjudicate(batch, catalog) → Verdict[]`.
- `AnthropicAdjudicator` (prod): server-side, API key in env var, **structured
  tool-use output** (replaces brittle ```-fence JSON parsing), model id in
  config (not a hardcoded snapshot), retries/backoff, and **verdict caching** by
  `hash(sku + name + catalogVersion)` in Postgres for determinism + cost.
- `RecordedAdjudicator` (tests/eval): replays canned verdicts from fixtures —
  offline, free, deterministic. `npm run eval --live` swaps in the real one for
  a fresh measurement.

### 3. Data layer (Neon Postgres)

| Table | Replaces | Notes |
|-------|----------|-------|
| `archetypes` | `MOC_MAPPINGS` + `customArchetypes` | `bare_part_number` PK, name, incentive, source |
| `approved_mappings` | `approvedMappings` | dealer SKU → archetype, approved_at/by |
| `aliases` | `aliasEntries` | bare#, name, source_sku, origin, added_at |
| `decisions` | `accuracyLog` + queue outcomes | **doubles as the labeled set**; grows with every human decision |
| `blocked_skus` / `dealer_rejections` | same | sku/core, reason |
| `runs` | `runHistory` | dealer, totals, exact %, ts |
| `ai_verdict_cache` | (new) | content_hash PK, verdict json, model, catalog_version |

`decisions` is deliberately both the audit log and the ground-truth source, so
the labeled set compounds automatically instead of going stale.

### 4. UI/UX redesign — light, clean SaaS look
- Direction: light/neutral surfaces, soft accent, friendly sans, rounded cards,
  airy spacing, well-built dense tables. Built to feel native when later embedded
  in the EZ Wins SaaS.
- Implementation: **shadcn/ui + Tailwind** (accessible, portable into the SaaS).
  Use `frontend-design` + shadcn skills at build time.
- **All existing screens/flows preserved**: upload, results table, approval
  queue, archetype manager, accuracy panel, Excel export. Data calls change from
  `window.storage` → `fetch('/api/...')`; the *match behavior and UX flows do
  not change*.

## Data flow

1. **Step 0 (de-risk first):** add an "Export all data" button to the current
   `.jsx`. User downloads `moc-export.json` (all `window.storage` keys). This is
   both the DB seed and the raw labeled-set material — and immediately backs up
   the crown jewels before any migration.
2. `db/seed.ts` populates Postgres from `moc-export.json` (idempotent).
3. Artifact retired; Postgres becomes the single source of truth.
4. **Match run:** UI uploads parts → `/api/match` runs the engine server-side
   with `AnthropicAdjudicator` → results returned → human reviews queue →
   approvals written to `approved_mappings` / `aliases` / `decisions`.
5. **Eval:** `npm run eval` loads `decisions`-derived labeled set, runs the
   pipeline with `RecordedAdjudicator`, writes `eval/report.md`.

## Accuracy harness (the "prove it works" deliverable)

`npm run eval`:
1. Loads labeled set from exported decisions; reserves a **held-out split** the
   engine is never tuned against.
2. Runs the full pipeline with `RecordedAdjudicator` (deterministic).
3. Emits `eval/report.md` (committed, PR-visible) containing:
   - Overall **precision / recall / F1**.
   - **Per-pass breakdown** (e.g. "exact+fuzzy: 99% precise on X% of volume; AI
     pass handles the ambiguous tail at Y%") — the most convincing artifact for
     a dev team.
   - **Confusion buckets**: false matches (said MOC, wasn't) vs missed matches
     (was MOC, said no), with example rows.
   - **Ground-truth caveat printed in the report**: labels are a biased sample
     (made with the old tool's help, queued rows only); mitigated by the held-out
     split and a flagged subset for fresh human audit. Honesty over a suspiciously
     perfect score.

## Testing

- **Unit tests (`npm test`, Vitest):** one spec per pass, fixtures drawn from the
  real SKU formats in the code (`TO01071`, `8888804461`, `2301`,
  `76620-T20-A01`, `999MP…`, `CR2032`, `TOMP01071`…). Every pass and every
  special-case rule pinned by at least one test. This is the regression guard the
  "revert instructions" comments wanted.
- **Eval (`npm run eval`):** accuracy regression — the report is reproducible and
  diffs in PRs.
- Tests and eval run with `RecordedAdjudicator` → no API calls, deterministic, CI-safe.

## Error handling & robustness
- AI route: retries + backoff; on persistent failure, surface an explicit
  "N parts failed to classify" signal instead of silently marking UNMATCHED.
- Persistence: real error propagation (no empty `catch {}`); failed writes are
  surfaced to the user.
- Secrets: Anthropic key + any admin secret in Vercel env vars; remove hardcoded
  `2115` PIN in favor of deployment protection / env-based secret.

## Deployment
- Next.js on Vercel; Neon provisioned via the Vercel + Neon Marketplace
  integration (connection string auto-injected as env var).
- Config module for model id, batch size (currently 30), confidence thresholds.

## Explicitly out of scope (YAGNI)
- SaaS integration and the weekly cron sweep (engine made *ready*, not wired).
- Heuristic rewrites/retuning (faithful port first; eval-guided changes later).
- Multi-tenant auth / external customer access.
- Changing match behavior or the review-queue UX.

## Open items for the implementation plan
- Exact Postgres column types / indexes and migration tooling choice.
- Whether `archetypes`/`aliases` are DB-sourced at runtime or build-time data
  files seeded into the DB (leaning DB-sourced for hot edits).
- Structured-output tool schema shape for the adjudicator.
- Deployment protection mechanism for the internal-only phase.
