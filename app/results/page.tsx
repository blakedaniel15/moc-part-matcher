"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Table2, CheckCircle2, UploadCloud, Loader2, ChevronRight, Download } from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { ResultsTable } from "../../components/match/results-table";
import { Button } from "../../components/ui/button";
import { loadRun, clearRun, saveRun, type StoredRun } from "../../lib/match-store";
import { candidateRows, downloadCandidates } from "../../lib/candidate-export";
import type { MatchResult } from "../../engine/types";

const isMatched = (r: MatchResult) =>
  r.matchType === "EXACT" || r.matchType === "FUZZY" || (r.matchType === "AI" && (r.confidence === "HIGH" || r.confidence === "MEDIUM"));
const isReview = (r: MatchResult) => r.matchType === "AI" && r.confidence === "LOW";

const counts = (results: MatchResult[]) => ({
  total: results.length,
  matched: results.filter(isMatched).length,
  review: results.filter(isReview).length,
  unmatched: results.filter((r) => r.matchType === "UNMATCHED").length,
});

interface RunSummary {
  runId: string;
  dealer: string;
  fileName: string;
  total: number;
  matched: number;
  review: number;
  unmatched: number;
  ranAt: string;
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

export default function ResultsPage() {
  const [run, setRun] = useState<StoredRun | null>(null);
  const [history, setHistory] = useState<RunSummary[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [reopening, setReopening] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, string>>({});

  const loadHistory = useCallback(() => {
    fetch("/api/runs")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setHistory(Array.isArray(d) ? d : []))
      .catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    setRun(loadRun());
    setLoaded(true);
    loadHistory();
  }, [loadHistory]);

  const finish = async () => {
    if (run) {
      try {
        await fetch("/api/runs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ runId: run.runId, dealer: run.dealerName, fileName: run.fileName, ...counts(run.results), snapshot: run.results }),
        });
      } catch {
        /* snapshot save is best-effort */
      }
    }
    clearRun();
    setRun(null);
    setHistory(null);
    loadHistory();
  };

  const reopen = async (runId: string) => {
    setReopening(runId);
    try {
      const res = await fetch(`/api/runs/${runId}`);
      if (!res.ok) return;
      const d = await res.json();
      const reopened: StoredRun = {
        results: Array.isArray(d.snapshot) ? d.snapshot : [],
        dealerName: d.dealer || "",
        fileName: d.fileName || "",
        runId: d.runId,
        ranAt: new Date().toISOString(),
      };
      saveRun(reopened);
      setRun(reopened);
      window.scrollTo(0, 0);
    } finally {
      setReopening(null);
    }
  };

  if (!loaded) return null;

  // Active run — review it
  if (run) {
    const c = counts(run.results);
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{run.dealerName || "Results"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="tnum">{c.total}</span> parts · <span className="tnum">{c.matched}</span> matched
              {run.knownCount ? <> · <span className="tnum">{run.knownCount}</span> known skipped</> : null} · from{" "}
              <span className="font-medium">{run.fileName}</span> · decisions save automatically
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCandidates(candidateRows(run.results, decisions), `${run.dealerName || "candidates"}.xlsx`)}
            >
              <Download className="h-4 w-4" aria-hidden />
              Export candidates
            </Button>
            <Button variant="primary" size="sm" onClick={finish}>
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Done — save &amp; file it
            </Button>
          </div>
        </div>
        <ResultsTable results={run.results} dealer={run.dealerName} runId={run.runId} onDecisionsChange={(d) => setDecisions(d)} />
      </div>
    );
  }

  // No active run — show the run history
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Run history</h2>
          <p className="mt-1 text-sm text-muted-foreground">Files you’ve run. Click one to re-open and review it.</p>
        </div>
        <Link href="/">
          <Button variant="accent" size="sm">
            <UploadCloud className="h-4 w-4" aria-hidden />
            Upload a file
          </Button>
        </Link>
      </div>

      {history === null ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </div>
      ) : history.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Table2 className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <h3 className="text-sm font-semibold">No files yet</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">Upload a dealer file and run a match. Finished files show up here.</p>
            </div>
            <Link href="/">
              <Button variant="accent" size="sm">
                <UploadCloud className="h-4 w-4" aria-hidden />
                Upload a file
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Dealer</th>
                  <th className="px-4 py-2.5 text-left font-medium">File</th>
                  <th className="px-4 py-2.5 text-left font-medium">Reviewed</th>
                  <th className="px-4 py-2.5 text-right font-medium">Parts</th>
                  <th className="px-4 py-2.5 text-right font-medium">Matched</th>
                  <th className="px-4 py-2.5 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {history.map((h) => (
                  <tr key={h.runId} className="cursor-pointer hover:bg-muted/40" onClick={() => reopen(h.runId)}>
                    <td className="px-4 py-2.5 font-medium">{h.dealer || "—"}</td>
                    <td className="max-w-xs truncate px-4 py-2.5 text-muted-foreground" title={h.fileName}>{h.fileName || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(h.ranAt)}</td>
                    <td className="tnum px-4 py-2.5 text-right">{h.total}</td>
                    <td className="tnum px-4 py-2.5 text-right">{h.matched}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {reopening === h.runId ? <Loader2 className="ml-auto h-4 w-4 animate-spin" aria-hidden /> : <ChevronRight className="ml-auto h-4 w-4" aria-hidden />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
