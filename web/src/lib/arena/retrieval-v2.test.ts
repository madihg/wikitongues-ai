import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  ENGLISH_STOPWORDS,
  contentWords,
  renderDictionaryLine,
  buildRetrievalV2,
  wantsStructureExamples,
} from "./retrieval-v2";
import { IGALA_SYSTEM_V2, buildUserTurnV2 } from "@/lib/generation-prompt-v2";
import { buildProtectedSet, checkStatic } from "@/lib/eval/leak-guard";

/**
 * The serving path v2 has one job the tests must hold it to: put attested
 * forms and structural examples in front of the model WITHOUT ever putting a
 * frozen prompt's own answer key there. The Prisma client is injected
 * (buildRetrievalV2(prisma, ...)), same pattern as collect.test.ts, so every
 * test runs against an in-memory fake - no database.
 */

interface FakeLexRow {
  id: string;
  headword: string;
  gloss: string;
  glossFolded: string;
  confidence: number;
}

interface FakePair {
  id: string;
  igala: string;
  english: string;
}

interface FakeGold {
  id: string;
  promptId: string; // cuid of the source prompt
  answerText: string;
  bucket: string | null;
  prompt: {
    promptId: string;
    text: string;
    isHoldout: boolean;
    bucket: string | null;
  };
}

function fakePrisma(opts: {
  lex?: FakeLexRow[];
  pairs?: FakePair[];
  gold?: FakeGold[];
  promptRow?: { id: string; ownGold: string[] } | null;
}): PrismaClient {
  const lex = opts.lex ?? [];
  return {
    prompt: {
      findUnique: async () =>
        opts.promptRow
          ? {
              id: opts.promptRow.id,
              coldAuthorAnswers: opts.promptRow.ownGold.map((answerText) => ({
                answerText,
              })),
            }
          : null,
    },
    lexEntry: {
      findMany: async (args: {
        where: { glossFolded: { in?: string[]; startsWith?: string } };
      }) => {
        const w = args.where.glossFolded;
        if (w.in) return lex.filter((r) => w.in!.includes(r.glossFolded));
        return lex.filter((r) => r.glossFolded.startsWith(w.startsWith!));
      },
    },
    coldAuthorAnswer: {
      findMany: async () =>
        (opts.gold ?? []).map((g) => ({
          ...g,
          consentTraining: true,
          isDemo: false,
          verificationStatus: "single_annotator",
        })),
    },
    // The ParallelPair leg is raw SQL over the DB-only englishTsv column, so
    // the fake stands in for the whole query: it returns what Postgres would.
    $queryRaw: async () => opts.pairs ?? [],
  } as unknown as PrismaClient;
}

const TRAIN_PROMPT = {
  promptId: "ig_train_001",
  text: "Write a short Igala greeting for the morning.",
  bucket: "register_honorifics",
  isHoldout: false,
};

describe("contentWords - the stopword filter", () => {
  it("ships a real stopword list, not a token gesture", () => {
    // ~120 words per the design; guard the order of magnitude so a refactor
    // cannot quietly swap in a 10-word list.
    expect(ENGLISH_STOPWORDS.size).toBeGreaterThanOrEqual(100);
  });

  it("drops function words, keeps content words in source order, dedupes", () => {
    expect(
      contentWords("What is the Igala word for water, and the water pot?"),
    ).toEqual(["igala", "word", "water", "pot"]);
  });

  it("folds case and punctuation so quoted words still match glossFolded", () => {
    expect(contentWords("Give the Igala word for 'Water'.")).toEqual([
      "give",
      "igala",
      "word",
      "water",
    ]);
  });
});

describe("renderDictionaryLine - the DiPMT-compact render", () => {
  it("renders a single sense as a bare statement", () => {
    expect(
      renderDictionaryLine("water", [
        { id: "l1", headword: "Ómi", gloss: "water", confidence: 1 },
      ]),
    ).toBe('"water" is Ómi.');
  });

  it("renders alternatives, warning when a sense means something else", () => {
    // The confusion pairing from the spec: a near-form with a DIFFERENT
    // meaning must carry its own gloss, because serving it bare would teach
    // exactly the near-form substitution Agnes flagged.
    expect(
      renderDictionaryLine("husband", [
        { id: "l1", headword: "ọ́kọ", gloss: "husband", confidence: 1 },
        { id: "l2", headword: "ọ́ya", gloss: "wife", confidence: 0.9 },
      ]),
    ).toBe('"husband" is ọ́kọ, or ọ́ya (wife - do not confuse).');
  });
});

