import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { computeMethodMetrics } from "./method-metrics";
import { toPublicMethodMetrics } from "./public-method-metrics";

/**
 * BYTE PARITY with the code as it stood before the 2026-10-10 speed-up.
 *
 * That change made the uncached computation about twenty times cheaper (see
 * the COST note in method-metrics.ts) on one condition: not a single number
 * moves. This file is the proof that travels with the code. It builds a
 * synthetic world that exercises every score and every leak path, runs
 * computeMethodMetrics over it, and compares the serialized result - the full
 * unrounded MethodMetrics and the public payload - with a payload RECORDED
 * from the commit before the change (method-metrics.parity.recorded.json,
 * `recordedFrom` names the commit).
 *
 * The recording is a serialization of doubles, and JSON round-trips a double
 * exactly, so "equal after JSON.stringify" is "identical to the last bit".
 *
 * To re-record (only when a change is MEANT to move a number, and then say so
 * in the commit): check out the commit to record from, copy this file in, and
 *   RECORD_METHOD_METRICS_PARITY=<commit> pnpm exec vitest run src/lib/method-metrics.parity.test.ts
 *
 * Every string in the world is generated: no speaker's answer, no frozen
 * prompt and no corpus text is in this file or in the recording (the
 * repository is public). The made-up words are built from z, q, x and v so
 * they cannot collide with the language.
 */

const RECORDED_PATH = fileURLToPath(
  new URL("./method-metrics.parity.recorded.json", import.meta.url),
);
const RECORD = process.env.RECORD_METHOD_METRICS_PARITY;
const PINNED_NOW = "2026-10-10T09:00:00.000Z";

// ─── deterministic text ─────────────────────────────────────────────────────

/** Small seeded generator, local to this file so the fixture depends on
 * nothing the code under test could change. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}
const pick = <T>(r: () => number, xs: readonly T[]): T =>
  xs[Math.floor(r() * xs.length)];

const DOT_E = "ẹ";
const DOT_O = "ọ";
const GRAVE = "̀";
const ACUTE = "́";
const MACRON = "̄";
const VOWELS = ["a", "e", "i", "o", "u", DOT_E, DOT_O] as const;
const TONES = ["", "", GRAVE, ACUTE, MACRON] as const;
/** Answer words: one of z q x v, a vowel, sometimes a tone mark. */
const ANSWER_ONSETS = ["z", "q", "x", "v"] as const;
/** Filler words: a two-consonant onset no answer word has, so filler can
 * never contain an answer by accident - every leak below is deliberate. */
const FILLER_ONSETS = ["j" + "q", "k" + "x", "w" + "z", "g" + "v"] as const;

function word(r: () => number, onsets: readonly string[]): string {
  const syllables = 2 + Math.floor(r() * 2);
  let w = "";
  for (let i = 0; i < syllables; i++) {
    w += pick(r, onsets) + pick(r, VOWELS) + pick(r, TONES);
  }
  return w.normalize("NFC");
}
function words(r: () => number, n: number, onsets: readonly string[]): string[] {
  return Array.from({ length: n }, () => word(r, onsets));
}
const filler = (r: () => number, n: number) =>
  words(r, n, FILLER_ONSETS).join(" ");

/** Remove the three tone marks this fixture uses; the dotted vowels stay. */
const untoned = (s: string) =>
  s
    .normalize("NFD")
    .replace(new RegExp(`[${GRAVE}${ACUTE}${MACRON}]`, "g"), "")
    .normalize("NFC");
/** Put an acute on every plain vowel: the over-marked answer. */
const overToned = (s: string) =>
  untoned(s)
    .replace(/[aeiou]/g, (v) => v + ACUTE)
    .normalize("NFC");

// ─── the world ──────────────────────────────────────────────────────────────

interface Prompt {
  id: string;
  slug: string;
  /** Words in the base answer: 1 for most, a sentence or a paragraph for a few. */
  length: number;
  /** How many of the six speakers answered. */
  speakers: number;
}

const SPEAKER_COUNTS = [3, 4, 2, 5, 3, 1, 0, 4, 3, 2, 5, 3, 4, 2, 6, 3, 2, 4, 1, 3];
const LENGTHS = [1, 1, 4, 1, 28, 1, 1, 6, 1, 1, 45, 2, 1, 1, 9, 1, 1, 60, 1, 3];
const PROMPTS: Prompt[] = SPEAKER_COUNTS.map((speakers, i) => ({
  id: `prompt-row-${i + 1}`,
  slug: `fx_parity_${String(i + 1).padStart(2, "0")}`,
  length: LENGTHS[i],
  speakers,
}));

