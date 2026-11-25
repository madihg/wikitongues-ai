/**
 * Information architecture per persona.
 *
 * - Learner: the chat tutor only.
 * - Annotator (Agnes's team): annotate - pairwise, rubric, edits. They do NOT
 *   manage the prompt catalogue, the handoff review queue, or the researcher tools.
 * - Researcher (linguists, advisory council): everything.
 *
 * The owner account (Halim) can act as all three personas via a switcher.
 */

import { canUseLab } from "@/lib/lab-flags";
import {
  researchLinks,
  TONE_PASS_HREF,
  TONE_PASS_LABEL,
} from "@/lib/admin/routes";

export const OWNER_EMAILS = ["madihalim@gmail.com"];

export function isOwner(email?: string | null): boolean {
  return !!email && OWNER_EMAILS.includes(email.toLowerCase());
}

/** A persona's full route access, with the owner able to do anything. */
export function canAccess(
  allowedRoles: string[],
  role?: string | null,
  email?: string | null,
): boolean {
  if (isOwner(email)) return true;
  return !!role && allowedRoles.includes(role);
}

export function isResearcher(
  role?: string | null,
  email?: string | null,
): boolean {
  return canAccess(["RESEARCHER"], role, email);
}

/**
 * The public "How it works" page lives on the marketing site, not in the app.
 * It is the canonical plain-language explainer (same live numbers, fetched
 * from /api/public/method-metrics), so the nav sends people there rather than
 * maintaining a second telling. Since 2026-10-10 the in-app routes
 * (/how-it-works and /admin/how-it-works) are redirects to it and nothing else.
 * One constant so nav, in-page CTAs, the redirects and tests cannot drift apart.
 */
// Since Nov 17 2026 the site is one page: the old /how-it-works/ page is
// gone, so this points at the page itself.
export const PUBLIC_HOW_IT_WORKS_URL = "https://wikitongues-ai-site.vercel.app/";

export interface NavLink {
  href: string;
  label: string;
  /** Renders as an out-link: new tab, rel-guarded, arrow-marked, never active. */
  external?: boolean;
  /**
   * Sidebar group. No group: the work links every account starts with
   * (Dashboard, Annotate, Speech, My Work, Rubric), in that order. "research":
   * the five researcher views, rendered after a divider under their own
   * heading. "more": the single More entry that closes the list.
   */
  group?: "research" | "more";
  /** The one question a research view answers. Shown as the link's tooltip. */
  question?: string;
  /** What is waiting behind this link. Absent when it is zero or not known. */
  count?: number;
  /**
   * Other path prefixes this link owns, so it stays highlighted on them
   * (Speech owns /lab/speech, where Recordings and Studio still live).
   */
  also?: string[];
}

/** Server-derived switches that change the nav. Passed in so navForRole stays pure. */
export interface NavOptions {
  /**
   * The speech layer is on for this account: the lab flag AND either a
   * researcher, or an annotator with the annotator layer flag on (the server
   * decides, via /api/lab/flags, and answers false for an annotator while the
   * layer flag is unset, so an annotator's nav is unchanged until then).
   */
  lab?: boolean;
  /** What is waiting, per kind of work. A number shows only above zero. */
  waiting?: { annotate?: number; speech?: number; fix?: number };
  /**
   * Tone-mark pass 2: how many items wait for this person. Set only when the
   * server says the person has been given tone items (waiting or done);
   * otherwise absent, and the nav has no such line.
   */
  tone?: number | null;
}

/** The Pass 2 line. It sits right after Annotate and the Speech link. */
export const TONE_NAV_HREF = "/annotator/tone";

/**
 * The researcher's view of the tone pass (/admin/tone). Not a sidebar line:
 * it is linked from the Data view, on Disagreements, under this label.
 */
export const TONE_ADMIN_LINK: NavLink = {
  href: TONE_PASS_HREF,
  label: TONE_PASS_LABEL,
};

/** A link with its waiting number, or the bare link when nothing waits. */
function withCount(link: NavLink, n: number | undefined): NavLink {
  return typeof n === "number" && n > 0 ? { ...link, count: n } : link;
}

/**
 * The Speech pages (Record, Listen, Check, Profile, and for researchers
 * Recordings and Studio). Not a sidebar line since 2026-11-24: the work on
 * them is a tab of Annotate now. The pages still open; researchers reach the
 * tools from More (Speech tools).
 */
export const SPEECH_LINK: NavLink = {
  href: "/speak",
  label: "Speech",
  also: ["/lab/speech"],
};

/**
 * The work links, the first lines of every sidebar, in a fixed order:
 * Dashboard, Annotate, My Work, Rubric. Since 2026-11-24 every kind of work
 * lives inside Annotate as a tab (components/work/work-flow.tsx): recording,
 * checking clips, tone marks, writing and comparing, listening. Halim, on
 * the call that day: "the task itself can change, but I don't want them to
 * go to different tabs on the left-hand side". So the Speech and "Pass 2:
 * tone marks" lines are gone, and Annotate's number is everything waiting
 * in it: prompts to answer, plus clips to record, check and hear when speech
 * is on, plus tone items given to the person.
 */
