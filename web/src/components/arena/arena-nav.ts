import {
  ARENA_MORE_PAGES,
  isViewTabActive,
  type ViewTab,
} from "@/lib/admin/routes";

/**
 * The Text model tab bar: one persistent horizontal nav across the pages that
 * answer "is the text model getting better?". Pure data plus matching logic,
 * so it can be unit-tested without a DOM.
 *
 * Four tabs, where there were eleven. Nothing was removed: Overview folded
 * into Verdict and Benchmark, Head-to-head sits beside Chat under Compare,
 * Collective review moved to the Data view, and Cost ledger, Demo session,
 * Fine-tune jobs and Trajectory are reached through More. Every old address
 * still answers (src/lib/admin/routes.ts, OLD_ROUTES).
 *
 * `hint` is the plain one-liner surfaced as the tab's title tooltip.
 */
export type ArenaTab = ViewTab;

export const ARENA_TABS: ArenaTab[] = [
  {
    href: "/admin/arena/verdict",
    label: "Verdict",
    hint: "What native speakers decide in blind matchups: who wins, why losing answers lose, and how often both answers are still inadequate.",
  },
  {
    href: "/admin/arena/eval",
    label: "Benchmark",
    hint: "The Community Agreement Score for every model, then the automatic checks behind it, then strength per category from the blind votes.",
  },
  {
    href: "/admin/arena/chat",
    label: "Compare",
    hint: "Read the models side by side: ask them one question, or walk two of them through the frozen prompts.",
    owns: ["/admin/arena/compare"],
  },
  {
    href: "/admin/arena/candidates",
    label: "Setup",
    hint: "The registry of model variants, and which of them speakers are comparing now.",
  },
];

/** The two modes of the Compare tab. Each keeps its old address. */
export const COMPARE_MODES = [
  { href: "/admin/arena/chat", label: "Ask a question" },
  { href: "/admin/arena/compare", label: "Frozen prompts" },
] as const;

/**
 * Which tab owns a pathname. A tab owns its sub-routes (a candidate detail
 * page keeps "Setup" selected) and any extra prefix it names (Compare owns
 * the head-to-head page).
 */
export function isTabActive(pathname: string, tab: ArenaTab): boolean {
  return isViewTabActive(pathname, tab);
}

/**
 * An arena page that no tab owns: it is reached through More now. The bar
 * shows where the page lives instead of lighting a tab that is not its own.
 */
export function arenaMorePage(
  pathname: string,
): { label: string; section: "Tools" | "Archive" } | null {
  const hit = ARENA_MORE_PAGES.find(
    (p) => pathname === p.prefix || pathname.startsWith(`${p.prefix}/`),
  );
  return hit ? { label: hit.label, section: hit.section } : null;
}
