"use client";

import { useMemo, useState } from "react";
import type { MatchResult } from "../../engine/types";
import { MatchTypeChip } from "./match-type-chip";
import { ConfidenceMeter } from "./confidence-meter";
import { cn } from "../../lib/utils";

type Filter = "all" | "matched" | "review" | "unmatched";

const isMatched = (r: MatchResult) =>
  r.matchType === "EXACT" || r.matchType === "FUZZY" || (r.matchType === "AI" && (r.confidence === "HIGH" || r.confidence === "MEDIUM"));
const isReview = (r: MatchResult) => r.matchType === "AI" && r.confidence === "LOW";

export function ResultsTable({ results }: { results: MatchResult[] }) {
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
                <th className="px-4 py-2.5 text-right font-medium">Incentive</th>
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
                  <td className="tnum px-4 py-2.5 text-right">{r.incentive ? `$${r.incentive}` : "—"}</td>
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
