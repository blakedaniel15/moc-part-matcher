# Data Layer + Live Adjudicator Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the engine on a durable, shared Neon Postgres datastore and a server-side live Anthropic adjudicator, expose matching through `/api/match`, and land the eval-guided fuzzy-2b fix for the OEM false positives.

**Architecture:** Pure, mockable units verified in CI (no secrets); live integration (real Neon + Anthropic) verified in a Vercel preview. The engine stays unchanged except the fuzzy-2b tightening. A thin data-access layer takes an injected SQL executor so it is unit-testable without a database. The `AnthropicAdjudicator` takes an injected `fetch` so it is unit-testable without an API key.

**Tech Stack:** Next.js App Router (route handlers), `@neondatabase/serverless`, TypeScript, Vitest. Anthropic Messages API via structured tool-use.

## Global Constraints

- The engine (`/engine/**`) still performs NO network/DB I/O directly. DB access lives in `/db`, the live AI call lives in the `AnthropicAdjudicator` (implements the existing `Adjudicator` interface).
- **CI runs with zero secrets.** Every task's `npm test` step must pass without `DATABASE_URL` or `ANTHROPIC_API_KEY`. Units that need them take an injected dependency (sql executor / fetch) and are tested with fakes.
- Live integration (real Neon, real Anthropic, `npm run eval --live`) is verified in a **Vercel preview**, not CI. Steps that require this say "Verify in preview".
- Model id from `process.env.ANTHROPIC_MODEL` with a code default of `claude-sonnet-4-6`.
- Match behavior is unchanged EXCEPT Task 1 (fuzzy-2b), which is gated by the eval: precision must improve with no recall loss on the held-out set.
- Secrets are server-side only; never imported into client components.

---

### Task 1: Fuzzy-2b fix — stop OEM trailing-suffix false positives

The eval surfaced false matches where an OEM part number coincidentally ends in a MOC number: `TO48068-02301 → 02301`, `TO90467-06121 → 06121` (dash-segmented), and `SU9418801201 → 01201` (make-code prefix + long digits). The legit 2b case is a *store number* prepended to the full MOC number (e.g. `8888804461`, prefix `88888`). Distinguish them structurally.

**Files:**
- Modify: `engine/fuzzy.ts`
- Test: `engine/fuzzy.test.ts`

**Interfaces:**
- `fuzzyMatch` signature unchanged. New internal helper `isStoreLikePrefix(prefix: string): boolean`.

**Rule:** 2b fires only when (a) the SKU is NOT dash-segmented (`\d{3,}-\d{3,}`), AND (b) the digit prefix before the trailing 5 is "store-like": all identical digits (e.g. `88888`, `00000`) OR length ≤ 4. Otherwise 2b does not fire.

- [ ] **Step 1: Add the failing tests** to `engine/fuzzy.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { fuzzyMatch } from "./fuzzy";
import type { Part, Archetype } from "./types";

const cat2b: Archetype[] = [
  { barePartNumber: "04461", manufacturerPart: "04461 - SHYFT, 12OZ", incentive: 10 },
  { barePartNumber: "02301", manufacturerPart: "02301 - COOLING KIT", incentive: 0 },
  { barePartNumber: "01201", manufacturerPart: "01201 - DOUBLE CLEAN", incentive: 0 },
];
const p2b = (sku: string, bare: string, name: string): Part => ({
  sku, partName: name, makeCode: null, barePartNumber: bare, dmsType: "R&R",
  structural: { score: 0, label: "UNLIKELY", detail: "" },
});

describe("fuzzyMatch 2b store-prefix guard", () => {
  it("keeps legit store-prefixed match (repeated-digit prefix)", () => {
    const r = fuzzyMatch(p2b("8888804461", "8888804461", "TRANSMISSION SERV"), cat2b);
    expect(r?.archetype.barePartNumber).toBe("04461");
  });
  it("rejects dash-segmented OEM number", () => {
    expect(fuzzyMatch(p2b("TO48068-02301", "TO48068-02301", "ARM SUB-ASSY"), cat2b)).toBeNull();
  });
  it("rejects make-code + non-store-like prefix (NUT LOCK ≠ DOUBLE CLEAN)", () => {
    expect(fuzzyMatch(p2b("SU9418801201", "9418801201", "NUT LOCK"), cat2b)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npm test -- fuzzy`
Expected: the two "rejects …" tests FAIL (currently 2b matches them).

- [ ] **Step 3: Implement the guard in `engine/fuzzy.ts`** — add the helper and apply it in the 2b branch.

