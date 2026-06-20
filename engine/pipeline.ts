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
  dealerRejections: string[]; // SKUs already NO'd for THIS dealer
  dealerBrand: "toyota" | "all";
  adjudicator: Adjudicator;
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

  // PASS 4 — AI adjudication.
  if (toAI.length) {
    const verdicts = await adjudicator.adjudicate(toAI);
    const bySku = new Map(verdicts.map((v) => [v.sku, v]));
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

  // Reclassification: UNMATCHED + 4-digit + chemical name => AI/LOW candidate.
  return results.map((r) => {
    if (r.matchType !== "UNMATCHED") return r;
    const is4digit = /^\d{4}$/.test(String(r.barePartNumber).trim());
    const isChemical = !isMechanicalName(r.partName) && (r.partName || "").trim().length > 0;
    if (is4digit && isChemical) {
      return {
        ...r,
        matchType: "AI",
        confidence: "LOW",
        matchedArchetype: null,
        matchedPartNumber: null,
        reason:
          "4-digit number with chemical product name — possible MOC part with dropped leading zero, no archetype on file yet",
      };
    }
    return r;
  });
}
