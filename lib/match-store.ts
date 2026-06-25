import type { MatchResult } from "../engine/types";

const KEY = "moc:results";

export interface StoredRun {
  results: MatchResult[];
  dealerName: string;
  fileName: string;
  ranAt: string;
  runId: string;
  knownCount?: number; // SKUs skipped as already-known (gap mode)
  dealerKey?: string;
}

// Results are passed from the Upload screen to the Results screen via sessionStorage
// (a run is a short-lived client artifact; the durable record lives in the DB).
export function saveRun(run: StoredRun) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(run));
  } catch {
    /* sessionStorage unavailable */
  }
}

export function loadRun(): StoredRun | null {
  try {
    const s = sessionStorage.getItem(KEY);
    return s ? (JSON.parse(s) as StoredRun) : null;
  } catch {
    return null;
  }
}

export function clearRun() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* sessionStorage unavailable */
  }
}
