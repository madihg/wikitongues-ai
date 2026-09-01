import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Render test for the rebuilt Model Arena Overview.
 *
 * The page exists to fix an ordering defect: it used to lead with the
 * Bradley-Terry rubric table fitted over all history, where nearly every cell
 * reports an absence of evidence, and it apologized for that table before the
 * reader had seen anything. So the two things worth pinning down are exactly
 * the two things that would silently regress:
 *
 * 1. ORDER. The speakers' verdict comes first, the agreement scoreboard
 *    second, the rubric table third, the reading guide last.
 * 2. LIVE NUMBERS. Nothing on the page is hardcoded. Proved the only way it
 *    can be proved: render twice against two different fixture databases and
 *    require every quoted figure to move with the data.
 *
 * Prisma is mocked with the same recorder-fake shape as method-metrics.test.ts
 * and how-it-works/page.test.tsx, so the page renders end to end (the
 * benchmark SVG included) without a database. `vi.hoisted` holds the fixture
 * so a test can swap the world and re-render.
 */

interface Arm {
  name: string;
  kind: string;
  versionLabel: string | null;
  archived: boolean;
  inPairingPool: boolean;
}

const POOL_RAG: Arm = {
  name: "Gemini + RAG v4",
  kind: "rag",
  versionLabel: "rag-v4",
  archived: false,
  inPairingPool: true,
};
const POOL_BASE: Arm = {
  name: "Bare Gemini",
  kind: "baseline",
  versionLabel: null,
  archived: false,
  inPairingPool: true,
};
const OLD_ARM: Arm = {
  name: "Old Claude",
  kind: "baseline",
  versionLabel: null,
  archived: false,
  inPairingPool: false,
};

function comparison(
  a: Arm,
  b: Arm,
  winner: string,
  day: number,
): Record<string, unknown> {
  const out = (cm: Arm, text: string) => ({
    outputText: text,
    model: "legacy-model",
    candidateModel: cm,
  });
  return {
    winner,
    failureTagsA: winner === "b" ? ["grammar"] : [],
    failureTagsB: winner === "a" ? ["wrong_word"] : [],
    explanation: "A speaker wrote why.",
    createdAt: new Date(Date.UTC(2026, 0, day)),
    promptId: "P1",
    modelOutputA: out(a, "answer a"),
    modelOutputB: out(b, "answer b"),
  };
}

/**
 * Baseline world. Pool pairing: 7 matchups, 5 decided (RAG 4, baseline 1),
 * 1 tie, 1 both-inadequate. Retired arm: 4 matchups, 0 decided, 3
 * both-inadequate. So all-time is 11 with 5 decided, and the both-inadequate
 * rate falls from 75% on the retired arm to 14% in the current pool.
 */
function baseWorld(): Record<string, unknown>[] {
  return [
    comparison(POOL_RAG, POOL_BASE, "a", 5),
    comparison(POOL_BASE, POOL_RAG, "b", 6),
    comparison(POOL_RAG, POOL_BASE, "a", 7),
    comparison(POOL_BASE, POOL_RAG, "b", 8),
    comparison(POOL_BASE, POOL_RAG, "a", 9),
    comparison(POOL_RAG, POOL_BASE, "both_inadequate", 10),
    comparison(POOL_RAG, POOL_BASE, "tie", 11),
    comparison(OLD_ARM, POOL_BASE, "both_inadequate", 1),
    comparison(OLD_ARM, POOL_BASE, "both_inadequate", 2),
    comparison(OLD_ARM, POOL_BASE, "both_inadequate", 3),
    comparison(OLD_ARM, POOL_BASE, "tie", 4),
  ];
}

/**
 * Second world, deliberately different in every quoted figure: 8 retired-arm
 * matchups instead of 4, all of them both-inadequate. All-time becomes 15,
 * the retired both-inadequate rate becomes 100%, the retired decided rate
 * stays 0%, and the pool numbers are untouched.
 */
