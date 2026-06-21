"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { Modal } from "../ui/modal";
import type { MatchResult } from "../../engine/types";
import { cn } from "../../lib/utils";

interface Archetype {
  barePartNumber: string;
  manufacturerPart: string;
  source: string;
}

export function MatchExistingDialog({
  row,
  dealer,
  runId,
  onClose,
  onMatched,
}: {
  row: MatchResult | null;
  dealer: string;
  runId: string;
  onClose: () => void;
  onMatched: (sku: string, barePartNumber: string, manufacturerPart: string) => void;
}) {
  const [catalog, setCatalog] = useState<Archetype[] | null>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!row) return;
    setCatalog(null);
    setError("");
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((data) => setCatalog(Array.isArray(data) ? data : []))
      .catch(() => setError("Couldn't load the catalog."));
  }, [row]);

  const results = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    const list = q ? catalog.filter((a) => a.manufacturerPart.toLowerCase().includes(q) || a.barePartNumber.includes(q)) : catalog;
    return list.slice(0, 60);
  }, [catalog, query]);

  const choose = async (a: Archetype) => {
    if (!row) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dealer, runId, outcome: "correct", row, chosenBare: a.barePartNumber, chosenName: a.manufacturerPart }),
      });
      if (!res.ok) throw new Error();
      onMatched(row.sku, a.barePartNumber, a.manufacturerPart);
    } catch {
      setError("Couldn't save. Try again.");
      setSaving(false);
    }
  };

  return (
    <Modal open={!!row} onClose={onClose} title="Match to an existing product">
      {row && (
        <div className="flex flex-col gap-3">
          <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Dealer SKU <span className="font-mono text-foreground">{row.sku}</span>
            {row.partName ? <> · <span className="text-foreground">{row.partName}</span></> : null}
          </p>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or MOC number…"
              className="h-9 w-full rounded-md border bg-card pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="max-h-72 overflow-y-auto rounded-md border">
            {catalog === null ? (
              <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading catalog…
              </div>
            ) : results.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">No products match “{query}”.</div>
            ) : (
              <ul className="divide-y">
                {results.map((a) => (
                  <li key={a.barePartNumber}>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => choose(a)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 disabled:opacity-50"
                      )}
                    >
                      <span className="font-mono text-xs font-medium">{a.barePartNumber}</span>
                      <span className="truncate text-muted-foreground">{a.manufacturerPart.replace(/^\d+\s*-\s*/, "")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