interface Gold {
  id: string;
  promptId: string;
  answerText: string;
  annotatorId: string;
  createdAt: Date;
  provenance: string;
}

const day = (n: number, hour = 12) =>
  new Date(Date.UTC(2026, 6, 1 + n, hour, 0, 0));

/** One speaker's version of the base answer. */
function speakerVariant(base: string[], s: number, r: () => number): string {
  const ws = [...base];
  if (s % 5 === 1) return untoned(ws.join(" "));
  if (s % 5 === 2) ws[Math.floor(r() * ws.length)] = word(r, ANSWER_ONSETS);
  if (s % 5 === 3 && ws.length > 1) ws.push(ws.shift()!);
  if (s % 5 === 4) ws.push(word(r, ANSWER_ONSETS));
  return ws.join(ws.length > 8 && s % 2 === 0 ? ", " : " ");
}

function buildGolds(): { golds: Gold[]; baseBySlug: Map<string, string[]> } {
  const golds: Gold[] = [];
  const baseBySlug = new Map<string, string[]>();
  PROMPTS.forEach((p, i) => {
    const r = rng(1000 + i);
    const base = words(r, p.length, ANSWER_ONSETS);
    baseBySlug.set(p.slug, base);
    for (let s = 0; s < p.speakers; s++) {
      golds.push({
        id: `gold-${i + 1}-${s + 1}`,
        promptId: p.id,
        answerText: speakerVariant(base, s, r),
        annotatorId: `speaker-${s + 1}`,
        createdAt: day(i * 3 + s),
        provenance:
          (i + s) % 2 === 0
            ? "corrected_from_inadequate"
            : "speaker_authored_sourcefree",
      });
    }
    // Repeat submissions by the first speaker: a later exact repeat on every
    // fourth prompt, and on every fifth an EARLIER, different answer that
    // sits later in the array - "first answer" must mean first by time.
    if (p.speakers > 0 && i % 4 === 0) {
      golds.push({
        id: `gold-${i + 1}-repeat`,
        promptId: p.id,
        answerText: golds.find((g) => g.promptId === p.id)!.answerText,
        annotatorId: "speaker-1",
        createdAt: day(i * 3 + 40),
        provenance: "corrected_from_inadequate",
      });
    }
    if (p.speakers > 1 && i % 5 === 3) {
      golds.push({
        id: `gold-${i + 1}-earlier`,
        promptId: p.id,
        answerText: speakerVariant(base, 2, r),
        annotatorId: "speaker-1",
        createdAt: day(i * 3 - 2),
        provenance: "corrected_from_inadequate",
      });
    }
  });
  return { golds, baseBySlug };
}

interface Arm {
  name: string;
  kind: string;
  versionLabel: string | null;
  provider: string;
  archived: boolean;
}
const ARMS: Arm[] = [
  { name: "fx plain", kind: "baseline", versionLabel: null, provider: "openai", archived: false },
  { name: "fx retrieval one", kind: "rag", versionLabel: null, provider: "openai", archived: false },
  { name: "fx retrieval two", kind: "rag", versionLabel: "rag-v2", provider: "openai", archived: false },
  { name: "fx retrieval three", kind: "rag", versionLabel: "rag-v3", provider: "google", archived: false },
  { name: "fx retrieval four one", kind: "rag", versionLabel: "rag-v4-1", provider: "google", archived: false },
  { name: "fx retrieval four five", kind: "rag", versionLabel: "rag-v4-5", provider: "google", archived: false },
  { name: "fx tuned", kind: "sft", versionLabel: null, provider: "together", archived: false },
  { name: "fx control", kind: "rag", versionLabel: "rag-v4-1", provider: "derived", archived: false },
  { name: "fx sparse", kind: "rag", versionLabel: "rag-v4-4", provider: "google", archived: false },
  { name: "fx archived", kind: "rag", versionLabel: "rag-v2", provider: "openai", archived: true },
];

interface Output {
  promptId: string;
  outputText: string;
  ragContextIds: string[];
  candidateModel: Arm;
}

