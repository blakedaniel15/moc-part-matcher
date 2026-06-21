"use client";

import { useEffect, useState } from "react";
import { BarChart3, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { EmptyState } from "../../components/ui/empty-state";
import type { Tally, RunStat } from "../../lib/stats";

interface StatsData {
  overall: Tally;
  runs: RunStat[];
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-4">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="tnum text-2xl font-semibold">{value}</span>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </CardContent>
    </Card>
  );
}

export default function StatsPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Failed to load stats.");
        return d;
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Accuracy &amp; stats</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          How well the system identifies MOC parts — measured against your review decisions.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </div>
      ) : error ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : !data || data.overall.denominator === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-6 w-6" aria-hidden />}
          title="No reviewed parts yet"
          body="Run a file and review it (Yes/No on matches, Match/New on unmatched MOC parts). Your identification rate appears here."
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>MOC identification rate · all files</CardTitle>
              <CardDescription>
                Across {data.runs.length} {data.runs.length === 1 ? "file" : "files"}: of {data.overall.denominator} confirmed MOC parts, the
                system auto-matched {data.overall.hits} correctly.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-3">
                <span className="tnum text-5xl font-bold tracking-tight text-accent">{pct(data.overall.rate)}</span>
                <span className="tnum mb-1 text-sm text-muted-foreground">
                  {data.overall.hits} / {data.overall.denominator}
                </span>
              </div>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-accent" style={{ width: pct(data.overall.rate) }} />
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Auto-matched" value={String(data.overall.hits)} sub="confirmed correct" />
            <Stat label="Rescued · review" value={String(data.overall.rescuedReview)} sub="you approved" />
            <Stat label="Rescued · unmatched" value={String(data.overall.rescuedUnmatched)} sub="matched or added" />
            <Stat label="False positives" value={String(data.overall.falsePositives)} sub="matched, you said no" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>By file</CardTitle>
              <CardDescription>Identification rate per upload.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Dealer</th>
                      <th className="px-4 py-2.5 text-left font-medium">Date</th>
                      <th className="px-4 py-2.5 text-right font-medium">Rate</th>
                      <th className="px-4 py-2.5 text-right font-medium">Hits / MOC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.runs.map((r) => (
                      <tr key={r.runId} className="hover:bg-muted/30">
                        <td className="px-4 py-2.5">{r.dealer}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(r.ranAt)}</td>
                        <td className="tnum px-4 py-2.5 text-right font-medium">{r.denominator ? pct(r.rate) : "—"}</td>
                        <td className="tnum px-4 py-2.5 text-right text-muted-foreground">
                          {r.hits} / {r.denominator}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