Add near the top of the file:
```ts
// A "store-like" prefix is what dealers prepend before the full MOC number:
// all-identical digits (88888, 00000) or a short run (≤4). An OEM part segment
// (e.g. 94188, or a dash-segmented catalog number) is NOT store-like.
function isStoreLikePrefix(prefix: string): boolean {
  if (prefix.length === 0) return true;
  if (prefix.length <= 4) return true;
  return /^(\d)\1*$/.test(prefix); // all identical digits
}
```

Replace the 2b branch:
```ts
  // 2b: trailing suffix — last 5 digits exactly match a MOC archetype.
  if (!archetype && !hasMidLetters && digits.length > 5) {
    const dashSegmented = /\d{3,}-\d{3,}/.test(part.barePartNumber);
    const tail5 = digits.slice(-5);
    const prefix = digits.slice(0, -5);
    if (!dashSegmented && isStoreLikePrefix(prefix)) {
      const m = catalog.find((a) => a.barePartNumber === tail5);
      if (m) {
        archetype = m;
        matchPass = "2b";
        reason = "MOC number " + m.barePartNumber + " found as trailing suffix (store prefix stripped)";
      }
    }
  }
```

- [ ] **Step 4: Run all fuzzy + pipeline tests**

Run: `npm test -- fuzzy pipeline`
Expected: PASS (new guards hold; existing 2b `8888804461` test still passes).

- [ ] **Step 5: Re-run eval and confirm precision improved with no recall loss**

Run: `npm run eval`
Expected: held-out **cold precision rises** (the OEM false positives drop out) and **recall stays 100%**. The "Cold-mode false positives" section should shrink. Paste the before/after into the commit.

- [ ] **Step 6: Commit**

```bash
git add engine/fuzzy.ts engine/fuzzy.test.ts
git commit -m "fix: tighten fuzzy 2b to reject OEM trailing-suffix false positives"
```

---

### Task 2: Config module

**Files:**
- Create: `lib/config.ts`
- Test: `lib/config.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const config: {
    anthropicModel: string;     // env ANTHROPIC_MODEL || "claude-sonnet-4-6"
    batchSize: number;          // 30
  };
  export function requireEnv(name: string): string; // throws if missing
  ```

- [ ] **Step 1: Write the failing test** `lib/config.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { config, requireEnv } from "./config";

describe("config", () => {
  it("defaults model and batch size", () => {
    expect(config.anthropicModel).toBeTruthy();
    expect(config.batchSize).toBe(30);
  });
  it("requireEnv throws when missing", () => {
    expect(() => requireEnv("DEFINITELY_NOT_SET_VAR")).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- config`
Expected: FAIL ("Cannot find module './config'").

- [ ] **Step 3: Write `lib/config.ts`**

```ts
export const config = {
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
  batchSize: 30,
};

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- config`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/config.ts lib/config.test.ts
git commit -m "feat: config module (model id, batch size, requireEnv)"
```

---

### Task 3: Postgres schema + migration SQL

**Files:**
- Create: `db/schema.sql`
- Create: `db/migrate.ts` (applies schema.sql to `DATABASE_URL`)

**Interfaces:**
- Produces tables: `archetypes`, `approved_mappings`, `aliases`, `decisions`, `blocked_skus`, `dealer_rejections`, `runs`, `ai_verdict_cache` (per the design spec).

- [ ] **Step 1: Write `db/schema.sql`**

```sql
create table if not exists archetypes (
  bare_part_number text primary key,
  manufacturer_part text not null,
  incentive integer not null default 0,
  components text[] null,
  source text not null default 'official',
  official_name text null
);

create table if not exists approved_mappings (
  dms_sku text primary key,
  dms_part_name text not null default '',
  bare_part_number text not null,
  manufacturer_part text not null,
  incentive integer not null default 0,
  approved_at timestamptz not null default now(),
  approved_by text null
);

create table if not exists aliases (
  id bigserial primary key,
  bare_part_number text not null,
  name text not null,
  source_sku text not null default '',
  origin text not null,
  added_at timestamptz not null default now(),
  unique (bare_part_number, name)
);

create table if not exists decisions (
  id bigserial primary key,
  sku text not null,
  part_name text not null default '',
  match_type text null,
  confidence text null,
  outcome text not null,            -- approve | reject | correct
  bare_part_number text null,       -- the human-confirmed answer (null = not MOC)
  ts timestamptz not null default now()
);

create table if not exists blocked_skus (
  sku text primary key,
  part_name text not null default '',
  reason text null,
  blocked_at timestamptz not null default now()
);