function workLinks(speechOn: boolean, options: NavOptions): NavLink[] {
  const w = options.waiting;
  // The parts that are known; no number at all when none is.
  const known = [w?.annotate, speechOn ? w?.speech : undefined, options.tone]
    .filter((n): n is number => typeof n === "number");
  const inAnnotate = known.length
    ? known.reduce((sum, n) => sum + n, 0)
    : undefined;
  return [
    { href: "/annotator", label: "Dashboard" },
    withCount(ANNOTATE_LINK, inAnnotate),
    // Answers of their own that need a fix.
    withCount({ href: "/annotator/history", label: "My Work" }, w?.fix),
    { href: "/annotator/rubric", label: "Rubric" },
  ];
}

/**
 * The one work link. It owns the old addresses of the work that moved into
 * it, so it stays lit there: the Pass 2 page (a redirect now) and the Speech
 * pages, which still open for anyone who has them bookmarked.
 */
export const ANNOTATE_LINK: NavLink = {
  href: "/annotator/annotate",
  label: "Annotate",
  also: [TONE_NAV_HREF, "/speak", "/lab/speech"],
};

/**
 * Primary sidebar nav for the (app) area. Every account starts with the same
 * work links in the same order. Annotators get only those; researchers (and
 * the owner) get the five research views and More after them, below a
 * divider.
 *
 * Speech is one link for every role (2026-11-13): Agnes looked for speech
 * next to her other work and did not find it under "Lab". The Lab group, its
 * "researchers only" tag and the three separate Speak, Listen and Check links
 * are gone; those are tabs inside Speech now.
 */
export function navForRole(
  role?: string | null,
  email?: string | null,
  options: NavOptions = {},
): NavLink[] {
  if (isResearcher(role, email)) {
    // The lab ships dark: the link exists only when the server says the flag
    // is on and the account holds the researcher role.
    const speechOn = !!options.lab && canUseLab(role);
    // Below the divider: five views and More (src/lib/admin/routes.ts owns
    // that list). Prompts, Corrections, Review queue, Annotations, Speakers'
    // Verdict, Model Arena, How it works, the speech loop and Tone agreement
    // are all still reachable, inside a view or under More.
    return [
      ...workLinks(speechOn, options),
      ...researchLinks({ speech: speechOn }),
    ];
  }
  // Pure annotator. NO Corrections tab (2026-08-28 rework, Halim's call):
  // corrections happen inside the episode, right after the A/B verdict - a
  // separate lane made "fix it" a different errand from "judge it", and the
  // errand never got run. /annotator/corrections redirects annotators into
  // the annotate flow; the API routes and researcher lane stay.
  // Speech sits right after Annotate once the annotator layer is on. Off,
  // nothing changes.
  return workLinks(!!options.lab && role === "ANNOTATOR", options);
}

/**
 * Which sidebar link owns a pathname: exact match wins, otherwise the LONGEST
 * link href (or other prefix the link owns, `also`) that prefixes the pathname
 * (at a path-segment boundary). The two
 * role dashboards ("/annotator", "/admin") only match exactly - every one of
 * their sub-pages has, or belongs to, its own link. Longest-prefix keeps
 * nested entries honest: /admin/arena/verdict highlights Speakers' Verdict,
 * not Model Arena as well.
 */
export function activeNavHref(
  links: NavLink[],
  pathname: string,
): string | null {
  let best: string | null = null;
  let bestLength = 0;
  for (const { href, external, also } of links) {
    // An out-link is never the active page: the reader left the app.
    if (external) continue;
    if (pathname === href) return href;
    if (href === "/annotator" || href === "/admin") continue;
    // The link's own path, then any other prefix it owns.
    for (const prefix of [href, ...(also ?? [])]) {
      if (
        (pathname === prefix || pathname.startsWith(`${prefix}/`)) &&
        prefix.length > bestLength
      ) {
        best = href;
        bestLength = prefix.length;
      }
    }
  }
  return best;
}

export interface Persona {
  key: "learner" | "annotator" | "researcher";
  label: string;
  href: string;
  blurb: string;
}

/** The three persona entry points, for the owner's "View as" switcher. */
export const PERSONAS: Persona[] = [
  {
    key: "learner",
    label: "Learner",
    href: "/learner",
    blurb: "The Igala chat tutor",
  },
  {
    key: "annotator",
    label: "Annotator",
    href: "/annotator/annotate",
    blurb: "Compare, score, correct",
  },
  {
    key: "researcher",
    label: "Researcher",
    href: "/admin/arena",
    blurb: "Arena, prompts, exports",
  },
];
