"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isViewTabActive, type ViewTab } from "@/lib/admin/routes";

/**
 * The tab bar inside a research view. Same treatment everywhere (accent
 * underline, accent text), so Data, Text model and Speech model read as one
 * family. Scrolls sideways on a narrow screen instead of wrapping.
 */
export function ViewTabs({
  tabs,
  label,
}: {
  tabs: ViewTab[];
  /** Names the nav for a screen reader, for example "Data sections". */
  label: string;
}) {
  const pathname = usePathname() ?? "";

  return (
    <div className="mb-6 border-b border-border">
      <nav
        aria-label={label}
        className="-mb-px flex items-stretch gap-1 overflow-x-auto"
      >
        {tabs.map((tab) => {
          const active = isViewTabActive(pathname, tab);
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
      </nav>
    </div>
  );
}
