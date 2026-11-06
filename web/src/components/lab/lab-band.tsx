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

/** The four /speak tabs, in order: the speaker side of the lab, for annotators and researchers. */
export const SPEAK_TABS = [
  { href: "/speak", label: "Speak" },
  { href: "/speak/listen", label: "Listen" },
  { href: "/speak/check", label: "Check" },
  { href: "/speak/profile", label: "Profile" },
] as const;

/** Which /speak tab a pathname belongs to; "/speak" matches only exactly. */
export function activeSpeakTab(pathname: string): string | null {
  if (pathname === "/speak") return "/speak";
  for (const tab of SPEAK_TABS) {
    if (tab.href === "/speak") continue;
    if (pathname === tab.href || pathname.startsWith(`${tab.href}/`)) {
      return tab.href;
    }
  }
  return null;
}

/**
 * The one mark that says "this is the lab": a full-width ink band, 56px tall,
 * the same on all tabs. Left, a tag then a name; right, the tab strip. Below
 * it the page is the normal light surface.
 */
function Band({
  tag,
  name,
  label,
  tabs,
  active,
}: {
  tag: string;
  name: string;
  label: string;
  tabs: readonly { href: string; label: string }[];
  active: string | null;
}) {
  return (
    <header className="flex h-14 items-center justify-between gap-3 bg-foreground px-4 text-background sm:px-8">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs tracking-widest">{tag}</span>
        <span className="text-sm font-medium">{name}</span>
      </div>
      <nav aria-label={label} className="flex items-center gap-1">
        {tabs.map((tab) => (
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

/** The Lab band: LAB, Speech, then Record, Listen, Recordings. */
export function LabBand() {
  const active = activeLabTab(usePathname());
  return (
    <Band tag="LAB" name="Speech" label="Speech Lab" tabs={LAB_TABS} active={active} />
  );
}

/** The Speak band for /speak/*: Speak, Listen, Check, Profile. */
export function SpeakBand() {
  const active = activeSpeakTab(usePathname());
  return (
    <Band
      tag="SPEECH"
      name="Add your voice"
      label="Speech"
      tabs={SPEAK_TABS}
      active={active}
    />
  );
}
