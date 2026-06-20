import { cn } from "../../lib/utils";

type Confidence = "EXACT" | "HIGH" | "MEDIUM" | "LOW" | null;

// The 4-dot confidence meter — the second signature element. Filled dots encode
// strength; the fill color reuses the match-type language (exact = blue ink).
const LEVEL: Record<NonNullable<Confidence>, { dots: number; color: string; label: string }> = {
  EXACT: { dots: 4, color: "bg-accent", label: "Exact" },
  HIGH: { dots: 3, color: "bg-exact", label: "High" },
  MEDIUM: { dots: 2, color: "bg-fuzzy", label: "Medium" },
  LOW: { dots: 1, color: "bg-ai", label: "Low" },
};

export function ConfidenceMeter({ confidence }: { confidence: Confidence }) {
  if (!confidence) return <span className="text-xs text-muted-foreground">—</span>;
  const { dots, color, label } = LEVEL[confidence];
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`Confidence: ${label}`} title={label}>
      <span className="flex items-center gap-0.5" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn("h-1.5 w-1.5 rounded-full", i < dots ? color : "bg-muted")} />
        ))}
      </span>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </span>
  );
}
