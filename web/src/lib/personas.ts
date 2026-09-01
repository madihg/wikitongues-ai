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

export interface NavLink {
  href: string;
  label: string;
}

/**
 * Primary sidebar nav for the (app) area. Annotators get only their own work;
 * researchers (and the owner) get the full tool, with Prompts before Annotate.
 */
export function navForRole(
  role?: string | null,
  email?: string | null,
): NavLink[] {
  if (isResearcher(role, email)) {
    return [
      { href: "/annotator", label: "Dashboard" },
      { href: "/annotator/prompts", label: "Prompts" },
      { href: "/annotator/annotate", label: "Annotate" },
      // Researchers keep the standalone Corrections lane (the backlog view of
      // already-judged outputs). Annotators do NOT get it - see below.
      { href: "/annotator/corrections", label: "Corrections" },
      { href: "/annotator/history", label: "My Work" },
      { href: "/annotator/rubric", label: "Rubric" },
      { href: "/annotator/review", label: "Review queue" },
      { href: "/admin/annotations", label: "Annotations" },
      { href: "/admin", label: "Researcher Dashboard" },
      // First stop for the human-judgment evidence: what speakers decide in
      // blind matchups, in plain language. Deliberately ahead of Model Arena.
      { href: "/admin/arena/verdict", label: "Speakers' Verdict" },
      { href: "/admin/arena", label: "Model Arena" },
      // Plain-language project explainer for staff, funders and community
      // members - researcher-gated like its /admin siblings.
      { href: "/admin/how-it-works", label: "How it works" },
    ];
  }
  // Pure annotator. NO Corrections tab (2026-08-28 rework, Halim's call):
  // corrections happen inside the episode, right after the A/B verdict - a
  // separate lane made "fix it" a different errand from "judge it", and the
  // errand never got run. /annotator/corrections redirects annotators into
  // the annotate flow; the API routes and researcher lane stay.
  return [
    { href: "/annotator", label: "Dashboard" },
    { href: "/annotator/annotate", label: "Annotate" },
    { href: "/annotator/history", label: "My Work" },
    { href: "/annotator/rubric", label: "Rubric" },
  ];
}

/**
 * Which sidebar link owns a pathname: exact match wins, otherwise the LONGEST
 * link href that prefixes the pathname (at a path-segment boundary). The two
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
  for (const { href } of links) {
    if (pathname === href) return href;
    if (href === "/annotator" || href === "/admin") continue;
    if (
      pathname.startsWith(`${href}/`) &&
      (best === null || href.length > best.length)
    ) {
      best = href;
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
