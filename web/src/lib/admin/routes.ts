/**
 * The researcher's map, as data.
 *
 * Five views answer five questions. Below them sits More: tools that are used
 * a few times a month, and an archive of pages that are kept but no longer
 * part of anyone's week. Nothing was deleted to get here. Every address a
 * researcher could reach before still answers, either with its own page or
 * with a redirect to the place its content moved to. OLD_ROUTES is that
 * promise written down, and routes.test.ts walks it.
 *
 * Pure data and pure functions: no React, no database, no import from
 * personas.ts (personas imports this file, not the other way round).
 */

export interface ResearchLink {
  href: string;
  label: string;
  /** The one question the view answers. Shown as the link's tooltip. */
  question: string;
  /** Sidebar group, read by the sidebar below its divider. */
  group: "research" | "more";
}

/** The five views, in sidebar order. */
export const RESEARCH_VIEWS: ResearchLink[] = [
  {
    href: "/admin",
    label: "Today",
    question: "What changed this week, and what needs me?",
    group: "research",
  },
  {
    href: "/admin/people",
    label: "People",
    question:
      "Who worked, for how many hours, and who is running out of prompts?",
    group: "research",
  },
  {
    href: "/admin/annotations",
    label: "Data",
    question: "What did the speakers write and record, and is it right?",
    group: "research",
  },
  {
    href: "/admin/arena/verdict",
    label: "Text model",
    question: "Is the text model getting better?",
    group: "research",
  },
  {
    href: "/admin/speech",
    label: "Speech model",
    question: "Is the speech model getting better?",
    group: "research",
  },
];

export const SPEECH_MODEL_HREF = "/admin/speech";

/**
 * The tone marks pass 2 admin page. It arrives with the annotator release,
 * not with this change: the Data view links to it from Disagreements, where
 * its subject lives, and owns it in the sidebar.
 */
export const TONE_PASS_HREF = "/admin/tone";

export const MORE_LINK: ResearchLink = {
  href: "/admin/more",
  label: "More",
  question: "Tools used now and then, and the archive.",
  group: "more",
};

/**
 * The links below the sidebar's divider. The Speech model view reads the
 * speech tables behind the lab flag, so it is listed only when the server
 * says speech is on, like every other speech link.
 */
export function researchLinks(options: { speech: boolean }): ResearchLink[] {
  const views = options.speech
    ? RESEARCH_VIEWS
    : RESEARCH_VIEWS.filter((v) => v.href !== SPEECH_MODEL_HREF);
  return [...views, MORE_LINK];
}

// ─── tabs inside a view ─────────────────────────────────────────────────────

export interface ViewTab {
  href: string;
  label: string;
  /** Plain one-liner, the tab's tooltip. */
  hint: string;
  /** Match the href exactly (a tab whose address prefixes its siblings). */
  exact?: boolean;
  /** Other path prefixes this tab owns. */
  owns?: string[];
  /** Listed only when speech is on for the account. */
  speech?: boolean;
}

export const DATA_TABS: ViewTab[] = [
  {
    href: "/admin/annotations",
    label: "Text answers",
    hint: "Every choice, written answer and correction, newest first.",
  },
  {
    href: "/admin/data/clips",
    label: "Speech clips",
    hint: "The recorded clips, with the control that locks the exam set.",
    speech: true,
  },
  {
    href: "/admin/data/disagreements",
    label: "Disagreements",
    hint: "Where two speakers chose or wrote differently, corrections waiting for a second reader, and the tone marks pass.",
    owns: [TONE_PASS_HREF],
  },
  {
    href: "/admin/data/prompts",
    label: "Prompts",
    hint: "The question bank. Browse, search and edit.",
  },
  {
    href: "/admin/data/export",
    label: "Export",
    hint: "Download the data as files.",
  },
];

export const SPEECH_MODEL_TABS: ViewTab[] = [
  {
    href: "/admin/speech",
    label: "Measure",
    hint: "How good the speech model is: what we can compute alone, and what listeners decided.",
    exact: true,
  },
  {
    href: "/admin/speech/loop",
    label: "Loop",
    hint: "What the nightly run did, the audio we hold, and the pause switch.",
  },
  {
    href: "/admin/speech/rights",
    label: "Rights",
    hint: "Outside audio and whether we may use it.",
  },
];

