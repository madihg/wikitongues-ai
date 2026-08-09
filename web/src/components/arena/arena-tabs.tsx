"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ARENA_TABS, ARENA_EXIT, isTabActive } from "./arena-nav";

/**
 * Persistent tab bar across every Model Arena page. Same active-state treatment
 * as the rest of the app's tabs (accent underline + accent text). Scrolls
 * horizontally on narrow screens rather than wrapping into a ragged block.
 */
export function ArenaTabs() {
  const pathname = usePathname() ?? "";

  return (
    <div className="mb-6 border-b border-border">
      <nav
        aria-label="Model Arena sections"
        className="-mb-px flex items-stretch gap-1 overflow-x-auto"
      >
        {ARENA_TABS.map((tab) => {
          const active = isTabActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              title={tab.hint}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "border-accent text-accent-text"
                  : "border-transparent text-text-tertiary hover:border-border-strong hover:text-text-secondary"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}

        <Link
          href={ARENA_EXIT.href}
          title={ARENA_EXIT.hint}
          className="ml-auto whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm text-text-muted transition-colors hover:text-text-secondary"
        >
          &larr; {ARENA_EXIT.label}
        </Link>
      </nav>
    </div>
  );
}
