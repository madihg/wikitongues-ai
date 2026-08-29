import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  NON_BIBLE_RESERVE,
  CORRECTIONS_K,
  MAX_CORRECTION_CHARS,
  REASON_SERVE_MAX,
  PARALLEL_INTRO_V4,
  CORRECTIONS_INTRO,
  isBibleSource,
  diversifyParallel,
  correctionReason,
  rankCorrections,
  renderCorrectionsBlock,
  buildRetrievalV4,
  type RankedPair,
  type CorrectionCandidate,
} from "./retrieval-v4";
import { contentWords, PARALLEL_K } from "./retrieval-v2";

/**
 * The v4 serving path adds two levers on top of v2's composition: the
 * non-Bible reservation in parallel retrieval (register protection) and the
 * corrections block (native mistake->repair demonstrations). These tests
 * hold both to their contracts - including the two that matter most:
 * byte-identical degradation to v2's ranking while the store is Bible-only,
 * and the leak guard covering the corrections exactly like every other
 * piece. Prisma is injected, so everything runs against an in-memory fake
 * (same pattern as retrieval-v2.test.ts).
 */

const BIBLE_SRC =
  "BSN IGL70 via HF dalaone/eng_igl_bible. Permission granted via Wikitongues outreach.";
const JWAL_SRC = "JWAL example sentences (Ejeba 2023), CC BY-NC waived";

function pair(id: string, source: string): RankedPair {
  return { id, igala: `ig-${id}`, english: `en-${id}`, source };
}

describe("isBibleSource - the register classifier", () => {
  it("classifies the live Bible provenance string and its family tokens", () => {
    expect(isBibleSource(BIBLE_SRC)).toBe(true);
    expect(isBibleSource("something IGL70 something")).toBe(true);
    expect(isBibleSource(JWAL_SRC)).toBe(false);
    expect(isBibleSource("Egbunu proverbs, permission on file")).toBe(false);
  });
});

describe("diversifyParallel - the register reservation", () => {
  const b = (n: number) => pair(`b${n}`, BIBLE_SRC);
  const j = (n: number) => pair(`j${n}`, JWAL_SRC);

  it("returns the general ranking untouched when no non-Bible pair matched", () => {
    // Today's store is Bible-only, so this is the live behavior: the v4
    // parallel leg must be exactly the v2 ranking - same rows, same order.
    const general = [b(1), b(2), b(3), b(4)];
    expect(diversifyParallel(general, [])).toEqual(general);
  });

  it("reserves up to NON_BIBLE_RESERVE slots, displacing only bottom-ranked Bible rows", () => {
    const out = diversifyParallel([b(1), b(2), b(3), b(4)], [j(1), j(2)]);
    expect(out).toHaveLength(PARALLEL_K);
    // The two strongest Bible matches survive; the reserve rows go LAST
    // (nearest the question once rendered - the strongest position).
    expect(out.map((p) => p.id)).toEqual(["b1", "b2", "j1", "j2"]);
  });

  it("counts non-Bible rows already in the general top-k against the reserve", () => {
    // j1 out-ranked the Bible on its own; only ONE more slot is reserved.
    const out = diversifyParallel([b(1), j(1), b(2), b(3)], [j(1), j(2)]);
    expect(out.map((p) => p.id)).toEqual(["b1", "j1", "b2", "j2"]);
  });

  it("never adds the same row twice and never exceeds the reserve", () => {
    const out = diversifyParallel(
      [b(1), b(2), b(3), b(4)],
      [j(1), j(2), j(3)], // three matches, reserve is 2
    );
    expect(out.filter((p) => !isBibleSource(p.source))).toHaveLength(
      NON_BIBLE_RESERVE,
    );
    expect(new Set(out.map((p) => p.id)).size).toBe(out.length);
  });

  it("appends without displacement when the general ranking has spare room", () => {
    const out = diversifyParallel([b(1), b(2)], [j(1), j(2)]);
    expect(out.map((p) => p.id)).toEqual(["b1", "b2", "j1", "j2"]);
  });

  it("never displaces a non-Bible row to seat another", () => {
    const out = diversifyParallel([j(1), j(2), b(1), b(2)], [j(3)]);
    // Reserve already satisfied by the general ranking - nothing changes.
    expect(out.map((p) => p.id)).toEqual(["j1", "j2", "b1", "b2"]);
  });
});

