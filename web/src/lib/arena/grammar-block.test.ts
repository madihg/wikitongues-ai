import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  buildGrammarBlock,
  buildGrammarBlocksByRowSet,
  GRAMMAR_CHUNK_TYPE,
  GRAMMAR_CHUNK_TYPE_V4_5,
  GRAMMAR_NOTE_STATUS,
  GRAMMAR_INTRO,
  GRAMMAR_K,
  grammarChunkTypesFor,
  grammarRowSetKey,
  MAX_GRAMMAR_CHARS,
  rankGrammarRules,
  renderGrammarBlock,
  commonWords,
  COMMON_WORD_MIN_ROWS,
} from "./grammar-block";
import { buildUserTurnV4, buildUserTurnV43 } from "@/lib/generation-prompt-v4";
import { buildV4FamilyTurn, V4_FAMILY_VERSION_LABELS } from "./frozen-exam";
import type { RetrievalV4Result } from "./retrieval-v4";

/**
 * The grammar leg. What these pin: ranking is by topic-weighted keyword
 * overlap with a floor; rendering never truncates a rule mid-sentence and
 * never exceeds the cap; a frozen prompt's own gold drops a rule exactly as
 * the v4 guard would; and the v4.2 turn is untouched by the block's
 * existence - only rag-v4-3 reads it.
 */

const ROWS = [
  {
    id: "r-greet",
    topic: "Igala greetings - the (w)ola frame and no word for hello",
    content:
      "The productive greeting is (w)ola plus a time noun: morning, afternoon, evening, night.",
  },
  {
    id: "r-num",
    topic: "Igala vigesimal numbers and market money counting",
    content:
      "The number system is base-20 and only adds or multiplies. Money in the market is counted in this system.",
  },
  {
    id: "r-plural",
    topic: "Igala number agreement - animacy, clitics, and count vs mass nouns",
    content:
      "Animate nouns take a plural prefix; inanimate nouns are unmarked and the verb carries the number.",
  },
  {
    id: "r-farewell",
    topic: "Igala farewells",
    content:
      "Goodbye is a fixed family of phrases, optionally followed by a blessing.",
  },
];

describe("rankGrammarRules", () => {
  it("ranks by topic-weighted overlap and applies the floor", () => {
    const ranked = rankGrammarRules(["greeting", "morning", "elder"], ROWS);
    expect(ranked[0].id).toBe("r-greet");
    // "greeting" meets "greetings" through the plural stem (topic, 3) and
    // "morning" hits content (1); "elder" hits nothing.
    expect(ranked[0].score).toBe(4);
    expect(ranked.every((r) => r.score >= 2)).toBe(true);
    expect(ranked.find((r) => r.id === "r-farewell")).toBeUndefined();
  });

  it("returns nothing for an empty query or an empty store", () => {
    expect(rankGrammarRules([], ROWS)).toEqual([]);
    expect(rankGrammarRules(["market"], [])).toEqual([]);
  });

  it("ignores words common to the store, once the store is big enough to tell", () => {
    // Nine rows all say "one word sentence"; only one is about goats. A
    // question about goats must reach that row on "goat" alone, and the
    // filler words must not drag every other row over the floor.
    const store = Array.from({ length: 9 }, (_, i) => ({
      id: `s-${i}`,
      topic: i === 4 ? "Igala goat plural" : `Igala rule ${i}`,
      content: "Write one word in one sentence.",
    }));
    expect(store.length).toBeGreaterThanOrEqual(COMMON_WORD_MIN_ROWS);
    expect(commonWords(store)).toEqual(
      new Set(["igala", "rule", "write", "one", "word", "sentence"]),
    );
    const ranked = rankGrammarRules(
      ["write", "one", "sentence", "goat"],
      store,
    );
    expect(ranked.map((r) => r.id)).toEqual(["s-4"]);
    // A small store keeps every word: the four-row fixture above is unchanged.
    expect(commonWords(ROWS)).toEqual(new Set());
  });

  it("caps at GRAMMAR_K and tiebreaks deterministically on id", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: `r-${String(i).padStart(2, "0")}`,
      topic: "market money counting",
      content: "",
    }));
    // Five rows: below COMMON_WORD_MIN_ROWS, so the shared topic words still
    // count and the cap alone decides.
    const ranked = rankGrammarRules(["market", "money"], many.slice(0, 5));
    expect(ranked).toHaveLength(GRAMMAR_K);
    expect(ranked.map((r) => r.id)).toEqual(["r-00", "r-01", "r-02"]);
  });
});

