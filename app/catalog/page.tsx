import { BookText } from "lucide-react";
import { EmptyState } from "../../components/ui/empty-state";

export default function CatalogPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Archetype catalog</h2>
        <p className="mt-1 text-sm text-muted-foreground">The 206 MOC products we match against.</p>
      </div>
      <EmptyState
        icon={<BookText className="h-6 w-6" aria-hidden />}
        title="Catalog loads from the database"
        body="Once the database is connected, browse and search every MOC archetype here."
      />
    </div>
  );
}
