# Gap Finder — Per-Dealer New-Part Detection (Design Spec)

**Date:** 2026-06-22
**Status:** Approved for planning
**Author:** Blake + Claude

## Goal

Add a **gap finder** on top of the existing matcher: given a dealer's recent
sales plus the SKUs already set up for them, surface only the **new MOC parts
not yet set up**, matched with a suggested MOC product, and export those
candidates for review. Keep the current full-file review ("setup finder")
unchanged during the transition.

## Context: two cores, one engine

1. **Setup finder (today's product — kept as-is).** Upload a dealer's parts
   history → the engine matches → the team confirms with Yes/No/Match/New. Turns
   "search and discover one part at a time" into a batch yes/no pass. Works well;
   not modified.
2. **Gap finder (new).** After setup, each week/month the team brings the dealer's
   recent sales. The tool diffs against what's known and surfaces only the new
   parts to add. Same engine, same review UX, same per-dealer foundation — the only
   difference is how much is already known.

The end state is a **matcher service**: this tool returns the parts that need
review with suggested matches, and decisions live in the platform. During the
manual transition we keep the full in-tool review and also export candidates.

## Architecture

```
   Platform delivers (per run):  sales rows  +  known SKU→MOC list
                                       │
                                       ▼
   ┌─────────────────────── this tool ───────────────────────┐
   │  gap = sold SKUs − known SKUs                            │
   │  match the gap (engine: catalog + known mappings + AI)    │
   │  review in-tool (Yes/No/Match/New)  [transition only]     │
   │  export candidates  ──────────────────────────────────►  │  back to platform
   └──────────────────────────────────────────────────────────┘
```

- **Inputs are per-run, not stored long-term.** The platform is the source of
  truth for what's set up, so the known list comes fresh each run — which removes
  the drift/storage problem entirely.
- **Setup finder unchanged.** A full-file run with no known list behaves exactly
  as today.

## Inputs (manual now; identical payload via API later)

1. **Sales file** — essential fields only: **SKU + Part Name**. (What's uploaded
   today.) For the gap finder this is the recent period's sales; for the setup
   finder it's the full history.
2. **Known list** — the dealer's currently set-up parts: **SKU → MOC part number**
   (name optional). Provided per run as a separate input (a small file or paste;
   a second sheet is also acceptable). Used three ways:
   - **Gap filter:** its SKUs define what's already handled.
   - **Exact pass:** its SKU→MOC mappings feed the matcher for this run.
   - **AI profile:** its mappings become dealer-scoped aliases/examples.

   The known list is optional: with none, the run is a plain full-file match
   (setup-finder behavior).

## The gap

`gap = sales SKUs − known SKUs`, scoped **per dealer** (the same SKU string can
mean different parts at different dealers). Only gap rows are matched and shown.
An empty gap is a valid no-op ("no new parts this week").

## Dealer identity

A lightweight **`dealers`** record keys everything to the right shop.

- On upload, derive the dealer from the filename, normalize, and **auto-match** to
  an existing dealer.
- Only when there's no confident match, prompt the user to **confirm or create**.
- Runs, decisions, and the gap are all scoped by the matched dealer.

## Per-dealer AI profile

When the gap goes to the AI pass, the adjudicator receives the **dealer's own
known mappings** (from the delivered list) as scoped aliases + few-shot examples,
on top of the global catalog context (already cached). This sharpens
identification of that dealer's new parts, and improves on its own as the
platform's setup for that dealer grows — no separate teaching step.

## UX

- **Upload** the sales file (and the known list, when present).
- **Dealer** auto-matched from the filename; confirm/create only if unsure.
- **Gap** is matched and shown in the existing results table; review with
  Yes/No/Match/New as today.
- **Export candidates** — a button that produces the deliverable for the platform:
  one row per gap part with `Dealer SKU, DMS Name, Suggested MOC #, Suggested MOC
  Product, Match Type, Confidence, Status`. `Status` reflects the in-tool decision
  if one was made (approved/rejected/corrected/added), else "needs review".
- **Setup finder** (full-file review, no known list) stays exactly as it is.

## Data model

- **Add `dealers`** — `key` (normalized name, PK), `name`, `dms_type`,
  `created_at`, `last_seen_at`. For identity + auto-match.
- **No `dealer_known_skus` table** — the known list is per-run input, not stored.
- **Optional:** persist the delivered known list with each run snapshot for audit
  (not as a source of truth).
- **Reused unchanged:** `archetypes`, `approved_mappings`, `decisions`,
  `run_snapshots`, `ai_verdict_cache`. In-tool decisions still feed the matcher
  during the transition.

## Candidate export format

A downloadable file (CSV/XLSX) the team hands to the platform:

| Dealer SKU | DMS Name | Suggested MOC # | Suggested MOC Product | Match Type | Confidence | Status |

One row per gap part. This is the contract the future API return payload mirrors.

## Testing

- **Gap computation** (pure, CI-tested): `sold − known` per dealer, including
  empty-gap and no-known-list (full-file) cases.
- **Dealer auto-match/normalize** (pure, CI-tested): filename → dealer key,
  confident-match vs needs-confirm.
- **Candidate export shaping** (pure, CI-tested): results → export rows.
- Engine and existing review flows are unchanged and already covered.

## Out of scope (the automated layer — deferred)

- Live platform/API connection and auto-pull of sales + known list.
- Weekly/monthly **cron scheduling** and team **notifications**.
- Long-term storage of known SKUs (collected each run instead).
- Moving decisions out of this tool into the platform (transition keeps in-tool
  review; the switchover is a later change Blake will flag).

## Open items for the implementation plan

- Exact manual format for the known list (separate file vs second sheet vs paste)
  and the parser for it.
- Whether the gap run and the setup run are one screen with/without a known list,
  or two entry points.
- Export as CSV vs XLSX (likely both; XLSX matches the upload format).
- Dealer-key normalization rules (how aggressively to fold filename variants).
