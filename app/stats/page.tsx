import { BarChart3 } from "lucide-react";
import { EmptyState } from "../../components/ui/empty-state";

export default function StatsPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Accuracy &amp; stats</h2>
        <p className="mt-1 text-sm text-muted-foreground">How the matcher is performing over time.</p>
      </div>
      <EmptyState
        icon={<BarChart3 className="h-6 w-6" aria-hidden />}
        title="No runs recorded yet"
        body="Match-rate, exact-match percentage, and accuracy trends will show here after your first runs."
      />
    </div>
  );
}
