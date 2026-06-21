"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Table2, CheckCircle2, UploadCloud } from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { ResultsTable } from "../../components/match/results-table";
import { Button } from "../../components/ui/button";
import { loadRun, clearRun, type StoredRun } from "../../lib/match-store";

export default function ResultsPage() {
  const router = useRouter();
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
          <p className="mt-1 text-sm text-muted-foreground">Matched parts from a run appear here.</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Table2 className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <h3 className="text-sm font-semibold">No file in review</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">Upload a dealer parts file and run a match to review results here.</p>
            </div>
            <Link href="/">
              <Button variant="accent" size="sm">
                <UploadCloud className="h-4 w-4" aria-hidden />
                Upload a file
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const exact = run.results.filter((r) => r.matchType === "EXACT").length;
  const total = run.results.length;

  const finish = () => {
    clearRun();
    router.push("/");
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{run.dealerName || "Results"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="tnum">{total}</span> parts · <span className="tnum">{exact}</span> exact · from{" "}
            <span className="font-medium">{run.fileName}</span> · decisions save automatically
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={finish}>
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          Done — review another file
        </Button>
      </div>

      <ResultsTable results={run.results} dealer={run.dealerName} runId={run.runId} />
    </div>
  );
}