create table if not exists dealer_rejections (
  dealer text not null,
  sku text not null,
  ts timestamptz not null default now(),
  primary key (dealer, sku)
);

create table if not exists runs (
  id bigserial primary key,
  dealer text null,
  total integer not null,
  exact integer not null,
  exact_pct numeric null,
  ts timestamptz not null default now()
);

create table if not exists ai_verdict_cache (
  content_hash text primary key,
  verdict jsonb not null,
  model text not null,
  catalog_version text null,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 2: Write `db/migrate.ts`** (run with `tsx db/migrate.ts`)

```ts
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { requireEnv } from "../lib/config";

async function main() {
  const sql = neon(requireEnv("DATABASE_URL"));
  const ddl = readFileSync("db/schema.sql", "utf8");
  // neon http supports multiple statements via the `query` form; run as one batch.
  await sql.query(ddl);
  console.log("Migration applied.");
}
main();
```

Run: `npm install @neondatabase/serverless`

- [ ] **Step 3: Add the `migrate` and `seed` scripts to `package.json`**

```json
"migrate": "tsx db/migrate.ts",
"seed": "tsx db/seed.ts"
```

- [ ] **Step 4: Verify in preview** — after `DATABASE_URL` is set, run `npm run migrate`; expect "Migration applied." and the 8 tables to exist. (No CI step — needs the DB.)

- [ ] **Step 5: Commit**

```bash
git add db/schema.sql db/migrate.ts package.json
git commit -m "feat: Postgres schema + migration runner"
```

---

### Task 4: Seed transforms (pure, CI-tested)

Convert `moc-export.json` + `data/archetypes.json` into row sets. Pure functions so CI can test them with no DB.

**Files:**
- Create: `db/transforms.ts`
- Test: `db/transforms.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function archetypeRows(catalog: any[]): { bare_part_number: string; manufacturer_part: string; incentive: number; components: string[] | null; source: string; official_name: string | null }[];
  export function approvedRows(exp: any): { dms_sku: string; dms_part_name: string; bare_part_number: string; manufacturer_part: string; incentive: number }[];
  export function blockedRows(exp: any): { sku: string; part_name: string }[];
  ```
  `approvedRows` dedupes by `dms_sku` (last wins) to satisfy the PK.

- [ ] **Step 1: Write the failing test** `db/transforms.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { archetypeRows, approvedRows, blockedRows } from "./transforms";

describe("seed transforms", () => {
  it("maps archetype fields incl components", () => {
    const rows = archetypeRows([{ barePartNumber: "02321", manufacturerPart: "02321 - Air Intake & Emission Cleaner Kit", incentive: 10, components: ["01201"], source: "official" }]);
    expect(rows[0]).toMatchObject({ bare_part_number: "02321", incentive: 10, components: ["01201"] });
  });
  it("dedupes approved by dms_sku (last wins)", () => {
    const exp = { approvedMappings: [
      { dmsSku: "A16501", dmsPartName: "OPT", barePartNumber: "16501", manufacturerPart: "x", incentive: 10 },
      { dmsSku: "A16501", dmsPartName: "OPT", barePartNumber: "16501", manufacturerPart: "x", incentive: 10 },
    ] };
    expect(approvedRows(exp)).toHaveLength(1);
  });
  it("maps blocked rows", () => {
    const exp = { blockedSkus: [{ sku: "TO48068-02301", partName: "ARM SUB-ASSY" }] };
    expect(blockedRows(exp)[0]).toMatchObject({ sku: "TO48068-02301", part_name: "ARM SUB-ASSY" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- transforms`
Expected: FAIL ("Cannot find module './transforms'").

- [ ] **Step 3: Write `db/transforms.ts`**

```ts
export function archetypeRows(catalog: any[]) {
  return catalog.map((a) => ({
    bare_part_number: a.barePartNumber,
    manufacturer_part: a.manufacturerPart,
    incentive: a.incentive ?? 0,
    components: Array.isArray(a.components) ? a.components : null,
    source: a.source ?? "official",
    official_name: a.officialName ?? null,
  }));
}

export function approvedRows(exp: any) {
  const bySku = new Map<string, any>();
  for (const a of exp.approvedMappings ?? []) {
    bySku.set(String(a.dmsSku).toUpperCase(), {
      dms_sku: a.dmsSku,
      dms_part_name: a.dmsPartName ?? "",
      bare_part_number: a.barePartNumber,
      manufacturer_part: a.manufacturerPart ?? a.barePartNumber,
      incentive: a.incentive ?? 0,
    });
  }
  return [...bySku.values()];
}

export function blockedRows(exp: any) {
  return (exp.blockedSkus ?? []).map((b: any) => ({
    sku: typeof b === "string" ? b : b.sku,
    part_name: typeof b === "string" ? "" : b.partName ?? "",
  }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- transforms`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add db/transforms.ts db/transforms.test.ts
git commit -m "feat: pure seed transforms with tests"
```

---

### Task 5: Seed script (integration — verified in preview)

**Files:**
- Create: `db/seed.ts`

**Interfaces:**
- Consumes: `archetypeRows`/`approvedRows`/`blockedRows`, the neon client. Idempotent (upserts).

- [ ] **Step 1: Write `db/seed.ts`**

```ts
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { requireEnv } from "../lib/config";
import { archetypeRows, approvedRows, blockedRows } from "./transforms";

async function main() {
  const sql = neon(requireEnv("DATABASE_URL"));
  const catalog = JSON.parse(readFileSync("data/archetypes.json", "utf8"));
  const exp = JSON.parse(readFileSync("eval/ground-truth/moc-export.json", "utf8"));

  for (const r of archetypeRows(catalog)) {
    await sql`insert into archetypes (bare_part_number, manufacturer_part, incentive, components, source, official_name)
      values (${r.bare_part_number}, ${r.manufacturer_part}, ${r.incentive}, ${r.components}, ${r.source}, ${r.official_name})
      on conflict (bare_part_number) do update set manufacturer_part = excluded.manufacturer_part,
        incentive = excluded.incentive, components = excluded.components, source = excluded.source,
        official_name = excluded.official_name`;
  }
  for (const r of approvedRows(exp)) {
    await sql`insert into approved_mappings (dms_sku, dms_part_name, bare_part_number, manufacturer_part, incentive)
      values (${r.dms_sku}, ${r.dms_part_name}, ${r.bare_part_number}, ${r.manufacturer_part}, ${r.incentive})
      on conflict (dms_sku) do update set bare_part_number = excluded.bare_part_number,
        dms_part_name = excluded.dms_part_name, manufacturer_part = excluded.manufacturer_part, incentive = excluded.incentive`;
  }
  for (const r of blockedRows(exp)) {
    await sql`insert into blocked_skus (sku, part_name) values (${r.sku}, ${r.part_name})
      on conflict (sku) do update set part_name = excluded.part_name`;
  }
  console.log("Seed complete.");
}
main();
```

- [ ] **Step 2: Verify in preview** — with `DATABASE_URL` set: `npm run migrate && npm run seed`. Expect "Seed complete." and `select count(*) from archetypes` ≈ 206, `approved_mappings` = 78, `blocked_skus` = 7.

- [ ] **Step 3: Commit**

```bash
git add db/seed.ts
git commit -m "feat: idempotent seed-from-export script"
```

---

### Task 6: Data-access layer (mockable, CI-tested)

Reads the engine's inputs (catalog, approved mappings, blocked SKUs) and writes decisions. Takes an injected sql-executor function so it is unit-testable without a DB.

**Files:**
- Create: `db/client.ts` (real neon executor)
- Create: `db/repo.ts` (queries + row mappers)
- Test: `db/repo.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type SqlExec = (strings: TemplateStringsArray, ...vals: any[]) => Promise<any[]>;
  export function loadCatalog(sql: SqlExec): Promise<Archetype[]>;
  export function loadApproved(sql: SqlExec): Promise<ApprovedMapping[]>;
  export function loadBlockedSkus(sql: SqlExec): Promise<string[]>;
  export function recordDecision(sql: SqlExec, d: { sku: string; partName: string; matchType: string | null; confidence: string | null; outcome: string; barePartNumber: string | null }): Promise<void>;
  ```

- [ ] **Step 1: Write the failing test** `db/repo.test.ts`

```ts
import { describe, it, expect, vi } from "vitest";
import { loadCatalog, loadApproved, recordDecision } from "./repo";

const fakeSql = (rows: any[]) => vi.fn(async () => rows) as any;

describe("repo", () => {
  it("loadCatalog maps rows to Archetype", async () => {
    const sql = fakeSql([{ bare_part_number: "01071", manufacturer_part: "01071 - E-SHIELD, 8OZ", incentive: 5 }]);
    const cat = await loadCatalog(sql);
    expect(cat[0]).toEqual({ barePartNumber: "01071", manufacturerPart: "01071 - E-SHIELD, 8OZ", incentive: 5 });
  });
  it("loadApproved maps rows to ApprovedMapping", async () => {
    const sql = fakeSql([{ dms_sku: "Z9", dms_part_name: "E-SHIELD", bare_part_number: "01071", manufacturer_part: "x", incentive: 5 }]);
    const a = await loadApproved(sql);
    expect(a[0]).toMatchObject({ dmsSku: "Z9", barePartNumber: "01071" });
  });
  it("recordDecision executes without throwing", async () => {
    const sql = fakeSql([]);
    await expect(recordDecision(sql, { sku: "A", partName: "", matchType: "AI", confidence: "LOW", outcome: "approve", barePartNumber: "04461" })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- repo`
Expected: FAIL ("Cannot find module './repo'").

- [ ] **Step 3: Write `db/repo.ts`**

```ts
import type { Archetype, ApprovedMapping } from "../engine/types";

export type SqlExec = (strings: TemplateStringsArray, ...vals: any[]) => Promise<any[]>;

export async function loadCatalog(sql: SqlExec): Promise<Archetype[]> {
  const rows = await sql`select bare_part_number, manufacturer_part, incentive from archetypes`;
  return rows.map((r) => ({ barePartNumber: r.bare_part_number, manufacturerPart: r.manufacturer_part, incentive: r.incentive }));
}

export async function loadApproved(sql: SqlExec): Promise<ApprovedMapping[]> {
  const rows = await sql`select dms_sku, dms_part_name, bare_part_number, manufacturer_part, incentive from approved_mappings`;
  return rows.map((r) => ({ dmsSku: r.dms_sku, dmsPartName: r.dms_part_name, barePartNumber: r.bare_part_number, manufacturerPart: r.manufacturer_part, incentive: r.incentive }));
}

export async function loadBlockedSkus(sql: SqlExec): Promise<string[]> {
  const rows = await sql`select sku from blocked_skus`;
  return rows.map((r) => r.sku);
}

export async function recordDecision(
  sql: SqlExec,
  d: { sku: string; partName: string; matchType: string | null; confidence: string | null; outcome: string; barePartNumber: string | null }
): Promise<void> {
  await sql`insert into decisions (sku, part_name, match_type, confidence, outcome, bare_part_number)
    values (${d.sku}, ${d.partName}, ${d.matchType}, ${d.confidence}, ${d.outcome}, ${d.barePartNumber})`;
}
```

- [ ] **Step 4: Write `db/client.ts`** (the real executor — thin, no test)

```ts
import { neon } from "@neondatabase/serverless";
import { requireEnv } from "../lib/config";

let _sql: ReturnType<typeof neon> | null = null;
export function db() {
  if (!_sql) _sql = neon(requireEnv("DATABASE_URL"));
  return _sql;
}
```

- [ ] **Step 5: Run to verify repo tests pass**

Run: `npm test -- repo`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add db/repo.ts db/client.ts db/repo.test.ts
git commit -m "feat: mockable data-access layer with tests"
```

---

### Task 7: AnthropicAdjudicator (mockable fetch, CI-tested)

Implements the existing `Adjudicator` interface using the Anthropic Messages API with **structured tool-use output** (no brittle fence-stripping), retries, and verdict caching by content hash.

**Files:**
- Create: `engine/anthropicAdjudicator.ts`
- Test: `engine/anthropicAdjudicator.test.ts`

**Interfaces:**
- Consumes: `Adjudicator`, `AdjudicationVerdict`, `Part`, `config`.
- Produces:
  ```ts
  export interface AdjudicatorDeps { apiKey: string; model: string; fetchImpl?: typeof fetch; cache?: { get(h: string): Promise<AdjudicationVerdict | null>; set(h: string, v: AdjudicationVerdict): Promise<void> }; }
  export function contentHash(part: Part, catalogVersion: string): string;
  export class AnthropicAdjudicator implements Adjudicator { constructor(deps: AdjudicatorDeps); adjudicate(parts: Part[]): Promise<AdjudicationVerdict[]>; }
  ```
  The tool schema forces `{ index, matched, mocPartNumber, confidence, reason }`.

- [ ] **Step 1: Write the failing test** `engine/anthropicAdjudicator.test.ts`

```ts
import { describe, it, expect, vi } from "vitest";
import { AnthropicAdjudicator, contentHash } from "./anthropicAdjudicator";
import type { Part } from "./types";

const part = (sku: string, name: string): Part => ({ sku, partName: name, makeCode: null, barePartNumber: sku, dmsType: "CDK", structural: { score: 1, label: "POSSIBLE", detail: "" } });

// Fake fetch returning a tool_use block the way the Messages API does.
const fakeFetch = (verdicts: any[]) => vi.fn(async () => ({
  ok: true,
  json: async () => ({ content: [{ type: "tool_use", name: "classify", input: { results: verdicts } }] }),
})) as any;

describe("AnthropicAdjudicator", () => {
  it("parses tool-use verdicts and maps by index", async () => {
    const adj = new AnthropicAdjudicator({ apiKey: "k", model: "m", fetchImpl: fakeFetch([{ index: 1, matched: true, mocPartNumber: "04461", confidence: "HIGH", reason: "shyft" }]) });
    const out = await adj.adjudicate([part("X1", "SHYFT ATF")]);
    expect(out[0]).toMatchObject({ sku: "X1", matched: true, mocPartNumber: "04461", confidence: "HIGH" });
  });
  it("uses the cache when present (no fetch call)", async () => {
    const f = fakeFetch([]);
    const cached = { sku: "X1", matched: true, mocPartNumber: "04461", confidence: "HIGH" as const, reason: "c" };
    const cache = { get: vi.fn(async () => cached), set: vi.fn(async () => {}) };
    const adj = new AnthropicAdjudicator({ apiKey: "k", model: "m", fetchImpl: f, cache });
    const out = await adj.adjudicate([part("X1", "SHYFT")]);
    expect(out[0]).toMatchObject({ mocPartNumber: "04461" });
    expect(f).not.toHaveBeenCalled();
  });
  it("contentHash is stable for same input", () => {
    expect(contentHash(part("X1", "SHYFT"), "v1")).toBe(contentHash(part("X1", "SHYFT"), "v1"));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- anthropicAdjudicator`
Expected: FAIL ("Cannot find module './anthropicAdjudicator'").

- [ ] **Step 3: Write `engine/anthropicAdjudicator.ts`**

```ts
import { createHash } from "node:crypto";
import type { Part } from "./types";
import type { Adjudicator, AdjudicationVerdict } from "./adjudicator";

export interface AdjudicatorDeps {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  catalogVersion?: string;
  cache?: { get(h: string): Promise<AdjudicationVerdict | null>; set(h: string, v: AdjudicationVerdict): Promise<void> };
}

export function contentHash(part: Part, catalogVersion: string): string {
  return createHash("sha256").update(`${part.sku}|${part.partName}|${catalogVersion}`).digest("hex");
}

const TOOL = {
  name: "classify",
  description: "Return a classification verdict for each part.",
  input_schema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer" },
            matched: { type: "boolean" },
            mocPartNumber: { type: ["string", "null"] },
            confidence: { type: ["string", "null"], enum: ["HIGH", "MEDIUM", "LOW", null] },
            reason: { type: "string" },
          },
          required: ["index", "matched", "reason"],
        },
      },
    },
    required: ["results"],
  },
};

export class AnthropicAdjudicator implements Adjudicator {
  constructor(private deps: AdjudicatorDeps) {}

  async adjudicate(parts: Part[]): Promise<AdjudicationVerdict[]> {
    const cv = this.deps.catalogVersion ?? "v1";
    const out: (AdjudicationVerdict | null)[] = new Array(parts.length).fill(null);
    const toAsk: { i: number; part: Part }[] = [];

    if (this.deps.cache) {
      for (let i = 0; i < parts.length; i++) {
        const hit = await this.deps.cache.get(contentHash(parts[i], cv));
        if (hit) out[i] = { ...hit, sku: parts[i].sku };
        else toAsk.push({ i, part: parts[i] });
      }
    } else {
      parts.forEach((part, i) => toAsk.push({ i, part }));
    }

    if (toAsk.length) {
      const verdicts = await this.callApi(toAsk.map((t) => t.part));
      for (let k = 0; k < toAsk.length; k++) {
        const v = verdicts.find((x) => x.index === k + 1);
        const part = toAsk[k].part;
        const verdict: AdjudicationVerdict = v
          ? { sku: part.sku, matched: !!v.matched, mocPartNumber: v.mocPartNumber ?? null, confidence: v.confidence ?? null, reason: v.reason ?? "" }
          : { sku: part.sku, matched: false, mocPartNumber: null, confidence: null, reason: "No verdict returned" };
        out[toAsk[k].i] = verdict;
        if (this.deps.cache && v) await this.deps.cache.set(contentHash(part, cv), verdict);
      }
    }

    return out.map((v, i) => v ?? { sku: parts[i].sku, matched: false, mocPartNumber: null, confidence: null, reason: "No verdict" });
  }

  private async callApi(parts: Part[]): Promise<any[]> {
    const f = this.deps.fetchImpl ?? fetch;
    const partsList = parts
      .map((p, idx) => `${idx + 1}. SKU: ${p.sku} | Bare#: ${p.barePartNumber} | Structure: ${p.structural.label} | DMS Name: ${p.partName}`)
      .join("\n");
    const prompt =
      "You are an automotive parts matching expert for MOC Products. For each part, decide if it matches a MOC product archetype. " +
      "Part number is the primary signal (~70%); the name supports it (~30%). A matching name on a wrong number is UNMATCHED. " +
      "Use the classify tool. 1-based index per part.\n\nPARTS:\n" + partsList;

    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await f("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": this.deps.apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: this.deps.model, max_tokens: 4000, tools: [TOOL], tool_choice: { type: "tool", name: "classify" }, messages: [{ role: "user", content: prompt }] }),
        });
        if (!(res as any).ok) throw new Error(`HTTP ${(res as any).status}`);
        const data = await (res as any).json();
        const block = (data.content || []).find((c: any) => c.type === "tool_use");
        return block?.input?.results ?? [];
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      }
    }
    throw lastErr;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- anthropicAdjudicator`
Expected: PASS (3 tests; cache test confirms no fetch call).

Run: `npm install` — ensure no new deps needed (`node:crypto` is built-in).

- [ ] **Step 5: Commit**

```bash
git add engine/anthropicAdjudicator.ts engine/anthropicAdjudicator.test.ts
git commit -m "feat: AnthropicAdjudicator with structured tool-use, retries, cache"
```

---

### Task 8: `/api/match` route (integration — preview-verified)

**Files:**
- Create: `app/api/match/route.ts`
- Test: `app/api/match/route.test.ts` (handler with mocked deps)

**Interfaces:**
- POST body: `{ parts: Part[], dealerBrand?: "toyota" | "all" }`. Loads catalog/approved/blocked from the DB, runs the pipeline with the `AnthropicAdjudicator`, returns `MatchResult[]`.

- [ ] **Step 1: Write the failing test** `app/api/match/route.test.ts`

```ts
import { describe, it, expect, vi } from "vitest";
import { runMatch } from "./route";
import type { Part } from "../../../engine/types";
import { RecordedAdjudicator } from "../../../engine/adjudicator";

const part = (sku: string, bare: string): Part => ({ sku, partName: "E-SHIELD", makeCode: null, barePartNumber: bare, dmsType: "CDK", structural: { score: 2, label: "STRONG", detail: "" } });

describe("runMatch (handler core)", () => {
  it("runs the pipeline with injected deps", async () => {
    const deps = {
      catalog: [{ barePartNumber: "01071", manufacturerPart: "01071 - E-SHIELD, 8OZ", incentive: 5 }],
      approved: [], blockedSkus: [], dealerRejections: [],
      adjudicator: new RecordedAdjudicator({}),
    };
    const out = await runMatch({ parts: [part("01071", "01071")], dealerBrand: "all" }, deps);
    expect(out[0]).toMatchObject({ matchType: "EXACT", matchedPartNumber: "01071" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- route`
Expected: FAIL ("Cannot find module './route'").

- [ ] **Step 3: Write `app/api/match/route.ts`** — split a pure `runMatch` (testable) from the HTTP wrapper.

```ts
import { NextResponse } from "next/server";
import type { Part, Archetype, ApprovedMapping, MatchResult } from "../../../engine/types";
import { runPipeline } from "../../../engine/pipeline";
import type { Adjudicator } from "../../../engine/adjudicator";
import { AnthropicAdjudicator } from "../../../engine/anthropicAdjudicator";
import { db } from "../../../db/client";
import { loadCatalog, loadApproved, loadBlockedSkus } from "../../../db/repo";
import { config, requireEnv } from "../../../lib/config";

export interface MatchDeps {
  catalog: Archetype[];
  approved: ApprovedMapping[];
  blockedSkus: string[];
  dealerRejections: string[];
  adjudicator: Adjudicator;
}

export async function runMatch(
  body: { parts: Part[]; dealerBrand?: "toyota" | "all" },
  deps: MatchDeps
): Promise<MatchResult[]> {
  return runPipeline(body.parts, {
    catalog: deps.catalog,
    approved: deps.approved,
    blockedSkus: deps.blockedSkus,
    dealerRejections: deps.dealerRejections,
    dealerBrand: body.dealerBrand ?? "all",
    adjudicator: deps.adjudicator,
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const sql = db();
  const [catalog, approved, blockedSkus] = await Promise.all([loadCatalog(sql), loadApproved(sql), loadBlockedSkus(sql)]);
  const adjudicator = new AnthropicAdjudicator({ apiKey: requireEnv("ANTHROPIC_API_KEY"), model: config.anthropicModel });
  const results = await runMatch(body, { catalog, approved, blockedSkus, dealerRejections: [], adjudicator });
  return NextResponse.json(results);
}
```

- [ ] **Step 4: Run to verify the handler-core test passes**

Run: `npm test -- route`
Expected: PASS.

- [ ] **Step 5: Verify in preview** — after env + seed: `POST /api/match` with a few real SKUs returns matched results. (Manual; needs DB + key.)

- [ ] **Step 6: Commit**

```bash
git add app/api/match/route.ts app/api/match/route.test.ts
git commit -m "feat: /api/match route (pure runMatch + DB-backed handler)"
```

---

### Task 9: `--live` eval flag (preview-verified) + CI note

Let the eval optionally hit the real adjudicator for a fresh measurement, while the default stays deterministic.

**Files:**
- Modify: `eval/run.ts`

- [ ] **Step 1: Add the `--live` branch in `eval/run.ts`** — choose the adjudicator by flag.

```ts
// near the top of main(), after imports:
const live = process.argv.includes("--live");
// build the adjudicator:
const adjudicator = live
  ? new (await import("../engine/anthropicAdjudicator")).AnthropicAdjudicator({
      apiKey: requireEnv("ANTHROPIC_API_KEY"),
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    })
  : new RecordedAdjudicator({});
// use `adjudicator` in BOTH cold and production runPipeline calls (replace the inline RecordedAdjudicator()).
```
Add `import { requireEnv } from "../lib/config";` to the imports.

- [ ] **Step 2: Run the default (deterministic) eval to confirm unchanged**

Run: `npm run eval`
Expected: PASS, same report as before (RecordedAdjudicator path).

- [ ] **Step 3: Verify in preview** — `ANTHROPIC_API_KEY=... npm run eval -- --live` produces a report that includes the AI pass. (Manual; needs key.)

- [ ] **Step 4: Commit**

```bash
git add eval/run.ts
git commit -m "feat: --live eval flag (real adjudicator); default stays deterministic"
```

---

## Self-Review

**Spec coverage (Plan 2 scope from the design spec):**
- Neon schema + migration → Task 3. ✓
- Seed-from-export → Tasks 4 (pure) + 5 (integration). ✓
- Data-access layer → Task 6. ✓
- AnthropicAdjudicator (structured output, retries, cache) → Task 7. ✓
- `/api/match` → Task 8. ✓
- `--live` eval → Task 9. ✓
- Config (model id, requireEnv) → Task 2. ✓
- Fuzzy-2b fix (eval-guided) → Task 1. ✓
- `ADMIN_SECRET` replacing the PIN, and the full UI write-endpoints (approve/reject) → deferred to Plan 3 (they belong with the UI). `DEALER_ALIASES` porting → folded into Plan 3 seed (aliases table exists now; populated when the UI captures them).

**Placeholder scan:** No "TBD"/"handle errors" placeholders — every code step shows real code. Integration steps that genuinely need secrets are explicitly "Verify in preview", not silent gaps.

**Type consistency:** `SqlExec`, `Archetype`/`ApprovedMapping` (reused from engine/types), `Adjudicator`/`AdjudicationVerdict` (reused from engine/adjudicator), `MatchDeps`, `AdjudicatorDeps`, and the `runMatch(body, deps)` signature are consistent across Tasks 6–9.

## CI vs preview matrix
- **CI-verified (no secrets):** Tasks 1, 2, 4, 6, 7, 8 (handler core), 9 (default path). These are the bulk of the logic.
- **Preview-verified (needs DATABASE_URL / ANTHROPIC_API_KEY):** Tasks 3, 5, 8 (live POST), 9 (`--live`).

## Notes carried to Plan 3
- UI rebuild (shadcn, light SaaS look) wired to `/api/match` + new write endpoints (approve/reject/correct/defer/block) that call `recordDecision` and upsert `approved_mappings`/`aliases`.
- Replace the legacy PIN with `ADMIN_SECRET`-gated server actions.
- Re-enable strict Next build checks (remove the `ignoreBuildErrors` from `next.config.mjs`).
- Excel upload/parse + export remain client-side (reuse the legacy logic), feeding `/api/match`.
