/**
 * The Model Arena tab bar: one persistent horizontal nav across every arena
 * page. Pure data + matching logic so it can be unit-tested without a DOM.
 *
 * `hint` is the plain-English one-liner surfaced as the tab's title tooltip.
 * These replaced the old row of pill buttons with separate "i" popovers.
 */
export interface ArenaTab {
  href: string;
  label: string;
  hint: string;
}

export const ARENA_TABS: ArenaTab[] = [
  {
    href: "/admin/arena",
    label: "Overview",
    hint: "The candidate-by-category table, plus a plain-English reading of what those numbers currently do and do not show.",
  },
  {
    href: "/admin/arena/verdict",
    label: "Speakers' verdict",
    hint: "What native speakers decide in blind matchups: who wins, why losing answers lose, and how often both answers are still inadequate. The human-judgment counterpart to the benchmark scores, in plain language.",
  },
  {
    href: "/admin/arena/candidates",
    label: "Candidates",
    hint: "The registry of model variants. A candidate is a reproducible recipe: a base model plus optional retrieval, system prompt, or fine-tune artifact.",
  },
  {
    href: "/admin/arena/jobs",
    label: "Fine-tune jobs",
    hint: "Turn collected annotations into training sets and launch fine-tunes. A tuned model also needs somewhere to be served, which is why tuning runs here have ended up with very different fates.",
  },
  {
    href: "/admin/arena/chat",
    label: "Chat",
    hint: "Ask several candidates the same question and read their answers side by side. For the judgement no metric can make: whether an answer is usable Igala, whether the register fits, and whether something fluent-looking is actually Yoruba. The model selection lives in the page address, so a curated set can be handed to a speaker as a link.",
  },
  {
    href: "/admin/arena/compare",
    label: "Head-to-head",
    hint: "Two candidates side by side on the frozen prompts, with the human verdict and the written reason. This is where a model's failures become concrete.",
  },
  {
    href: "/admin/arena/eval",
    label: "Automatic eval",
    hint: "Fast automatic signal while human judgment accumulates: character-overlap scores against community gold, a language-identity gate, and the ceiling set by how much the speakers themselves differ. Triage only, never a quality verdict. Any autorater agreement figure here is shown against the always-guess-the-majority baseline, because raw agreement looks high when almost every human label is 'both inadequate'.",
  },
  {
    href: "/admin/arena/trajectory",
    label: "Trajectory",
    hint: "Per-category strength over time. It can only move once annotators start picking winners, so it stays flat while nearly every comparison comes back 'both inadequate'.",
  },
  {
    href: "/admin/arena/contested",
    label: "Collective review",
    hint: "Items where annotators disagreed, plus edits awaiting verification. Resolving them together raises agreement and promotes corrections to gold.",
  },
  {
    href: "/admin/arena/costs",
    label: "Cost ledger",
    hint: "Money spent, provider by provider. Real billed amounts where the provider reports them, estimates otherwise, each one labelled.",
  },
  {
    href: "/admin/arena/demo",
    label: "Demo session",
    hint: "Run the real annotation flow for a live audience. Demo records never reach training, the table, or fine-tune sources.",
  },
];

/** Where the arena hands you back to the rest of the researcher tools. */
export const ARENA_EXIT = {
  href: "/admin",
  label: "Researcher dashboard",
  hint: "Leave the arena and go back to the researcher overview.",
};

/**
 * Which tab owns a pathname. The Overview tab is the arena root, so it matches
 * exactly; every other tab also owns its sub-routes (a candidate detail page
 * keeps "Candidates" selected, /jobs/new keeps "Fine-tune jobs" selected).
 */
export function isTabActive(pathname: string, href: string): boolean {
  if (href === "/admin/arena") return pathname === "/admin/arena";
  return pathname === href || pathname.startsWith(`${href}/`);
}
