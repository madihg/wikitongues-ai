import Link from "next/link";
import type { NeedsYouLine } from "@/lib/admin/today";

/**
 * "Needs you": one sentence per line, the number first, then a link of two
 * or three words. A line is only here because its number crossed its
 * threshold, and when no line qualifies the block is not drawn at all.
 */
export function NeedsYou({ lines }: { lines: NeedsYouLine[] }) {
  if (lines.length === 0) return null;
  return (
    <section aria-labelledby="needs-you">
      <h2
        id="needs-you"
        className="font-mono text-xs uppercase tracking-widest text-text-muted"
      >
        Needs you
      </h2>
      <ul className="mt-3 divide-y divide-border rounded-lg border border-warning bg-warning-subtle">
        {lines.map((l) => (
          <li
            key={l.key}
            className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-3"
          >
            <span className="whitespace-pre-line text-sm text-text-primary">
              {l.text}
            </span>
            <Link
              href={l.href}
              className="shrink-0 text-sm font-medium text-accent-text"
            >
              {l.linkLabel}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
