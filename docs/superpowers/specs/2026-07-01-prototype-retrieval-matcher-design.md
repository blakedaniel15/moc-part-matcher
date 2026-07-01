# Prototype Retrieval Matcher (Design Spec)

**Date:** 2026-07-01
**Status:** Approved for planning
**Author:** Blake + Claude

## Problem

Per-dealer learning already makes the weekly recurring runs excellent (a dealer's
confirmed SKUs auto-match EXACT forever). But **onboarding a brand-new dealer** —
where we have no history for that dealer — leans on the catalog + universal rules +
a *capped* slice of global examples stuffed into the AI prompt. That approach
raises recall but also false positives ("everything that sort of matches gets
pulled in"), and it under-uses the global corpus we're already banking.

## Goal

Use the **global corpus of confirmed assignments** as a **discriminative
reference** so we get *more accurate*, not just broader: match a candidate part to
the MOC product whose confirmed variations it genuinely resembles, and **confidently
reject** off-distribution lookalikes. Precision-first — held to the **≤2%
false-positive** bar. Biggest win is new-dealer onboarding; it helps everywhere.

## Core principle — keep the well, decide discriminatively

1. **Keep the well.** For each MOC product, **retain every confirmed variation**
   (the dealer description, how it's logged, the SKU) as its own embedded member —
   **do not average them into one lossy centroid.** A product can have several
   legitimate naming styles; keeping the members lets us decipher each part instead
   of blurring them together.
2. **Tight neighborhoods.** When scoring a candidate, only genuinely-close members
   count (high similarity floor, small k). We never drag in loosely-similar points
   until "they all look the same."
3. **Discriminative, not additive.** The corpus is used as much to say **No** as
   **Yes**. A candidate that only *superficially* looks like `01211` but sits
   *outside* how real `01211`s look is **rejected** — "we know the shape, this isn't
   it."

## How it works

### Data model
- **`assignment_vectors`** (new, pgvector on Neon): one row per confirmed variation —
  `id, bare_part_number (the product), text (the embedded string: dealer name +
  normalized SKU signal), embedding vector, dealer, origin (approved|corrected),
  created_at`. This is "the well," partitioned logically by `bare_part_number`.
- Populated from `approved_mappings` + confirmed `decisions`. **Backfill once**, then
  **incremental**: every new approval embeds + inserts one member.
- Near-duplicate members may be de-duped to control size, but **diversity is
  preserved** (distinct naming styles are kept).
- Embeddings live in Postgres via **pgvector**; similarity search runs in-DB
  (cosine), with an index for scale.

### Embedding
- A hosted **small embedding model** (e.g. Voyage AI — Anthropic's recommended
  embeddings partner; exact model a plan-time pick), called server-side. Cost is
  tiny: embed each variation once (on approval) and each candidate once per run.
- The embedded text normalizes the dealer name + a SKU signal so "looks like" is
  **semantic**, not just token overlap.

### Retrieval + decision (per candidate)
1. Embed the candidate; k-NN against `assignment_vectors` with a **similarity floor**
   (only genuinely-close members return) and small `k`.
2. Aggregate the returned members by product and compute:
   - **fit** — how close the nearest members are (relative to that product's own
     spread; an outlier for a tight product is a strong reject signal), and
   - **margin** — how much stronger the best product's support is vs the runner-up.
3. **Decide (precision-first):**
   - strong fit **and** clear margin → **match** (confident);
   - nothing clears the similarity floor, or the best product is a poor/outlier fit
     → **strong reject → UNMATCHED**;
   - middling fit, or two products competing (no clear margin) → **AI adjudicates
     with the retrieved members as grounding**, and if the **AI is unsure → Review**.

So the retrieval **gates**; the AI only handles the genuine middle, and it does so
grounded in *this candidate's* nearest confirmed members — not a global capped slice.

## Pipeline integration

Sits after the deterministic passes (exact → fuzzy `2a–2e`), around the AI pass:
- Confident retrieval match → result without an AI call.
- Strong reject → UNMATCHED (feeds the existing "possible miss" reclassify only if
  the name is chemical + genuinely uncertain, unchanged).
- Ambiguous → the AI adjudicator, but its context becomes the **retrieved nearest
  members** for this candidate (replacing today's `top-14` global example stuffing).

The existing `approved_mappings` still drives EXACT auto-match; this adds the
semantic layer for everything that isn't an exact repeat.

## Onboarding & the virtuous cycle

The well is **global** (all dealers), so a brand-new dealer's parts are matched
against every variation ever confirmed anywhere. Each dealer we onboard fills the
wells further, so the *next* onboarding is sharper — and because retrieval is tight
and discriminative, that improvement is in **accuracy**, not just volume.

## Precision calibration & eval

- The **similarity floor + margin** thresholds are the precision knobs; tune them on
  the ground-truth eval set against the **false-positive rate** (primary) and
  identification rate (secondary).
- Add eval cases for the reject behavior (off-distribution lookalikes must reject)
  and the confirm behavior (true members must match), so calibration is measurable
  and regression-guarded in CI.

## Op-code tool — same pattern, SEPARATE well

The op-code identifier is building its own brain/RAG. We **keep the two vector
stores separate** — they're different embedding spaces (part→product vs
op-code→menu-item), and mixing them would blur the very distinctions we're
sharpening. So:

- **Reuse the *pattern*, not the *data*.** The op-code tool follows this same
  keep-the-well / tight-retrieval / discriminative-decision design, but on **its
  own store**, keyed by `menu_item_id`.
- **No cross-querying, no merged corpus.** This matcher only ever reads the parts
  well; the op-code matcher only ever reads the op-code well.
- **Naming stays namespaced** so they never collide even if co-located in the shared
  Neon DB: parts uses `assignment_vectors`; the op-code tool uses
  `opcode_assignment_vectors` (or its own DB entirely — its choice). Either is fine;
  the hard rule is the two wells are distinct.

## Risks & guards

- **Semantic over-matching → false positives:** the similarity floor + margin +
  off-distribution reject, calibrated to ≤2% FP, are the guard.
- **Embedding cost/latency:** embed once per member (on approval) and once per
  candidate; batch candidate embeds; cache.
- **Scale:** pgvector index; the similarity floor keeps neighborhoods small.
- **Cold start:** until wells fill, this defers to the existing catalog + fuzzy +
  AI path — it only ever *adds* precision, never removes the current safety net.

## Resolved decisions
- Keep **all members** per product (no lossy centroid). ✓
- **Tight** retrieval (similarity floor, small k). ✓
- **AI unsure → Review; strong reject → UNMATCHED.** ✓
- **Semantic embeddings** for "looks like." ✓

## Out of scope (for now)
- Fine-tuning a custom embedding model (hosted model first).
- Cross-product hierarchy/graph reasoning.
- Replacing the deterministic passes — they run first and stay.

## Open items for the plan
- Exact embedding model + provider (recommend a hosted small model; confirm at plan
  time), and the pgvector index type/params.
- The precise similarity-floor / margin thresholds (set from eval-set calibration).
- Backfill batch job for existing `approved_mappings`.
