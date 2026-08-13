import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Render test for the "How it works" page. The page is prose ABOUT the code,
 * so the two things a test can hold in place are exactly the two things a
 * reader would be lied to about if they drifted:
 *
 * 1. The assembly-order list must match buildUserTurnV2's real order -
 *    parallel examples BEFORE the dictionary, dictionary immediately above
 *    the question, terminal contract last. That order is the one thing the
 *    page exists to explain.
 * 2. The system prompt must be the IMPORTED IGALA_SYSTEM_V2 rendered
 *    verbatim, never a paraphrase that could drift.
 *
 * Prisma is mocked with the same recorder-fake shape as
 * method-metrics.test.ts, so the page renders end to end (SVG included)
 * without a database.
 */

vi.mock("@/lib/prisma", () => {
  const t = (n: number) => new Date(2026, 0, n);
  const plain = {
    name: "Plain GPT",
    kind: "baseline",
    versionLabel: null,
    archived: false,
  };
  return {
    prisma: {
      prompt: {
        findMany: async () => [
          { id: "P1", promptId: "ig_bank_orth_001" },
          { id: "P2", promptId: "ig_bank_lex_003" },
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
                answerText: "Omi",
                annotatorId: "annA",
                createdAt: t(1),
              },
              {
                promptId: "P1",
                answerText: "Ọmi",
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
            outputText: "ámẹ́",
            ragContextIds: [],
            candidateModel: plain,
          },
        ],
      },
      pairwiseComparison: {
        count: async (args: { where?: { winner?: string } }) =>
          args.where?.winner === "both_inadequate" ? 6 : 7,
        findMany: async () => [],
      },
      outputEdit: { findMany: async () => [] },
      parallelPair: { count: async () => 10, findMany: async () => [] },
      lexEntry: { count: async () => 5, findMany: async () => [] },
      ragEntry: { findMany: async () => [] },
    },
  };
});

import HowItWorksPage from "./page";
import {
  IGALA_SYSTEM_V2,
  igalaTerminalContract,
} from "@/lib/generation-prompt-v2";

async function renderPage(): Promise<string> {
  return renderToStaticMarkup(await HowItWorksPage());
}

describe("how-it-works page", () => {
  it("renders end to end, including the journey SVG", async () => {
    const html = await renderPage();
    expect(html).toContain("<svg");
    expect(html).toContain("v0 - plain models");
    expect(html).toContain("v1 - retrieval");
    expect(html).toContain("v2 - a method");
  });

  it("lists the assembly steps in buildUserTurnV2's real order", async () => {
    const html = await renderPage();
    const order = [
      "THE METHOD (system prompt)",
      "Community gold Q/A exemplars",
      "Parallel example sentences",
      "Per-word dictionary lines",
      "The question",
      "Terminal contract",
    ].map((label) => html.indexOf(label));
    expect(order.every((i) => i >= 0)).toBe(true);
    // Strictly increasing: parallel before dictionary, dictionary immediately
    // above the question, contract last - the order retrieval-v2 actually
    // serves. A reordering here is a lie about the serving path.
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("renders the imported system prompt and terminal contract verbatim", async () => {
    const html = await renderPage();
    // Distinctive lines that contain no HTML-escaped characters, so a verbatim
    // import shows up as-is in the markup.
    expect(IGALA_SYSTEM_V2).toContain("Spelling is meaning-bearing in Igala.");
    expect(html).toContain("Spelling is meaning-bearing in Igala.");
    expect(html).toContain("seven vowels: a e ẹ i o ọ u");
    expect(html).toContain(igalaTerminalContract(""));
  });

  it("shows computed figures, not the retired hardcoded ones", async () => {
    const html = await renderPage();
    // The stale numbers this project shipped before (63.2 ceiling, 46 honest
    // ceiling, 781 comparisons) must never be baked into the markup - with a
    // fixture database none of them can legitimately appear.
    for (const stale of ["63.2", "46.0", "781"]) {
      expect(html).not.toContain(stale);
    }
    // Live-computed counts from the fixture do appear.
    expect(html).toContain(">10<"); // parallel pairs stat
    expect(html).toContain(">5<"); // dictionary entries stat
  });
});
