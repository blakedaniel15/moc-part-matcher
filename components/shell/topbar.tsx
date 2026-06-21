"use client";

import { useEffect, useState } from "react";

export function Topbar() {
  const [rate, setRate] = useState<number | null>(null);
  const [files, setFiles] = useState(0);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.overall?.denominator) {
          setRate(d.overall.rate);
          setFiles(d.runs?.length ?? 0);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card/80 px-6 backdrop-blur lg:px-8">
      <div className="flex flex-col">
        <h1 className="text-sm font-semibold leading-none tracking-tight">MOC Part Matcher</h1>
        <p className="mt-1 text-xs text-muted-foreground">Dealer DMS → MOC archetype identification</p>
      </div>
      {rate !== null && (
        <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-xs text-muted-foreground">
          <span>Global accuracy</span>
          <span className="tnum text-sm font-semibold text-accent">{(rate * 100).toFixed(1)}%</span>
          <span className="tnum">· {files} {files === 1 ? "file" : "files"}</span>
        </div>
      )}
    </header>
  );
}