describe("buildRetrievalV2 - dictionary lookup", () => {
  it("looks up by exact glossFolded, preferring higher confidence, max 3 senses", async () => {
    const prisma = fakePrisma({
      lex: [
        // Four attested forms for one gloss, deliberately out of confidence
        // order, to prove ordering and the 3-sense cap.
        {
          id: "a",
          headword: "úkwù",
          gloss: "money",
          glossFolded: "money",
          confidence: 0.6,
        },
        {
          id: "b",
          headword: "ókō",
          gloss: "money",
          glossFolded: "money",
          confidence: 1,
        },
        {
          id: "c",
          headword: "ẹ́gwà",
          gloss: "money",
          glossFolded: "money",
          confidence: 0.8,
        },
        {
          id: "d",
          headword: "ìhìám",
          gloss: "money",
          glossFolded: "money",
          confidence: 0.2,
        },
      ],
      promptRow: null,
    });
    const r = await buildRetrievalV2(prisma, {
      ...TRAIN_PROMPT,
      text: "What is the Igala word for money?",
    });
    // The fixture's ókō carries a Koelle-style macron (mid tone). Standard
    // orthography leaves mid unmarked, so the render transliterates it away:
    // the model sees óko, the stored row keeps the source notation.
    expect(r.dictionaryBlock).toContain('"money" is óko, or ẹ́gwà, or úkwù.');
    // The 4th sense never reaches the block or the audit trail.
    expect(r.dictionaryBlock).not.toContain("ìhìám");
    expect(r.contextIds).toEqual(
      expect.arrayContaining(["lex:b", "lex:c", "lex:a"]),
    );
    expect(r.contextIds).not.toContain("lex:d");
  });

  it("falls back to prefix match only on an exact miss, and says what the hit means", async () => {
    const prisma = fakePrisma({
      lex: [
        {
          id: "f1",
          headword: "ùgbó",
          gloss: "farming",
          glossFolded: "farming",
          confidence: 1,
        },
      ],
      promptRow: null,
    });
    const r = await buildRetrievalV2(prisma, {
      ...TRAIN_PROMPT,
      text: "Talk about a farm.",
    });
    expect(r.dictionaryBlock).toContain(
      '"farm" is ùgbó (farming - do not confuse).',
    );
  });

  it("returns an empty block, not a header over nothing, when nothing matches", async () => {
    const prisma = fakePrisma({ lex: [], promptRow: null });
    const r = await buildRetrievalV2(prisma, TRAIN_PROMPT);
    expect(r.dictionaryBlock).toBe("");
    expect(r.parallelBlock).toBe("");
    expect(r.contextIds).toEqual([]);
  });
});

describe("buildRetrievalV2 - the leak guard on holdout prompts", () => {
  // register_honorifics, not orthography: the adaptive gate withholds
  // parallel examples from lookup buckets entirely, which would leave the
  // parallel-pair leak vector unexercised. This bucket still receives every
  // block, so the guard is tested against all three vectors.
  const HOLDOUT = {
    promptId: "ig_bank_reg_001",
    text: "Give the Igala word for water.",
    bucket: "register_honorifics",
    isHoldout: true,
  };

  it("drops a parallel pair (and a lexicon entry) carrying the prompt's own gold", async () => {
    const prisma = fakePrisma({
      // The dictionary entry IS the answer key for this frozen prompt, and a
      // parallel pair happens to contain it too. Both arrived through
      // legitimate retrieval; both must be dropped, counted, and absent from
      // the audit trail. This is the exact 39.5% hole from the 2026-08-09
      // audit, planted deliberately.
      lex: [
        {
          id: "lw",
          headword: "Ómi",
          gloss: "water",
          glossFolded: "water",
          confidence: 1,
        },
      ],
      pairs: [
        { id: "p-leak", igala: "Ómi chẹ́ ùñmà.", english: "Water is good." },
        { id: "p-clean", igala: "Ẹ́là chẹ́ ùñmà.", english: "Food is good." },
      ],
      promptRow: { id: "cuid-holdout-1", ownGold: ["Ómi"] },
    });
    const r = await buildRetrievalV2(prisma, HOLDOUT);

    expect(r.leakReport.pass).toBe(false);
    expect(r.leakReport.hitCount).toBe(2);
    // Location only, never content - the guard's information-hygiene rule.
    expect(r.leakReport.hits.map((h) => h.where).sort()).toEqual([
      "lex:lw",
      "pp:p-leak",
    ]);

    expect(r.dictionaryBlock).not.toContain("Ómi");
    expect(r.parallelBlock).not.toContain("Ómi");
    expect(r.parallelBlock).toContain("Ẹ́là");
    expect(r.contextIds).toEqual(["pp:p-clean"]);
  });

  it("catches the leak through tone folding, not just verbatim", async () => {
    const prisma = fakePrisma({
      // Same word, different tone practice: the guard must still fire,
      // because a tone-stripped answer key is still the answer key.
      pairs: [{ id: "p1", igala: "omi kí ni?", english: "What is water?" }],
      promptRow: { id: "cuid-holdout-1", ownGold: ["Ómi"] },
    });
    const r = await buildRetrievalV2(prisma, HOLDOUT);
    expect(r.leakReport.hitCount).toBe(1);
    expect(r.parallelBlock).toBe("");
  });

  it("does not run the guard on train prompts, so nothing is over-dropped", async () => {
    const prisma = fakePrisma({
      pairs: [{ id: "p1", igala: "Ómi chẹ́ ùñmà.", english: "Water is good." }],
      // Even with own gold present, a non-holdout prompt serves everything:
      // scope B protects the benchmark, not ordinary generation.
      promptRow: { id: "cuid-train-1", ownGold: ["Ómi"] },
    });
    const r = await buildRetrievalV2(prisma, {
      ...TRAIN_PROMPT,
      text: "Give the Igala word for water.",
    });
    expect(r.leakReport.pass).toBe(true);
    expect(r.contextIds).toContain("pp:p1");
  });
});

