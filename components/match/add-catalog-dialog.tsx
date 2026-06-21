"use client";

import { useState } from "react";
import { Modal } from "../ui/modal";
import { Button } from "../ui/button";
import type { MatchResult } from "../../engine/types";

export function AddCatalogDialog({
  row,
  onClose,
  onAdded,
}: {
  row: MatchResult | null;
  onClose: () => void;
  onAdded: (sku: string, barePartNumber: string, manufacturerPart: string) => void;
}) {
  const [moc, setMoc] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!row) return;
    const bare = moc.trim();
    const productName = name.trim();
    if (!bare || !productName) {
      setError("Enter a MOC part number and a product name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/catalog/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sku: row.sku, partName: row.partName, barePartNumber: bare, productName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't add to catalog.");
        setSaving(false);
        return;
      }
      onAdded(row.sku, data.barePartNumber, data.manufacturerPart);
    } catch {
      setError("Couldn't reach the server.");
      setSaving(false);
    }
  };

  return (
    <Modal open={!!row} onClose={onClose} title="Add to catalog">
      {row && (
        <div className="flex flex-col gap-4">
          <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            From dealer SKU <span className="font-mono text-foreground">{row.sku}</span>
            {row.partName ? (
              <>
                {" "}
                · <span className="text-foreground">{row.partName}</span>
              </>
            ) : null}
          </p>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="moc" className="text-sm font-medium">
              MOC part number
            </label>
            <input
              id="moc"
              value={moc}
              onChange={(e) => setMoc(e.target.value)}
              placeholder="e.g. 04481"
              className="h-9 rounded-md border bg-card px-3 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="pname" className="text-sm font-medium">
              Product name
            </label>
            <input
              id="pname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. GDI FUEL INJECTOR CLEANER, 10OZ"
              className="h-9 rounded-md border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <p className="text-xs text-muted-foreground">Stored as the canonical catalog name; this SKU will map to it automatically next run.</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="accent" size="sm" onClick={save} disabled={saving}>
              {saving ? "Adding…" : "Add to catalog"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
