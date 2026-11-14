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
export const PUBLIC_HOW_IT_WORKS_URL =
  "https://wikitongues-ai-site.vercel.app/how-it-works/";

export interface NavLink {
  href: string;
  label: string;
  /** Renders as an out-link: new tab, rel-guarded, arrow-marked, never active. */
  external?: boolean;
  /**
   * Sidebar group. No group: the work links every account starts with
   * (Dashboard, Annotate, Speech, My Work, Rubric), in that order. "research":
   * the researcher tools, rendered after a divider.
   */
  group?: "research";
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
  waiting?: { annotate?: number; speech?: number };
}

/** A link with its waiting number, or the bare link when nothing waits. */
function withCount(link: NavLink, n: number | undefined): NavLink {
  return typeof n === "number" && n > 0 ? { ...link, count: n } : link;
}

/**
 * The one Speech link, the same for every role that has speech on: right
 * under Annotate, opening the Record tab. Listen, Check, Profile (and, for
 * researchers, Recordings and Studio) are tabs inside it, not sidebar links.
 */
export const SPEECH_LINK: NavLink = {
  href: "/speak",
  label: "Speech",
  also: ["/lab/speech"],
};

/**
 * The work links, the first lines of every sidebar, in a fixed order:
 * Dashboard, Annotate, Speech (only when speech is on for the account),
 * My Work, Rubric. An annotator with speech off sees exactly the four lines
 * they have always seen.
 */
function workLinks(speechOn: boolean, options: NavOptions): NavLink[] {
  const links: NavLink[] = [
    { href: "/annotator", label: "Dashboard" },
    withCount(
      { href: "/annotator/annotate", label: "Annotate" },
      options.waiting?.annotate,
    ),
  ];
  if (speechOn) links.push(withCount(SPEECH_LINK, options.waiting?.speech));
  links.push(
    { href: "/annotator/history", label: "My Work" },
    { href: "/annotator/rubric", label: "Rubric" },
  );
  return links;
}

/**
 * The researcher tools, below the divider. Every label is the one it has
 * always had. The order and grouping here belong to the researcher dashboard
 * work; the work links above do not.
 */
function researchLinks(speechOn: boolean): NavLink[] {
  const links: NavLink[] = [
    { href: "/annotator/prompts", label: "Prompts", group: "research" },
    // Researchers keep the standalone Corrections lane (the backlog view of
    // already-judged outputs). Annotators do NOT get it - see below.
    { href: "/annotator/corrections", label: "Corrections", group: "research" },
    { href: "/annotator/review", label: "Review queue", group: "research" },
    { href: "/admin/annotations", label: "Annotations", group: "research" },
    { href: "/admin", label: "Researcher Dashboard", group: "research" },
    // First stop for the human-judgment evidence: what speakers decide in
    // blind matchups, in plain language. Deliberately ahead of Model Arena.
    { href: "/admin/arena/verdict", label: "Speakers' Verdict", group: "research" },
    { href: "/admin/arena", label: "Model Arena", group: "research" },
    // Plain-language project explainer for staff, funders and community
    // members. Points OUT to the public marketing page (see the constant
    // above): one telling of the story, publicly readable, live numbers.
    {
      href: PUBLIC_HOW_IT_WORKS_URL,
      label: "How it works",
      external: true,
      group: "research",
    },
  ];
  // The nightly loop's dashboard: overnight card, hours, trend, candidates.
  // Ships dark with the lab (src/lib/lab-flags.ts).
  if (speechOn) {
    links.push({ href: "/admin/speech", label: "Speech loop", group: "research" });
  }
  return links;
}

/**
 * Primary sidebar nav for the (app) area. Every account starts with the same
 * work links in the same order. Annotators get only those; researchers (and
 * the owner) get the research tools after them, below a divider.
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
    return [...workLinks(speechOn, options), ...researchLinks(speechOn)];
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
