"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FileSpreadsheet, ArrowRight, Loader2 } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import { parseWorkbook } from "../lib/build-parts";
import { saveRun } from "../lib/match-store";

export default function UploadPage() {
  const router = useRouter();
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const [status, setStatus] = useState<"idle" | "matching">("idle");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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

  const runMatch = async () => {
    if (!file) return;
    setStatus("matching");
    setError("");
    try {
      const { parts, dealerName } = await parseWorkbook(file);
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parts, dealerBrand: "all" }),
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
      const runId =
        typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `run-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      saveRun({ results, dealerName, fileName: file.name, ranAt: new Date().toISOString(), runId });
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
          Upload a DMS parts export. We identify which rows are MOC products and what each one maps to.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
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
            <span className="text-sm font-medium">Drop an Excel file here, or click to browse</span>
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

          {error && (
            <p role="alert" className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {file && (
            <div className="mt-4 flex flex-col items-start justify-between gap-3 rounded-md border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center">
              <span className="flex items-center gap-2 text-sm">
                <FileSpreadsheet className="h-4 w-4 text-accent" aria-hidden />
                <span className="font-medium">{file.name}</span>
                <span className="tnum text-muted-foreground">· {rowCount} parts detected</span>
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
