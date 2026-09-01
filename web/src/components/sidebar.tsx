"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  navForRole,
  activeNavHref,
  isOwner,
  isResearcher,
  PERSONAS,
} from "@/lib/personas";

export function Sidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  if (!session) return null;

  const { role, email } = session.user;
  const links = navForRole(role, email);
  const owner = isOwner(email);
  const researcher = isResearcher(role, email);

  const roleLabel = owner
    ? "Owner"
    : role.charAt(0) + role.slice(1).toLowerCase();

  // Longest-prefix match so nested links (e.g. Speakers' Verdict under
  // /admin/arena) highlight exactly one entry, never their parent too.
  const activeHref = activeNavHref(links, pathname);

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-surface">
      <div className="border-b border-border px-6 py-5">
        <h1 className="text-lg text-text-primary">Wikitongues AI</h1>
        <p className="mt-1 text-sm text-text-tertiary">Igala language pilot</p>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {links.map((link) => {
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

        {/* Owner-only persona switcher: act as any of the three personas. */}
        {owner && (
          <div className="mt-6 border-t border-border pt-4">
            <div className="px-3 pb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
              View as
            </div>
            {PERSONAS.map((p) => (
              <Link
                key={p.key}
                href={p.href}
                className="block rounded-md px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary"
                title={p.blurb}
              >
                {p.label}
              </Link>
            ))}
          </div>
        )}

        {/* Researchers (non-owner) get a quick link to the learner tutor too. */}
        {researcher && !owner && (
          <div className="mt-6 border-t border-border pt-4">
            <Link
              href="/learner/chat"
              className="block rounded-md px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text-primary"
            >
              Learner tutor
            </Link>
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
