# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-file React component (`moc-matcher.jsx`, ~2400 lines) that matches automotive dealer DMS (Dealer Management System) part exports against MOC Products' canonical product catalog ("archetypes"). A user uploads a dealer's Excel parts file; the tool classifies each row as an exact / fuzzy / AI-inferred / unmatched MOC product, routes uncertain matches through a human approval queue, and exports the confirmed mappings.

## Runtime — read this before editing

This file is **not a normal npm project**. There is no `package.json`, no build config, no test suite, and no dev server. It is designed to run inside the **Claude.ai Artifacts runtime**, which provides two ambient globals the code depends on:

- `window.storage` — async key/value persistence (`.get(key)` returns `{ value }`, `.set(key, jsonString)`, `.delete(key)`). All app state survives across sessions through this. **There is no other database.**
- `fetch("https://api.anthropic.com/v1/messages", …)` with **no API key header** — the runtime injects auth. Do not add an `x-api-key`/`Authorization` header or move the model call server-side; it would break in this environment.

`xlsx` (SheetJS) and `react` are assumed available as imports. To actually run/preview changes, the file must be loaded as an artifact — you cannot `npm start` it here. Validate edits by reading carefully and reasoning about the pipeline rather than executing.

## Two large hardcoded data tables (top of file)

Edits to product data happen here, not in a DB:

- `MOC_MAPPINGS` (line ~8) — canonical archetypes keyed by 5-digit `barePartNumber`, with `manufacturerPart` (full name) and `incentive` (max observed dollar incentive). Split into an original set and an "EXPANDED ARCHETYPE SET" with `incentive: 0`.
- `DEALER_ALIASES` (line ~134) — `barePartNumber → [dealer name strings]`, seeded from real dealer data. Feeds Pass 2.5 name pre-matching and enriches the AI prompt. At runtime this is merged with user-approved aliases (`aliasEntries`) into `mergedAliases`.

## Matching pipeline (`runMatching`, line ~586)

The core algorithm runs every uploaded part through ordered passes; earlier, higher-confidence passes win and remaining parts fall through:

### Two axes — don't confuse them

The code tracks two independent things. "EXACT / POSSIBLE / UNLIKELY" mix them up, so keep them separate:

- **Structural signal** (`analyzeMOCStructure`, line ~237) — a *prior on the part-number shape only*, never a verdict. Produces a `{score, label}`: **STRONG** (score 2), **POSSIBLE** (score 1), **UNLIKELY** (score 0). Used by the pre-AI filter, the AI prompt, sorting, and the 4-digit reclassification — but it never matches a part by itself.
- **Match outcome** — `matchType` (`EXACT` / `FUZZY` / `AI` / `UNMATCHED`) paired with `confidence` (`EXACT` / `HIGH` / `MEDIUM` / `LOW`). This is the actual result.

**Structural label conditions** (input is the prefix-stripped `barePartNumber`):

| Label | Score | Exact condition |
|-------|-------|-----------------|
| STRONG | 2 | 5-digit all-numeric **with leading zero** (`01071`); OR single-letter-prefix + 5 digits with leading zero (`A04461`) |
| POSSIBLE | 1 | 5-digit all-numeric, no leading zero; OR 4-digit all-numeric (dropped-zero candidate); OR single-letter-prefix + 5 digits, no leading zero |
| UNLIKELY | 0 | any mixed alphanumeric (other than the single-letter-prefix case); OR all-numeric but not 4 or 5 digits |

### Pass-by-pass match conditions

Parts flow through ordered passes; a part that matches in one pass never reaches later passes. `matchType`/`confidence` are assigned as follows.

1. **Pass 1 — Exact** → `matchType: EXACT`, `confidence: EXACT`. Two ways: (a) `approvedMappings` has an entry whose `dmsSku` equals this row's SKU (case-insensitive) **and** the stored vs current part name share ≥1 token (`nameOverlap > 0`); (b) `allMappings` has an archetype whose `barePartNumber` *exactly equals* the stripped bare number. The **name-divergence guard**: if an approved SKU matches but `nameOverlap === 0`, it is **not** auto-matched — it's pushed with `_divergenceReason` and forced into the review queue (catches a SKU number reused for a different part).

2. **Blocking pre-pass** (before fuzzy) → `matchType: UNMATCHED`. SKUs in `blockedSkus` (exact or prefix-stripped core) or in `dealerRejections[thisDealer]` are dropped to UNMATCHED and never re-evaluated. Exact matches are never blocked.

3. **Pass 2 — Fuzzy numeric** → `matchType: FUZZY`. One of three sub-passes must hit (none fire if letters sit *between* digits — `\d[A-Z]+\d`):
   - **2a numeric-core**: `numericCore` (non-digits + leading zeros stripped) equals an archetype's core.
   - **2b trailing-suffix**: number is >5 digits and its **last 5 digits** equal an archetype (`8888804461` → `04461`).
   - **2c zero-pad**: number is exactly 4 digits and `"0" + number` equals an archetype (`2301` → `02301`).

   Fuzzy **confidence** is then derived from `skuComplexity(sku)` × which sub-pass × whether the name is mechanical (`isMechanicalName`):
   - `skuComplexity`: **clean** = all-numeric or `^[A-Z]{1,4}\d+$`; **suspect** = letters on both ends (`^[A-Z]+\d+[A-Z]+$`) or ≥8 chars mixed alpha+digit; **moderate** = anything else.
   - suspect SKU → **LOW** (regardless of sub-pass).
   - 2b or 2c → **MEDIUM**, dropped to **LOW** if the name is mechanical.
   - 2a + clean SKU → **HIGH**, dropped to **MEDIUM** if mechanical.
   - 2a + moderate SKU → **MEDIUM**, dropped to **LOW** if mechanical.
   - Note: fuzzy can only reach HIGH via a clean 2a number match — a matching *name* never boosts a fuzzy result.

