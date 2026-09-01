import { describe, it, expect } from "vitest";
import {
  MAX_HEADWORDS,
  MAX_RETRIEVAL_CONTENT_WORDS,
  MAX_SENSES,
  contentWords,
  retrieveDictCandidates,
} from "./retrieval-v2";

/**
 * RETRIEVAL BREADTH ON A VERY LONG INPUT.
 *
 * The incident's slowest surviving turn retrieved 33 reference chunks and took
 * 89.8s. Two different things could have been unbounded there, and they need
 * separating:
 *
 *   1. WHAT IS SERVED. Already bounded, and always was: MAX_HEADWORDS lines of
 *      at most MAX_SENSES senses, PARALLEL_K pairs, CORRECTIONS_K corrections,
 *      GOLD_K exemplars. No input, however long, can push the served block
 *      past those - which is why the fix here changes no composition anyone
 *      has measured.
 *
 *   2. WHAT IS DONE TO PRODUCE IT. NOT bounded until now: the dictionary leg
 *      issues one prefix query per content word that misses the lexicon, so a
 *      pasted paragraph opened one database round trip per unmatched word
 *      before a single token was generated. That is the part that scaled with
 *      input length, and MAX_RETRIEVAL_CONTENT_WORDS is the cap on it.
 *
 * Pinned in its own file, deliberately away from retrieval-v2.test.ts and
 * retrieval-v4.test.ts: those assert the byte-identical assembly the frozen
 * numbers were produced under, and they stay untouched.
 */

describe("contentWords is bounded", () => {
  it("caps a long passage at the single-sourced maximum", () => {
    const passage = Array.from({ length: 500 }, (_, i) => `word${i}`).join(" ");
    const words = contentWords(passage);
    expect(words).toHaveLength(MAX_RETRIEVAL_CONTENT_WORDS);
    // Truncated from the TAIL: the question's own order is the only ranking
    // signal this leg has, so the first words are the ones kept.
    expect(words[0]).toBe("word0");
    expect(words.at(-1)).toBe(`word${MAX_RETRIEVAL_CONTENT_WORDS - 1}`);
  });

  it("leaves every realistic question completely untouched", () => {
    // Every prompt shape the bank and the chat page actually carry sits far
    // below the cap, so the cap cannot be reached by anything measured.
    for (const text of [
      "How do I greet an elder in the morning?",
      "Give the Igala word for water.",
      "Write a natural Igala blessing for a newborn child.",
      "What is the difference between o kọ and ọ ya, and when would a speaker use each one in a market conversation?",
    ]) {
      const words = contentWords(text);
      expect(words.length).toBeLessThan(MAX_RETRIEVAL_CONTENT_WORDS);
      // The cap is a truncation, so an uncapped run would return this same
      // array: identical composition for every input below the bound.
      expect(words).toEqual(words.slice(0, MAX_RETRIEVAL_CONTENT_WORDS));
    }
  });

  it("is at least the number of lines that can be rendered", () => {
    // A cap below MAX_HEADWORDS would silently shrink the dictionary block.
    expect(MAX_RETRIEVAL_CONTENT_WORDS).toBeGreaterThanOrEqual(MAX_HEADWORDS);
  });
});

describe("the dictionary leg's database fan-out is bounded", () => {
  /** A prisma stand-in that counts the per-word prefix queries. */
  function countingPrisma() {
    let prefixQueries = 0;
    return {
      prefixQueries: () => prefixQueries,
      client: {
        lexEntry: {
          findMany: async (args: {
            where: { glossFolded?: { in?: string[]; startsWith?: string } };
          }) => {
            if (args.where.glossFolded?.startsWith !== undefined)
              prefixQueries += 1;
            return [];
          },
        },
      },
    };
  }

  it("issues at most one query per capped content word, whatever the input length", async () => {
    const passage = Array.from({ length: 400 }, (_, i) => `term${i}`).join(" ");
    const p = countingPrisma();
    const candidates = await retrieveDictCandidates(
      // The fake carries exactly the two calls this leg makes.
      p.client as unknown as Parameters<typeof retrieveDictCandidates>[0],
      contentWords(passage),
    );
    expect(candidates).toEqual([]);
    // Before the cap this was 400 round trips, each measured at roughly 400ms
    // against the pooled production database.
    expect(p.prefixQueries()).toBe(MAX_RETRIEVAL_CONTENT_WORDS);
  });

  it("still queries every word of an ordinary question", async () => {
    const words = contentWords("How do I greet an elder in the morning?");
    const p = countingPrisma();
    await retrieveDictCandidates(
      p.client as unknown as Parameters<typeof retrieveDictCandidates>[0],
      words,
    );
    expect(p.prefixQueries()).toBe(words.length);
  });
});

describe("what is SERVED was already bounded, cap or no cap", () => {
  it("cannot exceed the rendered-line and sense caps for any input", async () => {
    // Every word matches three senses: the pathological case for breadth.
    const prisma = {
      lexEntry: {
        findMany: async (args: {
          where: { glossFolded?: { in?: string[]; startsWith?: string } };
        }) => {
          const wanted = args.where.glossFolded?.in ?? [];
          return wanted.flatMap((w) =>
            [1, 2, 3, 4, 5].map((n) => ({
              id: `${w}-${n}`,
              headword: `${w}${n}`,
              gloss: w,
              glossFolded: w,
              confidence: 1,
            })),
          );
        },
      },
    };
    const passage = Array.from({ length: 300 }, (_, i) => `noun${i}`).join(" ");
    const candidates = await retrieveDictCandidates(
      prisma as unknown as Parameters<typeof retrieveDictCandidates>[0],
      contentWords(passage),
    );
    expect(candidates.length).toBeLessThanOrEqual(MAX_HEADWORDS * MAX_SENSES);
  });
});
