import { describe, it, expect } from "vitest";
import {
  retrieveGoldExamples,
  buildGoldExampleTurns,
  normalizeForMatch,
  charNgrams,
  diceCoefficient,
  buildIdf,
  type GoldPoolEntry,
  type GoldRetrievalQuery,
} from "./gold-retrieval";

/** A pool entry with sane defaults; override only what a test cares about. */
function gold(over: Partial<GoldPoolEntry> & { id: string }): GoldPoolEntry {
  return {
    promptId: `p_${over.id}`,
    promptText: "Write the Igala word for 'thing'.",
    answerText: "ẹnẹ",
    bucket: "orthography",
    isHoldout: false,
    isDemo: false,
    consentTraining: true,
    verificationStatus: "single_annotator",
    ...over,
  };
}

const heldOutQuery: GoldRetrievalQuery = {
  promptId: "frozen_1",
  text: "Write the Igala word for 'water' with correct spelling and tone marks.",
  bucket: "orthography",
  isHoldout: true,
};

describe("contamination guard", () => {
  it("never retrieves gold belonging to the prompt being answered", () => {
    const pool = [
      // The answer key itself, and a very strong lexical match by construction.
      gold({
        id: "self",
        promptId: "frozen_1",
        promptText: heldOutQuery.text,
        answerText: "ANSWER KEY",
      }),
      gold({
        id: "other",
        promptId: "train_1",
        promptText: "Write the Igala word for 'fire'.",
        answerText: "ọkụ",
      }),
    ];
    const result = retrieveGoldExamples(heldOutQuery, pool, { k: 5 });

    expect(result.examples.map((e) => e.id)).toEqual(["other"]);
    expect(result.examples.some((e) => e.answer === "ANSWER KEY")).toBe(false);
    expect(result.excluded.selfPrompt).toBe(1);
  });

  it("never retrieves gold from ANY other held-out prompt for a held-out query", () => {
    const pool = [
      gold({
        id: "frozen_sibling",
        promptId: "frozen_2",
        promptText:
          "Write the Igala word for 'water' with correct spelling and tone.",
        answerText: "LEAKED FROM THE BANK",
        isHoldout: true,
      }),
      gold({
        id: "train_ok",
        promptId: "train_1",
        promptText: "Write the Igala word for 'yam'.",
        answerText: "ọkụchị",
      }),
    ];
    const result = retrieveGoldExamples(heldOutQuery, pool, { k: 5 });

    expect(result.examples.map((e) => e.id)).toEqual(["train_ok"]);
    expect(result.excluded.holdoutSource).toBe(1);
  });

  it("cannot be talked into leaking: allowHoldoutSources is ignored for a held-out query", () => {
    const pool = [
      gold({
        id: "frozen_sibling",
        promptId: "frozen_2",
        promptText: heldOutQuery.text,
        answerText: "LEAKED",
        isHoldout: true,
      }),
    ];
    const result = retrieveGoldExamples(heldOutQuery, pool, {
      k: 5,
      allowHoldoutSources: true,
    });

    expect(result.examples).toHaveLength(0);
    expect(result.holdoutSourcesAllowed).toBe(false);
    expect(result.excluded.holdoutSource).toBe(1);
  });

  it("returns nothing rather than something contaminated when the pool is all held-out", () => {
    const pool = [
      gold({ id: "a", promptId: "frozen_2", isHoldout: true }),
      gold({ id: "b", promptId: "frozen_3", isHoldout: true }),
      gold({ id: "c", promptId: "frozen_1", isHoldout: true }),
    ];
    const result = retrieveGoldExamples(heldOutQuery, pool, { k: 5 });
    expect(result.examples).toEqual([]);
    expect(result.eligibleSize).toBe(0);
  });

  it("still excludes held-out gold by default for a TRAIN query, and self-prompt always", () => {
    const trainQuery: GoldRetrievalQuery = {
      promptId: "train_9",
      text: "Write the Igala word for 'market'.",
      bucket: "orthography",
      isHoldout: false,
    };
    const pool = [
      gold({ id: "self", promptId: "train_9", answerText: "SELF" }),
      gold({ id: "frozen", promptId: "frozen_2", isHoldout: true }),
      gold({ id: "peer", promptId: "train_3" }),
    ];
    const result = retrieveGoldExamples(trainQuery, pool, { k: 5 });
    expect(result.examples.map((e) => e.id)).toEqual(["peer"]);
    expect(result.excluded.selfPrompt).toBe(1);
    expect(result.excluded.holdoutSource).toBe(1);
  });

  it("lets a TRAIN query opt in to held-out sources, but never to its own gold", () => {
    const trainQuery: GoldRetrievalQuery = {
      promptId: "train_9",
      text: "Write the Igala word for 'market'.",
      bucket: "orthography",
      isHoldout: false,
    };
    const pool = [
      gold({ id: "self", promptId: "train_9" }),
      gold({ id: "frozen", promptId: "frozen_2", isHoldout: true }),
    ];
    const result = retrieveGoldExamples(trainQuery, pool, {
      k: 5,
      allowHoldoutSources: true,
    });
    expect(result.examples.map((e) => e.id)).toEqual(["frozen"]);
    expect(result.excluded.selfPrompt).toBe(1);
    expect(result.holdoutSourcesAllowed).toBe(true);
  });

  it("drops demo rows and rows without training consent", () => {
    const pool = [
      gold({ id: "demo", promptId: "train_1", isDemo: true }),
      gold({ id: "noconsent", promptId: "train_2", consentTraining: false }),
      gold({ id: "blank", promptId: "train_3", answerText: "   " }),
      gold({ id: "ok", promptId: "train_4" }),
    ];
    const result = retrieveGoldExamples(heldOutQuery, pool, { k: 5 });
    expect(result.examples.map((e) => e.id)).toEqual(["ok"]);
    expect(result.excluded).toMatchObject({
      demo: 1,
      noConsent: 1,
      empty: 1,
    });
  });

  it("the guard holds across every frozen prompt in a realistic mixed pool", () => {
    // 5 frozen prompts x 3 golds, plus 5 train prompts x 2 golds.
    const pool: GoldPoolEntry[] = [];
    for (let p = 0; p < 5; p++) {
      for (let g = 0; g < 3; g++) {
        pool.push(
          gold({
            id: `frozen_${p}_${g}`,
            promptId: `frozen_${p}`,
            promptText: `Frozen prompt ${p}: write the Igala word for thing ${p}.`,
            isHoldout: true,
          }),
        );
      }
    }
    for (let p = 0; p < 5; p++) {
      for (let g = 0; g < 2; g++) {
        pool.push(
          gold({
            id: `train_${p}_${g}`,
            promptId: `train_${p}`,
            promptText: `Train prompt ${p}: write the Igala word for thing ${p}.`,
          }),
        );
      }
    }

    for (let p = 0; p < 5; p++) {
      const q: GoldRetrievalQuery = {
        promptId: `frozen_${p}`,
        text: `Frozen prompt ${p}: write the Igala word for thing ${p}.`,
        bucket: "orthography",
        isHoldout: true,
      };
      const result = retrieveGoldExamples(q, pool, { k: 8 });
      expect(result.examples.length).toBeGreaterThan(0);
      for (const ex of result.examples) {
        expect(ex.promptId.startsWith("frozen_")).toBe(false);
        expect(ex.promptId).not.toBe(q.promptId);
      }
    }
  });
});

