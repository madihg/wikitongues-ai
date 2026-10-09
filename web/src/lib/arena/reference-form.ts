import type {
  CandidateGeneration,
  CandidateLike,
  GenerateArgs,
} from "@/lib/arena/providers";

/**
 * The REFERENCE FORM second pass: the same Igala answer, rendered the way
 * Salem Ejeba and Lydia Wiernik asked to read it (write-up of 2026-09-25,
 * section 2, inventory rules W-2-1 and W-2-2): tone marks on every word, and
 * every word written in full instead of contracted.
 *
 * WHY A SECOND PASS AND NOT A PROMPT LINE
 * ---------------------------------------
 * The speakers who annotate for us write the other way: 27% of gold answers
 * carry any tone mark and 32% contract. The served answer must stay in that
 * community register, because that register is what the speakers judge in the
 * blind pool and what the frozen exam scores against. So the model keeps
 * writing as it does, and a SEPARATE call renders the finished answer in the
 * reference form beside it, furigana-style (Lydia's phrase). The rendering is
 * never written into outputText, and nothing that scores or pairs reads it
 * (tasks/prd-salem-writeup-ingest-2026-10-08.md, US-010, FR-10).
 *
 * NOTHING STORES IT YET. The chat route keeps no rows, and adding nullable
 * columns that nothing writes would only make a schema-before-migration deploy
 * break every ModelOutput query that selects all columns. Where a rendering
 * should live is a follow-up, once Halim picks a home for it.
 *
 * WHAT THIS MODULE ASSERTS ABOUT IGALA: NOTHING
 * ---------------------------------------------
 * The instruction cites exactly one Igala pair, ki ọla / k'ọla, and cites it
 * as the authors' own example. Every other sentence is procedure. Where the
 * model does not know a word's tones it is told to leave the word unmarked,
 * because an unmarked word is a visible gap and a wrongly marked word is an
 * invisible error; the mechanical report below counts the words that came
 * back unmarked so that choice is measured, not assumed.
 *
 * Pure over an injected `generate`, like generateV4FamilyTrainAnswer, so the
 * tests mock the provider and the one script that spends money
 * (scripts/reference-form-samples.ts) is the only place a real call is made.
 */

/**
 * The version labels whose CHAT column carries the reference form. The chat
 * route keys on this list; the arena queue, the fill, the exam and the pairing
 * never read it (pinned in reference-form.test.ts by a grep over their
 * sources). rag-v4-5 is a v4-family label (V4_FAMILY_VERSION_LABELS in
 * frozen-exam.ts), which decides how its answer is assembled; this list stays
 * separate on purpose, so which arms get the second pass is decided here
 * alone and a label can join the v4 family without inheriting it.
 */
export const REFERENCE_FORM_LABELS = ["rag-v4-5"] as const;

export type ReferenceFormLabel = (typeof REFERENCE_FORM_LABELS)[number];

/** True when a chat column with this label gets the second pass. */
export function rendersReferenceForm(
  label: string | null | undefined,
): label is ReferenceFormLabel {
  return (REFERENCE_FORM_LABELS as readonly string[]).includes(
    label as string,
  );
}

/**
 * The second-pass instruction, served VERBATIM (systemPromptExact): the
 * IGALA_FORCING_INSTRUCTION every other call leads with tells the model to
 * give its best attempt even when unsure and to write tone marks where they
 * belong, which is the opposite of rule 1 here. The user turn still says in
 * its first line that the text is to be rendered, not answered.
 *
 * Rule 4 restricts letters to what the answer already has: an instruction to
 * respell s as ch would license exactly the letter changes rule 3 forbids, so
 * s in a native word is left for the report to flag (newSWords), not for the
 * model to fix.
 *
 * Rules 2 and 4 were tightened after the first 20 samples (Oct 8): the pass
 * guessed restored vowels (d'X -> dá X with no evidence for the a), split
 * fused words and swapped letters (e for ẹ and back, ñ for a toned n). A
 * vowel is now restored only where the full word is attested in the same
 * answer or is the authors' example, and the report counts every word whose
 * letters changed (lettersChanged) and every vowel restored.
 *
 * Scope-A: scripts/static-leak-check-reference-form.ts runs this text against
 * the frozen protected set before it serves.
 */