describe("buildRetrievalV2 - gold exemplars", () => {
  it("serves train gold, never own-prompt or other-holdout gold, weakest first", async () => {
    const gold = (
      id: string,
      promptCuid: string,
      slug: string,
      text: string,
      isHoldout: boolean,
      answer: string,
    ): FakeGold => ({
      id,
      promptId: promptCuid,
      answerText: answer,
      bucket: "orthography",
      prompt: { promptId: slug, text, isHoldout, bucket: "orthography" },
    });
    const prisma = fakePrisma({
      gold: [
        // The prompt's own gold - rule 1, must never appear.
        gold(
          "g-own",
          "cuid-h1",
          "ig_bank_orth_001",
          "Give the Igala word for water.",
          true,
          "Ómi",
        ),
        // Another frozen prompt's gold - rule 2, must never appear either.
        gold(
          "g-frozen",
          "cuid-h2",
          "ig_bank_orth_002",
          "Give the Igala word for child.",
          true,
          "Ọ́ma",
        ),
        // Train gold - the legitimate exemplar pool.
        gold(
          "g-t1",
          "cuid-t1",
          "ig_train_010",
          "Give the Igala word for sun.",
          false,
          "Ójọ́",
        ),
        gold(
          "g-t2",
          "cuid-t2",
          "ig_train_011",
          "Give the Igala word for moon.",
          false,
          "Óchù",
        ),
      ],
      promptRow: { id: "cuid-h1", ownGold: ["Ómi"] },
    });
    const r = await buildRetrievalV2(prisma, {
      promptId: "ig_bank_orth_001",
      text: "Give the Igala word for water.",
      bucket: "orthography",
      isHoldout: true,
    });

    const answers = r.exampleTurns.map((t) => t.answer);
    expect(answers).not.toContain("Ómi");
    expect(answers).not.toContain("Ọ́ma");
    expect(answers.length).toBe(2);
    expect(r.contextIds).toEqual(
      expect.arrayContaining(["gold:g-t1", "gold:g-t2"]),
    );
  });
});

describe("IGALA_SYSTEM_V2 - static text is leak-free (Scope A)", () => {
  it("contains no frozen gold answer from a representative protected set", () => {
    // Scope A: static text ships on EVERY request, so a single collision
    // leaks an answer key on every query. The sample set mixes one-word
    // answers with a phrase, tone-marked as gold actually is; checkStatic
    // folds both tiers itself.
    const protectedSet = buildProtectedSet(
      ["Ómi", "ẹ́kọ̀", "Ọ́ma", "Áta mi", "Ọ̀gbẹ́nẹ́ chojẹ", "àdagbá"].map(
        (answerText, i) => ({ promptId: `ig_bank_${i}`, answerText }),
      ),
    );
    const report = checkStatic(
      [{ where: "IGALA_SYSTEM_V2", text: IGALA_SYSTEM_V2 }],
      protectedSet,
    );
    expect(report.pass).toBe(true);
    expect(report.hits).toEqual([]);
  });

  it("carries no grammar-rule prose section", () => {
    // Three ablations say grammar prose does not help generation. The
    // sections are fixed; a GRAMMAR section appearing here is a regression.
    expect(IGALA_SYSTEM_V2).not.toMatch(/^GRAMMAR$/m);
  });
});