interface World {
  frozen: { id: string; promptId: string }[];
  golds: Gold[];
  outputs: Output[];
  rag: { id: string; content: string }[];
  lex: { id: string; headword: string; gloss: string }[];
  pairs: { id: string; igala: string; english: string }[];
  edits: {
    id: string;
    originalText: string;
    correctedText: string;
    rationale: string | null;
    segments: unknown;
  }[];
  poolJudgments: unknown[];
}

/** Prompts whose own answer was served, and through which id family. Index
 * into PROMPTS. Everything else is served filler only. */
const LEAK_BY_RAG = 1; // one arm only
const LEAK_LAST_OUTPUT = 2; // only the last output of the prompt carries it
const LEAK_BY_EXEMPLAR = 3;
const LEAK_BY_LEX = 5; // caught only through toOrthography
const LEAK_BY_PAIR = 7;
const LEAK_BY_EDIT = 9;
const LEAK_ARCHIVED_ONLY = 11;
const LEAK_TONE_VARIANT = 13;
// Served the row that leaks prompt 2's answer, BEFORE prompt 2 is reached,
// and clean for itself: a scan that remembered pieces across prompts instead
// of per prompt would skip the row at prompt 2 and miss the leak.
const SHARED_WITH = 0;
const EXPECTED_LEAKED = 8;

