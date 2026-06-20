import { Table2 } from "lucide-react";
import { EmptyState } from "../../components/ui/empty-state";

export default function ResultsPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Results</h2>
        <p className="mt-1 text-sm text-muted-foreground">Matched parts from your most recent run.</p>
      </div>
      <EmptyState
        icon={<Table2 className="h-6 w-6" aria-hidden />}
        title="No results yet"
        body="Upload a dealer parts file and run a match to see results here."
      />
    </div>
  );
}
