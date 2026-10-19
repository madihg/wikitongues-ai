"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The three Lab Speech tabs, in order. Nested routes under /lab/speech. */
export const LAB_TABS = [
  { href: "/lab/speech", label: "Record" },
  { href: "/lab/speech/listen", label: "Listen" },
  { href: "/lab/speech/recordings", label: "Recordings" },
] as const;

/**
 * Which tab a pathname belongs to. "/lab/speech" matches only exactly (it is
 * the prefix of the others); the other two match their own sub-paths.
 */
export function activeLabTab(pathname: string): string | null {
  if (pathname === "/lab/speech") return "/lab/speech";
  for (const tab of LAB_TABS) {
    if (tab.href === "/lab/speech") continue;
    if (pathname === tab.href || pathname.startsWith(`${tab.href}/`)) {
      return tab.href;
    }
  }
  return null;
}

/**
 * The one mark that says "this is the lab": a full-width ink band, 56px tall,
 * the same on all three tabs. Left, "LAB" then "Speech"; right, the tab
 * strip. Below it the page is the normal light surface.
 */
export function LabBand() {
  const pathname = usePathname();
  const active = activeLabTab(pathname);
  return (
    <header className="flex h-14 items-center justify-between gap-3 bg-foreground px-4 text-background sm:px-8">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs tracking-widest">LAB</span>
        <span className="text-sm font-medium">Speech</span>
      </div>
      <nav aria-label="Speech Lab" className="flex items-center gap-1">
        {LAB_TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active === tab.href ? "page" : undefined}
            className={`inline-flex min-h-[44px] cursor-pointer items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[var(--ring)] ${
              active === tab.href
                ? "bg-background/15 text-background"
                : "text-background/70 hover:bg-background/10 hover:text-background"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
