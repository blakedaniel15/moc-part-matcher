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

// Three KPIs derived from a tally.
const idRate = (t: Tally) => (t.denominator ? t.hits / t.denominator : 0);
// Review load: parts the system flagged for review / total parts (from match output).
const reviewRate = (t: Tally) => (t.parts ? t.reviewFlagged / t.parts : 0);
const fpRate = (t: Tally) => {
  const base = t.hits + t.falsePositives;
  return base ? t.falsePositives / base : 0;
};

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "good" | "warn" | "bad-when-high" }) {
  const color = tone === "good" ? "text-accent" : tone === "warn" ? "text-fuzzy" : value === "0.0%" ? "text-exact" : "text-destructive";
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-5">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={`tnum text-3xl font-bold tracking-tight ${color}`}>{value}</span>
        <span className="text-xs text-muted-foreground">{sub}</span>
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
        <p className="mt-1 text-sm text-muted-foreground">How well the system identifies MOC parts — measured against your review decisions.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </div>
      ) : error ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : !data || data.overall.decided === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-6 w-6" aria-hidden />}
          title="No reviewed parts yet"
          body="Run a file and review it (Yes/No on matches, Match/New on unmatched MOC parts). Your stats appear here."
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Across {data.runs.length} {data.runs.length === 1 ? "file" : "files"} · {data.overall.denominator} confirmed MOC parts
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Kpi
              label="Identification rate"
              value={data.overall.denominator ? pct(idRate(data.overall)) : "—"}
              sub={`${data.overall.hits} / ${data.overall.denominator} auto-matched`}
              tone="good"
            />
            <Kpi
              label="Review rate"
              value={data.overall.parts ? pct(reviewRate(data.overall)) : "—"}
              sub={`${data.overall.reviewFlagged} of ${data.overall.parts} flagged for review`}
              tone="warn"
            />
            <Kpi
              label="False-positive rate"
              value={data.overall.hits + data.overall.falsePositives ? pct(fpRate(data.overall)) : "—"}
              sub={`${data.overall.falsePositives} of ${data.overall.hits + data.overall.falsePositives} matches wrong`}
              tone="bad-when-high"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Auto-matched" value={String(data.overall.hits)} sub="confirmed correct" />
            <Stat label="Rescued · review" value={String(data.overall.rescuedReview)} sub="low-confidence, approved" />
            <Stat label="Rescued · unmatched" value={String(data.overall.rescuedUnmatched)} sub="system missed" />
            <Stat label="False positives" value={String(data.overall.falsePositives)} sub="matched, you said no" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>By file</CardTitle>
              <CardDescription>Identification · review · false-positive rate per upload.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Dealer</th>
                      <th className="px-4 py-2.5 text-left font-medium">Date</th>
                      <th className="px-4 py-2.5 text-right font-medium">Identify</th>
                      <th className="px-4 py-2.5 text-right font-medium">Review</th>
                      <th className="px-4 py-2.5 text-right font-medium">False+</th>
                      <th className="px-4 py-2.5 text-right font-medium">MOC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.runs.map((r) => (
                      <tr key={r.runId} className="hover:bg-muted/30">
                        <td className="px-4 py-2.5">{r.dealer}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(r.ranAt)}</td>
                        <td className="tnum px-4 py-2.5 text-right font-medium text-accent">{r.denominator ? pct(idRate(r)) : "—"}</td>
                        <td className="tnum px-4 py-2.5 text-right text-fuzzy">{r.parts ? pct(reviewRate(r)) : "—"}</td>
                        <td className={`tnum px-4 py-2.5 text-right ${r.falsePositives ? "text-destructive" : "text-muted-foreground"}`}>
                          {r.hits + r.falsePositives ? pct(fpRate(r)) : "—"}
                        </td>
                        <td className="tnum px-4 py-2.5 text-right text-muted-foreground">{r.denominator}</td>
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

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-4">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="tnum text-2xl font-semibold">{value}</span>
        <span className="text-xs text-muted-foreground">{sub}</span>
      </CardContent>
    </Card>
  );
}