describe("ranking", () => {
  it("puts same-bucket candidates strictly ahead of a better-matching other bucket", () => {
    const q: GoldRetrievalQuery = {
      promptId: "frozen_1",
      text: "Explain the meaning of a common Igala proverb about legacy.",
      bucket: "idioms_metaphor",
      isHoldout: true,
    };
    const pool = [
      // Near-identical wording, wrong bucket.
      gold({
        id: "wrong_bucket",
        promptId: "t1",
        promptText:
          "Explain the meaning of a common Igala proverb about legacy.",
        bucket: "orthography",
      }),
      // Unrelated wording, right bucket.
      gold({
        id: "right_bucket",
        promptId: "t2",
        promptText: "Give an Igala saying used when a harvest fails.",
        bucket: "idioms_metaphor",
      }),
    ];
    const result = retrieveGoldExamples(q, pool, { k: 2 });
    expect(result.examples.map((e) => e.id)).toEqual([
      "right_bucket",
      "wrong_bucket",
    ]);
    expect(result.examples[0].sameBucket).toBe(true);
  });

  it("ranks by content word, not by shared boilerplate (IDF is doing the work)", () => {
    const q: GoldRetrievalQuery = {
      promptId: "frozen_1",
      text: "Write the Igala word for 'market' with correct spelling and tone marks.",
      bucket: "orthography",
      isHoldout: true,
    };
    // IDF only discriminates once the boilerplate is actually frequent, which
    // is the real corpus condition: this bank has dozens of "Write the Igala
    // word for X with correct spelling and tone marks" prompts. Build that.
    const filler = [
      "father",
      "mother",
      "child",
      "house",
      "food",
      "yam",
      "money",
      "name",
    ].map((w, i) =>
      gold({
        id: `filler_${i}`,
        promptId: `f${i}`,
        promptText: `Write the Igala word for '${w}' with correct spelling and tone marks.`,
      }),
    );
    const pool = [
      ...filler,
      gold({
        id: "content_match",
        promptId: "t2",
        promptText:
          "Write the Igala word for 'market' day and name the market cycle.",
      }),
    ];
    const result = retrieveGoldExamples(q, pool, { k: 3 });
    // The one sharing the CONTENT word beats the eight sharing only boilerplate.
    expect(result.examples[0].id).toBe("content_match");
    // And the boilerplate neighbours are all scored below it, not equal to it.
    expect(result.examples[0].score).toBeGreaterThan(result.examples[1].score);
  });

  it("returns one exemplar per source prompt by default, so K questions means K distinct questions", () => {
    const pool = [
      gold({ id: "a1", promptId: "t1", answerText: "one" }),
      gold({ id: "a2", promptId: "t1", answerText: "two" }),
      gold({ id: "a3", promptId: "t1", answerText: "three" }),
      gold({ id: "b1", promptId: "t2", answerText: "four" }),
    ];
    const result = retrieveGoldExamples(heldOutQuery, pool, { k: 4 });
    expect(result.examples).toHaveLength(2);
    expect(new Set(result.examples.map((e) => e.promptId)).size).toBe(2);
  });

  it("honours maxPerPrompt above 1", () => {
    const pool = [
      gold({ id: "a1", promptId: "t1" }),
      gold({ id: "a2", promptId: "t1" }),
      gold({ id: "a3", promptId: "t1" }),
    ];
    const result = retrieveGoldExamples(heldOutQuery, pool, {
      k: 4,
      maxPerPrompt: 2,
    });
    expect(result.examples).toHaveLength(2);
  });

  it("prefers the better-verified answer when one prompt supplies the exemplar", () => {
    const pool = [
      gold({
        id: "zzz_single",
        promptId: "t1",
        verificationStatus: "single_annotator",
      }),
      gold({
        id: "aaa_expert",
        promptId: "t1",
        verificationStatus: "expert_reviewed",
      }),
    ];
    const result = retrieveGoldExamples(heldOutQuery, pool, { k: 1 });
    expect(result.examples[0].id).toBe("aaa_expert");
  });

  it("caps at k and is deterministic across repeated calls", () => {
    const pool = Array.from({ length: 30 }, (_, i) =>
      gold({
        id: `g${i}`,
        promptId: `t${i}`,
        promptText: `Write the Igala word for thing number ${i}.`,
      }),
    );
    const a = retrieveGoldExamples(heldOutQuery, pool, { k: 6 });
    const b = retrieveGoldExamples(heldOutQuery, pool, { k: 6 });
    expect(a.examples).toHaveLength(6);
    expect(a.examples.map((e) => e.id)).toEqual(b.examples.map((e) => e.id));
  });

  it("handles an empty pool and k = 0 without throwing", () => {
    expect(retrieveGoldExamples(heldOutQuery, [], { k: 5 }).examples).toEqual(
      [],
    );
    expect(
      retrieveGoldExamples(heldOutQuery, [gold({ id: "a", promptId: "t" })], {
        k: 0,
      }).examples,
    ).toEqual([]);
  });

  it("treats a null query bucket as matching nothing rather than everything", () => {
    const q: GoldRetrievalQuery = {
      promptId: "frozen_1",
      text: "Write the Igala word for 'water'.",
      bucket: null,
      isHoldout: true,
    };
    const result = retrieveGoldExamples(
      q,
      [gold({ id: "a", promptId: "t1", bucket: null })],
      { k: 2 },
    );
    expect(result.examples[0].sameBucket).toBe(false);
  });
});