export const REFERENCE_FORM_SYSTEM =
  "You are given a finished Igala answer, written in the community register: the way Igala speakers write to each other, with few tone marks and contracted words. " +
  "Two Igala scholars asked that the same text also be shown in a fuller reference form, because Igala has many homographs and a contracted, unmarked sentence can be read several ways. " +
  "Your task is to render the answer you are given in that reference form. You are not answering it, not improving it, not correcting it.\n\n" +
  "Render it so that:\n" +
  "1. Every word carries its tone marks. Mark every syllable whose tone you know. Where you do not know a word's tones, leave that word exactly as it is, unmarked. An unmarked word is a gap a reader can see; a wrongly marked word is an error a reader cannot see. Never guess a tone.\n" +
  "2. No elision where the full form is certain. Undo a contraction only by restoring the vowel the apostrophe stands for, and only where that full word appears elsewhere in this same answer, or is the authors' example: ki ọla, not k'ọla. Otherwise keep the apostrophe exactly as written. A word written without an apostrophe is one word: never split it.\n" +
  "3. The same words in the same order. Nothing added, nothing dropped, nothing reordered, nothing translated, nothing explained. A word you would have chosen differently stays as the answer wrote it. English the answer contains is copied unchanged.\n" +
  "4. Apart from the tone marks and the restored vowels above, copy every word's letters unchanged: a dotted vowel stays dotted, an undotted vowel stays undotted, ñ stays ñ, and a tone mark goes on top of a letter, never in place of one. Names and borrowed words keep their s.\n" +
  "5. One variety of Igala throughout: the variety the answer already uses. Never replace a form with the same word from another area.\n\n" +
  "Output the rendered Igala only: no heading, no notes, no second version, no commentary.";

/**
 * The user turn: the community answer and one line saying what to do with
 * it. No exemplars, no retrieval, no history: the second pass sees the answer
 * and nothing else, so nothing but the answer can leak into the rendering.
 */
export function buildReferenceFormTurn(communityText: string): GenerateArgs {
  return {
    userMessage:
      "Render the following Igala answer in the reference form described in your instructions. " +
      "Do not answer it. Output the rendered Igala only.\n\n" +
      communityText.trim(),
    systemPromptOverride: REFERENCE_FORM_SYSTEM,
    systemPromptExact: true,
  };
}

/**
 * The output budget the second pass gets. Google models bill their hidden
 * reasoning against the completion budget (the trap trainMaxTokensFor in
 * v4-family-train.ts documents for the fill): at the v4.4 candidate's 4,096,
 * five of the first 20 samples ran 3,946 to 4,092 tokens out and one stopped
 * after four of six sentences. So Google gets 8,192; every other provider
 * keeps the candidate's own budget (1,024 when it sets none, parseDecoding's
 * default in providers.ts).
 */
export const REFERENCE_MAX_TOKENS_GOOGLE = 8192;

export function referenceMaxTokensFor(candidate: CandidateLike): number {
  if (candidate.provider === "google") return REFERENCE_MAX_TOKENS_GOOGLE;
  const d = (candidate.decodingParams ?? {}) as Record<string, unknown>;
  return typeof d.maxTokens === "number" && Number.isFinite(d.maxTokens)
    ? d.maxTokens
    : 1024;
}

/**
 * The candidate as the second pass calls it: the same provider and model,
 * temperature 0 (a rendering has one right output, not a distribution), the
 * reference budget above, and ragEnabled OFF so no exemplar or chunk can be
 * attached by any caller. A candidate whose temperature is the explicit null
 * opt-out (Claude Opus 5 rejects the parameter, see providers.ts) keeps the
 * null.
 */
