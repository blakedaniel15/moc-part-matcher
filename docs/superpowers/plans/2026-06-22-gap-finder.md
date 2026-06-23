# Gap Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-dealer "gap finder" — diff a dealer's sales against a delivered known-SKU list, match only the new parts (with a dealer-scoped AI profile), review them in the existing UI, and export the candidates for the platform.

**Architecture:** New pure units (dealer-key normalization, gap diff, known-list parse, candidate export, dealer profile) are unit-tested in CI. They wire into the existing upload → `/api/match` → results flow: the upload screen gains an optional known-list dropzone (its presence switches to gap mode), the dealer is auto-matched from the filename, only the gap is sent to matching, and the results screen gains an Export Candidates button. The setup finder (no known list) is unchanged.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, `@neondatabase/serverless`, `xlsx`.

## Global Constraints

- Pure logic lives in `/lib` and `/engine` with no React/DB/network imports; it is unit-tested in CI (`npm test`), which runs with zero secrets.
- The **setup finder behaves exactly as today when no known list is provided.** Gap mode is additive.
- The **known list is per-run input, never stored** as a known-set source of truth (a copy may be saved with the run snapshot for audit only).
- The known list is an optional second file: columns **SKU** (required) and optionally **MOC#** and **Name**.
- Candidate export columns, in order: `Dealer SKU, DMS Name, Suggested MOC #, Suggested MOC Product, Match Type, Confidence, Status`.
- SKU comparisons are case-insensitive and trimmed.
- TypeScript strict. Node 20+. ES modules.

---

### Task 1: Dealer-key normalization + auto-match (pure)

**Files:**
- Create: `lib/dealer.ts`
- Test: `lib/dealer.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function normalizeDealerKey(name: string): string;
  export function dealerNameFromFile(fileName: string): string;
  export function matchDealer(key: string, existingKeys: string[]): { status: "match"; key: string } | { status: "new"; key: string };
  ```

- [ ] **Step 1: Write the failing test** `lib/dealer.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { normalizeDealerKey, dealerNameFromFile, matchDealer } from "./dealer";

describe("normalizeDealerKey", () => {
  it("folds punctuation/spacing to a stable key", () => {
    expect(normalizeDealerKey("Vegas Auto Gallery - Lotus Las Vegas")).toBe("vegas_auto_gallery_lotus_las_vegas");
    expect(normalizeDealerKey("  DeMontrond  Kia ")).toBe("demontrond_kia");
  });
});
describe("dealerNameFromFile", () => {
  it("strips extension and the _warranty… suffix", () => {
    expect(dealerNameFromFile("vegas_auto_gallery_lotus_las_vegas_warranty_uplift_report_2026_06_22.xlsx")).toBe("vegas auto gallery lotus las vegas");
  });
});
describe("matchDealer", () => {
  it("matches an existing key, else new", () => {
    expect(matchDealer("demontrond_kia", ["demontrond_kia"])).toEqual({ status: "match", key: "demontrond_kia" });
    expect(matchDealer("new_shop", ["demontrond_kia"])).toEqual({ status: "new", key: "new_shop" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- dealer`
Expected: FAIL ("Cannot find module './dealer'").

- [ ] **Step 3: Write `lib/dealer.ts`**

```ts
export function normalizeDealerKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, "_");
}

// Mirror the legacy filename parsing: everything before "_warranty", underscores → spaces.
export function dealerNameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  const m = base.match(/^(.+?)_warranty/i);
  return (m ? m[1] : base).replace(/_/g, " ").trim();
}

export function matchDealer(
  key: string,
  existingKeys: string[]
): { status: "match"; key: string } | { status: "new"; key: string } {
  return existingKeys.includes(key) ? { status: "match", key } : { status: "new", key };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- dealer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dealer.ts lib/dealer.test.ts
git commit -m "feat: dealer-key normalization + auto-match"
```

---

### Task 2: Gap computation (pure)

**Files:**
- Create: `lib/gap.ts`
- Test: `lib/gap.test.ts`

**Interfaces:**
- Consumes: `Part` from `engine/types`.
- Produces:
  ```ts
  export function computeGap(parts: Part[], knownSkus: Set<string>): { gap: Part[]; knownCount: number };
  ```

