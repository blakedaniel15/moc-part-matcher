// MOC identification rate = (MOC parts the system auto-matched correctly) /
// (all MOC parts), where "all MOC parts" = hits + parts the reviewer rescued from
// the Review and Unmatched buckets. Computed from the human decisions.

export interface DecisionRow {
  sku: string;
  matchType: string | null;
  confidence: string | null;
  outcome: string; // approve | reject | correct
  runId: string | null;
  dealer: string | null;
  ts: string;
}

export type Bucket = "matched" | "review" | "unmatched";

export function bucketOf(d: { matchType: string | null; confidence: string | null }): Bucket {
  const mt = d.matchType;
  if (mt === "EXACT" || mt === "FUZZY") return "matched";
  if (mt === "AI") return d.confidence === "HIGH" || d.confidence === "MEDIUM" ? "matched" : "review";
  return "unmatched";
}

export interface Tally {
  hits: number; // auto-matched (Matched bucket) + approved — the numerator
  rescuedReview: number; // approved from the Review bucket
  rescuedUnmatched: number; // resolved from the Unmatched bucket (match-existing or add-new)
  falsePositives: number; // Matched bucket but rejected
  denominator: number; // all confirmed MOC parts = hits + rescued
  rate: number; // hits / denominator (0..1)
  decided: number; // total parts with any verdict (approve/correct/reject)
}

// Dedupe to the latest decision per (run, sku); input must be ordered by ts ascending.
function tally(decisions: DecisionRow[]): Tally {
  const latest = new Map<string, DecisionRow>();
  for (const d of decisions) latest.set((d.runId ?? "") + "|" + d.sku, d);

  let hits = 0;
  let rescuedReview = 0;
  let rescuedUnmatched = 0;
  let falsePositives = 0;
  let decided = 0;

  for (const d of latest.values()) {
    const b = bucketOf(d);
    if (d.outcome === "approve" || d.outcome === "correct") {
      decided++;
      if (b === "matched") hits++;
      else if (b === "review") rescuedReview++;
      else rescuedUnmatched++;
    } else if (d.outcome === "reject") {
      decided++;
      if (b === "matched") falsePositives++;
    }
  }

  const denominator = hits + rescuedReview + rescuedUnmatched;
  return { hits, rescuedReview, rescuedUnmatched, falsePositives, denominator, rate: denominator ? hits / denominator : 0, decided };
}

export interface RunStat extends Tally {
  runId: string;
  dealer: string;
  ranAt: string | null;
}

export function computeStats(decisions: DecisionRow[]): { overall: Tally; runs: RunStat[] } {
  const overall = tally(decisions);

  const EARLIER = "__earlier__"; // decisions made before run-tagging — grouped together
  const byRun = new Map<string, DecisionRow[]>();
  for (const d of decisions) {
    const key = d.runId || EARLIER;
    if (!byRun.has(key)) byRun.set(key, []);
    byRun.get(key)!.push(d);
  }

  const runs: RunStat[] = [...byRun.entries()].map(([runId, ds]) => ({
    runId,
    dealer: runId === EARLIER ? "Earlier reviews" : ds.find((d) => d.dealer)?.dealer ?? "unknown",
    ranAt: ds[ds.length - 1]?.ts ?? null,
    ...tally(ds),
  }));
  runs.sort((a, b) => (b.ranAt ?? "").localeCompare(a.ranAt ?? ""));

  return { overall, runs };
}