export function referenceFormCandidate(candidate: CandidateLike): CandidateLike {
  const decoding = (candidate.decodingParams ?? {}) as Record<string, unknown>;
  return {
    ...candidate,
    ragEnabled: false,
    decodingParams: {
      ...decoding,
      temperature: decoding.temperature === null ? null : 0,
      maxTokens: referenceMaxTokensFor(candidate),
    },
  };
}

// ─── the mechanical report ───────────────────────────────────────────────────

/**
 * What the post-check can see without knowing any Igala. Counts and lists,
 * so a reviewer reads the numbers before the text: a rendering that dropped a
 * word, kept an apostrophe or brought a new s into the text is flagged here
 * whatever its tones look like.
 */
export interface ReferenceFormReport {
  /** Words (tokens with at least one letter) in the community answer. */
  communityWords: number;
  /** Words in the rendered reference form. */
  referenceWords: number;
  /** Reference words carrying at least one tone mark. */
  tonedWords: number;
  /**
   * Of tonedWords, those with at least one vowel left unmarked: the model
   * marked part of the word. Allowed by rule 1 (mark what you know), and
   * worth seeing apart from the fully marked ones.
   */
  partiallyTonedWords: number;
  /** Reference words carrying no tone mark: the gaps the model left visible. */
  unmarkedWords: number;
  /** tonedWords / referenceWords, 0 when there are no words. */
  tonedShare: number;
  /** Apostrophes still joining two words in the reference form. */
  apostrophesLeft: number;
  /**
   * Community words the rendering has nothing for, in order (see alignWords).
   * Surface forms, as written. A truncated rendering shows here as its tail.
   */
  dropped: string[];
  /** Reference words that stand for no community word, in order. */
  added: string[];
  /**
   * Aligned words whose letters differ once only the five tone marks are
   * set aside (the dot below, the tilde and ñ all count), the one vowel
   * restored at an apostrophe joint excepted. A fused word split in two is
   * here too. `reference` is the reference word or words it became.
   */
  changed: { community: string; reference: string }[];
  /** changed.length: the "letters changed" count. */
  lettersChanged: number;
  /**
   * Vowels restored at apostrophe joints across the rendering. Allowed by
   * rule 2 only where the full word is attested; the count is how often the
   * model did it, for a reader to check each one.
   */
  vowelsRestored: number;
  /**
   * New or changed reference words that contain an s the community answer
   * did not have. A name or loan copied from the answer is not here,
   * capitalised or not; an s the rendering brought in is, wherever it sits
   * in the sentence.
   */
  newSWords: string[];
}

/**
 * The tone marks the report counts and the comparison key ignores, as NFD
 * combining characters: grave, acute, circumflex, macron, caron. Escapes
 * rather than bare marks, which are invisible in review. Every other mark is
 * part of the letter and is kept: the dot below of ẹ and ọ, the tilde of ñ.
 */
const TONE_MARK_RE = /[\u0300\u0301\u0302\u0304\u030C]/u;
const TONE_MARKS_GLOBAL_RE = /[\u0300\u0301\u0302\u0304\u030C]/gu;

/** A vowel and the marks it carries, to tell a fully marked word from a partly marked one. */
const VOWEL_WITH_MARKS_RE = /[aeiou](\p{M}*)/giu;

/** One vowel letter with whatever non-tone marks it carries (ẹ, ọ): a restored vowel. */
const ONE_VOWEL_RE = /^[aeiou]\p{M}*$/u;

/** The apostrophes writers use at an elision joint. */
const APOSTROPHE_CLASS = "['\u2019\u02BC]";
const APOSTROPHE_RE = new RegExp(APOSTROPHE_CLASS, "gu");
/**
 * An apostrophe between two letters: a joint, not a quote. One before a lone
 * word-final n or ñ is not counted: that is the clause-final negator attached
 * to its word (the served prompts write it ñ), not two words run together.
 */