function buildWorld(): World {
  const { golds, baseBySlug } = buildGolds();
  const firstAnswer = (i: number) =>
    golds.find((g) => g.promptId === PROMPTS[i].id)!.answerText;

  const r = rng(77);
  const rag: World["rag"] = [];
  const lex: World["lex"] = [];
  const pairs: World["pairs"] = [];
  const edits: World["edits"] = [];

  // Innocuous context, the same rows for every arm that retrieves: this is
  // the repetition the leak scan no longer pays for.
  PROMPTS.forEach((_p, i) => {
    for (let k = 0; k < 3; k++) {
      rag.push({ id: `rag-${i + 1}-${k}`, content: filler(r, 30 + k * 20) });
    }
    lex.push({ id: `lex-${i + 1}-0`, headword: word(r, FILLER_ONSETS), gloss: "gloss" });
    lex.push({ id: `lex-${i + 1}-1`, headword: word(r, FILLER_ONSETS), gloss: "gloss" });
    pairs.push({ id: `pair-${i + 1}`, igala: filler(r, 8), english: "an english line" });
    edits.push({
      id: `edit-${i + 1}`,
      originalText: filler(r, 5),
      correctedText: filler(r, 5),
      rationale: i % 2 === 0 ? "a reason" : null,
      segments:
        i % 3 === 0
          ? { segments: [{ reason: "a segment reason" }, { reasonTags: ["wrong_word"] }] }
          : null,
    });
  });

  // Deliberate leaks, one per id family.
  rag.push({
    id: "rag-leak-shared",
    content: `${filler(r, 12)} ${firstAnswer(LEAK_BY_RAG)} ${filler(r, 12)}`,
  });
  rag.push({
    id: "rag-leak-last",
    content: `${filler(r, 4)}\n${firstAnswer(LEAK_LAST_OUTPUT)}.`,
  });
  rag.push({
    id: "rag-leak-archived",
    content: `${firstAnswer(LEAK_ARCHIVED_ONLY)} ${filler(r, 6)}`,
  });
  rag.push({
    id: "rag-leak-tone",
    content: `${filler(r, 6)} ${overToned(firstAnswer(LEAK_TONE_VARIANT))} ${filler(r, 2)}`,
  });
  // The lexicon stores phonemic notation; the served line is the
  // orthographic form. This headword matches the answer only once the open
  // vowels are transliterated, so a guard reading the raw row would miss it.
  const lexAnswer = `z${DOT_E}q${DOT_O}`;
  golds.find((g) => g.promptId === PROMPTS[LEAK_BY_LEX].id)!.answerText = lexAnswer;
  lex.push({ id: "lex-leak", headword: "zɛqɔ", gloss: "gloss" });
  pairs.push({
    id: "pair-leak",
    igala: `${filler(r, 3)} ${firstAnswer(LEAK_BY_PAIR)}`,
    english: "an english line",
  });
  edits.push({
    id: "edit-leak",
    originalText: filler(r, 4),
    correctedText: firstAnswer(LEAK_BY_EDIT),
    rationale: "a reason",
    segments: { segments: [{ reasonTags: ["wrong_word", "tone"] }] },
  });

  const outputs: Output[] = [];
  PROMPTS.forEach((p, i) => {
    const or = rng(5000 + i);
    const base = baseBySlug.get(p.slug)!;
    const own = golds.filter((g) => g.promptId === p.id).map((g) => g.answerText);
    const target = own[0] ?? base.join(" ");
    const second = own[1] ?? target;
    const common = [
      `rag-${i + 1}-0`,
      `rag-${i + 1}-1`,
      `rag-${i + 1}-2`,
      `lex:lex-${i + 1}-0`,
      `lex:lex-${i + 1}-1`,
      `pp:pair-${i + 1}`,
      `edit:edit-${i + 1}`,
    ];
    const textFor: Record<string, string> = {
      "fx plain": `Answer: ${words(or, Math.max(1, p.length), ANSWER_ONSETS).join(" ")}`,
      "fx retrieval one": (() => {
        const ws = [...base];
        ws[0] = word(or, ANSWER_ONSETS);
        return ws.join(" ");
      })(),
      "fx retrieval two": target,
      "fx retrieval three": untoned(second),
      "fx retrieval four one": overToned(target),
      "fx retrieval four five": [...base].reverse().join(" "),
      "fx tuned": `"${second}"`,
      "fx control": untoned(overToned(target)),
      "fx sparse": i % 5 === 1 ? "" : i % 5 === 3 ? "   " : `${target} (a gloss)`,
      "fx archived": target,
    };
    for (const arm of ARMS) {
      if (arm.name === "fx sparse" && i % 3 === 0) continue;
      const ids: string[] = arm.kind === "rag" ? [...common] : [];
      if (arm.name === "fx retrieval two" && i === LEAK_BY_RAG) ids.push("rag-leak-shared");
      if (arm.name === "fx retrieval two" && i === SHARED_WITH) ids.push("rag-leak-shared");
      if (arm.name === "fx retrieval three" && i === LEAK_BY_EXEMPLAR) ids.push(`gold:gold-${i + 1}-1`);
      if (arm.name === "fx retrieval four one" && i === LEAK_BY_EXEMPLAR) ids.push(`gold:gold-${i + 1}-1`);
      if (arm.name === "fx retrieval four five" && i === LEAK_BY_LEX) ids.push("lex:lex-leak");
      if (arm.name === "fx retrieval one" && i === LEAK_BY_PAIR) ids.push("pp:pair-leak");
      if (arm.name === "fx control" && i === LEAK_BY_EDIT) ids.push("edit:edit-leak");
      if (arm.name === "fx archived" && i === LEAK_ARCHIVED_ONLY) ids.push("rag-leak-archived");
      if (arm.name === "fx archived" && i === LEAK_LAST_OUTPUT) ids.push("rag-leak-last");
      if (arm.name === "fx retrieval three" && i === LEAK_TONE_VARIANT) ids.push("rag-leak-tone");
      // An id with no row behind it, and the same id listed twice.
      if (arm.kind === "rag" && i % 6 === 0) ids.push("rag-missing", `rag-${i + 1}-0`);
      outputs.push({
        promptId: p.id,
        outputText: textFor[arm.name],
        ragContextIds: ids,
        candidateModel: arm,
      });
    }
  });

  // Pool judgments across the four rounds, three pairs, every verdict.
  const POOL = ["fx plain", "fx retrieval three", "fx retrieval four five", "fx sparse"];
  const pool = (name: string) => {
    const a = ARMS.find((x) => x.name === name)!;
    return {
      candidateModel: {
        name: a.name,
        kind: a.kind,
        versionLabel: a.versionLabel,
        provider: a.provider,
      },
    };
  };
  const WHEN = [
    "2026-08-25T10:00:00.000Z",
    "2026-09-20T10:00:00.000Z",
    "2026-10-08T13:00:00.000Z",
    "2026-10-09T17:00:00.000Z",
  ];
  const VERDICTS = ["a", "b", "a", "tie", "both_inadequate", "b", "a"];
  const poolJudgments: unknown[] = [];
  for (let n = 0; n < 23; n++) {
    const a = POOL[n % 3];
    const b = POOL[(n % 3) + 1];
    poolJudgments.push({
      createdAt: new Date(Date.parse(WHEN[n % 4]) + n * 60_000),
      winner: VERDICTS[n % VERDICTS.length],
      // Orientation alternates: the same pair arrives as (a, b) and (b, a).
      modelOutputA: pool(n % 2 === 0 ? a : b),
      modelOutputB: pool(n % 2 === 0 ? b : a),
    });
  }
  // Rows the computation must skip rather than crash on.
  poolJudgments.push({
    createdAt: new Date(WHEN[0]),
    winner: "a",
    modelOutputA: pool("fx plain"),
    modelOutputB: { candidateModel: null },
  });
  poolJudgments.push({
    createdAt: new Date(WHEN[1]),
    winner: "b",
    modelOutputA: pool("fx plain"),
    modelOutputB: pool("fx plain"),
  });

  return {
    frozen: PROMPTS.map((p) => ({ id: p.id, promptId: p.slug })),
    golds,
    outputs,
    rag,
    lex,
    pairs,
    edits,
    poolJudgments,
  };
}

