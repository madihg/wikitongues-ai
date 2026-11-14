"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  useSpeechLayer,
  useSpeechWaiting,
} from "@/components/lab/use-speech-layer";
import { useToneCount } from "@/components/tone/use-tone-count";
import { canProbeSpeech } from "@/lib/lab-flags";
import {
  navForRole,
  activeNavHref,
  isOwner,
  type NavLink,
} from "@/lib/personas";
import { activeResearchHref, PEOPLE_HREF } from "@/lib/admin/routes";
import { useResearchLead } from "@/components/admin/use-research-lead";

/** One sidebar line: an in-app link (with its waiting number) or an out-link. */
function SidebarLink({ link, active }: { link: NavLink; active: boolean }) {
  const base =
    "flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors max-[899px]:min-h-11";
  // Out-links leave the app: new tab, rel-guarded, arrow-marked, and
  // a plain anchor rather than next/link (nothing to prefetch).
  if (link.external) {
    return (
      <a
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
  return (
    <Link
      href={link.href}
      className={`${base} justify-between ${
        active
          ? "bg-accent-subtle text-accent-text"
          : "text-text-secondary hover:bg-surface-sunken hover:text-text-primary"
      }`}
    >
      {link.label}
      {/* What is waiting. No number when it is zero. */}
      {link.count !== undefined && (
        <span
          data-testid="nav-count"
          className="font-mono text-xs font-normal tabular-nums text-text-tertiary"
        >
          {link.count}
          <span className="sr-only"> waiting</span>
        </span>
      )}
    </Link>
  );
}

/**
 * What a key does inside the open phone menu. Escape closes it. Tab on the
 * last stop goes to the first and Shift+Tab on the first goes to the last, so
 * focus never leaves the menu while it is open. Anything else is left alone
 * (null). `index` is the focused stop, -1 when focus is not on one.
 */
export function drawerKeyStep(
  key: string,
  shift: boolean,
  index: number,
  count: number,
): "close" | number | null {
  if (key === "Escape") return "close";
  if (key !== "Tab" || count === 0) return null;
  if (shift) return index <= 0 ? count - 1 : null;
  return index === count - 1 || index === -1 ? 0 : null;
}

/**
 * The phone menu: the same links as the desktop sidebar, in a panel that
 * slides over the page. A modal dialog: focus moves into it, Tab stays inside
 * it, Escape or the scrim closes it, and focus goes back to the menu button.
 */
function NavDrawer({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    close.current?.focus();
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Escape" && e.key !== "Tab") return;
    const stops = panel.current
      ? [...panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")]
      : [];
    const step = drawerKeyStep(
      e.key,
      e.shiftKey,
      stops.indexOf(document.activeElement as HTMLElement),
      stops.length,
    );
    if (step === "close") {
      e.stopPropagation();
      onClose();
    } else if (step !== null) {
      e.preventDefault();
      stops[step].focus();
    }
  }

  return (
    <div className="fixed inset-0 z-40 min-[900px]:hidden">
      <div
        data-testid="nav-scrim"
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/40"
      />
      <div
        ref={panel}
        id="app-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        onKeyDown={onKeyDown}
        className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-surface shadow-lg"
      >
        <button
          ref={close}
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 flex h-12 w-12 cursor-pointer items-center justify-center rounded-md text-text-primary hover:bg-surface-sunken"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="sr-only">Close menu</span>
        </button>
        {children}
      </div>
    </div>
  );
}

export function Sidebar({
  initialMenuOpen = false,
}: { initialMenuOpen?: boolean } = {}) {
  const { data: session } = useSession();
  const pathname = usePathname();
  // Researchers and annotators ask the server once on mount; the answer is
  // false for an annotator until SPEECH_LAYER_ANNOTATORS is set.
  const labOn = useSpeechLayer(canProbeSpeech(session?.user?.role));
  // How many of the account's own answers still wait for a clip. Asked only
  // once speech is on, so an account without speech makes no such request.
  const speechWaiting = useSpeechWaiting(labOn);
  // Tone-mark pass 2: the line shows only for a person who was given items.
  const tone = useToneCount(canProbeSpeech(session?.user?.role));

  // People is for research leads. The owner is one; another researcher asks
  // the server once. An annotator never asks.
  const ownerNow = isOwner(session?.user?.email);
  const askedLead = useResearchLead(
    session?.user?.role === "RESEARCHER" && !ownerNow,
  );
  const lead = ownerNow || askedLead;

  // The phone menu. It remembers the page it was opened on, so it is closed
  // again as soon as the page changes. Closing it by hand sends focus back to
  // the button that opened it.
  const [openedOn, setOpenedOn] = useState<string | null>(
    initialMenuOpen ? pathname : null,
  );
  const menuOpen = openedOn !== null && openedOn === pathname;
  const menuButton = useRef<HTMLButtonElement>(null);
  function closeMenu() {
    setOpenedOn(null);
    menuButton.current?.focus();
  }

  if (!session) return null;

  const { role, email } = session.user;
  const links = navForRole(role, email, {
    lab: labOn,
    waiting: { speech: speechWaiting },
    tone,
  });
  // The work links every account shares come first; the researcher tools
  // follow a divider. There is no "Lab" group: Speech is a work link.
  const workLinks = links.filter((l) => !l.group);
  // Below the divider. People is for research leads only.
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

  // Brand, links and account: the same three blocks in the desktop sidebar
  // and in the phone drawer.
  const body = (
    <>
      <div className="border-b border-border px-6 py-5">
        <h1 className="text-lg text-text-primary">Wikitongues AI</h1>
        <p className="mt-1 text-sm text-text-tertiary">Igala language pilot</p>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {workLinks.map((link) => (
          <SidebarLink
            key={link.href}
            link={link}
            active={activeHref === link.href}
          />
        ))}

        {/* Research: a divider, then the views a researcher works from,
            then More (tools, the owner's "View as" switcher, the archive). */}
        {researchLinks.length > 0 && (
          <div
            data-testid="research-links"
            className="mt-4 space-y-1 border-t border-border pt-4"
          >
            <div className="px-3 pb-1 font-mono text-xs uppercase tracking-widest text-text-muted">
              Research
            </div>
            {researchLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                title={link.question}
                aria-current={activeHref === link.href ? "page" : undefined}
                className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors max-[899px]:flex max-[899px]:min-h-11 max-[899px]:items-center ${
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
                className={`!mt-3 block rounded-md px-3 py-2 text-sm font-medium transition-colors max-[899px]:flex max-[899px]:min-h-11 max-[899px]:items-center ${
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
          className="mt-3 cursor-pointer text-sm text-text-tertiary transition-colors hover:text-text-primary max-[899px]:min-h-11"
        >
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Under 900px: a top bar with the menu button. The page gets the full width. */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface pl-4 pr-1 min-[900px]:hidden">
        <div>
          <p className="text-base font-semibold leading-tight text-text-primary">
            Wikitongues AI
          </p>
          <p className="text-xs leading-tight text-text-tertiary">
            Igala language pilot
          </p>
        </div>
        <button
          ref={menuButton}
          type="button"
          aria-expanded={menuOpen}
          aria-controls="app-nav-drawer"
          onClick={() => setOpenedOn(pathname)}
          className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-md text-text-primary hover:bg-surface-sunken"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="sr-only">Open menu</span>
        </button>
      </header>
      {menuOpen && <NavDrawer onClose={closeMenu}>{body}</NavDrawer>}

      {/* From 900px: the sidebar, as it has always been. */}
      <aside className="hidden h-screen w-64 flex-col border-r border-border bg-surface min-[900px]:flex">
        {body}
      </aside>
    </>
  );
}
