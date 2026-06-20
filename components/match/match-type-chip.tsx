import { cn } from "../../lib/utils";

type MatchType = "EXACT" | "FUZZY" | "AI" | "UNMATCHED";

// The match-type color language — one of the two signature elements. Each type
// owns a color (emerald / amber / violet / slate) used consistently everywhere.
const STYLES: Record<MatchType, string> = {
  EXACT: "bg-exact/10 text-exact ring-exact/20",
  FUZZY: "bg-fuzzy/10 text-fuzzy ring-fuzzy/20",
  AI: "bg-ai/10 text-ai ring-ai/20",
  UNMATCHED: "bg-unmatched/10 text-unmatched ring-unmatched/20",
};

export function MatchTypeChip({ type }: { type: MatchType }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        STYLES[type]
      )}
    >
      {type}
    </span>
  );
}