describe("similarity primitives", () => {
  it("folds diacritics and case so tone variants match", () => {
    expect(normalizeForMatch("Ọ̀jọ́ dú!")).toBe("ojo du");
  });

  it("scores dice at 1 for identical strings and 0 for disjoint ones", () => {
    expect(diceCoefficient(charNgrams("water"), charNgrams("water"))).toBe(1);
    expect(diceCoefficient(charNgrams("abc"), charNgrams("xyz"))).toBe(0);
  });

  it("gives a rarer term a higher IDF than a term in every document", () => {
    const idf = buildIdf([
      "write the igala word for water",
      "write the igala word for fire",
      "write the igala word for yam",
    ]);
    expect(idf.get("water")!).toBeGreaterThan(idf.get("igala")!);
  });
});

describe("buildGoldExampleTurns", () => {
  it("emits alternating user/assistant turns with the closest match last", () => {
    const result = retrieveGoldExamples(
      heldOutQuery,
      [
        gold({
          id: "far",
          promptId: "t1",
          promptText: "Name an Igala festival.",
          answerText: "FAR",
        }),
        gold({
          id: "near",
          promptId: "t2",
          promptText: "Write the Igala word for 'water'.",
          answerText: "NEAR",
        }),
      ],
      { k: 2 },
    );
    const turns = buildGoldExampleTurns(result.examples, heldOutQuery.text);
    expect(turns.map((t) => t.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    // Best match sits nearest the real question.
    expect(turns[turns.length - 1].content).toBe("NEAR");
  });

  it("drops an exemplar whose question is verbatim the prompt being graded", () => {
    const turns = buildGoldExampleTurns(
      [
        {
          id: "x",
          promptId: "other",
          question: heldOutQuery.text,
          answer: "LEAK",
          bucket: "orthography",
          score: 1,
          sameBucket: true,
        },
      ],
      heldOutQuery.text,
    );
    expect(turns).toEqual([]);
  });

  it("returns nothing for no examples", () => {
    expect(buildGoldExampleTurns([])).toEqual([]);
  });
});
