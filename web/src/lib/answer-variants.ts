import { foldIgala } from "@/lib/annotations-query";

/**
 * DIFFERENCES BETWEEN OUR OWN GOLD ANSWERS.
 *
 * When two annotators answer the same prompt, they disagree in one of two very
 * different ways, and the difference matters enormously for training data:
 *
 *   1. SAME WORD, WRITTEN DIFFERENTLY. Everyone agrees the answer is "odudu",
 *      but it comes back as "Ọdudu", "Òdúdú", "ódùdù". Or the same sentence is
 *      written "Ọma lẹ a jẹ ñwu" by one person and "Ọma lẹ aj'ẹñwu" by another
 *      - identical words, different tone marks, spacing and elision marks.
 *      This is an orthographic-convention decision. A session can settle it,
 *      and settling it is worth real money: inconsistent spelling of the same
 *      word teaches a model that both forms are equally correct, which is
 *      exactly the confusion we are trying to remove.
 *
 *   2. DIFFERENT WORDS. Two annotators genuinely gave different answers -
 *      a different greeting, a different verb, a different noun. That may be
 *      dialect variation worth RECORDING rather than resolving, or it may be
 *      one of them being wrong. Either way it is a linguistic conversation,
 *      not a typography one.
 *
 * Three comparison keys separate the two cases. Each strips one more layer:
 *
 *   spellingKey  diacritics folded away, case flattened, spacing kept.
 *                Same key  ->  same words, different tone marks / dotted
 *                vowels / capitalisation.
 *   toneKey      diacritics KEPT, spacing and elision marks stripped.
 *                Same key  ->  same letters and marks, written apart or
 *                joined differently ("a jẹ" vs "aj'ẹ").
 *   soundKey     both stripped. Same key  ->  the same word underneath every
 *                writing convention. This is the key that decides whether a
 *                group is a spelling argument or a vocabulary argument.
 *
 * Diacritic folding is shared with the annotation search surface (`foldIgala`)
 * so "written the same" means the same thing everywhere in the platform.
 */

/**
 * Characters that carry no sound of their own in written Igala: whitespace,
 * the elision apostrophes writers use for contracted vowels (straight, curly
 * and modifier-letter forms all appear in our data), hyphens, and sentence
 * punctuation. Stripping these is what lets "Ọma lẹ a jẹ ñwu" and
 * "Ọma lẹ aj'ẹñwu" be recognised as the same sentence.
 */
