import Link from "next/link";
import { requireResearcherPage } from "@/lib/admin/page-gate";
import { TOOLS } from "@/lib/admin/routes";
import { PERSONAS, PUBLIC_HOW_IT_WORKS_URL } from "@/lib/personas";

/**
 * More: everything a researcher can still reach that is not one of the five
 * views. Two lists. Tools are used a few times a month. The archive holds
 * pages that are kept as they were, each with one sentence saying why it left
 * the main list. Nothing here was deleted and every link opens the old page
 * unchanged.
 */
export const dynamic = "force-dynamic";

const row =
  "flex flex-col gap-0.5 px-5 py-3.5 transition-colors hover:bg-surface-sunken sm:flex-row sm:items-baseline sm:gap-4";

export default async function MorePage() {
  const who = await requireResearcherPage();

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary">More</h1>
        <p className="mt-2 text-sm text-text-tertiary">
          Tools you need now and then, and the pages we keep but no longer use
          every week.
        </p>
      </div>

      <section aria-labelledby="more-tools">
        <h2
          id="more-tools"
          className="font-mono text-xs uppercase tracking-widest text-text-muted"
        >
          Tools
        </h2>
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface">
          {TOOLS.map((t) => (
            <li key={t.href}>
              <Link href={t.href} className={row}>
                <span className="w-44 shrink-0 text-sm font-medium text-accent-text">
                  {t.label}
                </span>
                <span className="text-sm text-text-secondary">
                  {t.sentence}
                </span>
              </Link>
            </li>
          ))}
          <li>
            <a
              href={PUBLIC_HOW_IT_WORKS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={row}
            >
              <span className="w-44 shrink-0 text-sm font-medium text-accent-text">
                Public site
                <span className="sr-only"> (opens in a new tab)</span>
              </span>
              <span className="text-sm text-text-secondary">
                The one page that explains the project to everyone else.
              </span>
            </a>
          </li>
          {who.owner && (
            <li className="px-5 py-3.5">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
                <span className="w-44 shrink-0 text-sm font-medium text-text-primary">
                  View as
                </span>
                <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {PERSONAS.map((p) => (
                    <Link
                      key={p.key}
                      href={p.href}
                      title={p.blurb}
                      className="font-medium text-accent-text"
                    >
                      {p.label}
                    </Link>
                  ))}
                  <span className="text-text-tertiary">
                    See the platform as each kind of account sees it.
                  </span>
                </span>
              </div>
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
