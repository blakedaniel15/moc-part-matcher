import type { Part, Archetype, ApprovedMapping, MatchResult } from "./types";
import { exactMatch } from "./exact";
import { fuzzyMatch } from "./fuzzy";
import { prefilterSkip } from "./prefilter";
import { isMechanicalName } from "./heuristics";
import type { Adjudicator } from "./adjudicator";
import { decideRetrieval, type Retriever } from "./retrieval";

export interface PipelineContext {
  catalog: Archetype[];
  approved: ApprovedMapping[];
  blockedSkus: string[];
  dealerRejections: string[]; // SKUs already NO'd for THIS dealer
  dealerBrand: "toyota" | "all";
  adjudicator: Adjudicator;
  retriever?: Retriever; // optional semantic layer over "the well"; absent => unchanged behavior
}

const stripPrefix = (sku: string) => sku.toUpperCase().replace(/^[A-Z]+(?=\d)/, "");

// Robust archetype lookup — the AI may return "04461", "4461", or "04461 - SHYFT…".
function findArchetype(catalog: Archetype[], mocPartNumber: string): Archetype | null {
  const raw = String(mocPartNumber).replace(/[^0-9]/g, "");
  const padded = raw.padStart(5, "0");
  const unpadded = raw.replace(/^0+/, "") || "0";
  return (
    catalog.find(
      (m) => m.barePartNumber === padded || m.barePartNumber === raw || m.barePartNumber.replace(/^0+/, "") === unpadded
    ) ?? null
  );
}

// Ordered passes: exact (approved → canonical; divergence is AI-eligible) → block
// filter → fuzzy → pre-AI filter → adjudicator → 4-digit-chemical reclassification.
export async function runPipeline(parts: Part[], ctx: PipelineContext): Promise<MatchResult[]> {
  const { catalog, approved, dealerBrand, adjudicator } = ctx;
  const blockedSet = new Set(ctx.blockedSkus.map((s) => s.toUpperCase()));
  const blockedCores = new Set(ctx.blockedSkus.map((s) => stripPrefix(s)));
  const dealerNoSet = new Set(ctx.dealerRejections.map((s) => s.toUpperCase()));

  const results: MatchResult[] = [];
  const toAI: Part[] = [];

  for (const part of parts) {
    const base = { ...part } as MatchResult;

    // PASS 1 — exact.
    const ex = exactMatch(part, catalog, approved);
    if (ex && ex.kind === "approved") {
      results.push({
        ...base,
        matchType: "EXACT",
        matchedArchetype: ex.mapping.manufacturerPart,
        matchedPartNumber: ex.mapping.barePartNumber,
        confidence: "EXACT",
        reason: "Previously approved dealer mapping",
        incentive: ex.mapping.incentive ?? 0,
      });
      continue;
    }
    if (ex && ex.kind === "canonical") {
      results.push({
        ...base,
        matchType: "EXACT",
        matchedArchetype: ex.archetype.manufacturerPart,
        matchedPartNumber: ex.archetype.barePartNumber,
        confidence: "EXACT",
        reason: "Bare part number " + part.barePartNumber + " directly matches MOC archetype",
        incentive: ex.archetype.incentive,
      });
      continue;
    }
    // A divergence result falls through to be AI-reviewed.

    // Block filter (exact is never blocked; we are past exact here).
    if (blockedSet.has(part.sku.toUpperCase()) || blockedCores.has(stripPrefix(part.sku))) {
      results.push({
        ...base,
        matchType: "UNMATCHED",
        matchedArchetype: null,
        matchedPartNumber: null,
        confidence: null,
        reason: "SKU permanently blocked by admin — previously identified as non-MOC",
        incentive: null,
      });
      continue;
    }
    if (dealerNoSet.has(part.sku.toUpperCase())) {
      results.push({
        ...base,
        matchType: "UNMATCHED",
        matchedArchetype: null,
        matchedPartNumber: null,
        confidence: null,
        reason: "Previously marked NO for this dealer — skipped",
        incentive: null,
      });
      continue;
    }

    // PASS 2 — fuzzy.
    const fz = fuzzyMatch(part, catalog);
    if (fz) {
      results.push({
        ...base,
        matchType: "FUZZY",
        matchedArchetype: fz.archetype.manufacturerPart,
        matchedPartNumber: fz.archetype.barePartNumber,
        confidence: fz.confidence,
        reason: fz.reason,
        incentive: fz.archetype.incentive,
      });
      continue;
    }

    // PASS 3 — pre-AI filter.
    const skip = prefilterSkip(part, { dealerBrand });
    if (skip) {
      results.push({
        ...base,
        matchType: "UNMATCHED",
        matchedArchetype: null,
        matchedPartNumber: null,
        confidence: null,
        reason: skip,
        incentive: null,
      });
      continue;
    }
    toAI.push(part);
  }

  // PASS 3.5 — retrieval (optional): a confident semantic match to "the well"
  // fast-paths out of the AI call; everything else falls through to the AI.
  let aiParts = toAI;
  if (toAI.length && ctx.retriever) {
    const scores = await ctx.retriever.score(toAI.map((p) => ({ sku: p.sku, partName: p.partName })));
    const remaining: Part[] = [];
    for (const part of toAI) {
      const v = decideRetrieval(scores.get(part.sku) ?? [], ctx.retriever.config);
      if (v.decision === "match") {
        const arch = findArchetype(catalog, v.barePartNumber);
        results.push({
          ...part,
          matchType: "AI",
          matchedArchetype: arch ? arch.manufacturerPart : null,
          matchedPartNumber: arch ? arch.barePartNumber : null,
          confidence: v.confidence,
          reason: `Semantic match to confirmed ${v.barePartNumber} variations (similarity ${v.score.toFixed(2)})`,
          incentive: arch ? arch.incentive : null,
        } as MatchResult);
      } else {
        remaining.push(part);
      }
    }
    aiParts = remaining;
  }

  // PASS 4 — AI adjudication (on whatever retrieval didn't confidently resolve).
  if (aiParts.length) {
    const verdicts = await adjudicator.adjudicate(aiParts);
    const bySku = new Map(verdicts.map((v) => [v.sku, v]));
    for (const part of aiParts) {
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

  // Reclassify still-UNMATCHED rows into a "possible miss — review" bucket when
  //   (a) 4-digit + chemical name (dropped leading zero), OR
  //   (b) the AI hesitated on its "not a match" verdict (MEDIUM/LOW confidence) on a
  //       chemical-named part — that's exactly where real misses hide.
  // Everything else stays UNMATCHED, and we clear the AI's negative-verdict confidence
  // so an unmatched row never displays a match-style score.
  return results.map((r) => {
    if (r.matchType !== "UNMATCHED") return r;
    const isChemical = !isMechanicalName(r.partName) && (r.partName || "").trim().length > 0;
    const is4digit = /^\d{4}$/.test(String(r.barePartNumber).trim());
    const aiUnsure = r.confidence === "MEDIUM" || r.confidence === "LOW"; // AI wasn't sure it's a non-MOC part
    if (isChemical && (is4digit || aiUnsure)) {
      return {
        ...r,
        matchType: "AI",
        confidence: "LOW",
        matchedArchetype: null,
        matchedPartNumber: null,
        reason: is4digit
          ? "4-digit number with a chemical product name — possible MOC part with a dropped leading zero"
          : "Chemical product name and the AI wasn't confident it's a non-MOC part — flagged as a possible miss to review",
      };
    }
    return { ...r, confidence: null };
  });
}