const INNER_APOSTROPHE_RE = new RegExp(
  `(?<=\\p{L}\\p{M}*)${APOSTROPHE_CLASS}(?=\\p{L})(?!n\\p{M}*(?![\\p{L}\\p{M}]))`,
  "giu",
);

/** Whitespace tokens with edge punctuation stripped, keeping only those with a letter. */
function words(text: string): string[] {
  return text
    .normalize("NFD")
    .split(/\s+/u)
    .map((t) => t.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, ""))
    .filter((t) => /\p{L}/u.test(t));
}

/**
 * Comparison key: NFD, the five tone marks off, everything else kept (the dot
 * below, the tilde), lowercased, apostrophes kept. So a changed tone is not a
 * changed word, and ẹ for e or ñ for n is.
 */
function key(word: string): string {
  return word.normalize("NFD").replace(TONE_MARKS_GLOBAL_RE, "").toLowerCase();
}

/** `r` is `piece` with one vowel restored at its end: k -> ki, k -> kọ, ef -> efu. */
function restoredAtEnd(piece: string, r: string): boolean {
  return r.startsWith(piece) && ONE_VOWEL_RE.test(r.slice(piece.length));
}

/** `r` is `piece` with one vowel restored at its start: la -> ọla (the second vowel elided). */
function restoredAtStart(piece: string, r: string): boolean {
  return (
    r.length > piece.length &&
    r.endsWith(piece) &&
    ONE_VOWEL_RE.test(r.slice(0, r.length - piece.length))
  );
}

/**
 * A contraction's pieces against the same number of reference words, in
 * order. Each joint may restore ONE vowel, on either side of it: the piece
 * before the apostrophe may gain a final vowel (k -> ki, k -> kọ: the first
 * vowel elided, the common case) or the piece after it an initial one
 * (la -> ọla: the second vowel elided). Never two at one joint, never more
 * than one letter. Returns the vowels restored, or -1 when the pieces do not
 * match.
 */
function matchPieces(pieces: string[], refs: string[]): number {
  let restored = 0;
  // Whether the joint to the LEFT of the current piece already restored a
  // vowel (into the previous piece), so it cannot restore a second one.
  let leftJointUsed = false;
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const r = refs[i];
    let usedRightJoint = false;
    if (r === piece) {
      // copied as is
    } else if (i < pieces.length - 1 && restoredAtEnd(piece, r)) {
      usedRightJoint = true;
      restored++;
    } else if (i > 0 && !leftJointUsed && restoredAtStart(piece, r)) {
      restored++;
    } else {
      return -1;
    }
    leftJointUsed = usedRightJoint;
  }
  return restored;
}

/** Levenshtein distance over code points, for weighting a change. */
function editDistance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[y.length];
}

/**
 * Alignment costs. A changed word costs 1 plus how different it is (0 to 1),
 * so it is always cheaper than dropping it and adding another (2 + 2), and
 * of two candidate pairings the closer one wins. A fused word split in two
 * costs 2.5: more than a match plus an added word (2), so a genuinely added
 * word is not absorbed as a split, and less than a change plus an added word
 * (at least 3), so a real split reads as one change.
 */
const DROP_COST = 2;
const ADD_COST = 2;
const SPLIT_COST = 2.5;
const changeCost = (from: string, to: string) =>
  1 + editDistance(from, to) / Math.max([...from].length, [...to].length, 1);