// ─── the database stand-in ──────────────────────────────────────────────────

interface Args {
  where?: Record<string, unknown>;
  distinct?: string[];
}
const idsIn = (args: Args): Set<string> =>
  new Set((args.where?.id as { in?: string[] } | undefined)?.in ?? []);
const distinctAnnotators = (ids: string[]) =>
  [...new Set(ids)].map((annotatorId) => ({ annotatorId }));

/** Answers each read the way the database would, from the world above. The
 * reads themselves are pinned by method-metrics.test.ts; this fake only has
 * to give the old code and the new code the same rows. */
function fakePrisma(w: World): PrismaClient {
  return {
    prompt: { findMany: async () => w.frozen },
    coldAuthorAnswer: {
      findMany: async (args: Args) => {
        if (args.where?.consentBenchmark === true) {
          return w.golds.map((g) => ({
            promptId: g.promptId,
            answerText: g.answerText,
            annotatorId: g.annotatorId,
            createdAt: g.createdAt,
            provenance: g.provenance,
          }));
        }
        if (args.distinct) {
          return distinctAnnotators(w.golds.map((g) => g.annotatorId));
        }
        const ids = idsIn(args);
        return w.golds
          .filter((g) => ids.has(g.id))
          .map((g) => ({ id: g.id, answerText: g.answerText }));
      },
      count: async () => w.golds.length + 7,
    },
    modelOutput: { findMany: async () => w.outputs },
    pairwiseComparison: {
      count: async (args: Args) => {
        const where = args.where ?? {};
        if (where.modelOutputA) {
          if (where.winner === "both_inadequate") return 4;
          if (where.winner) return 15;
          return 23;
        }
        return where.winner === "both_inadequate" ? 9 : 40;
      },
      findMany: async (args: Args) =>
        args.distinct
          ? distinctAnnotators(["speaker-1", "speaker-2", "speaker-3"])
          : w.poolJudgments,
    },
    outputEdit: {
      findMany: async (args: Args) => {
        if (args.distinct) return distinctAnnotators(["speaker-2", "speaker-7"]);
        const ids = idsIn(args);
        return w.edits.filter((e) => ids.has(e.id));
      },
    },
    parallelPair: {
      count: async () => 77,
      findMany: async (args: Args) => {
        const ids = idsIn(args);
        return w.pairs.filter((p) => ids.has(p.id));
      },
    },
    lexEntry: {
      count: async () => 55,
      findMany: async (args: Args) => {
        const ids = idsIn(args);
        return w.lex.filter((l) => ids.has(l.id));
      },
    },
    ragEntry: {
      findMany: async (args: Args) => {
        const ids = idsIn(args);
        return w.rag.filter((x) => ids.has(x.id));
      },
    },
  } as unknown as PrismaClient;
}

// ─── the comparison ─────────────────────────────────────────────────────────

interface Recorded {
  recordedFrom: string;
  note: string;
  full: unknown;
  public: unknown;
}

async function compute() {
  const metrics = await computeMethodMetrics(fakePrisma(buildWorld()));
  return { full: metrics, public: toPublicMethodMetrics(metrics) };
}