const JOINERS = /[\s'‘’ʼ`´‐-―_.,;:!?"“”()[\]-]/g;

/**
 * Compose to NFC, collapse runs of whitespace, trim. This is the identity of
 * a "wording" - two answers that reduce to the same string here are the same
 * answer, not two spellings of it.
 *
 * NFC matters as much as the whitespace does. Production answers arrive in
 * both Unicode shapes: "Ọ" typed on one keyboard is the single codepoint
 * U+1ECC, and on another it is a plain "O" followed by a combining dot below.
 * They render identically on screen. Without composing them first the page
 * shows "Ọdudu" and "Ọdudu" side by side as if they were rival spellings,
 * which is nonsense to anyone reading it. NFC also leaves the toned dotted
 * vowels that have no precomposed codepoint (e.g. "ẹ" + an acute) in one
 * consistent shape, so they compare reliably too.
 */
export function normaliseSpacing(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Diacritics and case folded away, spacing kept. */
export function spellingKey(text: string): string {
  return normaliseSpacing(foldIgala(text));
}

/** Diacritics kept, spacing and elision marks stripped. */
export function toneKey(text: string): string {
  return normaliseSpacing(text).toLowerCase().replace(JOINERS, "");
}

/** Everything stripped: the same word under any writing convention. */
export function soundKey(text: string): string {
  return spellingKey(text).replace(JOINERS, "");
}

export type AnswerVariantKind =
  | "identical" // fewer than 2 distinct forms - nothing to look at
  | "spelling" // one word, written several ways
  | "mixed" // some spellings differ AND some answers differ
  | "different"; // genuinely different answers

/** What exactly separates the spellings inside one same-word cluster. */
export type SpellingDifference =
  | "marks" // tone marks, dotted vowels, capitalisation
  | "spacing" // word spacing and elision apostrophes
  | "marks_and_spacing";

export interface AnswerRow {
  promptId: string;
  answerText: string;
  englishGloss: string | null;
  dialect: string | null;
  annotatorId: string;
  annotatorName: string;
}

export interface VariantWriter {
  annotatorId: string;
  name: string;
  dialect: string | null;
}

export interface AnswerVariant {
  /** Whitespace-normalised answer, exactly as the annotator wrote it
   *  otherwise - tone marks and apostrophes preserved. */
  text: string;
  writers: VariantWriter[];
  /** Distinct English glosses attached to this exact wording. */
  glosses: string[];
}

export interface VariantCluster {
  /** Indexes into `AnswerVariantGroup.variants`. Two or more entries means
   *  the same word turned up written more than one way. */
  variantIndexes: number[];
  /** Only meaningful when `variantIndexes.length > 1`. */
  difference: SpellingDifference | null;
}

export interface AnswerVariantGroup {
  promptId: string;
  kind: AnswerVariantKind;
  variants: AnswerVariant[];
  clusters: VariantCluster[];
  annotatorCount: number;
  /** Rows behind the group, including exact re-submissions. */
  answerCount: number;
}

export interface VariantCounts {
  spelling: number;
  mixed: number;
  different: number;
  total: number;
}

/**
 * Classify a set of DISTINCT wordings of the same prompt.
 *
 * One cluster  -> every wording is the same word, so the only disagreement is
 *                 how to write it.
 * All singleton clusters -> no two people wrote the same word, so the
 *                 disagreement is about the answer itself.
 * Anything else -> both kinds are present in the one group.
 */
export function classifyVariantKind(
  clusters: VariantCluster[],
  variantCount: number,
): AnswerVariantKind {
  if (variantCount < 2) return "identical";
  if (clusters.length === 1) return "spelling";
  const hasSameWordCluster = clusters.some((c) => c.variantIndexes.length > 1);
  return hasSameWordCluster ? "mixed" : "different";
}

/**
 * Which writing convention the members of a same-word cluster disagree on.
 * Returns null for a cluster of one (nobody disagrees with themselves).
 */
export function describeDifference(texts: string[]): SpellingDifference | null {
  if (texts.length < 2) return null;
  if (new Set(texts.map(spellingKey)).size === 1) return "marks";
  if (new Set(texts.map(toneKey)).size === 1) return "spacing";
  return "marks_and_spacing";
}

/**
 * Turn raw gold-answer rows into one classified group per prompt.
 *
 * Groups are dropped unless at least two DIFFERENT annotators answered the
 * prompt and at least two distinct wordings came back - a prompt everybody
 * wrote identically is agreement, not something to review. Exact
 * re-submissions of the same wording by the same person (they happen: the
 * annotator UI has produced duplicate rows) collapse into one variant, but
 * still count towards `answerCount`.
 *
 * Sorted so spelling-only groups come first: those are the convention
 * decisions a collective session can actually settle in one sitting. Mixed
 * groups follow, then the different-answer groups, which need discussion
 * rather than a ruling.
 */
export function buildAnswerVariantGroups(
  rows: AnswerRow[],
): AnswerVariantGroup[] {
  const byPrompt = new Map<string, AnswerRow[]>();
  for (const row of rows) {
    const arr = byPrompt.get(row.promptId);
    if (arr) arr.push(row);
    else byPrompt.set(row.promptId, [row]);
  }

  const groups: AnswerVariantGroup[] = [];
  for (const [promptId, promptRows] of byPrompt) {
    const group = buildOneGroup(promptId, promptRows);
    if (group) groups.push(group);
  }

  return groups.sort(compareGroups);
}

const KIND_RANK: Record<AnswerVariantKind, number> = {
  identical: 3,
  spelling: 0,
  mixed: 1,
  different: 2,
};

function compareGroups(a: AnswerVariantGroup, b: AnswerVariantGroup): number {
  const byKind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
  if (byKind !== 0) return byKind;
  // Most-reviewed prompts first inside a kind - they are the ones a session
  // gets the most calibration out of. Deterministic tiebreak on promptId so
  // the list never reshuffles between requests.
  if (a.annotatorCount !== b.annotatorCount)
    return b.annotatorCount - a.annotatorCount;
  if (a.variants.length !== b.variants.length)
    return b.variants.length - a.variants.length;
  return a.promptId < b.promptId ? -1 : a.promptId > b.promptId ? 1 : 0;
}

function buildOneGroup(
  promptId: string,
  rows: AnswerRow[],
): AnswerVariantGroup | null {
  const annotators = new Set(rows.map((r) => r.annotatorId));
  if (annotators.size < 2) return null;

  const byText = new Map<string, AnswerVariant>();
  for (const row of rows) {
    const text = normaliseSpacing(row.answerText);
    if (text.length === 0) continue;
    let variant = byText.get(text);
    if (!variant) {
      variant = { text, writers: [], glosses: [] };
      byText.set(text, variant);
    }
    if (!variant.writers.some((w) => w.annotatorId === row.annotatorId)) {
      variant.writers.push({
        annotatorId: row.annotatorId,
        name: row.annotatorName,
        dialect: row.dialect,
      });
    } else if (row.dialect) {
      // A later row can carry the dialect an earlier identical one lacked.
      const writer = variant.writers.find(
        (w) => w.annotatorId === row.annotatorId,
      )!;
      writer.dialect ??= row.dialect;
    }
    const gloss = row.englishGloss?.trim();
    if (gloss && !variant.glosses.includes(gloss)) variant.glosses.push(gloss);
  }

  const variants = [...byText.values()];
  if (variants.length < 2) return null;

  const clusters = clusterBySound(variants);
  return {
    promptId,
    kind: classifyVariantKind(clusters, variants.length),
    variants,
    clusters,
    annotatorCount: annotators.size,
    answerCount: rows.length,
  };
}

/**
 * Bucket variant indexes by `soundKey`, biggest bucket first.
 *
 * Size order matters for the mixed groups, which are the common case: when six
 * people wrote one word six ways and a seventh gave a different answer
 * entirely, the six-way spelling cluster should lead, because that is the part
 * a session can settle. Ties keep first-appearance order (Array sort is
 * stable), so the list is deterministic between requests.
 */
function clusterBySound(variants: AnswerVariant[]): VariantCluster[] {
  const byKey = new Map<string, number[]>();
  variants.forEach((variant, index) => {
    const key = soundKey(variant.text);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(index);
    else byKey.set(key, [index]);
  });

  return [...byKey.values()]
    .sort((a, b) => b.length - a.length)
    .map((variantIndexes) => ({
      variantIndexes,
      difference: describeDifference(
        variantIndexes.map((i) => variants[i]!.text),
      ),
    }));
}

export function countByKind(groups: AnswerVariantGroup[]): VariantCounts {
  const counts: VariantCounts = {
    spelling: 0,
    mixed: 0,
    different: 0,
    total: 0,
  };
  for (const group of groups) {
    if (group.kind === "identical") continue;
    counts[group.kind] += 1;
    counts.total += 1;
  }
  return counts;
}
