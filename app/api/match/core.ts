import type { Part, Archetype, ApprovedMapping, MatchResult } from "../../../engine/types";
import { runPipeline } from "../../../engine/pipeline";
import type { Adjudicator } from "../../../engine/adjudicator";

export interface MatchDeps {
  catalog: Archetype[];
  approved: ApprovedMapping[];
  blockedSkus: string[];
  dealerRejections: string[];
  adjudicator: Adjudicator;
}

// Pure match orchestration — no HTTP, no DB. Testable with injected deps.
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
