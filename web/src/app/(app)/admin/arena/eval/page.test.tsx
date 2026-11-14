import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Render test for the Benchmark tab, which took over the two blocks of the
 * Model Arena overview that had no other home: the Community Agreement Score
 * scoreboard (now the full field) and the rubric arena table with its reading
 * guide (now the "By category" block). The overview's other blocks, the
 * speakers' headline and the current pairing, live on the Verdict tab.
 *
 * Two things are pinned, the two that would silently regress:
 *
 * 1. ORDER. The scoreboard first, the automatic eval second, the rubric
 *    table and its reading guide last and closed until asked for.
 * 2. LIVE NUMBERS. Nothing in the prose is hardcoded. Proved the only way it
 *    can be proved: render twice against two different fixture databases and
 *    require every quoted figure to move with the data.
 *
 * Prisma is mocked with the same recorder-fake shape as method-metrics.test.ts,
 * so the page renders end to end (the
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
                answerText: "Ẹ́ nwụ ọwa",
                annotatorId: "annA",
                createdAt: t(1),
              },
              {
                promptId: "P1",
                answerText: "Ẹ nwu ọwa",
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
            outputText: "Ẹ́ nwụ ọwa",
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

vi.mock("@/lib/admin/page-gate", () => ({
  requireResearcherPage: vi.fn(async () => ({
    id: "u1",
    name: "R",
    email: "r@example.org",
    role: "RESEARCHER",
    owner: false,
  })),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));

import BenchmarkPage from "./page";
import {
  AgreementSection,
  CategorySection,
} from "@/components/arena/benchmark-sections";
import ArenaRedirect from "../page";
import { requireResearcherPage } from "@/lib/admin/page-gate";

const shell = async (open?: string) =>
  renderToStaticMarkup(
    await BenchmarkPage({
      searchParams: Promise.resolve(open ? { open } : {}),
    }),
  );
const bars = async () => renderToStaticMarkup(await AgreementSection());
const category = async () => renderToStaticMarkup(await CategorySection());

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

const SCOREBOARD = "Community Agreement Score";
const AUTO = "Automatic eval";
const BY_CATEGORY = "By category";
const RUBRIC = "The rubric arena, category by category";
const GUIDE = "How to read the table above";

beforeEach(() => {
  fixture.comparisons = baseWorld();
});

describe("the old Model Arena address", () => {
  it("redirects to the Verdict tab", () => {
    expect(() => ArenaRedirect()).toThrow("NEXT_REDIRECT:/admin/arena/verdict");
  });
});

describe("Benchmark - order and the gate", () => {
  it("checks the researcher on the server before anything else", async () => {
    await shell();
    expect(requireResearcherPage).toHaveBeenCalled();
  });

  it("puts the scoreboard first, the automatic eval second, By category last", async () => {
    const html = await shell();
    const at = [SCOREBOARD, AUTO, BY_CATEGORY].map((s) => html.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("keeps By category closed, and uncomputed, until it is asked for", async () => {
    const closed = await shell();
    expect(closed).toContain(
      'href="/admin/arena/eval?open=category#by-category"',
    );
    expect(closed).not.toContain("Close</a>");
    const open = await shell("category");
    expect(open).toContain('href="/admin/arena/eval#by-category"');
    expect(open).toContain("Close</a>");
  });

  it("states the scoreboard's relationship to the verdict", async () => {
    const html = await shell();
    expect(html).toContain("machine proxy");
    expect(html).toContain("the humans win");
  });

  it("draws the whole field, anchored to native speaker agreement, with no fold", async () => {
    const html = await bars();
    expect(html).toContain("native speaker agreement");
    expect(html).toContain("<svg");
    expect(html).toContain("Gemini + RAG v4");
    // Every arm is on the first chart: nothing behind a "show all" toggle.
    expect(html).not.toContain("<details");
  });

  it("puts the reading guide under the rubric table, not above it", async () => {
    const html = await category();
    expect(html).not.toContain("How to read this table");
    expect(html.indexOf(RUBRIC)).toBeGreaterThanOrEqual(0);
    expect(html.indexOf(GUIDE)).toBeGreaterThan(html.indexOf(RUBRIC));
  });
});

describe("Benchmark, By category - live numbers", () => {
  it("reconciles the all-time and pool comparison counts from the data", async () => {
    const html = await category();
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
    const txt = textOf(await category());
    expect(txt).toContain("dated rather than membership-based");
    expect(txt).toContain(
      "its own count runs a little above the pool number quoted here",
    );
    expect(txt).toContain(
      "both are drawn from the same comparisons, minus demo sessions and test accounts",
    );
  });

  it("quotes the decided-winner total in the reading guide from the data", async () => {
    const html = await category();
    expect(html).toContain("Spread 5 decided winners across");
  });

  it("hardcodes nothing: every quoted figure moves when the data moves", async () => {
    const before = await category();
    fixture.comparisons = secondWorld();
    const after = await category();

    expect(after).not.toBe(before);
    // All-time count follows the fixture: 11 becomes 15.
    expect(after).toContain(
      "15 counts every blind comparison recorded outside demo sessions",
    );
    expect(after).not.toContain(
      "11 counts every blind comparison recorded outside demo sessions",
    );
    expect(after).toContain("0 of 8");
    // The pool half is untouched by the retired rows, as the split promises.
    expect(after).toContain("5 of its 7 matchups produced a decided winner");
  });

  it("carries none of the production figures the old page used to imply", async () => {
    const txt = textOf((await category()) + (await bars()) + (await shell()));
    // With a fixture database none of the real database's figures can
    // legitimately appear in the prose, so their presence would mean a
    // baked-in number.
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
