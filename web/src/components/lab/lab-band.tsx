"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The Speech tabs every speaker sees, in order. Record is the first tab and
 * its name: the people who have used it know it as Record.
 */
export const SPEECH_TABS = [
  { href: "/speak", label: "Record" },
  { href: "/speak/listen", label: "Listen" },
  { href: "/speak/check", label: "Check" },
  { href: "/speak/profile", label: "Profile" },
] as const;

/** The tabs only a researcher sees, after the four above. */
export const RESEARCHER_TABS = [
  { href: "/lab/speech/recordings", label: "Recordings" },
  { href: "/lab/speech/studio", label: "Studio" },
] as const;

/** Every tab a researcher's band carries. */
export const LAB_TABS = [...SPEECH_TABS, ...RESEARCHER_TABS] as const;
/** The tabs an annotator's band carries. */
export const SPEAK_TABS = SPEECH_TABS;

/**
 * Which tab a pathname belongs to. "/speak" matches only exactly (it is the
 * prefix of the others); every other tab matches its own sub-paths. The old
 * Record and Listen paths under /lab/speech are redirects, not tabs.
 */
export function activeSpeechTab(pathname: string): string | null {
  if (pathname === "/speak") return "/speak";
  for (const tab of LAB_TABS) {
    if (tab.href === "/speak") continue;
    if (pathname === tab.href || pathname.startsWith(`${tab.href}/`)) {
      return tab.href;
    }
  }
  return null;
}
export const activeLabTab = activeSpeechTab;
export const activeSpeakTab = activeSpeechTab;

/**
 * The one mark that says "this is Speech": a full-width ink band, 56px tall,
 * the same on every tab and for every role. Left, the word SPEECH; right, the
 * tab strip, which scrolls sideways on a narrow screen instead of wrapping.
 * Below it the page is the normal light surface.
 */
function Band({
  tabs,
  active,
}: {
  tabs: readonly { href: string; label: string }[];
  active: string | null;
}) {
  return (
    <header className="flex h-14 items-center justify-between gap-3 bg-foreground px-4 text-background sm:px-8">
      <span className="shrink-0 font-mono text-xs tracking-widest">SPEECH</span>
      <nav
        aria-label="Speech"
        className="flex min-w-0 items-center gap-1 overflow-x-auto"
      >
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active === tab.href ? "page" : undefined}
            className={`inline-flex min-h-[44px] shrink-0 cursor-pointer items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[var(--ring)] ${
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

/**
 * The Speech band: Record, Listen, Check, Profile for every speaker, and
 * Recordings and Studio after them for a researcher. One band for both roles.
 */
export function SpeechBand({ researcher = false }: { researcher?: boolean }) {
  const active = activeSpeechTab(usePathname());
  return <Band tabs={researcher ? LAB_TABS : SPEECH_TABS} active={active} />;
}

/** The band on the researcher-only pages (Recordings, Studio, Rights). */
export function LabBand() {
  return <SpeechBand researcher />;
}

/** The band on the /speak pages; a researcher gets their two extra tabs. */
export function SpeakBand({ researcher = false }: { researcher?: boolean }) {
  return <SpeechBand researcher={researcher} />;
}
