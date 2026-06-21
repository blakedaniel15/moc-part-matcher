"use client";

import { useEffect, useMemo, useState } from "react";
import { BookText, Search, Plus, Loader2 } from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { cn } from "../../lib/utils";

interface Archetype {
  barePartNumber: string;
  manufacturerPart: string;
  source: string;
}

const SOURCE_STYLE: Record<string, string> = {
  official: "bg-accent/10 text-accent ring-accent/20",
  custom: "bg-ai/10 text-ai ring-ai/20",
  regional: "bg-fuzzy/10 text-fuzzy ring-fuzzy/20",
};

function AddProduct({ onAdded }: { onAdded: (a: Archetype) => void }) {
  const [open, setOpen] = useState(false);
  const [moc, setMoc] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
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
        body: JSON.stringify({ barePartNumber: bare, productName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't add.");
        setSaving(false);
        return;
      }
      onAdded({ barePartNumber: data.barePartNumber, manufacturerPart: data.manufacturerPart, source: "custom" });
      setOpen(false);
      setMoc("");
      setName("");
      setSaving(false);
    } catch {
      setError("Couldn't reach the server.");
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="accent" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden /> Add product
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add a product">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cmoc" className="text-sm font-medium">MOC part number</label>
            <input id="cmoc" value={moc} onChange={(e) => setMoc(e.target.value)} placeholder="e.g. 04481"
              className="h-9 rounded-md border bg-card px-3 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cname" className="text-sm font-medium">Product name</label>
            <input id="cname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. GDI FUEL INJECTOR CLEANER, 10OZ"
              className="h-9 rounded-md border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="accent" size="sm" onClick={save} disabled={saving}>{saving ? "Adding…" : "Add product"}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export default function CatalogPage() {
  const [catalog, setCatalog] = useState<Archetype[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = () => {
    fetch("/api/catalog")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Failed to load catalog.");
        return d;
      })
      .then((d) => setCatalog(Array.isArray(d) ? d : []))
      .catch((e) => setError(e.message));
  };

  useEffect(load, []);

  const counts = useMemo(() => {
    const c = { total: 0, official: 0, custom: 0, regional: 0 };
    for (const a of catalog ?? []) {
      c.total++;
      if (a.source === "official") c.official++;
      else if (a.source === "regional") c.regional++;
      else c.custom++;
    }
    return c;
  }, [catalog]);

  const rows = useMemo(() => {
    const list = catalog ?? [];
    const q = query.trim().toLowerCase();
    return q ? list.filter((a) => a.manufacturerPart.toLowerCase().includes(q) || a.barePartNumber.includes(q)) : list;
  }, [catalog, query]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Archetype catalog</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {catalog ? (
              <>
                <span className="tnum">{counts.total}</span> products · <span className="tnum">{counts.official}</span> official ·{" "}
                <span className="tnum">{counts.regional}</span> regional · <span className="tnum">{counts.custom}</span> custom
              </>
            ) : (
              "Loading…"
            )}
          </p>
        </div>
        <AddProduct onAdded={(a) => setCatalog((prev) => [a, ...(prev ?? [])])} />
      </div>

      {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or MOC number…"
          className="h-9 w-full rounded-md border bg-card pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {catalog === null ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading catalog…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">MOC #</th>
                    <th className="px-4 py-2.5 text-left font-medium">Product</th>
                    <th className="px-4 py-2.5 text-left font-medium">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((a) => (
                    <tr key={a.barePartNumber} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs font-medium">{a.barePartNumber}</td>
                      <td className="px-4 py-2.5">{a.manufacturerPart.replace(/^\d+\s*-\s*/, "")}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ring-1 ring-inset", SOURCE_STYLE[a.source] || SOURCE_STYLE.custom)}>
                          {a.source}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-10 text-center text-sm text-muted-foreground">No products match “{query}”.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
