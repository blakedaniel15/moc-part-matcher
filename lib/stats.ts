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
  reviewFlagged: number; // parts the system sent to the Review bucket (from the match output)
  parts: number; // total parts in the file(s) (from the match output)
}

// Per-run match-output counts (from run_snapshots), independent of decisions.
export interface RunSummaryInput {
  runId: string;
  dealer: string;
  review: number;
  total: number;
  ranAt: string | null;
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
  // reviewFlagged/parts come from the match output (run snapshots), set in computeStats.
  return { hits, rescuedReview, rescuedUnmatched, falsePositives, denominator, rate: denominator ? hits / denominator : 0, decided, reviewFlagged: 0, parts: 0 };
}

export interface RunStat extends Tally {
  runId: string;
  dealer: string;
  ranAt: string | null;
}

export function computeStats(decisions: DecisionRow[], runSummaries: RunSummaryInput[] = []): { overall: Tally; runs: RunStat[] } {
  // Decisions drive identification / false-positive rates; run snapshots drive the
  // review load (parts the system flagged for review, regardless of decisions).
  const overall: Tally = {
    ...tally(decisions),
    reviewFlagged: runSummaries.reduce((a, s) => a + (s.review || 0), 0),
    parts: runSummaries.reduce((a, s) => a + (s.total || 0), 0),
  };

  const EARLIER = "__earlier__"; // decisions made before run-tagging — grouped together
  const byRun = new Map<string, DecisionRow[]>();
  for (const d of decisions) {
    const key = d.runId || EARLIER;
    if (!byRun.has(key)) byRun.set(key, []);
    byRun.get(key)!.push(d);
  }
  const summaryByRun = new Map(runSummaries.map((s) => [s.runId, s]));

  // A run appears if it has decisions OR a saved snapshot.
  const runIds = new Set<string>([...summaryByRun.keys(), ...byRun.keys()]);
  const runs: RunStat[] = [...runIds].map((runId) => {
    const ds = byRun.get(runId) ?? [];
    const s = summaryByRun.get(runId);
    return {
      runId,
      dealer: runId === EARLIER ? "Earlier reviews" : s?.dealer || ds.find((d) => d.dealer)?.dealer || "unknown",
      ranAt: s?.ranAt ?? ds[ds.length - 1]?.ts ?? null,
      ...tally(ds),
      reviewFlagged: s?.review ?? 0,
      parts: s?.total ?? 0,
    };
  });
  runs.sort((a, b) => (b.ranAt ?? "").localeCompare(a.ranAt ?? ""));

  return { overall, runs };
}
