"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Upload, Table2, ListChecks, BookText, BarChart3 } from "lucide-react";
import { cn } from "../../lib/utils";

const NAV = [
  { href: "/", label: "Upload", icon: Upload },
  { href: "/results", label: "Results", icon: Table2 },
  { href: "/queue", label: "Queue", icon: ListChecks },
  { href: "/catalog", label: "Catalog", icon: BookText },
  { href: "/stats", label: "Stats", icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r bg-card md:flex">
      <div className="flex h-14 items-center gap-2 border-b px-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          MP
        </span>
        <span className="text-sm font-semibold tracking-tight">Part Matcher</span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-4 text-xs text-muted-foreground">
        <span className="font-semibold text-accent">EZ Wins</span> internal tool
      </div>
    </aside>
  );
}