function secondWorld(): Record<string, unknown>[] {
  return [
    ...baseWorld().filter((c) => c.promptId === "P1"),
    comparison(OLD_ARM, POOL_BASE, "both_inadequate", 12),
    comparison(OLD_ARM, POOL_BASE, "both_inadequate", 13),
    comparison(OLD_ARM, POOL_BASE, "both_inadequate", 14),
    comparison(OLD_ARM, POOL_BASE, "both_inadequate", 15),
  ].map((c, i) =>
    // The base world's single retired tie becomes a both-inadequate, so the
    // retired rate is a clean 100% and can never coincide with the base run.
    i === 10 ? { ...c, winner: "both_inadequate" } : c,
  );
}

const fixture = vi.hoisted(() => ({
  comparisons: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/prisma", () => {
  const t = (n: number) => new Date(Date.UTC(2026, 0, n));
  return {
    prisma: {
      prompt: {
        findMany: async (args: { where?: { isHoldout?: boolean } }) =>
          args.where?.isHoldout
            ? [
                { id: "P1", promptId: "ig_bank_orth_001" },
                { id: "P2", promptId: "ig_bank_lex_003" },
              ]
            : [
                { id: "P1", text: "How do you greet an elder?" },
                { id: "P2", text: "Say 'the rain has stopped'." },
              ],
      },
      coldAuthorAnswer: {
        findMany: async (args: {
          where?: { consentBenchmark?: boolean };
          distinct?: string[];
        }) => {
          if (args.where?.consentBenchmark === true) {
            return [
              {
                promptId: "P1",
                answerText: "Ẹ́ nwụ ọma",
                annotatorId: "annA",
                createdAt: t(1),
              },
              {
                promptId: "P1",
                answerText: "Ẹ nwu ọma",
                annotatorId: "annB",
                createdAt: t(2),
              },
            ];
          }
          if (args.distinct) return [{ annotatorId: "annA" }];
          return [];
        },
        count: async () => 2,
      },
      modelOutput: {
        findMany: async () => [
          {
            promptId: "P1",
            outputText: "Ẹ́ nwụ ọma",
            ragContextIds: [],
            candidateModel: POOL_RAG,
          },
          {
            promptId: "P1",
            outputText: "Good morning sir",
            ragContextIds: [],
            candidateModel: POOL_BASE,
          },
        ],
      },
      pairwiseComparison: {
        count: async () => 0,
        findMany: async (args: { distinct?: string[] }) =>
          args.distinct ? [{ annotatorId: "annA" }] : fixture.comparisons,
      },
      outputEdit: { findMany: async () => [] },
      parallelPair: { count: async () => 10, findMany: async () => [] },
      lexEntry: { count: async () => 5, findMany: async () => [] },
      ragEntry: { findMany: async () => [] },
    },
  };
});

import ArenaPage from "./page";

async function renderPage(): Promise<string> {
  return renderToStaticMarkup(await ArenaPage());
}

/** Visible prose only: tags, SSR text-node comments and runs of whitespace
 * collapsed away, so an assertion about a sentence cannot be satisfied (or
 * defeated) by an inline percentage in a style attribute. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Section anchors, in the order the rebuilt page must present them.
const VERDICT = "What the speakers decided";
const SCOREBOARD = "Community Agreement Score";
const RUBRIC = "The rubric arena, category by category";
const GUIDE = "How to read the table above";

beforeEach(() => {
  fixture.comparisons = baseWorld();
});

describe("Model Arena overview - order", () => {
  it("leads with the speakers' verdict and demotes the rubric table below it", async () => {
    const html = await renderPage();
    const at = [VERDICT, SCOREBOARD, RUBRIC, GUIDE].map((s) => html.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    // Strictly increasing: verdict, scoreboard, rubric table, reading guide.
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("puts the honesty text under the data, not above it", async () => {
    const html = await renderPage();
    // The long pre-table explainer is suppressed on this page; its opening
    // line must not reappear above the verdict.
    expect(html).not.toContain("How to read this table");
    expect(html.indexOf(GUIDE)).toBeGreaterThan(html.indexOf(RUBRIC));
    expect(html.indexOf(GUIDE)).toBeGreaterThan(html.indexOf(VERDICT));
  });

  it("renders the three blocks the lede promises, and the eval link", async () => {
    const html = await renderPage();
    // 1. the headline split, naming the computed leader.
    expect(html).toContain("Gemini + RAG v4");
    // 2. the current pairing bar.
    expect(html).toContain("The current pairing");
    expect(html).toContain("current pairing</span>");
    // 3. the both-inadequate rate with its weekly trend strip.
    expect(html).toContain("Both answers rejected, and where that rate is");
    expect(html).toContain("rejected both");
    // The scoreboard states its relationship to the verdict and links out.
    expect(html).toContain("machine proxy");
    expect(html).toContain("the humans win");
    expect(html).toContain('href="/admin/arena/eval"');
    expect(html).toContain('href="/admin/arena/verdict"');
    // The scoreboard itself draws, anchored to native speaker agreement.
    expect(html).toContain("native speaker agreement");
    expect(html).toContain("<svg");
  });
});

describe("Model Arena overview - live numbers", () => {
  it("reconciles the all-time and pool comparison counts from the data", async () => {
    const html = await renderPage();
    // 11 all-time = 7 pool + 4 retired; 5 pool decided, 0 retired decided.
    expect(html).toContain(
      "11 counts every blind comparison recorded outside demo sessions",
    );
    expect(html).toContain(
      "7 counts only the matchups between two systems currently in the pairing pool",
    );
    expect(html).toContain("5 of its 7 matchups produced a decided winner");
    expect(html).toContain("(71%)");
    expect(html).toContain("0 of 4");
    expect(html).toContain("(0%)");
  });

  it("names the difference between the dated window and the pool count", async () => {
    // The pool count here is a membership split; the table's window below is a
    // date. They are close but not equal, and a reader who is not told that
    // reads two numbers for one thing. Both come from the same population:
    // non-demo comparisons by real annotators (see the @test.com exclusion in
    // /api/arena/leaderboard, which the table is served from).
    const txt = textOf(await renderPage());
    expect(txt).toContain("dated rather than membership-based");
    expect(txt).toContain(
      "its own count runs a little above the pool number quoted here",
    );
    expect(txt).toContain(
      "both are drawn from the same comparisons, minus demo sessions and test accounts",
    );
  });

  it("shows the both-inadequate rate falling from the retired arms to the pool", async () => {
    // Read the prose, not the markup: bar widths are inline percentages too,
    // so a raw "14%" search would match a style attribute.
    const txt = textOf(await renderPage());
    // 3 of 4 retired matchups rejected both; 1 of 7 pool matchups did.
    expect(txt).toContain(
      "rejected both answers in 75% of the 4 matchups involving an arm since retired",
    );
    expect(txt).toContain(
      "Among the 7 matchups between the current pool arms it is 14%",
    );
  });

  it("quotes the decided-winner total in the reading guide from the data", async () => {
    const html = await renderPage();
    expect(html).toContain("Spread 5 decided winners across");
  });

  it("hardcodes nothing: every quoted figure moves when the data moves", async () => {
    const before = await renderPage();
    fixture.comparisons = secondWorld();
    const after = await renderPage();

    expect(after).not.toBe(before);
    // All-time count follows the fixture: 11 becomes 15.
    expect(after).toContain(
      "15 counts every blind comparison recorded outside demo sessions",
    );
    expect(after).not.toContain(
      "11 counts every blind comparison recorded outside demo sessions",
    );
    // The retired arm is now uniformly both-inadequate.
    expect(after).toContain("100%");
    expect(after).toContain("0 of 8");
    // The pool half is untouched by the retired rows, as the split promises.
    expect(after).toContain("5 of its 7 matchups produced a decided winner");
  });

  it("carries none of the production figures this page used to imply", async () => {
    const txt = textOf(await renderPage());
    // The real database currently reads 1,222 non-demo comparisons by real
    // annotators (1,241 before the @test.com accounts are excluded), 73
    // decided, 191 of them between current pool arms, 1,030 before the pivot
    // and 192 since. With a fixture database none of those can legitimately
    // appear in the prose, so their presence would mean a baked-in number.
    for (const stale of [
      "1,241",
      "1241",
      "1,222",
      "1222",
      "1,043",
      "1,030",
      "34.3",
      "6.0%",
    ]) {
      expect(txt).not.toContain(stale);
    }
  });
});
