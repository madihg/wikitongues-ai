"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useSpeechLayer } from "@/components/lab/use-speech-layer";
import { canProbeSpeech } from "@/lib/lab-flags";
import { navForRole, activeNavHref, isOwner } from "@/lib/personas";
import { activeResearchHref, PEOPLE_HREF } from "@/lib/admin/routes";
import { useResearchLead } from "@/components/admin/use-research-lead";

export function Sidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  // Researchers and annotators ask the server once on mount; the answer is
  // false for an annotator until SPEECH_LAYER_ANNOTATORS is set.
  const labOn = useSpeechLayer(canProbeSpeech(session?.user?.role));

  // People is for research leads. The owner is one; another researcher asks
  // the server once. An annotator never asks.
  const ownerNow = isOwner(session?.user?.email);
  const askedLead = useResearchLead(
    session?.user?.role === "RESEARCHER" && !ownerNow,
  );
  const lead = ownerNow || askedLead;

  if (!session) return null;

  const { role, email } = session.user;
  const links = navForRole(role, email, { lab: labOn });
  const mainLinks = links.filter((l) => !l.group);
  const labLinks = links.filter((l) => l.group === "lab");
  // Below the divider: the five research views, then More. Researchers only.
  const researchLinks = links.filter(
    (l) => l.group === "research" && (lead || l.href !== PEOPLE_HREF),
  );
  const moreLinks = links.filter((l) => l.group === "more");
  const owner = isOwner(email);

  const roleLabel = owner
    ? "Owner"
    : role.charAt(0) + role.slice(1).toLowerCase();

  // Longest-prefix match so nested links (e.g. Speakers' Verdict under
  // /admin/arena) highlight exactly one entry, never their parent too.
  // A research page belongs to exactly one of the views below the divider
  // (a tab or an archived page lights its view, not a link of its own).
  const activeHref =
    (researchLinks.length > 0 ? activeResearchHref(pathname) : null) ??
    activeNavHref(links, pathname);

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-surface">
      <div className="border-b border-border px-6 py-5">
        <h1 className="text-lg text-text-primary">Wikitongues AI</h1>
        <p className="mt-1 text-sm text-text-tertiary">Igala language pilot</p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {mainLinks.map((link) => {
          const base =
            "flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors";
          // Out-links leave the app: new tab, rel-guarded, arrow-marked, and
          // a plain anchor rather than next/link (nothing to prefetch).
          if (link.external) {
            return (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`${base} text-text-secondary hover:bg-surface-sunken hover:text-text-primary`}
              >
                {link.label}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  className="shrink-0"
                >
                  <path
                    d="M7 17L17 7M17 7H8M17 7v9"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            );
          }
          const isActive = activeHref === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`${base} ${
                isActive
                  ? "bg-accent-subtle text-accent-text"
                  : "text-text-secondary hover:bg-surface-sunken hover:text-text-primary"
              }`}
            >
              {link.label}
            </Link>
          );
        })}

        {/* Lab group: a divider, a heading, then the lab links. Only present
            when the server flag is on and the account is a researcher. */}
        {labLinks.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <div className="px-3 pb-2 font-mono text-xs uppercase tracking-widest text-text-muted">
              Lab
            </div>
            {labLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  activeHref === link.href
                    ? "bg-accent-subtle text-accent-text"
                    : "text-text-secondary hover:bg-surface-sunken hover:text-text-primary"
                }`}
              >
                {link.label}
                {link.tag && (
                  <span className="font-mono text-[10px] font-normal text-text-tertiary">
                    {link.tag}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}

        {/* Research: the five views a researcher works from, then More
            (tools, the owner's "View as" switcher, and the archive). */}
        {researchLinks.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <div className="px-3 pb-2 font-mono text-xs uppercase tracking-widest text-text-muted">
              Research
            </div>
            {researchLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                title={link.question}
                aria-current={activeHref === link.href ? "page" : undefined}
                className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  activeHref === link.href
                    ? "bg-accent-subtle text-accent-text"
                    : "text-text-secondary hover:bg-surface-sunken hover:text-text-primary"
                }`}
              >
                {link.label}
              </Link>
            ))}
            {moreLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                title={link.question}
                aria-current={activeHref === link.href ? "page" : undefined}
                className={`mt-3 block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  activeHref === link.href
                    ? "bg-accent-subtle text-accent-text"
                    : "text-text-tertiary hover:bg-surface-sunken hover:text-text-primary"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div className="border-t border-border px-6 py-4">
        <div className="text-sm font-medium text-text-primary">
          {session.user.name || session.user.email}
        </div>
        <div className="text-xs text-text-tertiary">{roleLabel}</div>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="mt-3 cursor-pointer text-sm text-text-tertiary transition-colors hover:text-text-primary"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
