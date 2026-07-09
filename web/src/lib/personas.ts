/**
 * Information architecture per persona.
 *
 * - Learner: the chat tutor only.
 * - Annotator (Agnes's team): annotate — pairwise, rubric, edits. They do NOT
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
      { href: "/annotator/history", label: "My Work" },
      { href: "/annotator/review", label: "Review queue" },
      { href: "/admin/annotations", label: "Annotations" },
      { href: "/admin", label: "Researcher Dashboard" },
      { href: "/admin/arena", label: "Model Arena" },
    ];
  }
  // Pure annotator.
  return [
    { href: "/annotator", label: "Dashboard" },
    { href: "/annotator/annotate", label: "Annotate" },
    { href: "/annotator/history", label: "My Work" },
  ];
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
