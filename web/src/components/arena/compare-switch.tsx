"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { COMPARE_MODES } from "./arena-nav";

/**
 * The two ways to read models side by side, as one switch at the top of the
 * Compare tab: ask them a question, or walk two of them through the frozen
 * prompts. Each mode is its old page at its old address.
 */
export function CompareSwitch() {
  const pathname = usePathname() ?? "";
  return (
    <div
      role="group"
      aria-label="How to compare"
      className="mb-6 inline-flex rounded-md border border-border bg-surface p-0.5"
    >
      {COMPARE_MODES.map((m) => {
        const active = pathname === m.href || pathname.startsWith(`${m.href}/`);
        return (
          <Link
            key={m.href}
            href={m.href}
            aria-current={active ? "page" : undefined}
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-accent-subtle text-accent-text"
                : "text-text-tertiary hover:text-text-primary"
            }`}
          >
            {m.label}
          </Link>
        );
      })}
    </div>
  );
}
