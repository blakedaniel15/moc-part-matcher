import * as XLSX from "xlsx";
import type { MatchResult } from "../engine/types";

export interface CandidateRow {
  "Dealer SKU": string;
  "DMS Name": string;
  "Suggested MOC #": string;
  "Suggested MOC Product": string;
  "Match Type": string;
  Confidence: string;
  Status: string;
}

const STATUS: Record<string, string> = { approve: "approved", reject: "rejected", correct: "corrected", add: "added" };

export function candidateRows(results: MatchResult[], decisions: Record<string, string>): CandidateRow[] {
  return results.map((r) => ({
    "Dealer SKU": r.sku,
    "DMS Name": r.partName,
    "Suggested MOC #": r.matchedPartNumber || "",
    "Suggested MOC Product": r.matchedArchetype ? r.matchedArchetype.replace(/^\d+\s*-\s*/, "") : "",
    "Match Type": r.matchType,
    Confidence: r.confidence || "",
    Status: STATUS[decisions[r.sku]] || "needs review",
  }));
}

export function downloadCandidates(rows: CandidateRow[], fileName: string): void {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Candidates");
  XLSX.writeFile(wb, fileName);
}