/** One community word against a span of reference words: cost, and vowels restored. */
function spanOutcome(
  cKey: string,
  refKeys: string[],
): { cost: number; restored: number; changed: boolean } {
  const pieces = cKey.split(APOSTROPHE_RE).filter((p) => p.length > 0);
  const contracted = pieces.length > 1;
  const fused = pieces.join("");
  if (refKeys.length === 1) {
    const r = refKeys[0];
    if (r === cKey || (contracted && r === fused))
      return { cost: 0, restored: 0, changed: false };
    return { cost: changeCost(fused, r), restored: 0, changed: true };
  }
  if (contracted && refKeys.length === pieces.length) {
    const restored = matchPieces(pieces, refKeys);
    if (restored >= 0) return { cost: 0, restored, changed: false };
    return {
      cost: changeCost(fused, refKeys.join("")),
      restored: 0,
      changed: true,
    };
  }
  return { cost: SPLIT_COST, restored: 0, changed: true };
}

interface Alignment {
  dropped: string[];
  added: string[];
  changed: { community: string; reference: string }[];
  vowelsRestored: number;
  /** Reference word indices that are added or part of a changed span. */
  newReferenceIndices: number[];
}

/**
 * Align community words to reference words IN ORDER, the order rule 3 asks
 * the rendering to keep: the cheapest sequence of copies, changes, drops and
 * additions (a small dynamic program over the two word lists). A community
 * word may align to one reference word, or a contraction to as many words as
 * it has pieces, or any word to two (a split, which is a change). Comparison
 * is on the key, so a tone mark is never a change and a letter always is.
 *
 * Positional on purpose: an order-free match would report a changed word as
 * one dropped and one added, and a truncated rendering would hide among
 * them. Here a missing tail is a run of drops, and a changed word is a pair.
 */
function alignWords(community: string[], reference: string[]): Alignment {
  const cKeys = community.map(key);
  const rKeys = reference.map(key);
  const m = cKeys.length;
  const n = rKeys.length;
  const maxSpan = cKeys.map((k) =>
    Math.max(2, k.split(APOSTROPHE_RE).filter((p) => p.length > 0).length),
  );
  type Step =
    | { kind: "drop" }
    | { kind: "add" }
    | { kind: "span"; span: number; restored: number; changed: boolean };
  const cost: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(Number.POSITIVE_INFINITY),
  );
  const step: (Step | null)[][] = Array.from({ length: m + 1 }, () =>
    new Array<Step | null>(n + 1).fill(null),
  );
  cost[0][0] = 0;
  for (let i = 0; i <= m; i++) {
    for (let j = 0; j <= n; j++) {
      if (i === 0 && j === 0) continue;
      // Aligning first, so on an exact tie a pairing beats a drop or an add.
      if (i > 0) {
        for (let s = 1; s <= maxSpan[i - 1] && s <= j; s++) {
          const o = spanOutcome(cKeys[i - 1], rKeys.slice(j - s, j));
          const c = cost[i - 1][j - s] + o.cost;
          if (c < cost[i][j]) {
            cost[i][j] = c;
            step[i][j] = { kind: "span", span: s, ...o };
          }
        }
        if (cost[i - 1][j] + DROP_COST < cost[i][j]) {
          cost[i][j] = cost[i - 1][j] + DROP_COST;
          step[i][j] = { kind: "drop" };
        }
      }
      if (j > 0 && cost[i][j - 1] + ADD_COST < cost[i][j]) {
        cost[i][j] = cost[i][j - 1] + ADD_COST;
        step[i][j] = { kind: "add" };
      }
    }
  }

  const nfc = (w: string) => w.normalize("NFC");
  const dropped: string[] = [];
  const added: string[] = [];
  const changed: { community: string; reference: string }[] = [];
  const newReferenceIndices: number[] = [];
  let vowelsRestored = 0;
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    const s = step[i][j]!;
    if (s.kind === "drop") {
      dropped.push(nfc(community[i - 1]));
      i--;
    } else if (s.kind === "add") {
      added.push(nfc(reference[j - 1]));
      newReferenceIndices.push(j - 1);
      j--;
    } else {
      vowelsRestored += s.restored;
      if (s.changed) {
        changed.push({
          community: nfc(community[i - 1]),
          reference: reference.slice(j - s.span, j).map(nfc).join(" "),
        });
        for (let k = j - s.span; k < j; k++) newReferenceIndices.push(k);
      }
      i--;
      j -= s.span;
    }
  }
  return {
    dropped: dropped.reverse(),
    added: added.reverse(),
    changed: changed.reverse(),
    vowelsRestored,
    newReferenceIndices,
  };
}