4. **Pass 3 — Pre-AI filter** → `matchType: UNMATCHED` (skips the AI call to save batch slots). A part is dropped here if **any** of: confirmed OEM format (Nissan `999MP…`, or `CR2032`/`2032` with a battery/key/fob name); mid-letter OEM segment format (`76620-T20-A01`); **UNLIKELY structure AND mechanical name**; **suspect SKU AND UNLIKELY structure**; or (Toyota dealer) `####-####` catalog format AND mechanical name. Everything else goes to AI.

5. **AI pass** → batched (`BATCH_SIZE = 30`) to `claude-sonnet-4-20250514`. Per part the model returns `matched` + `confidence` (HIGH/MEDIUM/LOW) + `mocPartNumber`. Result becomes `matchType: AI` (with the model's confidence) if matched, else `UNMATCHED`. The prompt encodes the policy: **number = 70% of signal, name = 30%**; "matching name on a wrong number = UNMATCHED." Parsed defensively (strips ``` fences; tolerant `mocPartNumber` formats). On API/parse error the whole batch falls back to UNMATCHED.

6. **Reclassification** (post-pass): a still-`UNMATCHED` row that is **4-digit numeric AND has a non-mechanical/chemical name** is bumped to `matchType: AI`, `confidence: LOW` — flagged as a possible missing archetype, not confirmed OEM.

### Auto-report vs. human review

Two separate gates, both important:

**A. In-run approval queue** (`runMatching`, line ~1154) — what a human must click Approve/Reject/Correct/Defer on:
- **Auto-approved (no queue):** canonical `EXACT` matches (matchType EXACT + bare number in catalog) and rows whose SKU is already in `approvedMappings`.
- **Always queued:** **every FUZZY and every AI match**, plus any divergence-flagged row (even if its SKU was previously approved). Unmatched rows (no `matchedArchetype`) are not queued.

**B. Export sheets** (`exportResults` → `isMatched`/`isMaybe`, line ~1453) — the two-tab `.xlsx`:
- **"Matched" sheet** (`isMatched`): `EXACT`, **all** `FUZZY` (any confidence), and `AI` with `HIGH`/`MEDIUM`.
- **"Maybe – Review" sheet** (`isMaybe`): `AI` with `LOW` only.
- Plain `UNMATCHED` rows are exported to neither sheet.

> The two gates use different thresholds on purpose: the export's "Matched" sheet treats all FUZZY as matched, but the in-run queue still makes a human confirm every FUZZY before it can be saved as an `approvedMapping`.

### SKU prefix handling (`parseSKU`, line ~206)

DMS systems prepend prefixes to the canonical 5-digit number. Stripping is **DMS-type-aware**: R&R prefixes are stripped only if they match the definitive `RR_MAKE_CODES` whitelist (optionally followed by `MP`); CDK files are bare-numeric and stripping is fully disabled for them. One file = one dealer = one DMS, detected once at parse time. Don't loosen this to "strip any leading letters" — that's why the whitelist exists.

## State & persistence model

All meaningful state lives in `useState` inside `MOCMatcher` and is mirrored to `window.storage` keys, loaded once in the mount `useEffect` (line ~330, includes a one-time migration from old flat `dynamicAliases` → rich `aliasEntries`). Key persisted stores:

- `approvedMappings` — confirmed dealer-SKU → archetype mappings (Pass 1 input)
- `aliasEntries` — `{ bare → [{ name, sourceSku, origin, addedAt }] }`; `origin` is `"approved"` or `"exact_auto"` (auto-captured from exact matches). Flattened to `dynamicAliases` for the AI prompt.
- `customArchetypes` — user-added archetypes, merged with `MOC_MAPPINGS` into `allMappings`
- `accuracyLog`, `runHistory`, `blockedSkus`, `dealerRejections`, deferred queue items

The human-in-the-loop handlers — `handleApprove`, `handleReject`, `handleCorrect`, `handleDefer`, reject-forever (PIN-gated, line ~1328), bulk actions — are how mappings/aliases get written back. When changing match output shape, keep these and `exportResults` (line ~1464) in sync.

## Working in this file

- It's one component with inline data, logic, and JSX render. Section banners (`// ── … ──`) mark boundaries — use them to navigate.
- Many comments document **why** a guard exists (name divergence, mechanical compounds, R&R whitelist) and include revert instructions. Preserve that intent; these encode lessons from real dealer data, not arbitrary choices.
- The AI prompt is load-bearing product logic. Changes to weighting, evidence lists, or output schema directly change match quality and must stay consistent with the JSON parsing right below the `fetch`.
