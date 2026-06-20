export function Topbar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card/80 px-6 backdrop-blur lg:px-8">
      <div className="flex flex-col">
        <h1 className="text-sm font-semibold leading-none tracking-tight">MOC Part Matcher</h1>
        <p className="mt-1 text-xs text-muted-foreground">Dealer DMS → MOC archetype identification</p>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="hidden sm:inline">206 archetypes</span>
      </div>
    </header>
  );
}
