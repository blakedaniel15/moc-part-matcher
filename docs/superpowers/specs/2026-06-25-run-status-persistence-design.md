# Run Status & In-Progress Persistence (Design Spec)

**Date:** 2026-06-25
**Status:** Approved for planning
**Author:** Blake + Claude

## Problem

A reviewer matched a file (Phil Long Ford of Denver), didn't finish, and went
back to Upload to run another file — the unfinished review vanished. Root cause
(from the lifecycle trace):

- The **run snapshot** (the matched-parts list) is only written to the DB when
  the user clicks **Done**. Until then it lives solely in the browser tab's
  `sessionStorage` (`lib/match-store.ts`), so the next upload overwrites it.
- `run_snapshots` has **no status column** — a half-done review and a finished
  one are indistinguishable, and the history list can't flag "still open."

Reassuring: **individual Yes/No/Correct decisions are NOT lost** — each click
already writes to the `decisions` table with its `run_id` immediately
(`app/api/decision/route.ts`). Only the snapshot + status are missing. This
matters more once weekly files arrive automatically and create runs that a human
must review.

## Goal

Never lose an in-progress review. Persist every run the moment matching finishes,
mark runs **In progress** vs **Reviewed**, surface that in Run history with
progress, and restore prior decisions when an in-progress run is reopened so the
reviewer resumes exactly where they left off. Same model serves automatic
ingested files.

## Approach (approved)

1. **Auto-save on creation.** When a match completes (manual upload), immediately
   write the snapshot to the DB with `status = 'in_progress'` — before/around the
   existing `sessionStorage` save. Nothing is ever lost on navigation or tab close.
2. **"Done" flips status to 'reviewed'.** The Done button keeps its behavior but
   now only changes status (the snapshot already exists).
3. **Reopen restores decisions.** Reopening a run loads its prior decisions (from
   `decisions` keyed by `run_id`) and pre-fills the Yes/No state, instead of the
   current blank reopen.
4. **History shows status + progress.** Each run row gets an **In progress** /
   **Reviewed** chip and an "N of M reviewed" count (decided distinct SKUs / total).
5. **Automatic ingested files create 'in_progress' runs** (not auto-done), landing
   in the same review list with the badge for the team to work.

No extra "Save" button and no leave-confirmation dialog (auto-save only). Accuracy
stats are unchanged — they count decisions, so an unfinished run simply contributes
only the decisions actually made.

## Status model

`run_snapshots.status`: `'in_progress'` | `'reviewed'`.

- **Created** as `in_progress` (manual match completion AND ingest).
- **Done** button → `reviewed`.
- Reopening does not change status (view/continue freely).
- Migration backfills existing rows to `'reviewed'` (every run already in
  `run_snapshots` was written by the old Done-only flow, so it is finished). The
  column default is `'reviewed'` for safe backfill; all writers pass status
  explicitly going forward.

## Data flow

```
match completes (app/page.tsx)
  └─ POST /api/runs { status:'in_progress', runId, dealer, fileName, counts, snapshot }
  └─ saveRun() → sessionStorage  → navigate /results
reviewer clicks Yes/No  → POST /api/decision (already immediate, with run_id)
reviewer clicks Done    → POST /api/runs { status:'reviewed', … }
Run history (GET /api/runs) → rows with status + decided count
reopen (GET /api/runs/[runId]) → snapshot + decisions map → prefill Yes/No state
weekly ingest (api/v1/sales) → saveRunSnapshot status:'in_progress'
```

## Components to change

- `db/schema.ts` — `alter table run_snapshots add column if not exists status text not null default 'reviewed'`.
- `db/repo.ts` —
  - `saveRunSnapshot()` gains `status` (passed through to insert/update).
  - `loadRunSummaries()` selects `status` + a `decided` count subquery; returns both.
  - new `loadRunDecisions(sql, runId)` → `{ [sku]: outcome }` (latest per sku).
  - `loadRunSnapshot()` unchanged shape; the route adds decisions separately.
- `app/api/runs/route.ts` — POST passes `status` through (default `'in_progress'`).
- `app/api/runs/[runId]/route.ts` — GET returns `{ ...run, decisions }`.
- `app/api/v1/sales/route.ts` — `saveRunSnapshot(... status:'in_progress')`.
- `app/page.tsx` — after match, POST the run as `in_progress` before navigating.
- `app/results/page.tsx` — `finish()` sends `status:'reviewed'`; history row shows
  status chip + "N of M reviewed"; `reopen()` applies restored decisions.
- `components/match/results-table.tsx` — accept an `initialDecisions` prop to
  prefill the lifted Yes/No state on reopen.

## Error handling

- Auto-save POST is best-effort but logged; if it fails, the run still lives in
  sessionStorage for the active tab (no regression vs today). A retry happens
  naturally on Done.
- `loadRunDecisions` failure → reopen falls back to blank decisions (current
  behavior), never blocks reopening.

## Testing

- `loadRunSummaries` maps `status` + `decided` (mock sql).
- `loadRunDecisions` returns latest outcome per sku (mock sql with duplicate skus).
- `saveRunSnapshot` includes status in the tagged-template values (mock sql).
- Build + full suite green.
- Live verify: run a file, don't finish, start another → first run shows
  **In progress** in history and reopens with prior Yes/No intact.

## Out of scope

- Auto-marking a reopened Reviewed run back to In progress.
- Deleting/archiving runs from the history UI.
- Per-reviewer attribution.