describe("computeMethodMetrics - byte parity with the code before the 2026-10-10 speed-up", () => {
  beforeAll(() => {
    // Only the clock is pinned (computedAt); nothing else is faked.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(PINNED_NOW));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("serializes to exactly the recorded payload, full and public", async () => {
    const now = await compute();
    if (RECORD) {
      const recorded: Recorded = {
        recordedFrom: RECORD,
        note: "Output of computeMethodMetrics and toPublicMethodMetrics over the generated world in method-metrics.parity.test.ts, recorded from the commit named in recordedFrom. Numbers and made-up arm names only.",
        full: now.full,
        public: now.public,
      };
      writeFileSync(RECORDED_PATH, `${JSON.stringify(recorded, null, 2)}\n`);
      return;
    }
    expect(
      existsSync(RECORDED_PATH),
      "the recorded payload is missing - see this file's header",
    ).toBe(true);
    const recorded = JSON.parse(readFileSync(RECORDED_PATH, "utf8")) as Recorded;
    // Structural comparison first, for a readable diff when something moves.
    expect(JSON.parse(JSON.stringify(now.full))).toEqual(recorded.full);
    expect(JSON.parse(JSON.stringify(now.public))).toEqual(recorded.public);
    // Then the claim itself: the same bytes.
    expect(JSON.stringify(now.full)).toBe(JSON.stringify(recorded.full));
    expect(JSON.stringify(now.public)).toBe(JSON.stringify(recorded.public));
  });

  it("gives the same bytes on a second run over a fresh world", async () => {
    const a = await compute();
    const b = await compute();
    expect(JSON.stringify(b.full)).toBe(JSON.stringify(a.full));
  });

  it("the world is not a vacuous one: every score and every leak path is exercised", async () => {
    const { full: m } = await compute();
    // Every deliberate leak is found, through every id family - including
    // the one served only to an archived arm, the one carried only by the
    // last output of its prompt, and the one visible only in the
    // orthographic rendering of a dictionary row.
    expect(m.benchmark.frozenPrompts).toBe(PROMPTS.length);
    expect(m.benchmark.leakedPrompts).toBe(EXPECTED_LEAKED);
    expect(m.benchmark.leakFreePrompts).toBe(PROMPTS.length - EXPECTED_LEAKED);
    // The two ceilings differ (repeat submissions), on both prompt sets.
    expect(m.ceilings.asShipped.chrfAll).not.toBe(m.ceilings.onePerAnnotator.chrfAll);
    expect(m.ceilings.asShipped.chrfClean).not.toBe(m.ceilings.onePerAnnotator.chrfClean);
    // Enough like-for-like prompts for a real bootstrap interval, and a
    // strictly smaller sourcefree set.
    expect(m.likeForLikePrompts).toBeGreaterThanOrEqual(8);
    expect(m.nSourcefreePrompts).toBeGreaterThan(0);
    expect(m.nSourcefreePrompts).toBeLessThan(m.likeForLikePrompts);
    // The archived arm is off the board; everyone else is on it.
    expect(m.candidates.map((c) => c.name).sort()).toEqual(
      ARMS.filter((a) => !a.archived)
        .map((a) => a.name)
        .sort(),
    );
    const by = new Map(m.candidates.map((c) => [c.name, c]));
    const full = by.get("fx retrieval two")!;
    expect(full.agreementUnderpowered).toBe(false);
    expect(full.agreementCiLow).not.toBe(full.agreementCiHigh);
    expect(full.speakerRankCiLow).not.toBe(full.speakerRankCiHigh);
    // Tone marks move the over-marked arm's score, and removing them from
    // both sides moves it back - the tone-insensitive column is live.
    const marked = by.get("fx retrieval four one")!;
    expect(marked.agreementScore).not.toBe(marked.agreementScoreToneInsensitive);
    expect(marked.agreementScoreSourcefree).not.toBeNull();
    // Empty outputs are counted, not scored; a partial arm has fewer rows.
    const sparse = by.get("fx sparse")!;
    expect(sparse.emptyOutputs).toBeGreaterThan(0);
    expect(sparse.nLikeForLike).toBeLessThan(full.nLikeForLike);
    // Scores are spread out, not all 0 or all 100.
    const distinct = new Set(m.candidates.map((c) => c.strippedChrfClean));
    expect(distinct.size).toBeGreaterThanOrEqual(7);
    // Three judged pairs, with judgments in every round.
    expect(m.humanRounds).toHaveLength(3);
    for (const pair of m.humanRounds) {
      expect(pair.rounds.every((round) => round.n > 0)).toBe(true);
    }
  });
});
