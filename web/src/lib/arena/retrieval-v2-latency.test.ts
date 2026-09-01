import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  buildRetrievalV2,
  retrieveDictCandidates,
  retrieveGuardedGold,
} from "./retrieval-v2";

/**
 * The 2026-08-31 latency work: the v2/v3 chat serving path was measured at
 * 1.6-4.9s of pure retrieval before the model was even called, and virtually
 * all of it was network round trips (queries execute in <3ms server-side,
 * ~400ms each over the pooled connection). The fixes are concurrency and a
 * TTL cache on the gold pool - NEVER a change to what gets retrieved, which
 * retrieval-v2.test.ts pins separately and byte-identically.
 *
 * These tests pin the latency behavior itself: legs overlap instead of
 * queueing, and the gold pool is loaded once per client per TTL window.
 */

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A fake prisma that records, for every query, how many other queries were in
 * flight at the same moment. Every query takes ~15ms, so overlap is only
 * observable if the code actually issues them concurrently.
 */
function trackingPrisma() {
  let inFlight = 0;
  let maxInFlight = 0;
  const counts = { lexExact: 0, lexPrefix: 0, gold: 0, pairs: 0, prompt: 0 };

  async function track<T>(out: T): Promise<T> {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await wait(15);
    inFlight -= 1;
    return out;
  }

  const prisma = {
    prompt: {
      findUnique: async () => {
        counts.prompt += 1;
        return track(null);
      },
    },
    lexEntry: {
      findMany: async (args: {
        where: { glossFolded: { in?: string[]; startsWith?: string } };
      }) => {
        if (args.where.glossFolded.in) counts.lexExact += 1;
        else counts.lexPrefix += 1;
        return track([]);
      },
    },
    coldAuthorAnswer: {
      findMany: async () => {
        counts.gold += 1;
        return track([
          {
            id: "g1",
            promptId: "p1",
            answerText: "Ọma",
            bucket: "orthography",
            consentTraining: true,
            isDemo: false,
            verificationStatus: "single_annotator",
            prompt: {
              promptId: "ig_train_001",
              text: "Write the Igala word for child.",
              isHoldout: false,
              bucket: "orthography",
            },
          },
        ]);
      },
    },
    $queryRaw: async () => {
      counts.pairs += 1;
      return track([]);
    },
  } as unknown as PrismaClient;

  return { prisma, counts, max: () => maxInFlight };
}

const CHAT_PROMPT = {
  promptId: "__chat__",
  // Sentence-building phrasing so the parallel-pair leg runs too.
  text: "Translate this sentence about the farmer and the market for me.",
  bucket: null,
  isHoldout: true,
};

describe("gold pool caching (per client, TTL)", () => {
  it("loads the pool once across repeated calls on the same client", async () => {
    const { prisma, counts } = trackingPrisma();
    const first = await retrieveGuardedGold(prisma, CHAT_PROMPT);
    const second = await retrieveGuardedGold(prisma, CHAT_PROMPT);
    expect(counts.gold).toBe(1);
    // The guard itself still runs per call, on identical data.
    expect(second).toEqual(first);
  });

  it("keeps clients isolated - a different client gets a fresh load", async () => {
    const a = trackingPrisma();
    const b = trackingPrisma();
    await retrieveGuardedGold(a.prisma, CHAT_PROMPT);
    await retrieveGuardedGold(b.prisma, CHAT_PROMPT);
    expect(a.counts.gold).toBe(1);
    expect(b.counts.gold).toBe(1);
  });

  it("does not cache a failed load", async () => {
    let calls = 0;
    const flaky = {
      coldAuthorAnswer: {
        findMany: async () => {
          calls += 1;
          if (calls === 1) throw new Error("transient");
          return [];
        },
      },
    } as unknown as PrismaClient;
    await expect(retrieveGuardedGold(flaky, CHAT_PROMPT)).rejects.toThrow(
      "transient",
    );
    await expect(retrieveGuardedGold(flaky, CHAT_PROMPT)).resolves.toEqual([]);
    expect(calls).toBe(2);
  });
});

describe("query concurrency", () => {
  it("runs prefix-fallback lookups concurrently, one per missed word", async () => {
    const { prisma, counts, max } = trackingPrisma();
    await retrieveDictCandidates(prisma, ["farmer", "market", "children"]);
    // One exact query, then all three misses fall back in parallel.
    expect(counts.lexExact).toBe(1);
    expect(counts.lexPrefix).toBe(3);
    expect(max()).toBeGreaterThanOrEqual(2);
  });

  it("overlaps the retrieval legs of buildRetrievalV2 instead of queueing them", async () => {
    const { prisma, counts, max } = trackingPrisma();
    await buildRetrievalV2(prisma, CHAT_PROMPT);
    // All legs actually ran...
    expect(counts.prompt).toBe(1);
    expect(counts.lexExact).toBe(1);
    expect(counts.pairs).toBe(1);
    expect(counts.gold).toBe(1);
    // ...and at least two of them were on the wire at the same time.
    expect(max()).toBeGreaterThanOrEqual(2);
  });
});