describe("buildUserTurnV2 - assembly order", () => {
  it("puts the dictionary immediately above the question, contract last", () => {
    const turn = buildUserTurnV2(
      "Give the Igala word for water.",
      { parallelBlock: "PAIRS", dictionaryBlock: "DICT" },
      "orthography",
    );
    expect(turn).toBe(
      "PAIRS\n\nDICT\n\nGive the Igala word for water.\nAnswer in Igala only. Give the answer itself, nothing else.",
    );
  });

  it("omits empty blocks instead of leaving blank scaffolding", () => {
    const turn = buildUserTurnV2(
      "Question?",
      { parallelBlock: "", dictionaryBlock: "" },
      null,
    );
    expect(turn).toBe(
      "Question?\nAnswer in Igala only. Give the answer itself, nothing else.",
    );
  });
});

describe("dictionary serves orthography, never phonemic notation", () => {
  // The live assembly audit caught the dictionary serving chikhapo's phonemic
  // transcription verbatim: '"food" is ùǯɛũ.' under a system prompt that says
  // "copy attested spellings character for character". ǯ, ɛ, ɔ, ŋ and nasal
  // tildes are notation, not Igala - a speaker reading them sees a spelling
  // error, and spelling errors are meaning errors in Igala. These tests pin
  // the render-time transliteration so no phonemic character can reach a
  // model again.
  it("transliterates chikhapo phonemic forms to standard orthography", () => {
    const line = renderDictionaryLine("food", [
      { id: "1", headword: "ùǯɛũ", gloss: "food", confidence: 0.8 },
    ]);
    expect(line).toBe('"food" is ùjẹu.');
  });

  it("maps the documented correspondences: ɛ→ẹ ɔ→ọ ǯ→j ŋ→ñ", () => {
    const line = renderDictionaryLine("correct", [
      { id: "1", headword: "ɔ́kpàkpà", gloss: "correct", confidence: 0.8 },
      { id: "2", headword: "ŋmẹŋɛ", gloss: "right", confidence: 0.7 },
    ]);
    expect(line).not.toMatch(/[ɛɔǯŋɪʊ̄̃]/u);
    expect(line).toContain("ọ́kpàkpà");
    expect(line).toContain("ñmẹñẹ");
  });

  it("leaves real orthography untouched, including tone marks and dot-below", () => {
    const line = renderDictionaryLine("water", [
      { id: "1", headword: "Ómi", gloss: "water", confidence: 1 },
    ]);
    expect(line).toBe('"water" is Ómi.');
    const toned = renderDictionaryLine("child", [
      { id: "1", headword: "ọ́ma", gloss: "child", confidence: 1 },
    ]);
    expect(toned).toContain("ọ́ma");
  });
});

describe("wantsStructureExamples - the adaptive-assembly gate", () => {
  // Measured on the first sniff run: six Bible verses served to a one-word
  // lookup prompt cost -6.8/-9.0 stripped chrF vs v1, and the Bible register
  // bled into free-form output ("Jihofa" in a farmer story). Examples teach
  // structure; a prompt with a one-word answer has no structure to teach.
  it("withholds examples from lookup buckets", () => {
    expect(wantsStructureExamples("orthography", "anything")).toBe(false);
    expect(wantsStructureExamples("lexicon_disambig", "anything")).toBe(false);
  });

  it("serves examples to sentence-building buckets", () => {
    expect(wantsStructureExamples("idioms_metaphor", "x")).toBe(true);
    expect(wantsStructureExamples("register_honorifics", "x")).toBe(true);
    expect(wantsStructureExamples("cultural_values", "x")).toBe(true);
  });

  it("decides grammar_tone and bucketless chat by what the text asks for", () => {
    expect(
      wantsStructureExamples(
        "grammar_tone",
        "Translate 'The woman cooks food' into Igala",
      ),
    ).toBe(true);
    expect(
      wantsStructureExamples(
        null,
        "Give me a short story in Igala about a farmer",
      ),
    ).toBe(true);
    expect(
      wantsStructureExamples(null, "What is the Igala word for water?"),
    ).toBe(false);
  });
});