/** True when a toned word still has a vowel without a tone mark. */
function isPartlyToned(word: string): boolean {
  for (const m of word.normalize("NFD").matchAll(VOWEL_WITH_MARKS_RE)) {
    if (!TONE_MARK_RE.test(m[1])) return true;
  }
  return false;
}

/** The mechanical post-check over a community answer and its rendering. */
export function referenceFormReport(
  community: string,
  reference: string,
): ReferenceFormReport {
  const communityWords = words(community);
  const referenceWords = words(reference);
  const toned = referenceWords.filter((w) => TONE_MARK_RE.test(w));
  const alignment = alignWords(communityWords, referenceWords);
  // Every spelling of a community word the rendering could legitimately copy:
  // the word, its fused form, and each piece of a contraction.
  const communityKeys = new Set(
    communityWords.flatMap((w) => {
      const k = key(w);
      return [k, k.replace(APOSTROPHE_RE, ""), ...k.split(APOSTROPHE_RE)];
    }),
  );
  return {
    communityWords: communityWords.length,
    referenceWords: referenceWords.length,
    tonedWords: toned.length,
    partiallyTonedWords: toned.filter(isPartlyToned).length,
    unmarkedWords: referenceWords.length - toned.length,
    tonedShare:
      referenceWords.length === 0 ? 0 : toned.length / referenceWords.length,
    apostrophesLeft: (
      reference.normalize("NFD").match(INNER_APOSTROPHE_RE) ?? []
    ).length,
    dropped: alignment.dropped,
    added: alignment.added,
    changed: alignment.changed,
    lettersChanged: alignment.changed.length,
    vowelsRestored: alignment.vowelsRestored,
    newSWords: [...alignment.newReferenceIndices]
      .sort((a, b) => a - b)
      .map((k) => referenceWords[k])
      .filter((w) => {
        const k = key(w);
        return k.includes("s") && !communityKeys.has(k);
      })
      .map((w) => w.normalize("NFC")),
  };
}

const REPORT_COUNTS = [
  "communityWords",
  "referenceWords",
  "tonedWords",
  "partiallyTonedWords",
  "unmarkedWords",
  "tonedShare",
  "apostrophesLeft",
  "lettersChanged",
  "vowelsRestored",
] as const;
const REPORT_LISTS = ["dropped", "added", "newSWords"] as const;

/**
 * True when a value off the wire has the report's shape: every count a finite
 * number, every list an array of strings, every changed pair two strings. The
 * chat client renders a report it cannot trust as no report, never as a crash.
 */