/** Whether a tab owns a pathname. */
export function isViewTabActive(pathname: string, tab: ViewTab): boolean {
  if (pathname === tab.href) return true;
  if (!tab.exact && pathname.startsWith(`${tab.href}/`)) return true;
  return (tab.owns ?? []).some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

// ─── More: tools and the archive ────────────────────────────────────────────

export interface MoreItem {
  href: string;
  label: string;
  /** One sentence. For an archived page: why it is here. */
  sentence: string;
}

/** Used a few times a month. Each keeps its own address. */
export const TOOLS: MoreItem[] = [
  {
    href: "/admin/arena/costs",
    label: "Costs",
    sentence: "What we have spent, provider by provider.",
  },
  {
    href: "/admin/arena/demo",
    label: "Demo session",
    sentence: "Show the real flow to an audience. Nothing from a demo is kept.",
  },
];

/** Kept, not deleted. Each line says why it left the main list. */
export const ARCHIVE: MoreItem[] = [
  {
    href: "/annotator/review",
    label: "Review queue",
    sentence: "No item has ever arrived here.",
  },
  {
    href: "/annotator/corrections",
    label: "Corrections",
    sentence:
      "Corrections now happen inside Annotate, right after a choice. This is the old backlog view.",
  },
  {
    href: "/admin/arena/jobs",
    label: "Fine-tune jobs",
    sentence: "No tuning run has been started here since August.",
  },
  {
    href: "/admin/arena/trajectory",
    label: "Trajectory",
    sentence: "Nothing was ever recorded for this chart.",
  },
  {
    href: "/admin/more/legacy#leaderboard",
    label: "Leaderboard (old)",
    sentence:
      "It counts models we have retired. The verdict answers the question better.",
  },
  {
    href: "/admin/more/legacy#categories",
    label: "Rubric scores by category",
    sentence:
      "Averages of winning answers only, so they describe winners, not models.",
  },
  {
    href: "/admin/more/legacy#gaps",
    label: "Gap closure",
    sentence: "No item has ever arrived here.",
  },
  {
    href: "/learner",
    label: "Learner tutor",
    sentence: "No conversation was ever stored.",
  },
];

// ─── which view owns a pathname ─────────────────────────────────────────────

const TEXT_MODEL_PREFIXES = [
  "/admin/arena/verdict",
  "/admin/arena/eval",
  "/admin/arena/chat",
  "/admin/arena/compare",
  "/admin/arena/candidates",
];

/** Arena pages that are now reached through More. */
export const ARENA_MORE_PAGES: Array<{
  prefix: string;
  label: string;
  section: "Tools" | "Archive";
}> = [
  { prefix: "/admin/arena/costs", label: "Costs", section: "Tools" },
  { prefix: "/admin/arena/demo", label: "Demo session", section: "Tools" },
  { prefix: "/admin/arena/jobs", label: "Fine-tune jobs", section: "Archive" },
  {
    prefix: "/admin/arena/trajectory",
    label: "Trajectory",
    section: "Archive",
  },
];

const under = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * The research link a pathname belongs to, or null for a page outside the
 * research area (the annotator's own lines, the speech work pages). One
 * answer per pathname, so the sidebar never lights two entries.
 */
export function activeResearchHref(pathname: string): string | null {
  if (pathname === "/admin") return "/admin";
  if (under(pathname, "/admin/people")) return "/admin/people";
  if (
    under(pathname, "/admin/annotations") ||
    under(pathname, "/admin/data") ||
    under(pathname, TONE_PASS_HREF) ||
    under(pathname, "/annotator/prompts")
  ) {
    return "/admin/annotations";
  }
  if (under(pathname, "/admin/speech")) return SPEECH_MODEL_HREF;
  if (
    under(pathname, "/admin/more") ||
    ARENA_MORE_PAGES.some((p) => under(pathname, p.prefix)) ||
    under(pathname, "/annotator/review") ||
    under(pathname, "/annotator/corrections")
  ) {
    return MORE_LINK.href;
  }
  if (
    pathname === "/admin/arena" ||
    TEXT_MODEL_PREFIXES.some((p) => under(pathname, p))
  ) {
    return "/admin/arena/verdict";
  }
  return null;
}

// ─── every old address still answers ────────────────────────────────────────

export type OldRoute =
  /** The page is still at this address. */
  | { url: string; was: string; now: "same"; home: string }
  /** The address redirects to where its content moved. */
  | { url: string; was: string; now: "redirect"; to: string; home: string }
  /** The address redirects out of the app (the public explainer). */
  | { url: string; was: string; now: "external"; home: string };

/**
 * Every address a RESEARCHER account could reach before this change: the 12
 * sidebar links, the Lab group, the 11 arena tabs, the speech tabs, and the
 * pages behind them. `home` says where a researcher finds it now.
 */
export const OLD_ROUTES: OldRoute[] = [
  // The old sidebar.
  { url: "/annotator", was: "Dashboard", now: "same", home: "My work" },
  {
    url: "/annotator/prompts",
    was: "Prompts",
    now: "same",
    home: "Data, Prompts",
  },
  { url: "/annotator/annotate", was: "Annotate", now: "same", home: "My work" },
  {
    url: "/annotator/corrections",
    was: "Corrections",
    now: "same",
    home: "More, Archive",
  },
  { url: "/annotator/history", was: "My Work", now: "same", home: "My work" },
  { url: "/annotator/rubric", was: "Rubric", now: "same", home: "My work" },
  {
    url: "/annotator/review",
    was: "Review queue",
    now: "same",
    home: "More, Archive",
  },
  {
    url: "/admin/annotations",
    was: "Annotations",
    now: "same",
    home: "Data, Text answers",
  },
  { url: "/admin", was: "Researcher Dashboard", now: "same", home: "Today" },
  {
    url: "/admin/arena/verdict",
    was: "Speakers' Verdict",
    now: "same",
    home: "Text model, Verdict",
  },
  {
    url: "/admin/arena",
    was: "Model Arena",
    now: "redirect",
    to: "/admin/arena/verdict",
    home: "Text model, Verdict",
  },
  {
    url: "/admin/how-it-works",
    was: "How it works",
    now: "external",
    home: "More, Tools",
  },
  {
    url: "/how-it-works",
    was: "How it works",
    now: "external",
    home: "More, Tools",
  },
  // The old Lab group.
  { url: "/lab/speech", was: "Speech", now: "same", home: "My work" },
  { url: "/speak/check", was: "Check", now: "same", home: "My work" },
  {
    url: "/admin/speech",
    was: "Speech loop",
    now: "same",
    home: "Speech model, Measure. The loop's cards are on the Loop tab",
  },
  // The old arena tabs.
  {
    url: "/admin/arena/candidates",
    was: "Candidates",
    now: "same",
    home: "Text model, Setup",
  },
  {
    url: "/admin/arena/jobs",
    was: "Fine-tune jobs",
    now: "same",
    home: "More, Archive",
  },
  {
    url: "/admin/arena/jobs/new",
    was: "New fine-tune job",
    now: "same",
    home: "More, Archive",
  },
  {
    url: "/admin/arena/chat",
    was: "Chat",
    now: "same",
    home: "Text model, Compare",
  },
  {
    url: "/admin/arena/compare",
    was: "Head-to-head",
    now: "same",
    home: "Text model, Compare",
  },
  {
    url: "/admin/arena/eval",
    was: "Automatic eval",
    now: "same",
    home: "Text model, Benchmark",
  },
  {
    url: "/admin/arena/trajectory",
    was: "Trajectory",
    now: "same",
    home: "More, Archive",
  },
  {
    url: "/admin/arena/contested",
    was: "Collective review",
    now: "redirect",
    to: "/admin/data/disagreements",
    home: "Data, Disagreements",
  },
  {
    url: "/admin/arena/costs",
    was: "Cost ledger",
    now: "same",
    home: "More, Tools",
  },
  {
    url: "/admin/arena/demo",
    was: "Demo session",
    now: "same",
    home: "More, Tools",
  },
  // The speech tabs.
  { url: "/lab/speech/listen", was: "Listen", now: "same", home: "My work" },
  {
    url: "/lab/speech/recordings",
    was: "Recordings",
    now: "same",
    home: "Data, Speech clips",
  },
  { url: "/lab/speech/studio", was: "Studio", now: "same", home: "My work" },
  {
    url: "/lab/speech/rights",
    was: "Rights register",
    now: "redirect",
    to: "/admin/speech/rights",
    home: "Speech model, Rights",
  },
  { url: "/speak", was: "Speak", now: "same", home: "My work" },
  { url: "/speak/listen", was: "Speak, Listen", now: "same", home: "My work" },
  {
    url: "/speak/profile",
    was: "Speaker profile",
    now: "same",
    home: "My work",
  },
  // The learner tutor, reached from the old sidebar's foot.
  { url: "/learner", was: "Learner tutor", now: "same", home: "More, Archive" },
  {
    url: "/learner/chat",
    was: "Learner tutor",
    now: "same",
    home: "More, Archive",
  },
];

/** The new addresses this change adds. Each must have a page. */
export const NEW_ROUTES: string[] = [
  "/admin/people",
  "/admin/data/clips",
  "/admin/data/disagreements",
  "/admin/data/prompts",
  "/admin/data/export",
  "/admin/speech/loop",
  "/admin/speech/rights",
  "/admin/more",
  "/admin/more/legacy",
];
