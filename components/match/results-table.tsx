"use client";

import { useMemo, useState } from "react";
import { Check, X, Loader2 } from "lucide-react";
import type { MatchResult } from "../../engine/types";
import { MatchTypeChip } from "./match-type-chip";
import { ConfidenceMeter } from "./confidence-meter";
import { cn } from "../../lib/utils";

type Filter = "all" | "matched" | "review" | "unmatched";
type DecisionState = "none" | "saving" | "approve" | "reject";

const isMatched = (r: MatchResult) =>
  r.matchType === "EXACT" || r.matchType === "FUZZY" || (r.matchType === "AI" && (r.confidence === "HIGH" || r.confidence === "MEDIUM"));
const isReview = (r: MatchResult) => r.matchType === "AI" && r.confidence === "LOW";

function DecisionCell({ row, dealer }: { row: MatchResult; dealer: string }) {
  const [state, setState] = useState<DecisionState>("none");
  const [err, setErr] = useState(false);

  if (!row.matchedPartNumber) return <span className="text-xs text-muted-foreground">—</span>;

  const decide = async (outcome: "approve" | "reject") => {
    setState("saving");
    setErr(false);
    try {
      const res = await fetch("/api/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dealer, outcome, row }),
      });
      if (!res.ok) throw new Error();
      setState(outcome);
    } catch {
      setState("none");
      setErr(true);
    }
  };

  if (state === "saving") return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />;

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => decide("approve")}
        aria-pressed={state === "approve"}
        aria-label="Correct match"
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium ring-1 ring-inset transition-colors",
          state === "approve" ? "bg-exact text-white ring-exact" : "bg-card text-muted-foreground ring-border hover:bg-exact/10 hover:text-exact"
        )}
      >
        <Check className="h-3.5 w-3.5" aria-hidden /> Yes
      </button>
      <button
        type="button"
        onClick={() => decide("reject")}
        aria-pressed={state === "reject"}
        aria-label="Wrong match"
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium ring-1 ring-inset transition-colors",
          state === "reject" ? "bg-destructive text-white ring-destructive" : "bg-card text-muted-foreground ring-border hover:bg-destructive/10 hover:text-destructive"
        )}
      >
        <X className="h-3.5 w-3.5" aria-hidden /> No
      </button>
      {err && <span className="text-xs text-destructive">retry</span>}
    </span>
  );
}

export function ResultsTable({ results, dealer }: { results: MatchResult[]; dealer: string }) {
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(
    () => ({
      all: results.length,
      matched: results.filter(isMatched).length,
      review: results.filter(isReview).length,
      unmatched: results.filter((r) => r.matchType === "UNMATCHED").length,
    }),
    [results]
  );

  const rows = useMemo(
    () =>
      results.filter((r) =>
        filter === "matched" ? isMatched(r) : filter === "review" ? isReview(r) : filter === "unmatched" ? r.matchType === "UNMATCHED" : true
      ),
    [results, filter]
  );

  const TABS: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "matched", label: "Matched" },
    { key: "review", label: "Review" },
    { key: "unmatched", label: "Unmatched" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              filter === t.key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted/60"
            )}
          >
            {t.label} <span className="tnum opacity-70">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Dealer SKU</th>
                <th className="px-4 py-2.5 text-left font-medium">DMS name</th>
                <th className="px-4 py-2.5 text-left font-medium">MOC product</th>
                <th className="px-4 py-2.5 text-left font-medium">MOC #</th>
                <th className="px-4 py-2.5 text-left font-medium">Match</th>
                <th className="px-4 py-2.5 text-left font-medium">Confidence</th>
                <th className="px-4 py-2.5 text-left font-medium">Correct?</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr key={r.sku + i} className="hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{r.sku}</td>
                  <td className="px-4 py-2.5">{r.partName || <span className="text-muted-foreground">—</span>}</td>
                  <td className="max-w-xs truncate px-4 py-2.5 text-muted-foreground" title={r.matchedArchetype || ""}>
                    {r.matchedArchetype ? r.matchedArchetype.replace(/^\d+\s*-\s*/, "") : "—"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs font-medium">{r.matchedPartNumber || "—"}</td>
                  <td className="px-4 py-2.5">
                    <MatchTypeChip type={r.matchType} />
                  </td>
                  <td className="px-4 py-2.5">
                    <ConfidenceMeter confidence={r.confidence} />
                  </td>
                  <td className="px-4 py-2.5">
                    <DecisionCell row={r} dealer={dealer} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No parts in this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
