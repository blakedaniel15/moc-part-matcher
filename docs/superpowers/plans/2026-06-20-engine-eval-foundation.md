# Engine + Eval Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the MOC matching pipeline from the single-file artifact into a pure, typed, unit-tested TypeScript engine, and build a reproducible `npm run eval` accuracy harness — the deliverable a dev team can run and trust before adoption.

**Architecture:** A new Next.js + TypeScript repo whose `/engine` directory holds pure functions (no React, no network) lifted faithfully from `moc-matcher.jsx`. The AI step is an injected `Adjudicator` interface; tests and eval inject a `RecordedAdjudicator` so everything runs offline and deterministically. The eval harness reads an exported `moc-export.json` (produced by a new button on the legacy artifact) as ground truth.

**Tech Stack:** Next.js (App Router), TypeScript, Vitest. No database or UI in this plan (those are Plans 2 and 3).

## Global Constraints

- TypeScript strict mode (`"strict": true` in tsconfig).
- The engine (`/engine/**`) MUST NOT import React or perform any network I/O. The AI call is reachable ONLY through the injected `Adjudicator` interface.
- Match **behavior** is a faithful port: same passes, same heuristics, same confidence rules. Do NOT "improve" logic in this plan — only relocate and type it. Any behavior change is a bug.
- Two distinct axes, never conflated: *structural signal* (`STRONG`/`POSSIBLE`/`UNLIKELY`, a prior on number shape) vs *match outcome* (`matchType` × `confidence`).
- All tests and eval run with `RecordedAdjudicator` — zero API calls, deterministic, CI-safe.
- Node 20+. Use ES modules.
- **Verification runs in the cloud, not locally.** No local Node is assumed. Every task's `npm test` / `npm run eval` step is verified by GitHub Actions CI on push (Task 12), and the app is built/deployed by Vercel from the repo. "Expected: PASS" means the CI job for that push is green. A developer with local Node may run the same commands locally, but it is not required.

---

### Task 1: Add "Export all data" button to the legacy artifact (Step 0)

De-risks the crown jewels immediately and produces the ground-truth seed. This is the ONLY change to `moc-matcher.jsx`.

**Files:**
- Modify: `moc-matcher.jsx` (add an export handler + a button in the header area near line ~1532)

**Interfaces:**
- Produces: a downloaded `moc-export.json` with shape:
  ```ts
  {
    exportedAt: string,
    approvedMappings: any[],
    aliasEntries: Record<string, any[]>,
    customArchetypes: any[],
    accuracyLog: any[],
    blockedSkus: any[],
    dealerRejections: Record<string, string[]>,
    runHistory: any[],
    deferredMappings: any[]
  }
  ```

- [ ] **Step 1: Add the export handler inside the `MOCMatcher` component** (place it next to the other handlers, e.g. after `exportResults`, ~line 1487)

```jsx
const exportAllData = async () => {
  const keys = [
    "approvedMappings", "aliasEntries", "customArchetypes", "accuracyLog",
    "blockedSkus", "dealerRejections", "runHistory", "deferredMappings",
  ];
  const out = { exportedAt: new Date().toISOString() };
  for (const k of keys) {
    try {
      const stored = await window.storage.get(k);
      out[k] = stored && stored.value ? JSON.parse(stored.value) : (k === "aliasEntries" || k === "dealerRejections" ? {} : []);
    } catch {
      out[k] = (k === "aliasEntries" || k === "dealerRejections") ? {} : [];
    }
  }
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "moc-export.json"; a.click();
  URL.revokeObjectURL(url);
};
```

- [ ] **Step 2: Add the button** in the header block (near line ~1532, in the top-right info area)

```jsx
<button onClick={exportAllData} style={{ marginLeft: "16px", background: "#e65c00", color: "#fff", border: "none", padding: "6px 12px", fontSize: "11px", letterSpacing: "1px", cursor: "pointer" }}>
  ⬇ EXPORT ALL DATA
</button>
```

- [ ] **Step 3: Manually verify in the running artifact**

Load the artifact, click **EXPORT ALL DATA**, confirm `moc-export.json` downloads and contains the keys above (it is fine if some arrays are empty). Save the file to `eval/ground-truth/moc-export.json` in the new repo (created in Task 10).

- [ ] **Step 4: Commit**

```bash
git add moc-matcher.jsx
git commit -m "feat: add export-all-data button to legacy artifact (Step 0)"
```

---

### Task 2: Scaffold Next.js + TypeScript + Vitest, define engine types

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `next.config.mjs`
- Create: `engine/types.ts`
- Test: `engine/__tests__/types.test.ts`

**Interfaces:**
- Produces (consumed by every later task):
  ```ts
  export type DmsType = "R&R" | "CDK";
  export type StructuralLabel = "STRONG" | "POSSIBLE" | "UNLIKELY";
  export type Confidence = "EXACT" | "HIGH" | "MEDIUM" | "LOW";
  export type MatchType = "EXACT" | "FUZZY" | "AI" | "UNMATCHED";
  export interface Structural { score: 0 | 1 | 2; label: StructuralLabel; detail: string; }
  export interface Part { sku: string; partName: string; makeCode: string | null; barePartNumber: string; dmsType: DmsType; structural: Structural; }
  export interface Archetype { barePartNumber: string; manufacturerPart: string; incentive: number; }
  export interface ApprovedMapping { dmsSku: string; dmsPartName: string; barePartNumber: string; manufacturerPart: string; incentive: number; }
  export interface MatchResult extends Part {
    matchType: MatchType;
    matchedArchetype: string | null;
    matchedPartNumber: string | null;
    confidence: Confidence | null;
    reason: string;
    incentive: number | null;
  }
  ```

- [ ] **Step 1: Initialize the project**

Run:
```bash
npm init -y
npm install next@latest react@latest react-dom@latest xlsx
npm install -D typescript @types/node @types/react vitest
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "preserve",
    "types": ["node", "vitest/globals"],
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] }
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { globals: true, environment: "node", include: ["engine/**/*.test.ts", "eval/**/*.test.ts"] },
});
```

- [ ] **Step 4: Add scripts to `package.json`**

```json
"scripts": {
  "test": "vitest run",
  "eval": "tsx eval/run.ts",
  "dev": "next dev",
  "build": "next build"
}
```
Run: `npm install -D tsx`

- [ ] **Step 5: Create `engine/types.ts`** with the exact contents from the Interfaces block above.

- [ ] **Step 6: Write the failing test** `engine/__tests__/types.test.ts`

```ts
import { describe, it, expect } from "vitest";
import type { Part } from "../types";
describe("types", () => {
  it("Part shape compiles and is usable", () => {
    const p: Part = { sku: "TO01071", partName: "E-SHIELD", makeCode: "TO", barePartNumber: "01071", dmsType: "R&R", structural: { score: 2, label: "STRONG", detail: "x" } };
    expect(p.barePartNumber).toBe("01071");
  });
});
```

- [ ] **Step 7: Run tests**

Run: `npm test`
Expected: PASS (1 test).

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts next.config.mjs engine/
git commit -m "chore: scaffold Next.js + TS + Vitest, add engine types"
```

---

### Task 3: `parseSku` + `detectDms` (faithful port of `parseSKU` and file DMS detection)

**Files:**
- Create: `engine/parseSku.ts`
- Test: `engine/parseSku.test.ts`

**Interfaces:**
- Consumes: `DmsType` from `engine/types.ts`.
- Produces:
  ```ts
  export const RR_MAKE_CODES: ReadonlySet<string>;
  export function parseSku(rawSku: string, fileDmsType: DmsType): { makeCode: string | null; barePartNumber: string; dmsType: DmsType };
  export function detectDms(skus: string[]): DmsType;
  ```

- [ ] **Step 1: Write the failing test** `engine/parseSku.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { parseSku, detectDms } from "./parseSku";