- [ ] **Step 1: Write the failing test** `lib/gap.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { computeGap } from "./gap";
import type { Part } from "../engine/types";

const p = (sku: string): Part => ({ sku, partName: "X", makeCode: null, barePartNumber: sku, dmsType: "CDK", structural: { score: 1, label: "POSSIBLE", detail: "" } });

describe("computeGap", () => {
  it("returns only SKUs not in the known set (case-insensitive)", () => {
    const { gap, knownCount } = computeGap([p("A1"), p("b2"), p("C3")], new Set(["a1", "B2"]));
    expect(gap.map((g) => g.sku)).toEqual(["C3"]);
    expect(knownCount).toBe(2);
  });
  it("empty known set => everything is gap (setup mode)", () => {
    const { gap } = computeGap([p("A1"), p("A2")], new Set());
    expect(gap).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- gap`
Expected: FAIL ("Cannot find module './gap'").

- [ ] **Step 3: Write `lib/gap.ts`**

```ts
import type { Part } from "../engine/types";

export function computeGap(parts: Part[], knownSkus: Set<string>): { gap: Part[]; knownCount: number } {
  const norm = (s: string) => s.trim().toUpperCase();
  const known = new Set([...knownSkus].map(norm));
  const gap = parts.filter((p) => !known.has(norm(p.sku)));
  return { gap, knownCount: parts.length - gap.length };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- gap`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/gap.ts lib/gap.test.ts
git commit -m "feat: per-dealer gap computation"
```

---

### Task 3: Known-list parsing (client)

**Files:**
- Create: `lib/known-list.ts`
- Test: `lib/known-list.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface KnownList { skus: Set<string>; mappings: { sku: string; moc: string; name?: string }[] }
  export function knownListFromRows(rows: any[][]): KnownList; // header row + data rows
  export function parseKnownFile(file: File): Promise<KnownList>; // xlsx/csv via SheetJS
  ```
  `knownListFromRows` is the pure, tested core; `parseKnownFile` is the thin SheetJS wrapper.

- [ ] **Step 1: Write the failing test** `lib/known-list.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { knownListFromRows } from "./known-list";

