"use client";

import { useCallback, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { UploadCloud, FileSpreadsheet, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { MatchTypeChip } from "../components/match/match-type-chip";
import { ConfidenceMeter } from "../components/match/confidence-meter";
import { cn } from "../lib/utils";

type Parsed = { fileName: string; rowCount: number } | null;

export default function UploadPage() {
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<Parsed>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    setError("");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        const headers = (rows[0] || []).map((h) => String(h).toUpperCase());
        const skuIdx = headers.findIndex((h) => h.includes("SKU"));
        if (skuIdx === -1) {
          setError("Couldn't find a SKU column in that file. Check the header row and try again.");
          return;
        }
        const seen = new Set<string>();
        for (let i = 1; i < rows.length; i++) {
          const sku = rows[i]?.[skuIdx];
          if (sku) seen.add(String(sku).trim());
        }
        setParsed({ fileName: file.name, rowCount: seen.size });
      } catch {
        setError("That file couldn't be read as an Excel workbook.");
      }
    };
    reader.readAsBinaryString(file);
  }, []);

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

          {parsed && (
            <div className="mt-4 flex flex-col items-start justify-between gap-3 rounded-md border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center">
              <span className="flex items-center gap-2 text-sm">
                <FileSpreadsheet className="h-4 w-4 text-accent" aria-hidden />
                <span className="font-medium">{parsed.fileName}</span>
                <span className="tnum text-muted-foreground">· {parsed.rowCount} parts detected</span>
              </span>
              <Button variant="accent" size="sm" disabled title="Connect a database to run matching">
                Run match
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          )}
          {parsed && (
            <p className="mt-2 text-xs text-muted-foreground">
              Matching runs once the database and model are connected (Neon + API key).
            </p>
          )}
        </CardContent>
      </Card>

      {/* Live preview of the match ledger — the result-row design language. */}
      <Card>
        <CardHeader>
          <CardTitle>How results read</CardTitle>
          <CardDescription>Each row maps a dealer SKU to a MOC product, with how we know.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Dealer SKU</th>
                  <th className="px-4 py-2.5 text-left font-medium">DMS name</th>
                  <th className="px-4 py-2.5 text-left font-medium">MOC #</th>
                  <th className="px-4 py-2.5 text-left font-medium">Match</th>
                  <th className="px-4 py-2.5 text-left font-medium">Confidence</th>
                  <th className="px-4 py-2.5 text-right font-medium">Incentive</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {SAMPLE.map((r) => (
                  <tr key={r.sku} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-mono text-xs">{r.sku}</td>
                    <td className="px-4 py-2.5">{r.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs font-medium">{r.moc}</td>
                    <td className="px-4 py-2.5">
                      <MatchTypeChip type={r.type} />
                    </td>
                    <td className="px-4 py-2.5">
                      <ConfidenceMeter confidence={r.conf} />
                    </td>
                    <td className="tnum px-4 py-2.5 text-right">{r.incentive ? `$${r.incentive}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const SAMPLE = [
  { sku: "8888801071", name: "E-SHIELD MOC", moc: "01071", type: "EXACT", conf: "EXACT", incentive: 5 },
  { sku: "8888804461", name: "TRANSMISSION SERV", moc: "04461", type: "FUZZY", conf: "MEDIUM", incentive: 10 },
  { sku: "2301", name: "ATF FLUSH", moc: "02301", type: "AI", conf: "LOW", incentive: 0 },
  { sku: "TO48068-02301", name: "ARM SUB-ASSY", moc: "—", type: "UNMATCHED", conf: null, incentive: 0 },
] as const;