describe("renderGrammarBlock", () => {
  it("is empty with no rules and leads with the literal instruction otherwise", () => {
    expect(renderGrammarBlock([])).toBe("");
    const block = renderGrammarBlock([ROWS[0]]);
    expect(block.startsWith(GRAMMAR_INTRO)).toBe(true);
    expect(block).toContain(ROWS[0].topic);
    expect(block).toContain(ROWS[0].content);
  });

  it("drops a rule that would cross the cap whole, never truncating it", () => {
    const big = {
      id: "big",
      topic: "A very long rule",
      content: "x".repeat(MAX_GRAMMAR_CHARS),
    };
    const block = renderGrammarBlock([ROWS[1], big, ROWS[0]]);
    expect(block.length).toBeLessThanOrEqual(MAX_GRAMMAR_CHARS);
    expect(block).toContain(ROWS[1].topic);
    expect(block).not.toContain("A very long rule");
    // A later, smaller rule still fits after the oversized one was skipped.
    expect(block).toContain(ROWS[0].topic);
  });
});

describe("buildGrammarBlock", () => {
  function fakePrisma(golds: string[]): PrismaClient {
    return {
      ragEntry: { findMany: async () => ROWS },
      prompt: {
        findUnique: async () => ({
          coldAuthorAnswers: golds.map((answerText) => ({ answerText })),
        }),
      },
    } as unknown as PrismaClient;
  }

  it("serves matching rules on a train prompt with audit ids", async () => {
    const r = await buildGrammarBlock(fakePrisma([]), {
      promptId: "ig_x",
      text: "How do you count money at the market?",
      isHoldout: false,
    });
    expect(r.grammarBlock).toContain("vigesimal");
    expect(r.grammarIds).toContain("grammar:r-num");
    expect(r.leakReport.pass).toBe(true);
  });

  it("drops a rule that contains a frozen prompt's own gold", async () => {
    // The gold answer IS a phrase inside the greetings rule's content.
    const r = await buildGrammarBlock(
      fakePrisma(["morning, afternoon, evening, night"]),
      {
        promptId: "ig_frozen",
        text: "Give the greeting for the morning and the evening",
        isHoldout: true,
      },
    );
    expect(r.grammarBlock).not.toContain("(w)ola");
    expect(r.grammarIds).not.toContain("grammar:r-greet");
    expect(r.leakReport.hitCount).toBeGreaterThan(0);
  });
});

describe("row sets per label (the v4.5 rows reach rag-v4-5 only)", () => {
  /** A fake that records every findMany `where` and serves rows by chunkType. */
  function recordingPrisma() {
    const wheres: unknown[] = [];
    const store = [
      {
        id: "base-1",
        chunkType: GRAMMAR_CHUNK_TYPE,
        topic: "zebra quokka - the base rule",
        content: "zebra quokka",
        verificationStatus: "community_verified",
      },
      {
        id: "v45-1",
        chunkType: GRAMMAR_CHUNK_TYPE_V4_5,
        topic: "zebra quokka - the v4.5 rule",
        content: "zebra quokka",
        verificationStatus: "community_verified",
      },
    ];
    const prisma = {
      ragEntry: {
        findMany: async (args: {
          where: { chunkType: string | { in: string[] } };
        }) => {
          wheres.push(args.where);
          const ct = args.where.chunkType;
          const wanted = typeof ct === "string" ? [ct] : ct.in;
          return store.filter((r) => wanted.includes(r.chunkType));
        },
      },
      prompt: { findUnique: async () => null },
    } as unknown as PrismaClient;
    return { prisma, wheres };
  }
  const prompt = { promptId: "p-z", text: "zebra quokka", isHoldout: false };

  it("every label but rag-v4-5 reads grammar_rule alone; rag-v4-5 adds its own chunkType", () => {
    expect(grammarChunkTypesFor()).toEqual(["grammar_rule"]);
    expect(grammarChunkTypesFor(null)).toEqual(["grammar_rule"]);
    for (const label of V4_FAMILY_VERSION_LABELS) {
      expect(grammarChunkTypesFor(label)).toEqual(
        label === "rag-v4-5"
          ? ["grammar_rule", "grammar_rule_v4_5"]
          : ["grammar_rule"],
      );
    }
  });

  it("v4.4's query is byte-identical to the pre-v4.5 query, with or without a label", async () => {
    const { prisma, wheres } = recordingPrisma();
    const before = { language: "igala", chunkType: "grammar_rule" };
    const noLabel = await buildGrammarBlock(prisma, prompt);
    const v44 = await buildGrammarBlock(prisma, prompt, "rag-v4-4");
    const v43 = await buildGrammarBlock(prisma, prompt, "rag-v4-3");
    expect(wheres).toEqual([before, before, before]);
    for (const r of [noLabel, v44, v43]) {
      expect(r.grammarIds).toEqual(["grammar:base-1"]);
      expect(r.grammarBlock).not.toContain("the v4.5 rule");
    }
  });

  it("rag-v4-5 reads both chunkTypes and can serve its own rows", async () => {
    const { prisma, wheres } = recordingPrisma();
    const r = await buildGrammarBlock(prisma, prompt, "rag-v4-5");
    expect(wheres).toEqual([
      {
        language: "igala",
        chunkType: { in: ["grammar_rule", "grammar_rule_v4_5"] },
      },
    ]);
    expect(r.grammarIds).toEqual(
      expect.arrayContaining(["grammar:base-1", "grammar:v45-1"]),
    );
  });

  it("a multi-column turn builds one block per row set, never twice for one set", async () => {
    const built: string[] = [];
    const build = async (label: string) => {
      built.push(label);
      return {
        grammarBlock: `BLOCK ${grammarRowSetKey(label)}`,
        grammarIds: [],
        leakReport: { pass: true, hitCount: 0, hits: [] },
      };
    };
    expect(await buildGrammarBlocksByRowSet([], build)).toBeNull();
    const byKey = await buildGrammarBlocksByRowSet(
      ["rag-v4-3", "rag-v4-4", "rag-v4-5", "rag-v4-4"],
      build,
    );
    // v4.3 and v4.4 share one block; v4.5 gets its own.
    expect(built).toEqual(["rag-v4-3", "rag-v4-5"]);
    expect(byKey!.get(grammarRowSetKey("rag-v4-4"))!.grammarBlock).toBe(
      "BLOCK grammar_rule",
    );
    expect(byKey!.get(grammarRowSetKey("rag-v4-5"))!.grammarBlock).toBe(
      "BLOCK grammar_rule+grammar_rule_v4_5",
    );
  });
});

