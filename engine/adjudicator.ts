import type { Part } from "./types";

export interface AdjudicationVerdict {
  sku: string;
  matched: boolean;
  mocPartNumber: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW" | null;
  reason: string;
}

// The AI step is reachable ONLY through this interface. The engine never performs
// network I/O itself — prod injects an Anthropic-backed adjudicator (Plan 2),
// tests/eval inject the RecordedAdjudicator below.
export interface Adjudicator {
  adjudicate(parts: Part[]): Promise<AdjudicationVerdict[]>;
}

// Replays canned verdicts keyed by SKU. Deterministic, offline, free.
export class RecordedAdjudicator implements Adjudicator {
  constructor(private records: Record<string, AdjudicationVerdict>) {}
  async adjudicate(parts: Part[]): Promise<AdjudicationVerdict[]> {
    return parts.map(
      (p) =>
        this.records[p.sku] ?? {
          sku: p.sku,
          matched: false,
          mocPartNumber: null,
          confidence: null,
          reason: "No recorded verdict",
        }
    );
  }
}