export function isReferenceFormReport(x: unknown): x is ReferenceFormReport {
  if (x === null || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return (
    REPORT_COUNTS.every(
      (k) => typeof r[k] === "number" && Number.isFinite(r[k]),
    ) &&
    REPORT_LISTS.every(
      (k) =>
        Array.isArray(r[k]) &&
        (r[k] as unknown[]).every((v) => typeof v === "string"),
    ) &&
    Array.isArray(r.changed) &&
    (r.changed as unknown[]).every(
      (c) =>
        c !== null &&
        typeof c === "object" &&
        typeof (c as Record<string, unknown>).community === "string" &&
        typeof (c as Record<string, unknown>).reference === "string",
    )
  );
}

/**
 * The report in one line, for the small print under a rendering and for the
 * samples file. Says only what happened: a clean rendering reads as two
 * numbers, a dirty one names the words.
 */
export function summarizeReferenceReport(r: ReferenceFormReport): string {
  const plural = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? "" : "s"}`;
  const parts = [
    `${Math.round(r.tonedShare * 100)}% of ${r.referenceWords} words toned` +
      (r.partiallyTonedWords > 0 ? ` (${r.partiallyTonedWords} partly)` : ""),
    `${plural(r.apostrophesLeft, "apostrophe")} left`,
  ];
  if (r.vowelsRestored > 0)
    parts.push(`${plural(r.vowelsRestored, "vowel")} restored`);
  if (r.lettersChanged > 0)
    parts.push(
      `letters changed in ${plural(r.lettersChanged, "word")} (${r.changed
        .map((c) => `${c.community} → ${c.reference}`)
        .join(", ")})`,
    );
  if (r.dropped.length > 0)
    parts.push(
      `${plural(r.dropped.length, "word")} dropped (${r.dropped.join(", ")})`,
    );
  if (r.added.length > 0)
    parts.push(`${r.added.length} added (${r.added.join(", ")})`);
  if (r.newSWords.length > 0) parts.push(`new s in ${r.newSWords.join(", ")}`);
  return parts.join(" · ");
}

// ─── the pass ────────────────────────────────────────────────────────────────

/** One generation, however the caller performs it (the real provider, or a mock). */
export type ReferenceFormGenerate = (
  candidate: CandidateLike,
  args: GenerateArgs,
) => Promise<CandidateGeneration>;

export interface ReferenceFormResult {
  /** The rendered Igala, trimmed. */
  text: string;
  modelId: string;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number;
  /** The output budget the pass ran with (referenceMaxTokensFor). */
  maxTokens: number;
  report: ReferenceFormReport;
}

/**
 * Render one community-register answer in the reference form. Throws on an
 * empty answer and on whatever `generate` throws; every caller catches,
 * because the second pass must never cost the reader the first.
 */
export async function renderReferenceForm(
  candidate: CandidateLike,
  communityText: string,
  generate: ReferenceFormGenerate,
): Promise<ReferenceFormResult> {
  if (communityText.trim().length === 0) {
    throw new Error("reference form: nothing to render (empty answer)");
  }
  const gen = await generate(
    referenceFormCandidate(candidate),
    buildReferenceFormTurn(communityText),
  );
  const text = gen.text.trim();
  return {
    text,
    modelId: gen.modelId,
    tokensIn: gen.tokensIn ?? null,
    tokensOut: gen.tokensOut ?? null,
    latencyMs: gen.latencyMs,
    maxTokens: referenceMaxTokensFor(candidate),
    report: referenceFormReport(communityText, text),
  };
}

/** A rendering pinned within this many tokens of its cap is taken as truncated. */
export const REFERENCE_CAP_MARGIN = 8;
/** More than this share of the community words dropped and the rendering is not shown. */
export const MAX_DROPPED_SHARE = 0.25;

/**
 * Why a rendering must not be shown, or null when it may be. Modelled on
 * unstorableReason (v4-family-train.ts): empty text, a pass pinned at its cap
 * (sample 2 of the first 20 stopped after four of six sentences at 4,092 of
 * 4,096), or a rendering missing more than a quarter of the answer's words.
 * A partial rendering beside a full answer would read as the reference form
 * of a shorter answer, which is worse than none.
 */
export function referenceFormRefusal(r: ReferenceFormResult): string | null {
  if (r.text.length === 0) return "empty rendering";
  if (r.tokensOut != null && r.tokensOut >= r.maxTokens - REFERENCE_CAP_MARGIN) {
    return `truncated (tokensOut ${r.tokensOut} hit the ${r.maxTokens} cap)`;
  }
  const { dropped, communityWords } = r.report;
  if (communityWords > 0 && dropped.length > communityWords * MAX_DROPPED_SHARE) {
    return `dropped ${dropped.length} of ${communityWords} words`;
  }
  return null;
}