describe("parseSku", () => {
  it("CDK: never strips, keeps full SKU", () => {
    expect(parseSku("01071", "CDK")).toEqual({ makeCode: null, barePartNumber: "01071", dmsType: "CDK" });
    expect(parseSku("48068-02301", "CDK").barePartNumber).toBe("48068-02301");
  });
  it("R&R: strips known make code, pads to 5", () => {
    expect(parseSku("TO01071", "R&R")).toEqual({ makeCode: "TO", barePartNumber: "01071", dmsType: "R&R" });
    expect(parseSku("SU6002", "R&R").barePartNumber).toBe("06002");
  });
  it("R&R: handles MP-branded make code", () => {
    expect(parseSku("TOMP01071", "R&R")).toEqual({ makeCode: "TOMP", barePartNumber: "01071", dmsType: "R&R" });
  });
  it("R&R: unknown prefix is preserved (not a make code)", () => {
    expect(parseSku("XY01071", "R&R")).toEqual({ makeCode: null, barePartNumber: "XY01071", dmsType: "R&R" });
  });
});

describe("detectDms", () => {
  it("alphabetic-prefixed majority => R&R", () => {
    expect(detectDms(["TO01071", "SU06002", "01071"])).toBe("R&R");
  });
  it("pure-numeric majority => CDK", () => {
    expect(detectDms(["01071", "06002", "TO01071"])).toBe("CDK");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- parseSku`
Expected: FAIL ("Cannot find module './parseSku'").

- [ ] **Step 3: Write `engine/parseSku.ts`** (lifted verbatim from `moc-matcher.jsx:201-232` and `:434-444`)

```ts
import type { DmsType } from "./types";

export const RR_MAKE_CODES: ReadonlySet<string> = new Set(["SU","TO","MB","FO","HP","GN","CH","KI","GM","LE"]);

export function parseSku(rawSku: string, fileDmsType: DmsType): { makeCode: string | null; barePartNumber: string; dmsType: DmsType } {
  const sku = String(rawSku).trim().toUpperCase();
  if (fileDmsType === "CDK") {
    return { makeCode: null, barePartNumber: sku, dmsType: "CDK" };
  }
  for (const code of RR_MAKE_CODES) {
    if (!sku.startsWith(code)) continue;
    const afterCode = sku.slice(code.length);
    if (/^\d+$/.test(afterCode)) {
      return { makeCode: code, barePartNumber: afterCode.padStart(5, "0"), dmsType: "R&R" };
    }
    if (afterCode.startsWith("MP") && /^\d+$/.test(afterCode.slice(2))) {
      return { makeCode: code + "MP", barePartNumber: afterCode.slice(2).padStart(5, "0"), dmsType: "R&R" };
    }
  }
  return { makeCode: null, barePartNumber: sku, dmsType: "R&R" };
}

export function detectDms(skus: string[]): DmsType {
  let rrVotes = 0, cdkVotes = 0;
  for (const raw of skus.slice(0, 20)) {
    const s = String(raw).trim().toUpperCase();
    if (/^[A-Z]+\d/.test(s)) rrVotes++; else cdkVotes++;
  }
  return rrVotes > cdkVotes ? "R&R" : "CDK";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- parseSku`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/parseSku.ts engine/parseSku.test.ts
git commit -m "feat: port parseSku + detectDms with tests"
```

---

### Task 4: `analyzeStructure` (faithful port of `analyzeMOCStructure`)

**Files:**
- Create: `engine/structural.ts`
- Test: `engine/structural.test.ts`

**Interfaces:**
- Consumes: `Structural` from `engine/types.ts`.
- Produces: `export function analyzeStructure(barePartNumber: string): Structural;`

- [ ] **Step 1: Write the failing test** `engine/structural.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { analyzeStructure } from "./structural";

describe("analyzeStructure", () => {
  it("5-digit with leading zero => STRONG", () => {
    expect(analyzeStructure("01071")).toMatchObject({ score: 2, label: "STRONG" });
  });
  it("single-letter prefix + 5 digits leading zero => STRONG", () => {
    expect(analyzeStructure("A04461")).toMatchObject({ score: 2, label: "STRONG" });
  });
  it("5-digit no leading zero => POSSIBLE", () => {
    expect(analyzeStructure("16501")).toMatchObject({ score: 1, label: "POSSIBLE" });
  });
  it("4-digit numeric => POSSIBLE", () => {
    expect(analyzeStructure("2301")).toMatchObject({ score: 1, label: "POSSIBLE" });
  });
  it("mixed alphanumeric => UNLIKELY", () => {
    expect(analyzeStructure("76620-T20-A01")).toMatchObject({ score: 0, label: "UNLIKELY" });
  });
  it("wrong digit count => UNLIKELY", () => {
    expect(analyzeStructure("123")).toMatchObject({ score: 0, label: "UNLIKELY" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- structural`
Expected: FAIL ("Cannot find module './structural'").

- [ ] **Step 3: Write `engine/structural.ts`** (lifted verbatim from `moc-matcher.jsx:237-263`)

```ts
import type { Structural } from "./types";

export function analyzeStructure(barePartNumber: string): Structural {
  const s = String(barePartNumber).trim();
  const allDigits = /^\d+$/.test(s);

  const singleLetterPrefix = /^[A-Z](\d{5})$/i.exec(s);
  if (singleLetterPrefix) {
    const digits = singleLetterPrefix[1];
    return digits.startsWith("0")
      ? { score: 2, label: "STRONG",   detail: "Single-letter prefix + 5-digit number — R&R make-code format with leading zero (e.g. M02421, A04461)" }
      : { score: 1, label: "POSSIBLE", detail: "Single-letter prefix + 5-digit number — R&R make-code format (e.g. M02421)" };
  }
  if (!allDigits)
    return { score: 0, label: "UNLIKELY", detail: "Mixed alphanumeric — OEM part number, not MOC format" };
  if (s.length === 5 && s.startsWith("0"))
    return { score: 2, label: "STRONG",   detail: "5-digit numeric with leading zero — matches MOC pattern closely" };
  if (s.length === 5)
    return { score: 1, label: "POSSIBLE", detail: "5-digit numeric — consistent with MOC part structure" };
  if (s.length === 4)
    return { score: 1, label: "POSSIBLE", detail: "4-digit numeric — likely MOC number with dropped leading zero (e.g. 2301 → 02301)" };
  return { score: 0, label: "UNLIKELY", detail: s.length + "-digit numeric — MOC parts are 5 digits" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- structural`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/structural.ts engine/structural.test.ts
git commit -m "feat: port analyzeStructure with tests"
```

---

### Task 5: Name heuristics — `numericCore`, `skuComplexity`, `isMechanicalName`

**Files:**
- Create: `engine/heuristics.ts`
- Test: `engine/heuristics.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function numericCore(s: string): string;
  export function skuComplexity(sku: string): "clean" | "moderate" | "suspect";
  export function isMechanicalName(name: string): boolean;
  export const MOC_SAFE_PHRASES: string[];
  export const MECHANICAL_COMPOUNDS: string[];
  ```

- [ ] **Step 1: Write the failing test** `engine/heuristics.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { numericCore, skuComplexity, isMechanicalName } from "./heuristics";

describe("numericCore", () => {
  it("strips formatting and leading zeros", () => {
    expect(numericCore("01-071A")).toBe("1071");
    expect(numericCore("06002")).toBe("6002");
  });
});
describe("skuComplexity", () => {
  it("all-numeric => clean", () => expect(skuComplexity("8888804461")).toBe("clean"));
  it("make-code + digits => clean", () => expect(skuComplexity("TO04181")).toBe("clean"));
  it("letters on both ends => suspect", () => expect(skuComplexity("68004181AC")).toBe("suspect"));
});
describe("isMechanicalName", () => {
  it("safe phrase wins over compound", () => expect(isMechanicalName("GEAR GUARD 75W-90")).toBe(false));
  it("OEM compound flagged", () => expect(isMechanicalName("ABS SPEED SENSOR")).toBe(true));
  it("plain chemical name not flagged", () => expect(isMechanicalName("ATF FLUSH")).toBe(false));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- heuristics`
Expected: FAIL ("Cannot find module './heuristics'").

- [ ] **Step 3: Write `engine/heuristics.ts`** (lift `numericCore` from `:600`, `skuComplexity` from `:735-747`, `isMechanicalName` + the two phrase arrays from `:686-731`)

```ts
export const MOC_SAFE_PHRASES: string[] = [
  "GEAR GUARD","GEAR PLUS","75W90 GEAR","CALIPER LUBE","BRAKE CALIPER LUBE",
  "SENSOR CLEANER","FLOW SENSOR","GLASS TREAT","GLASS KIT","VISION GLASS",
  "MP VISION GLASS","MOC VISION GLASS","GLASS TREATMENT",
];

export const MECHANICAL_COMPOUNDS: string[] = [
  "RING GEAR","GEAR BOX","GEAR ASSY","GEAR ASSEMBLY","GEAR SHAFT","GEAR SET",
  "GEAR CASE","BEVEL GEAR","GEAR RATIO","GEAR OIL",
  "DOOR GLASS","WINDOW GLASS","GLASS ASSY","GLASS ASSEMBLY","SIDE GLASS",
  "REAR GLASS","FRONT GLASS","BACK GLASS","WINDSHIELD GLASS",
  "SPEED SENSOR","ABS SENSOR","O2 SENSOR","OXYGEN SENSOR","MAP SENSOR",
  "CAM SENSOR","CRANK SENSOR","TEMP SENSOR","KNOCK SENSOR","PRESSURE SENSOR",
  "SENSOR ASSY","SENSOR ASSEMBLY","PARK SENSOR","REVERSE SENSOR",
  "CALIPER ASSY","CALIPER ASSEMBLY","BRAKE CALIPER","CALIPER BRACKET",
  "LAMP:","PARK LAMP","TAIL LAMP","HEAD LAMP","HEADLAMP","FOG LAMP",
];
// NOTE: verify this list against moc-matcher.jsx:691-722 during port — copy ALL entries verbatim.

export function numericCore(s: string): string {
  return String(s).replace(/[^0-9]/g, "").replace(/^0+/, "") || "0";
}

export function skuComplexity(sku: string): "clean" | "moderate" | "suspect" {
  const s = sku.toUpperCase();
  if (/^\d+$/.test(s)) return "clean";
  if (/^[A-Z]{1,4}\d+$/.test(s)) return "clean";
  if (/^[A-Z]+\d+[A-Z]+$/i.test(s)) return "suspect";
  if (s.length >= 8 && /[A-Z]/.test(s) && /\d/.test(s)) return "suspect";
  return "moderate";
}

export function isMechanicalName(name: string): boolean {
  if (!name) return false;
  const upper = name.toUpperCase();
  if (MOC_SAFE_PHRASES.some(p => upper.includes(p))) return false;
  return MECHANICAL_COMPOUNDS.some(p => upper.includes(p));
}
```

- [ ] **Step 4: Verify the compound list is complete** — open `moc-matcher.jsx:691-722` and confirm every entry in `MECHANICAL_COMPOUNDS` is copied. Add any missing entries.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- heuristics`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add engine/heuristics.ts engine/heuristics.test.ts
git commit -m "feat: port numericCore, skuComplexity, isMechanicalName"
```

---

### Task 6: Fuzzy pass (`fuzzyMatch`) — sub-passes 2a/2b/2c + confidence scoring

**Files:**
- Create: `engine/fuzzy.ts`
- Test: `engine/fuzzy.test.ts`

**Interfaces:**
- Consumes: `Part`, `Archetype`, `Confidence` from types; `numericCore`, `skuComplexity`, `isMechanicalName` from `engine/heuristics.ts`.
- Produces:
  ```ts
  export function fuzzyMatch(part: Part, catalog: Archetype[]): { archetype: Archetype; confidence: Confidence; reason: string; matchPass: "2a" | "2b" | "2c" } | null;
  ```

- [ ] **Step 1: Write the failing test** `engine/fuzzy.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { fuzzyMatch } from "./fuzzy";
import type { Part, Archetype } from "./types";

const catalog: Archetype[] = [
  { barePartNumber: "04461", manufacturerPart: "04461 - SHYFT, 12OZ", incentive: 10 },
  { barePartNumber: "02301", manufacturerPart: "02301 - X", incentive: 0 },
];
const part = (sku: string, bare: string, name = "SHYFT"): Part =>
  ({ sku, partName: name, makeCode: null, barePartNumber: bare, dmsType: "CDK", structural: { score: 1, label: "POSSIBLE", detail: "" } });

describe("fuzzyMatch", () => {
  it("2b trailing suffix on store-prefixed number => MEDIUM", () => {
    const r = fuzzyMatch(part("8888804461", "8888804461"), catalog);
    expect(r).toMatchObject({ matchPass: "2b", confidence: "MEDIUM" });
    expect(r!.archetype.barePartNumber).toBe("04461");
  });
  it("2c zero-pad on 4-digit => MEDIUM", () => {
    const r = fuzzyMatch(part("2301", "2301", "ATF FLUSH"), catalog);
    expect(r).toMatchObject({ matchPass: "2c", confidence: "MEDIUM" });
  });
  it("2a clean numeric core => HIGH", () => {
    const r = fuzzyMatch(part("04461", "4461"), catalog);
    expect(r).toMatchObject({ matchPass: "2a", confidence: "HIGH" });
  });
  it("mid-letter OEM number => no fuzzy match", () => {
    expect(fuzzyMatch(part("76620-T20-A01", "76620-T20-A01"), catalog)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fuzzy`
Expected: FAIL ("Cannot find module './fuzzy'").

- [ ] **Step 3: Write `engine/fuzzy.ts`** (lift Pass 2 logic from `moc-matcher.jsx:784-877`, preserving every branch)

```ts
import type { Part, Archetype, Confidence } from "./types";
import { numericCore, skuComplexity, isMechanicalName } from "./heuristics";

export function fuzzyMatch(
  part: Part,
  catalog: Archetype[]
): { archetype: Archetype; confidence: Confidence; reason: string; matchPass: "2a" | "2b" | "2c" } | null {
  const digits = part.barePartNumber.replace(/[^0-9]/g, "");
  const core   = numericCore(part.barePartNumber);
  const stripped      = part.barePartNumber.replace(/-/g, "");
  const hasMidLetters = /\d[A-Z]+\d/i.test(stripped);

  let archetype: Archetype | null = null;
  let matchPass: "2a" | "2b" | "2c" | null = null;
  let reason = "";

  // 2a numeric core
  if (!hasMidLetters && core !== "0") {
    const m = catalog.find(a => numericCore(a.barePartNumber) === core);
    if (m) { archetype = m; matchPass = "2a"; reason = "Numeric core matches MOC " + m.barePartNumber + " after stripping formatting"; }
  }
  // 2b trailing suffix
  if (!archetype && !hasMidLetters && digits.length > 5) {
    const tail5 = digits.slice(-5);
    const m = catalog.find(a => a.barePartNumber === tail5);
    if (m) { archetype = m; matchPass = "2b"; reason = "MOC number " + m.barePartNumber + " found as trailing suffix (store prefix stripped)"; }
  }
  // 2c zero-pad
  if (!archetype && /^\d{4}$/.test(part.barePartNumber)) {
    const padded = "0" + part.barePartNumber;
    const m = catalog.find(a => a.barePartNumber === padded);
    if (m) { archetype = m; matchPass = "2c"; reason = "4-digit number zero-padded to " + padded + " — dealer likely dropping MOC leading zero"; }
  }

  if (!archetype || !matchPass) return null;

  const complexity = skuComplexity(part.sku);
  const mechName   = isMechanicalName(part.partName);

  let confidence: Confidence;
  if (complexity === "suspect") {
    confidence = "LOW";
  } else if (matchPass === "2b") {
    confidence = mechName ? "LOW" : "MEDIUM";
  } else if (matchPass === "2c") {
    confidence = mechName ? "LOW" : "MEDIUM";
  } else {
    confidence = complexity === "clean" ? (mechName ? "MEDIUM" : "HIGH") : (mechName ? "LOW" : "MEDIUM");
  }

  if (mechName) reason += " (name contains mechanical terms — confidence lowered)";
  if (complexity === "suspect") reason += " (SKU structure suspect — letters on both ends or complex mixed format)";

  return { archetype, confidence, reason, matchPass };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- fuzzy`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/fuzzy.ts engine/fuzzy.test.ts
git commit -m "feat: port fuzzy pass (2a/2b/2c) with confidence scoring"
```

---

### Task 7: Pre-AI filter (`prefilterSkip`)

**Files:**
- Create: `engine/prefilter.ts`
- Test: `engine/prefilter.test.ts`

**Interfaces:**
- Consumes: `Part` from types; `skuComplexity`, `isMechanicalName` from `engine/heuristics.ts`.
- Produces:
  ```ts
  export function prefilterSkip(part: Part, ctx: { dealerBrand: "toyota" | "all" }): string | null;
  ```
  Returns a skip reason string if the part should NOT go to AI, else `null`.

- [ ] **Step 1: Write the failing test** `engine/prefilter.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { prefilterSkip } from "./prefilter";
import type { Part } from "./types";

const mk = (sku: string, name: string, label: "STRONG"|"POSSIBLE"|"UNLIKELY"): Part =>
  ({ sku, partName: name, makeCode: null, barePartNumber: sku, dmsType: "CDK",
     structural: { score: label === "UNLIKELY" ? 0 : label === "POSSIBLE" ? 1 : 2, label, detail: "" } });

describe("prefilterSkip", () => {
  it("Nissan 999MP OEM => skip", () => {
    expect(prefilterSkip(mk("999MP1234", "WHATEVER", "POSSIBLE"), { dealerBrand: "all" })).toMatch(/Nissan/);
  });
  it("CR2032 battery+key name => skip", () => {
    expect(prefilterSkip(mk("CR2032", "KEY FOB BATTERY", "POSSIBLE"), { dealerBrand: "all" })).toMatch(/coin cell|2032/i);
  });
  it("UNLIKELY + mechanical name => skip", () => {
    expect(prefilterSkip(mk("ABC123XYZ", "ABS SPEED SENSOR", "UNLIKELY"), { dealerBrand: "all" })).toBeTruthy();
  });
  it("chemical name, POSSIBLE => goes to AI (null)", () => {
    expect(prefilterSkip(mk("12345", "ATF FLUSH", "POSSIBLE"), { dealerBrand: "all" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- prefilter`
Expected: FAIL ("Cannot find module './prefilter'").

- [ ] **Step 3: Write `engine/prefilter.ts`** (lift Pass 3 logic from `moc-matcher.jsx:892-938`)

```ts
import type { Part } from "./types";
import { skuComplexity, isMechanicalName } from "./heuristics";

export function prefilterSkip(part: Part, ctx: { dealerBrand: "toyota" | "all" }): string | null {
  const raw = part.sku.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const isNissanOEM = raw.startsWith("999MP");
  const isCR2032 = /^(CR)?2032$/i.test(part.sku.trim().replace(/\s/g, "")) && /(BATTERY|BATT|KEY|FOB)/i.test(part.partName || "");

  const isUnlikely = (part.structural?.score ?? 0) === 0;
  const isSuspect  = skuComplexity(part.sku) === "suspect";
  const isMech     = isMechanicalName(part.partName);
  const hasMidLet  = /\d[A-Z]+\d/i.test(part.sku.replace(/-/g, ""));

  const skipOEM      = isNissanOEM || isCR2032;
  const skipSegment  = hasMidLet;
  const skipUnlikely = isUnlikely && isMech;
  const skipSuspect  = isSuspect && isUnlikely;
  const toyotaDash   = ctx.dealerBrand === "toyota" && /\d{4,}-\d{4,}/.test(part.sku) && isMech;

  if (!(skipOEM || skipSegment || skipUnlikely || skipSuspect || toyotaDash)) return null;

  return skipOEM
    ? (isNissanOEM ? "Nissan OEM 999MP-format part — confirmed OEM product line, not MOC"
                   : "CR2032 / 2032 coin cell battery with battery/key name — confirmed OEM key fob battery, not a MOC product")
    : skipSegment ? "OEM segment-format part number (letters between digit groups) — not MOC format"
    : toyotaDash  ? "Toyota catalog format (####-####) with mechanical name — OEM sub-assembly, not MOC"
    : skipUnlikely ? "Non-MOC structure with mechanical part name — pre-filtered before AI"
    : "Suspect SKU format with non-MOC structure — pre-filtered before AI";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- prefilter`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/prefilter.ts engine/prefilter.test.ts
git commit -m "feat: port pre-AI filter rules"
```

---

### Task 8: Exact pass (`exactMatch`) with name-divergence guard

**Files:**
- Create: `engine/exact.ts`
- Test: `engine/exact.test.ts`

**Interfaces:**
- Consumes: `Part`, `Archetype`, `ApprovedMapping` from types.
- Produces:
  ```ts
  export function nameOverlap(n1: string, n2: string): number;
  export function exactMatch(part: Part, catalog: Archetype[], approved: ApprovedMapping[]):
    | { kind: "approved"; archetype: Archetype | null; mapping: ApprovedMapping }
    | { kind: "canonical"; archetype: Archetype }
    | { kind: "divergence"; mapping: ApprovedMapping }
    | null;
  ```

- [ ] **Step 1: Write the failing test** `engine/exact.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { exactMatch, nameOverlap } from "./exact";
import type { Part, Archetype, ApprovedMapping } from "./types";

const catalog: Archetype[] = [{ barePartNumber: "01071", manufacturerPart: "01071 - E-SHIELD, 8OZ", incentive: 5 }];
const part = (sku: string, bare: string, name: string): Part =>
  ({ sku, partName: name, makeCode: null, barePartNumber: bare, dmsType: "CDK", structural: { score: 2, label: "STRONG", detail: "" } });

describe("exactMatch", () => {
  it("canonical bare-number match", () => {
    const r = exactMatch(part("01071", "01071", "E-SHIELD"), catalog, []);
    expect(r).toMatchObject({ kind: "canonical" });
  });
  it("approved SKU with overlapping name", () => {
    const ap: ApprovedMapping = { dmsSku: "Z9", dmsPartName: "E-SHIELD COAT", barePartNumber: "01071", manufacturerPart: "01071 - E-SHIELD, 8OZ", incentive: 5 };
    const r = exactMatch(part("Z9", "Z9", "E-SHIELD"), catalog, [ap]);
    expect(r).toMatchObject({ kind: "approved" });
  });
  it("approved SKU with zero name overlap => divergence", () => {
    const ap: ApprovedMapping = { dmsSku: "Z9", dmsPartName: "E-SHIELD COAT", barePartNumber: "01071", manufacturerPart: "x", incentive: 5 };
    const r = exactMatch(part("Z9", "Z9", "BRAKE ROTOR"), catalog, [ap]);
    expect(r).toMatchObject({ kind: "divergence" });
  });
});

describe("nameOverlap", () => {
  it("counts shared significant tokens", () => {
    expect(nameOverlap("E-SHIELD COAT", "E-SHIELD SPRAY")).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- exact`
Expected: FAIL ("Cannot find module './exact'").

- [ ] **Step 3: Write `engine/exact.ts`** (lift `nameTokens`/`nameOverlap` from `:607-618` and exact logic from `:622-663`)

```ts
import type { Part, Archetype, ApprovedMapping } from "./types";

const STOP = new Set(["the","a","an","and","or","of","to","in","for","with","is","it","as","at","by","kit","moc"]);

function nameTokens(name: string): Set<string> {
  return new Set(
    String(name).toUpperCase().split(/[\s\/,\-&.]+/)
      .filter(w => w.length >= 3 && !STOP.has(w.toLowerCase()) && !/^\d+$/.test(w))
  );
}

export function nameOverlap(n1: string, n2: string): number {
  const t1 = nameTokens(n1), t2 = nameTokens(n2);
  if (!t1.size || !t2.size) return 1;
  return [...t1].filter(w => t2.has(w)).length;
}

export function exactMatch(part: Part, catalog: Archetype[], approved: ApprovedMapping[]):
  | { kind: "approved"; archetype: Archetype | null; mapping: ApprovedMapping }
  | { kind: "canonical"; archetype: Archetype }
  | { kind: "divergence"; mapping: ApprovedMapping }
  | null {
  const approvedMatch = approved.find(a => a.dmsSku.toUpperCase() === part.sku.toUpperCase());
  if (approvedMatch) {
    if (nameOverlap(part.partName || "", approvedMatch.dmsPartName || "") === 0) {
      return { kind: "divergence", mapping: approvedMatch };
    }
    const archetype = catalog.find(m => m.barePartNumber === approvedMatch.barePartNumber) ?? null;
    return { kind: "approved", archetype, mapping: approvedMatch };
  }
  const canonical = catalog.find(m => m.barePartNumber === part.barePartNumber);
  if (canonical) return { kind: "canonical", archetype: canonical };
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- exact`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/exact.ts engine/exact.test.ts
git commit -m "feat: port exact pass with name-divergence guard"
```

---

### Task 9: Adjudicator interface + `RecordedAdjudicator`

**Files:**
- Create: `engine/adjudicator.ts`
- Test: `engine/adjudicator.test.ts`

**Interfaces:**
- Consumes: `Part` from types.
- Produces:
  ```ts
  export interface AdjudicationVerdict { sku: string; matched: boolean; mocPartNumber: string | null; confidence: "HIGH" | "MEDIUM" | "LOW" | null; reason: string; }
  export interface Adjudicator { adjudicate(parts: Part[]): Promise<AdjudicationVerdict[]>; }
  export class RecordedAdjudicator implements Adjudicator {
    constructor(records: Record<string, AdjudicationVerdict>);
    adjudicate(parts: Part[]): Promise<AdjudicationVerdict[]>;
  }
  ```
  Keying is by `part.sku`. The prod `AnthropicAdjudicator` is implemented in Plan 2.

- [ ] **Step 1: Write the failing test** `engine/adjudicator.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { RecordedAdjudicator } from "./adjudicator";
import type { Part } from "./types";

const p = (sku: string): Part => ({ sku, partName: "X", makeCode: null, barePartNumber: sku, dmsType: "CDK", structural: { score: 1, label: "POSSIBLE", detail: "" } });

describe("RecordedAdjudicator", () => {
  it("returns recorded verdict by sku", async () => {
    const adj = new RecordedAdjudicator({ "A1": { sku: "A1", matched: true, mocPartNumber: "04461", confidence: "HIGH", reason: "rec" } });
    const out = await adj.adjudicate([p("A1")]);
    expect(out[0]).toMatchObject({ matched: true, mocPartNumber: "04461" });
  });
  it("defaults to unmatched when no record exists", async () => {
    const adj = new RecordedAdjudicator({});
    const out = await adj.adjudicate([p("ZZ")]);
    expect(out[0]).toMatchObject({ matched: false, mocPartNumber: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- adjudicator`
Expected: FAIL ("Cannot find module './adjudicator'").

- [ ] **Step 3: Write `engine/adjudicator.ts`**

```ts
import type { Part } from "./types";

export interface AdjudicationVerdict {
  sku: string;
  matched: boolean;
  mocPartNumber: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW" | null;
  reason: string;
}

export interface Adjudicator {
  adjudicate(parts: Part[]): Promise<AdjudicationVerdict[]>;
}

export class RecordedAdjudicator implements Adjudicator {
  constructor(private records: Record<string, AdjudicationVerdict>) {}
  async adjudicate(parts: Part[]): Promise<AdjudicationVerdict[]> {
    return parts.map(p => this.records[p.sku] ?? { sku: p.sku, matched: false, mocPartNumber: null, confidence: null, reason: "No recorded verdict" });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- adjudicator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/adjudicator.ts engine/adjudicator.test.ts
git commit -m "feat: add Adjudicator interface + RecordedAdjudicator"
```

---

### Task 10: Pipeline orchestration (`runPipeline`)

**Files:**
- Create: `engine/pipeline.ts`
- Test: `engine/pipeline.test.ts`

**Interfaces:**
- Consumes: all prior engine modules + `Adjudicator`.
- Produces:
  ```ts
  export interface PipelineContext {
    catalog: Archetype[];
    approved: ApprovedMapping[];
    blockedSkus: string[];
    dealerRejections: string[];   // SKUs already NO'd for THIS dealer
    dealerBrand: "toyota" | "all";
    adjudicator: Adjudicator;
  }
  export function runPipeline(parts: Part[], ctx: PipelineContext): Promise<MatchResult[]>;
  ```
  Ordering: exact (approved → canonical, divergence→AI-eligible) → block filter → fuzzy → prefilter → adjudicator → 4-digit-chemical reclassification.

- [ ] **Step 1: Write the failing test** `engine/pipeline.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { runPipeline } from "./pipeline";
import { RecordedAdjudicator } from "./adjudicator";
import type { Part, Archetype } from "./types";

const catalog: Archetype[] = [
  { barePartNumber: "01071", manufacturerPart: "01071 - E-SHIELD, 8OZ", incentive: 5 },
  { barePartNumber: "04461", manufacturerPart: "04461 - SHYFT, 12OZ", incentive: 10 },
];
const mk = (sku: string, bare: string, name: string, score: 0|1|2 = 1): Part =>
  ({ sku, partName: name, makeCode: null, barePartNumber: bare, dmsType: "CDK",
     structural: { score, label: score === 2 ? "STRONG" : score === 1 ? "POSSIBLE" : "UNLIKELY", detail: "" } });

const ctx = (adj = new RecordedAdjudicator({})) =>
  ({ catalog, approved: [], blockedSkus: [], dealerRejections: [], dealerBrand: "all" as const, adjudicator: adj });

describe("runPipeline", () => {
  it("canonical exact match", async () => {
    const [r] = await runPipeline([mk("01071", "01071", "E-SHIELD", 2)], ctx());
    expect(r).toMatchObject({ matchType: "EXACT", matchedPartNumber: "01071", confidence: "EXACT" });
  });
  it("fuzzy trailing suffix", async () => {
    const [r] = await runPipeline([mk("8888804461", "8888804461", "SHYFT")], ctx());
    expect(r).toMatchObject({ matchType: "FUZZY", matchedPartNumber: "04461" });
  });
  it("blocked SKU => UNMATCHED, never fuzzy", async () => {
    const c = { ...ctx(), blockedSkus: ["8888804461"] };
    const [r] = await runPipeline([mk("8888804461", "8888804461", "SHYFT")], c);
    expect(r.matchType).toBe("UNMATCHED");
  });
  it("AI verdict applied from adjudicator", async () => {
    const adj = new RecordedAdjudicator({ "CUSTOM9": { sku: "CUSTOM9", matched: true, mocPartNumber: "04461", confidence: "MEDIUM", reason: "name says shyft" } });
    const [r] = await runPipeline([mk("CUSTOM9", "CUSTOM9", "SHYFT ATF")], ctx(adj));
    expect(r).toMatchObject({ matchType: "AI", confidence: "MEDIUM", matchedPartNumber: "04461" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pipeline`
Expected: FAIL ("Cannot find module './pipeline'").

- [ ] **Step 3: Write `engine/pipeline.ts`** (compose the prior modules in the order from `runMatching`; AI-result lookup mirrors `:1050-1070`; reclassification mirrors `:1100-1115`)

```ts
import type { Part, Archetype, ApprovedMapping, MatchResult } from "./types";
import { exactMatch } from "./exact";
import { fuzzyMatch } from "./fuzzy";
import { prefilterSkip } from "./prefilter";
import { isMechanicalName } from "./heuristics";
import type { Adjudicator } from "./adjudicator";

export interface PipelineContext {
  catalog: Archetype[];
  approved: ApprovedMapping[];
  blockedSkus: string[];
  dealerRejections: string[];
  dealerBrand: "toyota" | "all";
  adjudicator: Adjudicator;
}

const stripPrefix = (sku: string) => sku.toUpperCase().replace(/^[A-Z]+(?=\d)/, "");

function findArchetype(catalog: Archetype[], mocPartNumber: string): Archetype | null {
  const raw = String(mocPartNumber).replace(/[^0-9]/g, "");
  const padded = raw.padStart(5, "0");
  const unpadded = raw.replace(/^0+/, "") || "0";
  return catalog.find(m =>
    m.barePartNumber === padded || m.barePartNumber === raw || m.barePartNumber.replace(/^0+/, "") === unpadded
  ) ?? null;
}

export async function runPipeline(parts: Part[], ctx: PipelineContext): Promise<MatchResult[]> {
  const { catalog, approved, dealerBrand, adjudicator } = ctx;
  const blockedSet   = new Set(ctx.blockedSkus.map(s => s.toUpperCase()));
  const blockedCores = new Set(ctx.blockedSkus.map(s => stripPrefix(s)));
  const dealerNoSet  = new Set(ctx.dealerRejections.map(s => s.toUpperCase()));

  const results: MatchResult[] = [];
  const toAI: Part[] = [];

  for (const part of parts) {
    const base = { ...part } as MatchResult;

    // PASS 1 — exact
    const ex = exactMatch(part, catalog, approved);
    if (ex && ex.kind === "approved") {
      results.push({ ...base, matchType: "EXACT", matchedArchetype: ex.mapping.manufacturerPart, matchedPartNumber: ex.mapping.barePartNumber, confidence: "EXACT", reason: "Previously approved dealer mapping", incentive: ex.mapping.incentive ?? 0 });
      continue;
    }
    if (ex && ex.kind === "canonical") {
      results.push({ ...base, matchType: "EXACT", matchedArchetype: ex.archetype.manufacturerPart, matchedPartNumber: ex.archetype.barePartNumber, confidence: "EXACT", reason: "Bare part number " + part.barePartNumber + " directly matches MOC archetype", incentive: ex.archetype.incentive });
      continue;
    }
    // divergence falls through to be queued/AI-reviewed (kept as a candidate for AI)

    // Block filter (exact is never blocked; we are past exact here)
    if (blockedSet.has(part.sku.toUpperCase()) || blockedCores.has(stripPrefix(part.sku))) {
      results.push({ ...base, matchType: "UNMATCHED", matchedArchetype: null, matchedPartNumber: null, confidence: null, reason: "SKU permanently blocked by admin — previously identified as non-MOC", incentive: null });
      continue;
    }
    if (dealerNoSet.has(part.sku.toUpperCase())) {
      results.push({ ...base, matchType: "UNMATCHED", matchedArchetype: null, matchedPartNumber: null, confidence: null, reason: "Previously marked NO for this dealer — skipped", incentive: null });
      continue;
    }

    // PASS 2 — fuzzy
    const fz = fuzzyMatch(part, catalog);
    if (fz) {
      results.push({ ...base, matchType: "FUZZY", matchedArchetype: fz.archetype.manufacturerPart, matchedPartNumber: fz.archetype.barePartNumber, confidence: fz.confidence, reason: fz.reason, incentive: fz.archetype.incentive });
      continue;
    }

    // PASS 3 — pre-AI filter
    const skip = prefilterSkip(part, { dealerBrand });
    if (skip) {
      results.push({ ...base, matchType: "UNMATCHED", matchedArchetype: null, matchedPartNumber: null, confidence: null, reason: skip, incentive: null });
      continue;
    }
    toAI.push(part);
  }

  // PASS 4 — AI adjudication
  if (toAI.length) {
    const verdicts = await adjudicator.adjudicate(toAI);
    const bySku = new Map(verdicts.map(v => [v.sku, v]));
    for (const part of toAI) {
      const v = bySku.get(part.sku);
      const mapping = v && v.matched && v.mocPartNumber != null ? findArchetype(catalog, v.mocPartNumber) : null;
      results.push({
        ...part,
        matchType: v && v.matched ? "AI" : "UNMATCHED",
        matchedArchetype: mapping ? mapping.manufacturerPart : null,
        matchedPartNumber: mapping ? mapping.barePartNumber : null,
        confidence: (v && v.confidence) || null,
        reason: (v && v.reason) || "No match found",
        incentive: mapping ? mapping.incentive : null,
      } as MatchResult);
    }
  }

  // Reclassification: UNMATCHED + 4-digit + chemical name => AI/LOW candidate
  return results.map(r => {
    if (r.matchType !== "UNMATCHED") return r;
    const is4digit   = /^\d{4}$/.test(String(r.barePartNumber).trim());
    const isChemical = !isMechanicalName(r.partName) && (r.partName || "").trim().length > 0;
    if (is4digit && isChemical) {
      return { ...r, matchType: "AI", confidence: "LOW", matchedArchetype: null, matchedPartNumber: null, reason: "4-digit number with chemical product name — possible MOC part with dropped leading zero, no archetype on file yet" };
    }
    return r;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pipeline`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS (all engine tests green).

- [ ] **Step 6: Commit**

```bash
git add engine/pipeline.ts engine/pipeline.test.ts
git commit -m "feat: port pipeline orchestration"
```

---

### Task 11: Eval harness (`npm run eval`) + accuracy report

Builds the labeled set from the exported decisions and produces a reproducible accuracy report. This is the dev-team-facing deliverable.

**Files:**
- Create: `eval/ground-truth/.gitkeep` (the operator drops `moc-export.json` here — Task 1, Step 3)
- Create: `eval/labels.ts` (derive labeled examples from the export)
- Create: `eval/metrics.ts` (precision/recall/F1 + per-pass + confusion buckets)
- Create: `eval/run.ts` (the `npm run eval` entrypoint → writes `eval/report.md`)
- Test: `eval/metrics.test.ts`, `eval/labels.test.ts`

**Interfaces:**
- Consumes: `runPipeline`, `RecordedAdjudicator`, engine types.
- Produces:
  ```ts
  // eval/labels.ts
  export interface LabeledExample { sku: string; partName: string; expectedBare: string | null; } // null = "not MOC"
  export function labelsFromExport(exp: any): LabeledExample[];
  export function splitHeldOut(labels: LabeledExample[], fraction: number, seed: number): { train: LabeledExample[]; heldOut: LabeledExample[] };
  // eval/metrics.ts
  export interface Metrics { precision: number; recall: number; f1: number; truePos: number; falsePos: number; falseNeg: number; }
  export function computeMetrics(predicted: { sku: string; predictedBare: string | null }[], labels: LabeledExample[]): Metrics;
  ```

- [ ] **Step 1: Write the failing test** `eval/metrics.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { computeMetrics } from "./metrics";

describe("computeMetrics", () => {
  it("computes precision/recall/f1 on bare-number agreement", () => {
    const labels = [
      { sku: "A", partName: "", expectedBare: "01071" },
      { sku: "B", partName: "", expectedBare: "04461" },
      { sku: "C", partName: "", expectedBare: null },
    ];
    const predicted = [
      { sku: "A", predictedBare: "01071" }, // TP
      { sku: "B", predictedBare: null },     // FN
      { sku: "C", predictedBare: "06002" },  // FP
    ];
    const m = computeMetrics(predicted, labels);
    expect(m.truePos).toBe(1);
    expect(m.falseNeg).toBe(1);
    expect(m.falsePos).toBe(1);
    expect(m.precision).toBeCloseTo(0.5);
    expect(m.recall).toBeCloseTo(0.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- metrics`
Expected: FAIL ("Cannot find module './metrics'").

- [ ] **Step 3: Write `eval/metrics.ts`**

```ts
import type { LabeledExample } from "./labels";
export interface Metrics { precision: number; recall: number; f1: number; truePos: number; falsePos: number; falseNeg: number; }

export function computeMetrics(predicted: { sku: string; predictedBare: string | null }[], labels: LabeledExample[]): Metrics {
  const predBy = new Map(predicted.map(p => [p.sku, p.predictedBare]));
  let tp = 0, fp = 0, fn = 0;
  for (const lab of labels) {
    const pred = predBy.get(lab.sku) ?? null;
    if (lab.expectedBare != null) {
      if (pred === lab.expectedBare) tp++;
      else fn++;
      if (pred != null && pred !== lab.expectedBare) fp++;
    } else {
      if (pred != null) fp++;
    }
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall    = tp + fn ? tp / (tp + fn) : 0;
  const f1        = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1, truePos: tp, falsePos: fp, falseNeg: fn };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- metrics`
Expected: PASS.

- [ ] **Step 5: Write the failing test** `eval/labels.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { labelsFromExport, splitHeldOut } from "./labels";

describe("labelsFromExport", () => {
  it("derives positive labels from approvedMappings", () => {
    const exp = { approvedMappings: [{ dmsSku: "Z9", dmsPartName: "E-SHIELD", barePartNumber: "01071" }], blockedSkus: [], dealerRejections: {} };
    const labels = labelsFromExport(exp);
    expect(labels).toContainEqual({ sku: "Z9", partName: "E-SHIELD", expectedBare: "01071" });
  });
  it("derives negative labels from blockedSkus", () => {
    const exp = { approvedMappings: [], blockedSkus: [{ sku: "BAD1" }], dealerRejections: {} };
    const labels = labelsFromExport(exp);
    expect(labels).toContainEqual({ sku: "BAD1", partName: "", expectedBare: null });
  });
});

describe("splitHeldOut", () => {
  it("is deterministic for a fixed seed", () => {
    const labels = Array.from({ length: 10 }, (_, i) => ({ sku: "S" + i, partName: "", expectedBare: "01071" }));
    const a = splitHeldOut(labels, 0.2, 42);
    const b = splitHeldOut(labels, 0.2, 42);
    expect(a.heldOut.map(x => x.sku)).toEqual(b.heldOut.map(x => x.sku));
    expect(a.heldOut.length).toBe(2);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- labels`
Expected: FAIL ("Cannot find module './labels'").

- [ ] **Step 7: Write `eval/labels.ts`**

```ts
export interface LabeledExample { sku: string; partName: string; expectedBare: string | null; }

export function labelsFromExport(exp: any): LabeledExample[] {
  const out: LabeledExample[] = [];
  for (const a of exp.approvedMappings ?? []) {
    out.push({ sku: a.dmsSku, partName: a.dmsPartName ?? "", expectedBare: a.barePartNumber });
  }
  for (const b of exp.blockedSkus ?? []) {
    // Carry the part name through — the engine needs it to REASON about negatives
    // in cold mode (e.g. mechanical-name detection), not just memorize the block list.
    out.push({ sku: typeof b === "string" ? b : b.sku, partName: typeof b === "string" ? "" : (b.partName ?? ""), expectedBare: null });
  }
  for (const skus of Object.values(exp.dealerRejections ?? {})) {
    for (const sku of skus as string[]) out.push({ sku, partName: "", expectedBare: null });
  }
  // Dedupe by SKU (the real store re-approves the same SKU multiple times; a DB
  // unique constraint collapses these later). Last write wins.
  const bySku = new Map<string, LabeledExample>();
  for (const ex of out) bySku.set(ex.sku.toUpperCase(), ex);
  return [...bySku.values()];
}

// Deterministic LCG shuffle keyed by seed — no Math.random (reproducible).
export function splitHeldOut(labels: LabeledExample[], fraction: number, seed: number) {
  const arr = [...labels];
  let s = seed >>> 0;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (1664525 * s + 1013904223) >>> 0;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const cut = Math.round(arr.length * fraction);
  return { heldOut: arr.slice(0, cut), train: arr.slice(cut) };
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- labels`
Expected: PASS.

- [ ] **Step 9: Write `eval/run.ts`** (entrypoint — reads export, runs pipeline with `RecordedAdjudicator`, writes report)

```ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { runPipeline } from "../engine/pipeline";
import { RecordedAdjudicator } from "../engine/adjudicator";
import { analyzeStructure } from "../engine/structural";
import { parseSku, detectDms } from "../engine/parseSku";
import { labelsFromExport, splitHeldOut } from "./labels";
import { computeMetrics } from "./metrics";
import type { Part, Archetype } from "../engine/types";

const EXPORT_PATH = "eval/ground-truth/moc-export.json";

async function main() {
  if (!existsSync(EXPORT_PATH)) {
    console.error(`Missing ${EXPORT_PATH}. Run the "Export all data" button on the legacy artifact and place the file here.`);
    process.exit(1);
  }
  const exp = JSON.parse(readFileSync(EXPORT_PATH, "utf8"));
  const labels = labelsFromExport(exp);
  const { heldOut } = splitHeldOut(labels, 0.2, 42);

  // Canonical catalog foundation: the official MOC catalog merged with regional extras,
  // built from "MOC Official Product Catalog.xlsx" → data/archetypes.json (206 products).
  // Using the full real catalog gives the fuzzy passes (2b trailing-suffix, 2c zero-pad)
  // the complete MOC number space to match against, not a subset reconstructed from labels.
  const catalogRaw = JSON.parse(readFileSync("data/archetypes.json", "utf8")) as Array<{ barePartNumber: string; manufacturerPart: string; incentive?: number }>;
  const catalog: Archetype[] = catalogRaw.map(a => ({ barePartNumber: a.barePartNumber, manufacturerPart: a.manufacturerPart, incentive: a.incentive ?? 0 }));

  const dmsType = detectDms(heldOut.map(l => l.sku));
  const parts: Part[] = heldOut.map(l => {
    const parsed = parseSku(l.sku, dmsType);
    return { sku: l.sku, partName: l.partName, makeCode: parsed.makeCode, barePartNumber: parsed.barePartNumber, dmsType, structural: analyzeStructure(parsed.barePartNumber) };
  });

  // Score TWO modes (both deterministic — no AI verdicts recorded, so the AI pass
  // yields UNMATCHED and this isolates the exact+fuzzy reasoning core):
  //
  //   COLD       — engine gets NO memorized approved/blocked lists. Measures whether
  //                fuzzy/structural/prefilter REASON each row correctly. This is the
  //                honest generalization number, and it will expose where the fuzzy
  //                trailing-suffix pass over-matches OEM segment numbers.
  //   PRODUCTION — engine gets the approved + blocked lists, as users experience it.
  //                Higher, but partly tautological (it memorized these rows).
  const blockedList = (exp.blockedSkus ?? []).map((b: any) => (typeof b === "string" ? b : b.sku));

  const coldResults = await runPipeline(parts, { catalog, approved: [], blockedSkus: [], dealerRejections: [], dealerBrand: "all", adjudicator: new RecordedAdjudicator({}) });
  const prodResults = await runPipeline(parts, { catalog, approved: exp.approvedMappings ?? [], blockedSkus: blockedList, dealerRejections: [], dealerBrand: "all", adjudicator: new RecordedAdjudicator({}) });

  const score = (results: typeof coldResults) => computeMetrics(results.map(r => ({ sku: r.sku, predictedBare: r.matchedPartNumber })), heldOut);
  const cold = score(coldResults);
  const prod = score(prodResults);

  // Cold-mode false positives are the most useful artifact: rows the engine matched
  // that the human labeled "not MOC" (expectedBare === null).
  const negSkus = new Set(heldOut.filter(l => l.expectedBare == null).map(l => l.sku.toUpperCase()));
  const coldFalsePos = coldResults.filter(r => negSkus.has(r.sku.toUpperCase()) && r.matchedPartNumber != null)
    .map(r => `  - ${r.sku} (${r.partName}) → wrongly matched ${r.matchedPartNumber} [${r.matchType}/${r.confidence}]`);

  const line = (m: typeof cold) => `P ${(m.precision*100).toFixed(1)}% · R ${(m.recall*100).toFixed(1)}% · F1 ${(m.f1*100).toFixed(1)}%  (TP ${m.truePos} · FP ${m.falsePos} · FN ${m.falseNeg})`;
  const report = [
    "# MOC Matcher — Accuracy Report",
    "",
    "_Generated by `npm run eval` (deterministic, RecordedAdjudicator — no API calls)._",
    "",
    "## Ground-truth caveat",
    "Labels are derived from past in-tool human decisions (approved/blocked/rejected). They are a **biased sample**: they only cover rows that reached the review queue, and were produced with the old tool's help. This report scores a **20% held-out split** the engine was not tuned against. A subset should still receive fresh human audit before these numbers are treated as production truth.",
    "",
    `Held-out examples: ${heldOut.length} (${heldOut.filter(l => l.expectedBare != null).length} positive, ${heldOut.filter(l => l.expectedBare == null).length} negative)`,
    "",
    "## Cold accuracy — engine reasoning, NO memorized lists (the honest number)",
    `- ${line(cold)}`,
    "",
    "## Production accuracy — with approved + blocked lists (what users see)",
    `- ${line(prod)}`,
    "",
    "## Cold-mode false positives (OEM parts the engine wrongly matched)",
    coldFalsePos.length ? coldFalsePos.join("\n") : "  (none)",
    "",
    "> These are exactly the rows the production block list is currently papering over. They show where the fuzzy trailing-suffix pass needs tightening — the kind of finding that justifies the eval harness. With no recorded AI verdicts the AI pass is inert here by design; `npm run eval --live` (Plan 2) adds it.",
    "",
  ].join("\n");

  writeFileSync("eval/report.md", report);
  console.log(report);
}

main();
```

- [ ] **Step 10: Run the eval end to end**

Run: `npm run eval`
Expected: writes `eval/report.md` and prints precision/recall/F1. (Requires `eval/ground-truth/moc-export.json` from Task 1.)

- [ ] **Step 11: Run the full suite once more**

Run: `npm test`
Expected: PASS (all engine + eval tests green).

- [ ] **Step 12: Commit**

```bash
git add eval/
git commit -m "feat: eval harness with accuracy report (deterministic core)"
```

---

### Task 12: GitHub Actions CI (runs tests + eval in the cloud)

Makes the cloud the source of truth for "it works" — no local Node needed. Runs on every push and PR.

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `npm test`, `npm run eval` scripts (Task 2).
- Produces: a green/red CI check on every push; the regenerated `eval/report.md` printed in the job log.

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push:
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test
      - name: Accuracy report (eval)
        run: npm run eval
      - name: Upload accuracy report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: accuracy-report
          path: eval/report.md
```

- [ ] **Step 2: Push the branch and confirm CI is green**

Run:
```bash
git add .github/workflows/ci.yml
git commit -m "ci: run tests + eval on every push"
git push -u origin rebuild/foundation
```
Expected: the **CI** check on the pushed commit passes (tests green, eval prints the accuracy report and uploads `eval/report.md` as a build artifact). View it in the GitHub Actions tab or on the PR.

- [ ] **Step 3 (one-time): connect Vercel**

In the Vercel dashboard, import the GitHub repo (Framework preset: **Next.js**). No build config needed beyond defaults. Each push to `rebuild/foundation` gets a preview deployment; merging to `main` deploys production. (App routes/UI land in Plan 3; for now this just wires the pipeline.)

---

## Self-Review

**Spec coverage:**
- Engine extraction (parseSku, structural, fuzzy, prefilter, exact, pipeline) → Tasks 3–10. ✓
- Injected adjudicator interface + RecordedAdjudicator → Task 9. ✓
- Unit tests per pass → every task. ✓
- Eval harness + accuracy report + held-out split + ground-truth caveat → Task 11. ✓
- Step 0 data export → Task 1. ✓
- Scaffold / TS strict / Vitest → Task 2. ✓
- AnthropicAdjudicator, Neon DB, /api/match, seed, UI → deferred to Plans 2 & 3 (out of scope here, per spec). ✓

**Placeholder scan:** Task 5 Step 4 instructs verifying the `MECHANICAL_COMPOUNDS` list against source lines 691–722 and copying any missing entries — this is a deliberate verification step, not a placeholder (the partial list shown is functional; the step ensures completeness). No "TBD"/"handle edge cases" placeholders remain.

**Type consistency:** `parseSku`/`detectDms`, `analyzeStructure`, `fuzzyMatch` (returns `{archetype,confidence,reason,matchPass}`), `exactMatch` (tagged union `approved|canonical|divergence`), `Adjudicator.adjudicate(parts) → AdjudicationVerdict[]` keyed by `sku`, `runPipeline(parts, ctx) → MatchResult[]`, and the eval `LabeledExample`/`Metrics` shapes are used consistently across tasks.

## Notes carried to Plan 2
- The canonical catalog foundation already exists at `data/archetypes.json` (206 products: 177 from the official MOC catalog Excel + 29 regional extras; 3 name conflicts resolved with `officialName` retained for traceability). Plan 2 seeds this into the Postgres `archetypes` table; the eval already loads it directly.
- `DEALER_ALIASES` still needs porting to `/data` (or the DB) in Plan 2.
- Kit names in `data/archetypes.json` are cleaned: component part numbers (e.g. `(01201, 01271, 10431)`) are stripped from `manufacturerPart` and stored in a structured `components` field (52 entries). The `AnthropicAdjudicator` prompt in Plan 2 builds from `manufacturerPart`, so embedded numbers can't pollute the model's number reasoning. Plan 2's adjudicator must still validate any returned `mocPartNumber` against a real `barePartNumber` (the existing `findArchetype` does this).
- `AnthropicAdjudicator` (structured tool-use output, retries, verdict caching) + `--live` eval flag land in Plan 2.