describe("correctionReason - composing the Reason line", () => {
  it("returns null when the row carries no reason at all", () => {
    expect(correctionReason(null, null)).toBeNull();
    expect(
      correctionReason({ v: 1, segments: [{ start: 0 }] }, null),
    ).toBeNull();
    expect(correctionReason(undefined, "   ")).toBeNull();
  });

  it("uses the row rationale, then per-segment reasons, deduplicated", () => {
    const segments = {
      v: 1,
      segments: [
        { start: 0, end: 3, reason: "wrong vowel" },
        { start: 5, end: 9, reason: "wrong vowel" }, // duplicate lesson
        { start: 10, end: 12, reason: "nasal is negation" },
      ],
    };
    expect(correctionReason(segments, "not Igala")).toBe(
      "not Igala; wrong vowel; nasal is negation",
    );
  });

  it("renders tag labels for segments carrying only tags", () => {
    const segments = {
      v: 1,
      segments: [{ start: 0, end: 3, reasonTags: ["wrong_word", "unsure"] }],
    };
    expect(correctionReason(segments, null)).toBe(
      "Wrong word or meaning, Not sure - please check",
    );
  });

  it("caps the served line - a 2,000-char stored reason must not dwarf the correction", () => {
    const long = "x".repeat(500);
    const out = correctionReason(null, long)!;
    expect(out.length).toBe(REASON_SERVE_MAX + 3);
    expect(out.endsWith("...")).toBe(true);
  });

  it("degrades malformed envelopes to no reason, never throws", () => {
    expect(correctionReason("garbage", null)).toBeNull();
    expect(correctionReason({ segments: "nope" }, null)).toBeNull();
    expect(correctionReason({ segments: [null, 42] }, null)).toBeNull();
  });
});