describe("grammar notes stay in the store", () => {
  it("never serves a scholarship_note row, however well it matches", async () => {
    // Grade-C rows (one evidence class) are stored for the v1 path and the
    // next failure mine; the v4.3 block is prompt-adjacent, so the two-class
    // contract applies and the status is the switch.
    const note = {
      id: "note-1",
      topic: "zebra quokka - the zebra quokka rule",
      content: "zebra quokka zebra quokka",
      verificationStatus: GRAMMAR_NOTE_STATUS,
    };
    const served = {
      id: "served-1",
      topic: "zebra quokka - the served rule",
      content: "zebra quokka",
      verificationStatus: "community_verified",
    };
    const prisma = {
      ragEntry: { findMany: async () => [note, served] },
      prompt: { findUnique: async () => null },
    } as unknown as PrismaClient;
    const r = await buildGrammarBlock(prisma, {
      promptId: "p-zebra",
      text: "zebra quokka",
      isHoldout: false,
    });
    expect(r.grammarIds).toEqual(["grammar:served-1"]);
    expect(r.grammarBlock).not.toContain("the zebra quokka rule");
  });
});

describe("the v4.3 turn", () => {
  const retrieval: RetrievalV4Result = {
    correctionsBlock: "CORRECTIONS",
    parallelBlock: "PARALLEL",
    dictionaryBlock: "DICTIONARY",
    exampleTurns: [],
    contextIds: [],
    leakReport: { pass: true, hitCount: 0, hits: [] },
  };
  const prompt = { text: "Q?", bucket: null };

  it("puts the grammar block first and leaves everything after it byte-identical to v4", () => {
    const v4 = buildUserTurnV4(prompt.text, retrieval, null);
    const v43 = buildUserTurnV43(prompt.text, retrieval, "GRAMMAR", null);
    expect(v43).toBe(`GRAMMAR\n\n${v4}`);
    expect(buildUserTurnV43(prompt.text, retrieval, "", null)).toBe(v4);
  });

  it("only rag-v4-3, rag-v4-4 and rag-v4-5 read the block; every other label ignores it", () => {
    const grammar = { grammarBlock: "GRAMMAR" };
    for (const label of ["rag-v4-3", "rag-v4-4", "rag-v4-5"] as const) {
      const turn = buildV4FamilyTurn(label, prompt, retrieval, grammar);
      expect(turn.args.userMessage.startsWith("GRAMMAR\n\n")).toBe(true);
    }
    for (const label of [
      "rag-v4",
      "rag-v4-1",
      "rag-v4-1-norepair",
      "rag-v4-2",
    ] as const) {
      const withBlock = buildV4FamilyTurn(label, prompt, retrieval, grammar);
      const without = buildV4FamilyTurn(label, prompt, retrieval);
      expect(withBlock.args.userMessage).toBe(without.args.userMessage);
      expect(withBlock.args.userMessage).not.toContain("GRAMMAR");
    }
  });

  it("v4.3 serves the v4.2 system prompt byte for byte, and the repair round with names", () => {
    const v42 = buildV4FamilyTurn("rag-v4-2", prompt, retrieval);
    const v43 = buildV4FamilyTurn("rag-v4-3", prompt, retrieval);
    expect(v43.args.systemPromptOverride).toBe(v42.args.systemPromptOverride);
    expect(v43.opts.checkNames).toBe(true);
  });
});
