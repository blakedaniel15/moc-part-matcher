"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Table2, ArrowLeft } from "lucide-react";
import { EmptyState } from "../../components/ui/empty-state";
import { ResultsTable } from "../../components/match/results-table";
import { Button } from "../../components/ui/button";
import { loadRun, type StoredRun } from "../../lib/match-store";

export default function ResultsPage() {
  const [run, setRun] = useState<StoredRun | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setRun(loadRun());
    setLoaded(true);
  }, []);

  if (!loaded) return null;

  if (!run) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Results</h2>
          <p className="mt-1 text-sm text-muted-foreground">Matched parts from your most recent run.</p>
        </div>
        <EmptyState
          icon={<Table2 className="h-6 w-6" aria-hidden />}
          title="No results yet"
          body="Upload a dealer parts file and run a match to see results here."
        />
      </div>
    );
  }

  const exact = run.results.filter((r) => r.matchType === "EXACT").length;
  const total = run.results.length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{run.dealerName || "Results"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="tnum">{total}</span> parts · <span className="tnum">{exact}</span> exact · from{" "}
            <span className="font-medium">{run.fileName}</span>
          </p>
        </div>
        <Link href="/">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            New file
          </Button>
        </Link>
      </div>

      <ResultsTable results={run.results} dealer={run.dealerName} runId={run.runId} />
    </div>
  );
}
