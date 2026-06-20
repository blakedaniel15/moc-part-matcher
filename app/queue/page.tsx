import { ListChecks } from "lucide-react";
import { EmptyState } from "../../components/ui/empty-state";

export default function QueuePage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Approval queue</h2>
        <p className="mt-1 text-sm text-muted-foreground">Review fuzzy and AI matches before they’re saved.</p>
      </div>
      <EmptyState
        icon={<ListChecks className="h-6 w-6" aria-hidden />}
        title="Nothing to review"
        body="Matches that need a human decision will appear here after a run."
      />
    </div>
  );
}
