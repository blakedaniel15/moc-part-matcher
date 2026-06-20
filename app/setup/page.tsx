"use client";

import { useState } from "react";
import { Database, Loader2, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Button } from "../../components/ui/button";

type Result = { ok: true; archetypes: number; approved: number; blocked: number } | null;

export default function SetupPage() {
  const [secret, setSecret] = useState("");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<Result>(null);
  const [error, setError] = useState("");

  const run = async () => {
    setStatus("running");
    setError("");
    try {
      const res = await fetch("/api/admin/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Setup failed.");
        setStatus("error");
        return;
      }
      setResult(data);
      setStatus("done");
    } catch {
      setError("Couldn't reach the server. Check that the database and admin secret are configured.");
      setStatus("error");
    }
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Initialize database</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          One-time setup: create the tables and load the catalog and approved mappings into Neon.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-accent" aria-hidden />
            Migrate &amp; seed
          </CardTitle>
          <CardDescription>Loads 206 archetypes, your approved mappings, and blocked SKUs. Safe to re-run.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="secret" className="text-sm font-medium">
              Admin secret
            </label>
            <input
              id="secret"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="ADMIN_SECRET"
              className="h-9 rounded-md border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <p className="text-xs text-muted-foreground">The value you set as ADMIN_SECRET in the project’s environment variables.</p>
          </div>

          <div>
            <Button variant="accent" onClick={run} disabled={status === "running" || !secret}>
              {status === "running" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Database className="h-4 w-4" aria-hidden />}
              {status === "running" ? "Initializing…" : "Initialize database"}
            </Button>
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {status === "done" && result && (
            <div className="flex items-start gap-2 rounded-md bg-exact/10 px-3 py-2 text-sm text-exact">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                Database ready — <span className="tnum font-medium">{result.archetypes}</span> archetypes,{" "}
                <span className="tnum font-medium">{result.approved}</span> approved mappings,{" "}
                <span className="tnum font-medium">{result.blocked}</span> blocked SKUs loaded. You can run matches now.
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
