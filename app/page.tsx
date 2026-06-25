"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FileSpreadsheet, ArrowRight, Loader2, ListChecks, X } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import { parseWorkbook } from "../lib/build-parts";
import { parseKnownFile, type KnownList } from "../lib/known-list";
import { computeGap } from "../lib/gap";
import { normalizeDealerKey, matchDealer } from "../lib/dealer";
import { saveRun } from "../lib/match-store";

export default function UploadPage() {
  const router = useRouter();
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const [knownList, setKnownList] = useState<KnownList | null>(null);
  const [knownFileName, setKnownFileName] = useState("");
  const [status, setStatus] = useState<"idle" | "matching">("idle");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const knownInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (f: File) => {
    setError("");
    setFile(null);
    try {
      const { parts } = await parseWorkbook(f);
      setFile(f);
      setRowCount(parts.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    }
  }, []);

  const handleKnown = useCallback(async (f: File) => {
    setError("");
    try {
      const k = await parseKnownFile(f);
      setKnownList(k);
      setKnownFileName(f.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read the known-list file.");
    }
  }, []);

  const runMatch = async () => {
    if (!file) return;
    setStatus("matching");
    setError("");
    try {
      const { parts, dealerName } = await parseWorkbook(file);
      const { gap, knownCount } = knownList ? computeGap(parts, knownList.skus) : { gap: parts, knownCount: 0 };

      // Register / match the dealer (best-effort).
      const key = normalizeDealerKey(dealerName);
      let dealerKey = key;
      try {
        const existing = (await (await fetch("/api/dealers")).json()) as string[];
        const m = matchDealer(key, Array.isArray(existing) ? existing : []);
        if (m.status === "new") {
          await fetch("/api/dealers", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ key, name: dealerName, dmsType: parts[0]?.dmsType ?? null }),
          });
        }
        dealerKey = m.key;
      } catch {
        /* dealer registry is best-effort */
      }

      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parts: gap, dealerBrand: "all", knownMappings: knownList?.mappings ?? [] }),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = `Match failed (HTTP ${res.status}).`;
        try {
          msg = JSON.parse(text).error || msg;
        } catch {
          /* keep default */
        }
        setError(msg);
        setStatus("idle");
        return;
      }
      const results = await res.json();
      const runId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `run-${Date.now()}`;
      saveRun({ results, dealerName, fileName: file.name, ranAt: new Date().toISOString(), runId, knownCount, dealerKey });
      router.push("/results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Match failed.");
      setStatus("idle");
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Match a dealer parts file</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a DMS parts export. Add a known-SKU list to find only the new parts not set up yet.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-5">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors",
              dragOver ? "border-accent bg-accent/5" : "border-border hover:border-accent/50 hover:bg-muted/40"
            )}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <UploadCloud className="h-6 w-6" aria-hidden />
            </span>
            <span className="text-sm font-medium">Drop the sales file here, or click to browse</span>
            <span className="text-xs text-muted-foreground">.xlsx or .xls — one dealer per file</span>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </label>

          {/* Optional known-list — presence switches to gap mode */}
          <div className="flex flex-col gap-2 rounded-md border bg-muted/20 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <ListChecks className="h-4 w-4 text-accent" aria-hidden /> Known-SKU list <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </span>
              {knownList ? (
                <button
                  type="button"
                  onClick={() => {
                    setKnownList(null);
                    setKnownFileName("");
                  }}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" aria-hidden /> remove
                </button>
              ) : (
                <button type="button" onClick={() => knownInputRef.current?.click()} className="text-xs font-medium text-accent hover:underline">
                  Add list
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {knownList ? (
                <>
                  <span className="font-medium text-foreground">{knownFileName}</span> · <span className="tnum">{knownList.skus.size}</span> known SKUs —
                  only new parts will be shown.
                </>
              ) : (
                "Without a list, the full file is matched (setup mode). With one (SKU + optional MOC#/Name), only the parts not already set up are shown (gap mode)."
              )}
            </p>
            <input
              ref={knownInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleKnown(f);
              }}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {file && (
            <div className="flex flex-col items-start justify-between gap-3 rounded-md border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center">
              <span className="flex items-center gap-2 text-sm">
                <FileSpreadsheet className="h-4 w-4 text-accent" aria-hidden />
                <span className="font-medium">{file.name}</span>
                <span className="tnum text-muted-foreground">
                  · {rowCount} parts{knownList ? " · gap mode" : ""}
                </span>
              </span>
              <Button variant="accent" size="sm" onClick={runMatch} disabled={status === "matching"}>
                {status === "matching" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {status === "matching" ? "Matching…" : "Run match"}
                {status !== "matching" && <ArrowRight className="h-4 w-4" aria-hidden />}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
