export type DmsType = "R&R" | "CDK";
export type StructuralLabel = "STRONG" | "POSSIBLE" | "UNLIKELY";
export type Confidence = "EXACT" | "HIGH" | "MEDIUM" | "LOW";
export type MatchType = "EXACT" | "FUZZY" | "AI" | "UNMATCHED";

export interface Structural {
  score: 0 | 1 | 2;
  label: StructuralLabel;
  detail: string;
}

export interface Part {
  sku: string;
  partName: string;
  makeCode: string | null;
  barePartNumber: string;
  dmsType: DmsType;
  structural: Structural;
}

export interface Archetype {
  barePartNumber: string;
  manufacturerPart: string;
  incentive: number;
}

export interface ApprovedMapping {
  dmsSku: string;
  dmsPartName: string;
  barePartNumber: string;
  manufacturerPart: string;
  incentive: number;
}

export interface MatchResult extends Part {
  matchType: MatchType;
  matchedArchetype: string | null;
  matchedPartNumber: string | null;
  confidence: Confidence | null;
  reason: string;
  incentive: number | null;
}