describe("rankCorrections - English-side prompt overlap", () => {
  const cand = (id: string, promptText: string): CorrectionCandidate => ({
    id,
    promptText,
    original: "o",
    corrected: "c",
    reason: null,
  });
  const words = contentWords(
    "Write a natural Igala blessing for a newborn child.",
  );

  it("ranks by shared content words and excludes zero-overlap rows outright", () => {
    const ranked = rankCorrections(words, [
      cand("far", "Describe the market day in your town."),
      cand("close", "Write a natural Igala blessing said over a newborn."),
      cand("mid", "Write a natural Igala greeting."),
    ]);
    expect(ranked.map((c) => c.id)).toEqual(["close", "mid"]);
  });

  it("caps at CORRECTIONS_K and breaks ties on id for determinism", () => {
    const tied = ["d", "b", "a", "c"].map((id) =>
      cand(id, "Write a natural Igala blessing."),
    );
    const ranked = rankCorrections(words, tied);
    expect(ranked).toHaveLength(CORRECTIONS_K);
    expect(ranked.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
});

describe("renderCorrectionsBlock - the served render", () => {
  it("renders the mandated three-line shape, Reason only when present", () => {
    const block = renderCorrectionsBlock([
      {
        id: "e1",
        promptText: "p",
        original: "Ọjọ̀mọ̀mọ̀ àgbà",
        corrected: "Agba abọ ọgijọ",
        reason: "honorific vocative first",
      },
      {
        id: "e2",
        promptText: "p",
        original: "bad",
        corrected: "good",
        reason: null,
      },
    ]);
    expect(block).toBe(
      `${CORRECTIONS_INTRO}\n\n` +
        "A model wrote: Ọjọ̀mọ̀mọ̀ àgbà\n" +
        "A speaker corrected it to: Agba abọ ọgijọ\n" +
        "Reason: honorific vocative first\n\n" +
        "A model wrote: bad\n" +
        "A speaker corrected it to: good",
    );
  });

  it("returns an empty string, not a header over nothing", () => {
    expect(renderCorrectionsBlock([])).toBe("");
  });
});

// ─── buildRetrievalV4 integration, against an in-memory fake ────────────────

interface FakeEdit {
  id: string;
  promptId: string; // cuid of the edited output's prompt
  originalText: string;
  correctedText: string;
  rationale: string | null;
  segments: unknown;
}

interface FakeEditPrompt {
  id: string;
  text: string;
  isHoldout: boolean;
}

function fakePrisma(opts: {
  lex?: {
    id: string;
    headword: string;
    gloss: string;
    glossFolded: string;
    confidence: number;
  }[];
  pairsGeneral?: RankedPair[];
  pairsNonBible?: RankedPair[];
  edits?: FakeEdit[];
  editPrompts?: FakeEditPrompt[];
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
      findMany: async (args: { where: { id: { in: string[] } } }) =>
        (opts.editPrompts ?? []).filter((p) => args.where.id.in.includes(p.id)),
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
    coldAuthorAnswer: { findMany: async () => [] },
    outputEdit: { findMany: async () => opts.edits ?? [] },
    // Two raw queries: the general ranking and the non-Bible reserve. The
    // fake dispatches on the reserve's distinguishing predicate, standing in
    // for what Postgres would return for each.
    $queryRaw: async (q: unknown) => {
      const sql =
        (q as { sql?: string }).sql ??
        (q as { strings?: string[] }).strings?.join("") ??
        "";
      return sql.includes("!~*")
        ? (opts.pairsNonBible ?? [])
        : (opts.pairsGeneral ?? []);
    },
  } as unknown as PrismaClient;
}

const TRAIN_PROMPT = {
  promptId: "ig_train_100",
  text: "Write a natural Igala blessing for a newborn child.",
  bucket: "authenticity",
  isHoldout: false,
};

describe("buildRetrievalV4 - corrections retrieval", () => {
  const edits: FakeEdit[] = [
    {
      id: "e-close",
      promptId: "cuid-t1",
      originalText: "pseudo-igala",
      correctedText: "Ẹnyọ ọma",
      rationale: null,
      segments: {
        v: 1,
        segments: [{ start: 0, end: 6, reason: "invented words" }],
      },
    },
    {
      id: "e-far",
      promptId: "cuid-t2",
      originalText: "x",
      correctedText: "y",
      rationale: null,
      segments: null,
    },
    {
      id: "e-frozen",
      promptId: "cuid-h1",
      originalText: "frozen-orig",
      correctedText: "frozen-corr",
      rationale: null,
      segments: null,
    },
    {
      id: "e-noop",
      promptId: "cuid-t1",
      originalText: "same",
      correctedText: "same",
      rationale: null,
      segments: null,
    },
    {
      id: "e-long",
      promptId: "cuid-t1",
      originalText: "L".repeat(MAX_CORRECTION_CHARS + 1),
      correctedText: "short",
      rationale: null,
      segments: null,
    },
  ];
  const editPrompts: FakeEditPrompt[] = [
    {
      id: "cuid-t1",
      text: "Write a natural Igala blessing said over a newborn.",
      isHoldout: false,
    },
    { id: "cuid-t2", text: "Describe the market day.", isHoldout: false },
    {
      id: "cuid-h1",
      text: "Write a natural Igala blessing for a child.",
      isHoldout: true,
    },
  ];

  it("serves overlap-matched train edits with their reasons; excludes holdout, no-op, oversized and zero-overlap rows", async () => {
    const prisma = fakePrisma({ edits, editPrompts, promptRow: null });
    const r = await buildRetrievalV4(prisma, TRAIN_PROMPT);
    expect(r.correctionsBlock).toContain("A model wrote: pseudo-igala");
    expect(r.correctionsBlock).toContain("A speaker corrected it to: Ẹnyọ ọma");
    expect(r.correctionsBlock).toContain("Reason: invented words");
    // e-frozen: its PROMPT is holdout - an edit there states frozen gold.
    expect(r.correctionsBlock).not.toContain("frozen-corr");
    // e-far: zero content-word overlap; e-noop and e-long: query-side rules.
    expect(r.contextIds).toEqual(["edit:e-close"]);
    expect(r.leakReport.pass).toBe(true);
  });

  it("never serves a prompt its own correction (self-exclusion, rule 1)", async () => {
    const prisma = fakePrisma({
      edits,
      editPrompts,
      // The serving prompt IS cuid-t1, the prompt e-close corrected.
      promptRow: { id: "cuid-t1", ownGold: [] },
    });
    const r = await buildRetrievalV4(prisma, TRAIN_PROMPT);
    expect(r.correctionsBlock).toBe("");
    expect(r.contextIds).toEqual([]);
  });

  it("leak-guards a correction carrying the holdout prompt's own gold", async () => {
    const prisma = fakePrisma({
      edits: [
        {
          id: "e-leak",
          promptId: "cuid-t1",
          originalText: "wrong blessing",
          // The corrected side IS this frozen prompt's gold answer.
          correctedText: "Ẹnyọ ọma",
          rationale: null,
          segments: null,
        },
        {
          id: "e-clean",
          promptId: "cuid-t3",
          originalText: "bad blessing words",
          correctedText: "Ẹla chẹ ùñmà",
          rationale: null,
          segments: null,
        },
      ],
      editPrompts: [
        ...editPrompts,
        {
          id: "cuid-t3",
          text: "Write a short blessing for a friend.",
          isHoldout: false,
        },
      ],
      promptRow: { id: "cuid-holdout-9", ownGold: ["Ẹnyọ ọma"] },
    });
    const r = await buildRetrievalV4(prisma, {
      promptId: "ig_bank_auth_099",
      text: "Write a natural Igala blessing for a newborn child.",
      bucket: "authenticity",
      isHoldout: true,
    });
    expect(r.leakReport.pass).toBe(false);
    expect(r.leakReport.hits.map((h) => h.where)).toContain("edit:e-leak");
    expect(r.correctionsBlock).not.toContain("Ẹnyọ ọma");
    expect(r.correctionsBlock).toContain("Ẹla chẹ ùñmà");
    expect(r.contextIds).toEqual(["edit:e-clean"]);
  });
});

describe("buildRetrievalV4 - source-diversified parallel retrieval", () => {
  it("reserves slots for non-Bible pairs and stamps the register guard on the block", async () => {
    const prisma = fakePrisma({
      pairsGeneral: [
        pairRow("b1", BIBLE_SRC),
        pairRow("b2", BIBLE_SRC),
        pairRow("b3", BIBLE_SRC),
        pairRow("b4", BIBLE_SRC),
      ],
      pairsNonBible: [pairRow("j1", JWAL_SRC)],
      promptRow: null,
    });
    const r = await buildRetrievalV4(prisma, TRAIN_PROMPT);
    expect(r.parallelBlock.startsWith(PARALLEL_INTRO_V4)).toBe(true);
    expect(r.parallelBlock).toContain("spell it");
    expect(r.contextIds).toEqual(["pp:b1", "pp:b2", "pp:b3", "pp:j1"]);
  });

  it("degrades to the plain ranking while the store is Bible-only (today's state)", async () => {
    const general = [pairRow("b1", BIBLE_SRC), pairRow("b2", BIBLE_SRC)];
    const prisma = fakePrisma({
      pairsGeneral: general,
      pairsNonBible: [],
      promptRow: null,
    });
    const r = await buildRetrievalV4(prisma, TRAIN_PROMPT);
    expect(r.contextIds).toEqual(["pp:b1", "pp:b2"]);
  });

  it("withholds pairs from lookup prompts - the v2 structure gate still applies", async () => {
    const prisma = fakePrisma({
      pairsGeneral: [pairRow("b1", BIBLE_SRC)],
      promptRow: null,
    });
    const r = await buildRetrievalV4(prisma, {
      promptId: "ig_train_101",
      text: "Give the Igala word for water.",
      bucket: "orthography",
      isHoldout: false,
    });
    expect(r.parallelBlock).toBe("");
  });

  function pairRow(id: string, source: string): RankedPair {
    return {
      id,
      igala: `Igala sentence ${id}`,
      english: `Blessing example ${id}`,
      source,
    };
  }
});