describe("knownListFromRows", () => {
  it("reads SKU (required) + optional MOC#/Name columns", () => {
    const rows = [
      ["SKU", "MOC#", "Name"],
      ["8888804461", "04461", "SHYFT"],
      ["A01071", "01071", ""],
      ["", "", ""],
    ];
    const k = knownListFromRows(rows);
    expect([...k.skus]).toEqual(["8888804461", "A01071"]);
    expect(k.mappings[0]).toEqual({ sku: "8888804461", moc: "04461", name: "SHYFT" });
  });
  it("works with only a SKU column", () => {
    const k = knownListFromRows([["SKU"], ["3381"], ["6002"]]);
    expect([...k.skus]).toEqual(["3381", "6002"]);
    expect(k.mappings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- known-list`
Expected: FAIL ("Cannot find module './known-list'").

- [ ] **Step 3: Write `lib/known-list.ts`**

```ts
import * as XLSX from "xlsx";

export interface KnownList {
  skus: Set<string>;
  mappings: { sku: string; moc: string; name?: string }[];
}

export function knownListFromRows(rows: any[][]): KnownList {
  const headers = (rows[0] || []).map((h) => String(h).toUpperCase());
  const skuIdx = headers.findIndex((h) => h.includes("SKU"));
  const mocIdx = headers.findIndex((h) => h.includes("MOC") || h === "BARE" || h.includes("BARE"));
  const nameIdx = headers.findIndex((h) => h.includes("NAME") || h.includes("PRODUCT"));
  const skus = new Set<string>();
  const mappings: { sku: string; moc: string; name?: string }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const sku = skuIdx >= 0 ? String(rows[i]?.[skuIdx] ?? "").trim() : "";
    if (!sku) continue;
    skus.add(sku);
    const moc = mocIdx >= 0 ? String(rows[i]?.[mocIdx] ?? "").trim() : "";
    if (moc) {
      const name = nameIdx >= 0 ? String(rows[i]?.[nameIdx] ?? "").trim() : "";
      mappings.push(name ? { sku, moc, name } : { sku, moc });
    }
  }
  return { skus, mappings };
}

export function parseKnownFile(file: File): Promise<KnownList> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(knownListFromRows(XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]));
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Couldn't read the known-list file."));
      }
    };
    reader.onerror = () => reject(new Error("Couldn't read the file."));
    reader.readAsBinaryString(file);
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- known-list`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/known-list.ts lib/known-list.test.ts
git commit -m "feat: known-list parsing (SKU + optional MOC#/Name)"
```

---

### Task 4: Dealer-scoped AI profile (pure)

**Files:**
- Create: `lib/dealer-profile.ts`
- Test: `lib/dealer-profile.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function buildDealerProfile(
    mappings: { sku: string; moc: string; name?: string }[]
  ): { aliases: Record<string, string[]>; examples: { name: string; barePartNumber: string }[] };
  ```
  Turns this dealer's known SKU→MOC mappings (with names when present) into the
  `aliases` + `examples` shape the `AnthropicAdjudicator` already accepts.

- [ ] **Step 1: Write the failing test** `lib/dealer-profile.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildDealerProfile } from "./dealer-profile";

describe("buildDealerProfile", () => {
  it("builds aliases + examples from named mappings", () => {
    const { aliases, examples } = buildDealerProfile([
      { sku: "X1", moc: "04461", name: "TRANS SERV" },
      { sku: "X2", moc: "01071", name: "E-SHIELD" },
      { sku: "X3", moc: "01071" }, // no name -> contributes nothing
    ]);
    expect(aliases["04461"]).toEqual(["TRANS SERV"]);
    expect(examples).toContainEqual({ name: "TRANS SERV", barePartNumber: "04461" });
    expect(examples.find((e) => e.name === undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- dealer-profile`
Expected: FAIL ("Cannot find module './dealer-profile'").

- [ ] **Step 3: Write `lib/dealer-profile.ts`**

```ts
export function buildDealerProfile(
  mappings: { sku: string; moc: string; name?: string }[]
): { aliases: Record<string, string[]>; examples: { name: string; barePartNumber: string }[] } {
  const aliases: Record<string, string[]> = {};
  const examples: { name: string; barePartNumber: string }[] = [];
  for (const m of mappings) {
    if (!m.name || !m.moc) continue;
    (aliases[m.moc] ||= []).push(m.name);
    if (examples.length < 14) examples.push({ name: m.name, barePartNumber: m.moc });
  }
  return { aliases, examples };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- dealer-profile`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dealer-profile.ts lib/dealer-profile.test.ts
git commit -m "feat: dealer-scoped AI profile from known mappings"
```

---

### Task 5: Candidate export shaping + download

**Files:**
- Create: `lib/candidate-export.ts`
- Test: `lib/candidate-export.test.ts`

**Interfaces:**
- Consumes: `MatchResult` from `engine/types`.
- Produces:
  ```ts
  export interface CandidateRow { "Dealer SKU": string; "DMS Name": string; "Suggested MOC #": string; "Suggested MOC Product": string; "Match Type": string; Confidence: string; Status: string }
  export function candidateRows(results: MatchResult[], decisions: Record<string, string>): CandidateRow[];
  export function downloadCandidates(rows: CandidateRow[], fileName: string): void; // XLSX via SheetJS
  ```
  `candidateRows` is pure/tested; `downloadCandidates` is the SheetJS writer.

- [ ] **Step 1: Write the failing test** `lib/candidate-export.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { candidateRows } from "./candidate-export";
import type { MatchResult } from "../engine/types";

const r = (over: Partial<MatchResult>): MatchResult => ({
  sku: "S", partName: "N", makeCode: null, barePartNumber: "S", dmsType: "CDK",
  structural: { score: 1, label: "POSSIBLE", detail: "" },
  matchType: "FUZZY", matchedArchetype: "04461 - SHYFT, 12OZ", matchedPartNumber: "04461",
  confidence: "MEDIUM", reason: "", incentive: null, ...over,
});

describe("candidateRows", () => {
  it("shapes a row with the decision status", () => {
    const rows = candidateRows([r({ sku: "8888804461" })], { "8888804461": "approve" });
    expect(rows[0]).toMatchObject({
      "Dealer SKU": "8888804461", "Suggested MOC #": "04461", "Match Type": "FUZZY", Confidence: "MEDIUM", Status: "approved",
    });
  });
  it("uses 'needs review' when no decision", () => {
    expect(candidateRows([r({})], {})[0].Status).toBe("needs review");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- candidate-export`
Expected: FAIL ("Cannot find module './candidate-export'").

- [ ] **Step 3: Write `lib/candidate-export.ts`**

```ts
import * as XLSX from "xlsx";
import type { MatchResult } from "../engine/types";

export interface CandidateRow {
  "Dealer SKU": string;
  "DMS Name": string;
  "Suggested MOC #": string;
  "Suggested MOC Product": string;
  "Match Type": string;
  Confidence: string;
  Status: string;
}

const STATUS: Record<string, string> = { approve: "approved", reject: "rejected", correct: "corrected", add: "added" };

export function candidateRows(results: MatchResult[], decisions: Record<string, string>): CandidateRow[] {
  return results.map((r) => ({
    "Dealer SKU": r.sku,
    "DMS Name": r.partName,
    "Suggested MOC #": r.matchedPartNumber || "",
    "Suggested MOC Product": r.matchedArchetype ? r.matchedArchetype.replace(/^\d+\s*-\s*/, "") : "",
    "Match Type": r.matchType,
    Confidence: r.confidence || "",
    Status: STATUS[decisions[r.sku]] || "needs review",
  }));
}

export function downloadCandidates(rows: CandidateRow[], fileName: string): void {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Candidates");
  XLSX.writeFile(wb, fileName);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- candidate-export`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/candidate-export.ts lib/candidate-export.test.ts
git commit -m "feat: candidate export shaping + xlsx download"
```

---

### Task 6: Dealers table + repo + `/api/dealers`

**Files:**
- Modify: `db/schema.ts` (add `dealers` table to `runMigration`)
- Modify: `db/repo.ts` (add `loadDealerKeys`, `upsertDealer`)
- Create: `app/api/dealers/route.ts`
- Test: `db/dealers.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // db/repo.ts
  export function loadDealerKeys(sql: SqlExec): Promise<string[]>;
  export function upsertDealer(sql: SqlExec, d: { key: string; name: string; dmsType: string | null }): Promise<void>;
  // GET /api/dealers -> string[] of keys ; POST {key,name,dmsType} -> {ok:true}
  ```

- [ ] **Step 1: Add the `dealers` table** to `runMigration` in `db/schema.ts`, after the `run_snapshots` block:

```ts
  await sql`create table if not exists dealers (
    key text primary key,
    name text not null,
    dms_type text null,
    created_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now()
  )`;
```

- [ ] **Step 2: Write the failing test** `db/dealers.test.ts`

```ts
import { describe, it, expect, vi } from "vitest";
import { loadDealerKeys } from "./repo";

describe("loadDealerKeys", () => {
  it("maps rows to keys", async () => {
    const sql = vi.fn(async () => [{ key: "demontrond_kia" }, { key: "vegas_auto" }]) as any;
    expect(await loadDealerKeys(sql)).toEqual(["demontrond_kia", "vegas_auto"]);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- dealers`
Expected: FAIL ("loadDealerKeys is not a function" / import error).

- [ ] **Step 4: Add to `db/repo.ts`** (after `loadRunSnapshot`):

```ts
export async function loadDealerKeys(sql: SqlExec): Promise<string[]> {
  const rows = await sql`select key from dealers order by name`;
  return rows.map((r) => r.key);
}

export async function upsertDealer(sql: SqlExec, d: { key: string; name: string; dmsType: string | null }): Promise<void> {
  await sql`insert into dealers (key, name, dms_type) values (${d.key}, ${d.name}, ${d.dmsType})
    on conflict (key) do update set name = excluded.name, dms_type = coalesce(excluded.dms_type, dealers.dms_type), last_seen_at = now()`;
}
```

- [ ] **Step 5: Create `app/api/dealers/route.ts`**

```ts
import { NextResponse } from "next/server";
import { db } from "../../../db/client";
import { loadDealerKeys, upsertDealer } from "../../../db/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sql: any = db();
    return NextResponse.json(await loadDealerKeys(sql));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load dealers." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { key, name, dmsType } = await req.json();
    if (!key || !name) return NextResponse.json({ error: "key and name required." }, { status: 400 });
    const sql: any = db();
    await upsertDealer(sql, { key, name, dmsType: dmsType ?? null });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to save dealer." }, { status: 500 });
  }
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npm test -- dealers`
Expected: PASS.

- [ ] **Step 7: Commit** (note: re-run `/setup` after deploy to create the `dealers` table)

```bash
git add db/schema.ts db/repo.ts app/api/dealers/ db/dealers.test.ts
git commit -m "feat: dealers table + repo + /api/dealers"
```

---

### Task 7: `/api/match` accepts known mappings + dealer-scoped profile

**Files:**
- Modify: `app/api/match/route.ts`

**Interfaces:**
- Consumes: `buildDealerProfile` (Task 4). POST body gains optional `knownMappings: {sku,moc,name?}[]`.
- Produces: same `MatchResult[]`, but the adjudicator now also gets the dealer-scoped aliases/examples merged ahead of the global ones.

- [ ] **Step 1: Modify the adjudicator wiring in `app/api/match/route.ts`** — after the existing `aliases`/`examples` are built from `approved`, merge the dealer profile from the request:

```ts
import { buildDealerProfile } from "../../../lib/dealer-profile";
// ...inside POST, after building aliases/examples from `approved`:
const dealerProfile = buildDealerProfile(Array.isArray(body.knownMappings) ? body.knownMappings : []);
for (const [moc, names] of Object.entries(dealerProfile.aliases)) {
  aliases[moc] = [...new Set([...(names as string[]), ...(aliases[moc] || [])])];
}
const mergedExamples = [...dealerProfile.examples, ...examples].slice(0, 14);
```
Then pass `examples: mergedExamples` (instead of `examples`) into `new AnthropicAdjudicator({ ... })`.

- [ ] **Step 2: Verify the handler core test still passes**

Run: `npm test -- route`
Expected: PASS (the pure `runMatch` test is unaffected).

- [ ] **Step 3: Verify in preview** — POST `/api/match` with `knownMappings` present returns results; the AI tail reflects dealer naming. (Needs DB + key.)

- [ ] **Step 4: Commit**

```bash
git add app/api/match/route.ts
git commit -m "feat: /api/match accepts dealer known mappings for a scoped AI profile"
```

---

### Task 8: Upload screen — known-list dropzone, dealer match, gap flow

**Files:**
- Modify: `app/page.tsx`
- Modify: `lib/match-store.ts` (add gap metadata to `StoredRun`)

**Interfaces:**
- Consumes: `parseWorkbook` (existing), `parseKnownFile` (Task 3), `computeGap` (Task 2), `normalizeDealerKey`/`dealerNameFromFile`/`matchDealer` (Task 1).
- Produces: a `StoredRun` whose `results` are the matched **gap** (or full file if no known list), plus `knownCount`, `dealerKey`.

- [ ] **Step 1: Extend `StoredRun`** in `lib/match-store.ts`:

```ts
export interface StoredRun {
  results: MatchResult[];
  dealerName: string;
  fileName: string;
  ranAt: string;
  runId: string;
  knownCount?: number;   // SKUs skipped as already-known (gap mode)
  dealerKey?: string;
}
```

- [ ] **Step 2: Add a second optional dropzone + gap logic to `app/page.tsx`.** Keep the existing sales dropzone; add a smaller "Known list (optional)" dropzone that stores a `KnownList`. In `runMatch`, after parsing the sales file:

```ts
// after: const { parts, dealerName } = await parseWorkbook(file);
const known = knownList; // state holding a KnownList | null from the second dropzone
const { gap, knownCount } = known ? computeGap(parts, known.skus) : { gap: parts, knownCount: 0 };

// dealer identity
const key = normalizeDealerKey(dealerName);
let dealerKey = key;
try {
  const existing = (await (await fetch("/api/dealers")).json()) as string[];
  const m = matchDealer(key, existing);
  if (m.status === "new") {
    await fetch("/api/dealers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, name: dealerName, dmsType: parts[0]?.dmsType ?? null }) });
  }
  dealerKey = m.key;
} catch {
  /* dealer registry is best-effort */
}

const res = await fetch("/api/match", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ parts: gap, dealerBrand: "all", knownMappings: known?.mappings ?? [] }),
});
// ...existing error handling...
const results = await res.json();
const runId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `run-${Date.now()}`;
saveRun({ results, dealerName, fileName: file.name, ranAt: new Date().toISOString(), runId, knownCount, dealerKey });
router.push("/results");
```

Add `import { parseKnownFile, type KnownList } from "../lib/known-list";`, `import { computeGap } from "../lib/gap";`, `import { normalizeDealerKey, dealerNameFromFile, matchDealer } from "../lib/dealer";`, and `const [knownList, setKnownList] = useState<KnownList | null>(null);`. The second dropzone calls `parseKnownFile(f).then(setKnownList)`.

- [ ] **Step 3: Build locally**

Run: `npm run build`
Expected: "✓ Compiled successfully".

- [ ] **Step 4: Verify in preview** — upload sales + a known list; only the gap is matched and you land on results showing the new parts. Without a known list, behavior is unchanged. (Needs DB + key.)

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx lib/match-store.ts
git commit -m "feat: upload known list, compute gap, register dealer"
```

---

### Task 9: Results screen — gap header + Export Candidates

**Files:**
- Modify: `app/results/page.tsx`
- Modify: `components/match/results-table.tsx` (expose current decisions for export)

**Interfaces:**
- Consumes: `candidateRows`/`downloadCandidates` (Task 5).
- Produces: an Export button that downloads the candidate file; a header line noting `N known skipped` in gap mode.

- [ ] **Step 1: Lift decisions for export.** In `components/match/results-table.tsx`, accept an optional `onDecisionsChange?: (d: Record<string, string>) => void` prop and call it inside `decide()` after `setDecided`, passing the new map. (The table already owns `decided`.)

```ts
// in decide(), after setDecided:
const next = { ...decided, [row.sku]: outcome };
setDecided(next);
onDecisionsChange?.(next);
```
Add `onDecisionsChange` to the component's props type.

- [ ] **Step 2: Wire the export button in `app/results/page.tsx`** (active-run branch):

```ts
import { candidateRows, downloadCandidates } from "../../lib/candidate-export";
// state:
const [decisions, setDecisions] = useState<Record<string, string>>({});
// in the header actions, next to Done:
<Button variant="outline" size="sm" onClick={() => downloadCandidates(candidateRows(run.results, decisions), `${run.dealerName || "candidates"}.xlsx`)}>
  Export candidates
</Button>
// pass onDecisionsChange to the table:
<ResultsTable results={run.results} dealer={run.dealerName} runId={run.runId} onDecisionsChange={setDecisions} />
// in the counts line, when knownCount:
{run.knownCount ? <> · <span className="tnum">{run.knownCount}</span> known skipped</> : null}
```

- [ ] **Step 3: Build locally**

Run: `npm run build`
Expected: "✓ Compiled successfully".

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS (all pure units + existing engine/eval green).

- [ ] **Step 5: Commit**

```bash
git add app/results/page.tsx components/match/results-table.tsx
git commit -m "feat: export candidates + gap header on results"
```

---

## Self-Review

**Spec coverage:**
- Gap = sold − known, per dealer → Task 2 + Task 8. ✓
- Known list as per-run input (SKU + optional MOC#/Name), not stored → Task 3 + Task 8 (passed to /api/match, never persisted as a known set). ✓
- Dealer identity (auto-match, confirm/create) → Task 1 + Task 6 + Task 8. ✓
- Per-dealer AI profile → Task 4 + Task 7. ✓
- Keep setup finder unchanged (no known list → full file) → Task 8 (`known ? gap : parts`). ✓
- Candidate export with the exact columns → Task 5 + Task 9. ✓
- Out of scope (cron, API, notifications, long-term known storage) → not built; known never persisted. ✓

**Placeholder scan:** No "TBD"/"handle errors" placeholders; every code step shows real code. Preview-only steps (DB/key) are labeled, not gaps.

**Type consistency:** `KnownList` ({skus, mappings}), `buildDealerProfile` → {aliases, examples}, `candidateRows(results, decisions)`, `loadDealerKeys`/`upsertDealer`, and the `StoredRun` additions (`knownCount`, `dealerKey`) are used consistently across tasks. `knownMappings: {sku,moc,name?}[]` is the same shape in Tasks 3, 4, 7, 8.

## Notes
- After deploying Task 6, **re-run `/setup`** once to create the `dealers` table.
- Manual file format chosen: the known list is a **second optional file** (xlsx/csv) with a `SKU` column (+ optional `MOC#`/`Name`). The future API sends the same fields as JSON.
- Setup vs gap is **one screen**: presence of a known list switches to gap mode.
