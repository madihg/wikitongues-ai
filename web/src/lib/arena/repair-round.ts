import type { CandidateGeneration, GenerateArgs } from "@/lib/arena/providers";
import { hasBudgetForReask } from "@/lib/arena/turn-budget";

/**
 * REPAIR ROUND for the rag-v4-1 serving path: a deterministic, dependency-free
 * checker over a finished output string, plus the one-retry integration the
 * chat and eval-generation routes share.
 *
 * WHY THIS EXISTS (tasks/grammar-failure-analysis-v4-1.md, section 3.5)
 * --------------------------------------------------------------------
 * ~40% of the judged v3 failure phenomena VIOLATE rules the prompt already
 * states - prompt-only remediation has a measured ceiling. The three checks
 * here are the spec's three cheap serving-side lints, each catching a failure
 * family mechanically:
 *   (a) character allowlist  - pattern 5 (~21 rows: banned/alien letters).
 *       An allowlist, never a ban list: the failures evaded v3's ban list
 *       with c-hacek, which no ban list anticipated.
 *   (b) hyphenated prefix    - pattern 6 (~24 rows: the invented é- tic).
 *       Corpus tokens shaped vowel-hyphen in 30,907 verses: zero.
 *   (c) tone-mark saturation - pattern 4 (~15 rows: every native edit in the
 *       failure set strips tone; R8.3 grade A says saturate only on request).
 *   (d) name not preserved  - the 2026-09-01 community finding, rag-v4-2 only.
 *       In a TRANSLATION request every proper noun in the source must survive
 *       into the answer unchanged (see below).
 *
 * THE 2026-09-01 BUG: CHECK (a) WAS MANUFACTURING THE ERROR IT LOOKS FOR
 * ----------------------------------------------------------------------
 * The allowlist has no s, because Igala has no /s/. Applied to a whole answer
 * it therefore flagged Lagos, Egbuson, Bayelsa, Spring and Montessori - the
 * proper nouns of an English Wikipedia biography, which the community says
 * must be copied through untouched - as "letters that do not exist in Igala",
 * and re-asked the model to rewrite them. It flagged "psychology" the same
 * way, which is the likeliest reason that fact was dropped from the
 * translation instead of borrowed. The lint was not merely blind to the
 * failure Agnes and Charity reported: it was causing it, one turn after the
 * model got it right.
 *
 * THE FIX is a scope, not a weakening. Check (a) exists to catch the model's
 * OWN inventions - the adsa family, recurring verbatim across unrelated
 * prompts. A word the model copied out of the question is not an invention,
 * so `opts.sourceText` exempts any word that already appears in the question.
 * Fabrications are unaffected: they are, by definition, not in the question.
 * The exemption applies to every v4-family label including rag-v4-1, because
 * it is a bug fix rather than a version change - and it is a verified no-op
 * on the frozen exam (scripts/replay-repair-check.ts replays the stored
 * rag-v4-1 outputs against both checkers and reports zero differences), so
 * the published v4.1 numbers still describe the system that produced them.
 *
 * These are generation-side lint, NOT grammar: no check asserts an Igala
 * form, so the sourcing contract does not apply. The repair instruction they
 * produce quotes only the model's OWN output words plus fixed English
 * scaffolding - no attested Igala material - so it cannot leak gold.
 *
 * THE INTEGRATION CONTRACT
 * ------------------------
 * generateWithRepairRound wraps one buffered generation:
 *   - versionLabel !== "rag-v4-1": exactly one generate call, args passed
 *     through UNTOUCHED, result returned unchanged. The no-op guarantee -
 *     every other arm's serving stays byte-identical (unit-tested).
 *   - rag-v4-1, clean first answer: one call, no retry.
 *   - rag-v4-1, violations: re-ask ONCE with the violations named (the first
 *     answer becomes an assistant turn, the repair instruction the new user
 *     turn, so the model sees exactly what it wrote), and the second answer
 *     is kept REGARDLESS - never a loop, never a third call. Latency and
 *     token accounting SUM both calls: serve what you measure.
 *   - rag-v4-1, violations, but a BUDGET was supplied and it is nearly spent:
 *     the re-ask is NOT started. The first answer is kept and the caller is
 *     told through onRevision(violations, false). Only the chat route supplies
 *     a budget; the exam and the eval route pass none, so this branch cannot
 *     fire on the measured paths and their behaviour is unchanged.
 *
 * BUFFERED FOR THE EXAM, STREAMED FOR THE CHAT
 * --------------------------------------------
 * The checker needs a COMPLETE answer, which is why the offline exam and the
 * eval-generation route keep calling generateWithRepairRound: buffered, one
 * stored output per prompt, nobody watching. The chat route may not pay that
 * price - rag-v4-1 is the default-selected column, so buffering it meant the
 * first thing every reviewer saw was a blank panel for the length of TWO full
 * generations.
 *
 * streamWithRepairRound resolves that without touching the invariant the exam
 * measures. Both entry points call the SAME runRepairRound core with the same
 * decisions (check, one named re-ask, second answer kept regardless, summed
 * accounting); they differ only in the two callbacks they inject - deltas as
 * they arrive, and a notification between the attempts. The streamed column
 * therefore ENDS on exactly the text the buffered call would have returned,
 * which is the only property the numbers depend on.
 */

/**
 * The versionLabels whose serving path runs the repair round. rag-v4-2 joins
 * rag-v4-1: v4.2 is v4.1 plus the named-entity rules, and the round is part
 * of what those rules need (check (d) is where "names survive" is enforced
 * rather than merely requested). Every other label keeps the no-op
 * passthrough, unit-tested below. rag-v4-3, rag-v4-4 and rag-v4-5 inherit
 * v4.2's rules and the round with them.
 */
export const REPAIR_ROUND_VERSION_LABELS = [
  "rag-v4-1",
  "rag-v4-2",
  "rag-v4-3",
  "rag-v4-4",
  "rag-v4-5",
] as const;

/** True when this label's serving path runs the repair round. */
export function labelRunsRepairRound(
  label: string | null | undefined,
): boolean {
  return (REPAIR_ROUND_VERSION_LABELS as readonly string[]).includes(
    label as string,
  );
}

export type RepairViolationKind =
  | "banned-character"
  | "hyphenated-prefix"
  | "tone-saturation"
  | "name-not-preserved";

export interface RepairViolation {
  kind: RepairViolationKind;
  /** Human-readable line for the repair instruction, naming the offenders. */
  detail: string;
}

// ─── (a) character allowlist ────────────────────────────────────────────────

/**
 * The spec's E5 allowlist, decomposed to per-character terms (NFD): the base
 * letters that appear in "a b ch d e ẹ f g gb gw i j k kp kw l m n ñ ñm ñw
 * nw ny o ọ p r t u w y". Absent entirely: q s v x z - so ṣ (s + dot) fails
 * on its base letter alone, exactly as the spec wants.
 */
const ALLOWED_BASE_LETTERS = new Set("abcdefghijklmnoprtuwy");

/** Tone accents the orthography allows on vowels: grave, acute, macron. */
const TONE_MARKS = new Set(["̀", "́", "̄"]);
/** Dot below - only under e/o (ẹ, ọ). Under i/u/s it is the banned ị/ụ/ṣ. */
const DOT_BELOW = "̣";
/** Tilde - only over n (ñ). */
const TILDE = "̃";

const APOSTROPHES = new Set(["'", "’", "ʼ"]);

/** One "word": letters/marks plus in-word apostrophes and hyphens. */
const WORD_RE = /[\p{L}\p{M}'’ʼ-]+/gu;

/** Straight and curly single quotes. The same characters serve as quote
 * marks, possessive apostrophes and Igala elision marks, so a token only
 * sheds them at its EDGES (2026-09-28). */
const EDGE_QUOTE_RE = /^['’‘ʼ]+|['’‘ʼ]+$/gu;

/**
 * A word token without quote marks stuck to its edges: `'Musa` -> `Musa`,
 * `Idah'` -> `Idah`, `w'ọla` unchanged. The v4.2 prompt bank puts source
 * sentences in single quotes (Translate 'Musa lives in Idah' into Igala.),
 * and before this every check read `'musa` and `idah'` as the words: the
 * copied-word exemption missed Musa, the name check demanded `Idah'`, and a
 * correct answer was re-asked into a respelled or padded one. "" for a token
 * that was nothing but quote marks.
 */
export function stripEdgeQuotes(token: string): string {
  return token.replace(EDGE_QUOTE_RE, "");
}

/** Fold a word for set membership: edge quotes off, lowercase, NFC. */
function foldWord(token: string): string {
  return stripEdgeQuotes(token).toLowerCase().normalize("NFC");
}

function isLetter(ch: string): boolean {
  return /\p{L}/u.test(ch);
}
function isMark(ch: string): boolean {
  return /\p{M}/u.test(ch);
}

/**
 * True when every character of the (NFD-normalized) word is licensed by the
 * allowlist: an allowed base letter, a tone accent on a vowel, dot-below on
 * e/o, tilde on n, an apostrophe, or a hyphen (hyphen PLACEMENT is check b's
 * job, not this one's).
 */
function wordViolatesAllowlist(word: string): boolean {
  const nfd = word.normalize("NFD");
  let prevBase = "";
  for (const ch of nfd) {
    if (APOSTROPHES.has(ch) || ch === "-") {
      prevBase = "";
      continue;
    }
    if (isMark(ch)) {
      if (TONE_MARKS.has(ch)) continue;
      if (ch === DOT_BELOW && (prevBase === "e" || prevBase === "o")) continue;
      if (ch === TILDE && prevBase === "n") continue;
      return true; // hacek, dot under i/u, or any other mark
    }
    if (isLetter(ch)) {
      const lower = ch.toLowerCase();
      prevBase = lower;
      if (!ALLOWED_BASE_LETTERS.has(lower)) return true; // s, z, x, q, v, ...
      continue;
    }
    // Anything else inside a word-token (should not happen) is suspect.
    return true;
  }
  return false;
}

/**
 * Case-folded word set of a source text, for the copied-word exemption.
 * Folding is lowercase + NFC so "Lagos" in the question exempts "lagos" or
 * "Lagos" in the answer, and nothing else.
 */
export function sourceWordSet(sourceText: string | undefined): Set<string> {
  const set = new Set<string>();
  if (!sourceText) return set;
  for (const w of sourceText.match(WORD_RE) ?? []) {
    const key = foldWord(w);
    if (!key) continue;
    set.add(key);
    // An Igala elision prefix fuses to the next word (t'Ankpa, ef'Abuja,
    // efẹw'Abuja). The name behind it is present, so each segment after an
    // in-word apostrophe is a word of its own too (2026-10-08 review).
    if (/['’ʼ]/.test(key)) {
      for (const seg of key.split(/['’ʼ]+/)) if (seg.length >= 3) set.add(seg);
    }
  }
  return set;
}

/**
 * Words in `text` containing a letter or mark outside the Igala allowlist,
 * EXCLUDING words the question already contained (see the header): those are
 * copied foreign material, which check (a) was never meant to police.
 */
export function findAllowlistViolations(
  text: string,
  exempt: Set<string> = new Set(),
): string[] {
  const hits: string[] = [];
  for (const match of text.match(WORD_RE) ?? []) {
    if (exempt.has(foldWord(match))) continue;
    if (wordViolatesAllowlist(match) && !hits.includes(match)) hits.push(match);
  }
  return hits;
}

/**
 * The question asks for some English in the answer ("explain in English",
 * "note in English", "one line of English"). Check (a) is about Igala words,
 * so on such a question it would flag the requested English and the re-ask,
 * which restates "answer in Igala only", would strip it (2026-09-28: the
 * idiom and loanword prompts of the v4.2 bank). Deliberately narrow: "leave
 * it in English" asks about a name, not for English prose, and does not match.
 */
export function requestsEnglish(sourceText: string | undefined): boolean {
  if (!sourceText) return false;
  // A phrase inside a quoted passage is part of the sentence to translate,
  // not an instruction ("Translate 'write your name in English' into Igala").
  const text = stripQuotedPassages(sourceText);
  const re =
    /\b(?:explain|note|write|answer|reply|describe|add|say)(?:\s+[\w']+){0,3}\s+in English\b/gi;
  for (const m of text.matchAll(re)) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 40), m.index);
    // "do not answer in English", "never reply in English", "without
    // writing in English": the instruction forbids English.
    if (/\b(?:not|never|don't|dont|without|no)\s+(?:[\w']+\s+){0,2}$/i.test(before))
      continue;
    return true;
  }
  return /\bline of English\b/i.test(text);
}

/** True for a word of plain Latin letters with no Igala mark (no ẹ, ọ, ñ,
 * tone accent or other combining mark): the shape English prose has, and
 * the shape an Igala respelling such as shọpu or yuñivasítí never has. */
export function isPlainAscii(word: string): boolean {
  return /^[A-Za-z'’ʼ-]+$/.test(word);
}

// ─── (d) name preservation (rag-v4-2) ───────────────────────────────────────

/**
 * Capitalized source words that are NOT proper nouns for our purposes: the
 * model may legitimately render these in Igala, so their absence is not a
 * violation. Languages and peoples have Igala names; God has an attested
 * Igala form; English weekday and month names are governed by the dates rule.
 */
const NOT_A_NAME = new Set([
  "i",
  "igala",
  "english",
  // Task framing, never a name to preserve: "an Igala Wikipedia article".
  "wikipedia",
  "wiktionary",
  "yoruba",
  "igbo",
  "hausa",
  "nigerian",
  "african",
  "god",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
]);

/** True when the request is a translation - the only shape check (d) fires on. */
export function isTranslationRequest(sourceText: string | undefined): boolean {
  return !!sourceText && /\btranslat/i.test(sourceText);
}

/**
 * English function words and imperatives that open a quoted sentence
 * ("Translate 'The people of Ajaokuta said ...'"). Capitalized there, they are
 * not names; before 2026-10-08 the quote mark stuck to them hid this by
 * accident, and stripping it exposed "The" as a name to preserve.
 */
const FUNCTION_WORDS = new Set([
  "the", "a", "an", "he", "she", "it", "they", "we", "you", "my", "our",
  "your", "his", "her", "their", "its", "this", "that", "these", "those",
  "there", "here", "when", "where", "what", "who", "whom", "which", "how",
  "why", "in", "on", "at", "to", "for", "of", "with", "from", "by", "into",
  "and", "but", "or", "if", "as", "so", "not", "no", "yes", "is", "are",
  "was", "were", "be", "been", "being", "do", "does", "did", "have", "has",
  "had", "will", "would", "can", "could", "should", "may", "might", "must",
  "please", "write", "give", "say", "tell", "ask", "translate", "explain",
  "name", "use", "some", "every", "all", "both", "each", "many", "one",
  "two", "three", "first", "last", "next", "today", "tomorrow", "yesterday",
  "now", "then", "also", "only", "just", "very", "more", "most", "after",
  "before", "because", "while", "since", "until", "about", "over", "under",
  "once", "upon", "yesterday's", "today's",
]);

/**
 * Proper nouns in a source text: capitalized words of 3+ letters that are not
 * sentence-initial, not in NOT_A_NAME and not English function words. A
 * possessive clitic is not part of the name (Amina's -> Amina): Igala marks
 * possession without it, so demanding "Amina's" re-asked every correct
 * answer. Sentence-initial words are skipped because capitalization there
 * carries no information - "Write the Igala..." would otherwise make "Write"
 * a name; a word that opens a QUOTED sentence mid-question (Translate 'Musa
 * lives ...') is not sentence-initial and is checked.
 */
export function findSourceProperNouns(sourceText: string): string[] {
  const out: string[] = [];
  // Sentence-initial = first word overall, or the first word after . ! ? : or
  // a newline. Tracked by scanning the raw text rather than the word list.
  const re = /[\p{L}\p{M}'’ʼ-]+|[^\p{L}\p{M}\s]|\n/gu;
  let atStart = true;
  for (const raw of sourceText.match(re) ?? []) {
    if (/^[.!?:\n]$/.test(raw)) {
      atStart = true;
      continue;
    }
    if (!/^[\p{L}\p{M}'’ʼ-]+$/u.test(raw)) continue;
    // A token that was only quote marks is punctuation: it neither counts
    // as a word nor takes the sentence-start slot from the word after it.
    const tok = stripEdgeQuotes(raw);
    if (!tok) continue;
    const wasStart = atStart;
    atStart = false;
    if (wasStart) continue;
    const name = tok.replace(/['’ʼ]s$/u, "");
    if (name.length < 3) continue;
    if (name[0] !== name[0].toUpperCase() || name[0] === name[0].toLowerCase())
      continue;
    const key = name.toLowerCase();
    if (NOT_A_NAME.has(key) || FUNCTION_WORDS.has(key)) continue;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/**
 * English words that open the framing AFTER a quoted sentence ("'...' into
 * Igala", "'...' means", "'...' as a market woman would say it"). A closing
 * mark followed by one of them is the end of the passage; a closing mark
 * followed by anything else may be a plural possessive or an elision inside
 * it ("the farmers' union", "ch' ọma").
 */
const AFTER_QUOTE_WORDS = new Set([
  "into", "in", "to", "as", "means", "mean", "for", "and", "or", "from",
  "with", "so", "then", "but", "using", "without", "when", "if", "which",
  "that", "where", "is", "was", "are", "would", "could", "should", "be",
  "you", "please", "how", "what", "who", "the", "a", "an", "on", "at", "by",
  "of", "this", "these", "here", "there", "said", "say", "says", "called",
  "translate", "translated", "translation", "correctly", "right", "properly",
  "back", "out", "naturally", "literally", "exactly", "idiomatically", "too",
  "also", "again", "twice", "once", "first", "write", "give", "put", "keep",
  "keeping", "render", "rendered", "sounds", "sound", "spoken", "written",
]);

/**
 * The quoted passages of a question, in order. An opener is a quote mark
 * that does not follow a letter. Its closer is a mark of the same family
 * (' or ‘ closes with ' or ’; " or “ with " or ”) that does not stand
 * inside a word, and that is followed by the end of the text, punctuation,
 * another opener, or one of AFTER_QUOTE_WORDS; failing that, the LAST such
 * mark. So `Translate 'Amina's father sells yams' into Igala` yields the
 * whole sentence (the possessive is inside a word), `'the farmers' union'
 * into Igala` is not cut at the plural possessive, two quotes in one
 * question stay two passages, and `your community's songs` yields nothing.
 * Used to find instructions that sit outside the sentence to translate;
 * names are read from the whole question.
 */
export function quotedPassages(text: string): string[] {
  const out: string[] = [];
  const chars = [...text];
  const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{M}\d]/u.test(c);
  const isOpener = (c: string | undefined, prev: string | undefined) =>
    (c === "'" || c === "‘" || c === '"' || c === "“") && !isWordChar(prev);
  const closersFor = (c: string): Set<string> =>
    c === "'" || c === "‘" ? new Set(["'", "’"]) : new Set(['"', "”"]);
  const endsPassage = (j: number): boolean => {
    let k = j + 1;
    if (k >= chars.length) return true;
    if (/[.,;:!?)\]]/.test(chars[k])) return true;
    if (!/\s/.test(chars[k])) return isOpener(chars[k], chars[j]);
    while (k < chars.length && /\s/.test(chars[k])) k++;
    if (k >= chars.length) return true;
    if (isOpener(chars[k], chars[k - 1])) return true;
    const word = chars.slice(k).join("").match(/^[A-Za-z']+/)?.[0] ?? "";
    return AFTER_QUOTE_WORDS.has(word.toLowerCase());
  };
  let i = 0;
  while (i < chars.length) {
    if (isOpener(chars[i], chars[i - 1])) {
      const closers = closersFor(chars[i]);
      let end = -1;
      let last = -1;
      for (let j = i + 1; j < chars.length && end < 0; j++) {
        if (!closers.has(chars[j]) || isWordChar(chars[j + 1])) continue;
        last = j;
        if (endsPassage(j)) end = j;
      }
      if (end < 0) end = last;
      if (end > i + 1) {
        out.push(chars.slice(i + 1, end).join(""));
        i = end + 1;
        continue;
      }
    }
    i++;
  }
  return out;
}

/** The question with its quoted passages blanked out. */
function stripQuotedPassages(text: string): string {
  let out = text;
  for (const p of quotedPassages(text)) out = out.replace(p, " ");
  return out;
}

/**
 * Proper nouns the source supplied and the answer did not keep. Only
 * meaningful on a translation request: in a question-and-answer turn the
 * answer has no obligation to repeat a name the question mentioned. Names
 * are read from the WHOLE question: a translation that quotes only a title
 * or a nickname ("Miriam Makeba, known as 'Mama Africa', sang in
 * Johannesburg") still has to keep Makeba and Johannesburg (2026-10-08
 * review; the Sep 28 fix read the quoted span alone and lost them).
 */
export function findDroppedNames(output: string, sourceText: string): string[] {
  const present = sourceWordSet(output);
  return findSourceProperNouns(sourceText).filter(
    (n) => !present.has(foldWord(n)),
  );
}

// ─── (b) hyphenated prefix ──────────────────────────────────────────────────

/**
 * Words shaped like the é- tic: a SINGLE letter (with any diacritics) fused
 * by a hyphen to a following word (é-jẹu, é-gbítì). Multi-letter compounds
 * with a hyphen (ugbo-wn, danyedo-we) are community-attested and pass.
 */
export function findHyphenPrefixViolations(text: string): string[] {
  const hits: string[] = [];
  for (const match of text.match(WORD_RE) ?? []) {
    const at = match.indexOf("-");
    if (at <= 0 || at === match.length - 1) continue;
    const prefix = match.slice(0, at).normalize("NFD");
    const chars = [...prefix];
    const baseCount = chars.filter((c) => isLetter(c)).length;
    const onlyMarksElse = chars.every((c) => isLetter(c) || isMark(c));
    if (baseCount === 1 && onlyMarksElse && !hits.includes(match))
      hits.push(match);
  }
  return hits;
}

// ─── (c) tone-mark saturation ───────────────────────────────────────────────

/**
 * Saturation thresholds. R8.3 (grade A) says community writing carries tone
 * only on request; pattern 4's examples are FULLY marked short answers
 * (Àgbá Ọ́jọ́), so the heuristic is a proportion with a floor: at least
 * MIN_TONE_MARKED_VOWELS accented vowels AND at least TONE_SATURATION_RATIO
 * of all vowels accented. A single stray accent never trips it - that is an
 * edit-distance nit, not saturation.
 */
export const TONE_SATURATION_RATIO = 0.4;
export const MIN_TONE_MARKED_VOWELS = 2;

const VOWELS = new Set("aeiou");

/** True when the output is tone-saturated per the thresholds above. */
export function isToneSaturated(text: string): boolean {
  const nfd = text.normalize("NFD");
  let vowels = 0;
  let accented = 0;
  let inVowel = false;
  let vowelAccented = false;
  const closeVowel = () => {
    if (inVowel) {
      vowels++;
      if (vowelAccented) accented++;
    }
    inVowel = false;
    vowelAccented = false;
  };
  for (const ch of nfd) {
    if (isMark(ch)) {
      if (inVowel && TONE_MARKS.has(ch)) vowelAccented = true;
      continue;
    }
    closeVowel();
    if (isLetter(ch) && VOWELS.has(ch.toLowerCase())) inVowel = true;
  }
  closeVowel();
  return (
    accented >= MIN_TONE_MARKED_VOWELS &&
    accented / vowels >= TONE_SATURATION_RATIO
  );
}

// ─── the checker ────────────────────────────────────────────────────────────

export interface RepairCheckOptions {
  /**
   * The question explicitly asked for tone marks, so saturation is the
   * requested behavior, not a violation (R8.3: saturate ON REQUEST). The
   * call sites pass a match on the raw user question.
   */
  allowTone?: boolean;
  /**
   * The raw question this answer was written from. Enables the copied-word
   * exemption on check (a) - see the header - and is what check (d) reads
   * its proper nouns out of. Every v4-family serving path supplies it.
   */
  sourceText?: string;
  /**
   * Run check (d), name preservation. rag-v4-2 only: it enforces a rule the
   * v4.2 prompt states and v4.1 does not, so switching it on for v4.1 would
   * change a measured arm.
   */
  checkNames?: boolean;
}

/**
 * Pure checker over a finished output string. Deterministic, no I/O, no
 * model calls - safe to run on every generation.
 */
export function checkIgalaOutput(
  output: string,
  opts: RepairCheckOptions = {},
): RepairViolation[] {
  const violations: RepairViolation[] = [];
  // On a question that asks for English prose, the English is exempt from
  // check (a) word by word (plain Latin letters, no Igala mark), and the
  // model's own respellings (shọpu, yuñivasítí) are still caught. Skipping
  // the check wholesale let three such respellings into the queue
  // (2026-10-08 review).
  const allHits = findAllowlistViolations(output, sourceWordSet(opts.sourceText));
  const badChars = requestsEnglish(opts.sourceText)
    ? allHits.filter((w) => !isPlainAscii(w))
    : allHits;
  if (badChars.length > 0) {
    violations.push({
      kind: "banned-character",
      detail:
        `these words use letters that do not exist in Igala ` +
        `(Igala has no s, z, x, q, v, no hacek, and dots only under e and o): ` +
        badChars.join(", "),
    });
  }
  const hyphens = findHyphenPrefixViolations(output);
  if (hyphens.length > 0) {
    violations.push({
      kind: "hyphenated-prefix",
      detail:
        `Igala has no hyphenated prefixes - these words must be rewritten ` +
        `without the letter-hyphen prefix: ` +
        hyphens.join(", "),
    });
  }
  if (opts.checkNames && isTranslationRequest(opts.sourceText)) {
    const dropped = findDroppedNames(output, opts.sourceText!);
    if (dropped.length > 0) {
      violations.push({
        kind: "name-not-preserved",
        detail:
          `a translation keeps every name exactly as the source writes it, ` +
          `and these are missing from your answer: ${dropped.slice(0, 8).join(", ")}`,
      });
    }
  }
  if (!opts.allowTone && isToneSaturated(output)) {
    violations.push({
      kind: "tone-saturation",
      detail:
        "the answer is saturated with tone marks - community writing uses " +
        "no tone marks unless the question asks for them; remove them",
    });
  }
  return violations;
}

/**
 * Short, plain-language names for the three rule families - what a reviewer is
 * told while the column is being rewritten under her.
 *
 * Deliberately NOT the `detail` lines: those are written for the model and
 * quote the offending words, and the offending words are about to disappear
 * from the screen. The reviewer needs the category, not the evidence.
 */
export const REPAIR_VIOLATION_LABELS: Record<RepairViolationKind, string> = {
  "banned-character": "letters that are not in the Igala alphabet",
  "hyphenated-prefix": "a hyphenated prefix Igala does not use",
  "tone-saturation": "tone marks the question did not ask for",
  "name-not-preserved": "a name from the source that was changed or dropped",
};

/** The labels for one violation set, one per kind, in check order. */
export function describeViolations(violations: RepairViolation[]): string[] {
  const seen = new Set<RepairViolationKind>();
  const out: string[] = [];
  for (const v of violations) {
    if (seen.has(v.kind)) continue;
    seen.add(v.kind);
    out.push(REPAIR_VIOLATION_LABELS[v.kind]);
  }
  return out;
}

/**
 * The re-ask turn. English scaffolding plus the model's own output words
 * only - no attested Igala forms, so Scope A has nothing to bite on. Restates
 * the output contract because the retrieval-laden first turn scrolled away.
 */
export function buildRepairInstruction(violations: RepairViolation[]): string {
  return [
    "Your answer breaks these Igala writing rules:",
    ...violations.map((v) => `- ${v.detail}`),
    "Write the answer again with every violation fixed, changing nothing else. Answer in Igala only. Give the answer itself, nothing else.",
  ].join("\n");
}

// ─── the integration ────────────────────────────────────────────────────────

export interface RepairedGeneration extends CandidateGeneration {
  /** True when the repair re-ask actually ran (rag-v4-1, dirty first pass). */
  repaired: boolean;
  /**
   * Violations found on the FIRST answer. Empty array = checked and clean;
   * null = the checker never ran (any other versionLabel).
   */
  repairViolations: RepairViolation[] | null;
  /**
   * The discarded first-pass text, kept ONLY when a re-ask actually ran
   * (repaired=true) - it is the answer the repair round decided not to serve.
   * null when the round never ran, or ran and found nothing to fix: there is
   * nothing "first-pass" to distinguish from the served text in either case
   * (tasks/project-audit-2026-09-01.md, finding 10/5 - "the repair round's
   * first pass is unrecoverable").
   */
  firstPassText: string | null;
  /**
   * True when the checker DID find violations but the turn had too little
   * budget left to run a second generation, so the first answer was kept. Only
   * ever true when a budget was supplied - the exam and eval paths supply
   * none, so it is false there by construction.
   */
  repairSkippedForTime: boolean;
}

/**
 * The turn's deadline, as the repair round sees it.
 *
 * An ABSOLUTE timestamp rather than a duration: the round starts whenever the
 * first attempt happens to finish, and "how much of the turn is left" is only
 * answerable against a fixed end point. `now` is injected so the decision is
 * testable without sleeping through a real budget.
 */
export interface RepairRoundBudget {
  /** Epoch ms by which the whole turn must be finished. */
  deadlineMs: number;
  /** Clock, injectable for tests. Defaults to Date.now. */
  now?: () => number;
}

/**
 * THE ONE implementation of the repair round. Every decision the round makes
 * lives here and nowhere else: which labels run it, what counts as dirty, how
 * the re-ask turn is built, that the second answer is kept regardless, and how
 * latency and tokens are summed.
 *
 * `run` is one generation, however the caller performs it - buffered for the
 * exam and the eval route, streaming for chat. `onRevision` fires exactly once,
 * AFTER the first answer is judged dirty and BEFORE the second call starts, so
 * a streaming caller can tell its client that what it has been reading is
 * about to be replaced. Neither injection can change the outcome: `run` is
 * called with identical arguments in identical order either way, so buffered
 * and streamed callers return the same RepairedGeneration for the same model.
 */
async function runRepairRound(
  candidate: { versionLabel?: string | null },
  args: GenerateArgs,
  run: (a: GenerateArgs) => Promise<CandidateGeneration>,
  onRevision: (violations: RepairViolation[], applied: boolean) => void,
  opts: RepairCheckOptions,
  budget?: RepairRoundBudget,
): Promise<RepairedGeneration> {
  if (!labelRunsRepairRound(candidate.versionLabel)) {
    // The no-op guarantee: one call, untouched args, unchanged result.
    const result = await run(args);
    return {
      ...result,
      repaired: false,
      repairViolations: null,
      firstPassText: null,
      repairSkippedForTime: false,
    };
  }

  const first = await run(args);
  const violations = checkIgalaOutput(first.text, opts);
  if (violations.length === 0) {
    return {
      ...first,
      repaired: false,
      repairViolations: [],
      firstPassText: null,
      repairSkippedForTime: false,
    };
  }

  // THE BUDGET GATE - the only deadline-aware decision in this file.
  //
  // The first attempt is finished and, on the chat path, already on the
  // reviewer's screen. A re-ask is a SECOND full generation; started with too
  // little budget left it does not finish, the platform kills the function
  // mid-rewrite, and BOTH answers are lost - the bodiless 504 this work exists
  // to prevent. The asymmetry decides it: an answer with a lint violation is
  // worth far more than a rewrite that never lands. So the first answer is
  // kept, and the reviewer is told through the SAME channel a real rewrite
  // announces itself on that the check found something and there was no time
  // to act on it. Never a silent pass.
  //
  // No budget means no deadline (exam, eval): the gate cannot fire there.
  const now = budget?.now ?? Date.now;
  if (budget !== undefined && !hasBudgetForReask(budget.deadlineMs, now())) {
    onRevision(violations, false);
    return {
      ...first,
      repaired: false,
      repairViolations: violations,
      // The first answer IS what got served here, not a discarded draft -
      // there is no "first pass" separate from the served text.
      firstPassText: null,
      repairSkippedForTime: true,
    };
  }

  onRevision(violations, true);

  // Re-ask ONCE, violations named, first answer in context as the model's
  // own prior turn. The second answer is kept regardless of what the checker
  // would say about it - one repair, never a loop.
  const second = await run({
    ...args,
    conversationHistory: [
      ...(args.conversationHistory ?? []),
      { role: "user", content: args.userMessage },
      { role: "assistant", content: first.text },
    ],
    userMessage: buildRepairInstruction(violations),
  });

  const sumTokens = (a?: number, b?: number) =>
    a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);

  return {
    ...second,
    // Serve what you measure: the served answer cost BOTH calls.
    latencyMs: first.latencyMs + second.latencyMs,
    tokensIn: sumTokens(first.tokensIn, second.tokensIn),
    tokensOut: sumTokens(first.tokensOut, second.tokensOut),
    repaired: true,
    repairViolations: violations,
    // The discarded attempt - never served, kept so the round can be audited.
    firstPassText: first.text,
    repairSkippedForTime: false,
  };
}

/** Nothing to announce when nobody is watching a buffered generation. */
const NO_REVISION_NOTICE = () => {};

/**
 * Wrap one BUFFERED generation in the repair round - the exam and eval path.
 * `generate` is injected (the routes pass generateForCandidate bound to their
 * candidate) so this module stays pure of provider concerns and the unit tests
 * need no SDK mocks. Nothing is shown until the round is over, which is what a
 * stored, scored output wants.
 */
export async function generateWithRepairRound(
  candidate: { versionLabel?: string | null },
  args: GenerateArgs,
  generate: (a: GenerateArgs) => Promise<CandidateGeneration>,
  opts: RepairCheckOptions = {},
  budget?: RepairRoundBudget,
): Promise<RepairedGeneration> {
  return runRepairRound(
    candidate,
    args,
    generate,
    NO_REVISION_NOTICE,
    opts,
    budget,
  );
}

export interface RepairStreamHandlers {
  /** Every token of BOTH attempts, in arrival order. */
  onDelta: (delta: string) => void;
  /**
   * The first attempt was dirty. Fires at most once, and never for a clean
   * answer or a non-rag-v4-1 label.
   *
   * `applied` says what happens next, and the two cases are opposites for the
   * client: true - a repaired attempt is about to stream, so everything
   * delivered through onDelta so far is SUPERSEDED. false - the turn had too
   * little budget left to rewrite, so the first attempt STANDS and is the
   * answer; the reasons are still worth showing, because a reviewer must not
   * be served a flagged answer without being told it was flagged.
   */
  onRevision: (violations: RepairViolation[], applied: boolean) => void;
}

/**
 * Wrap one STREAMED generation in the repair round - the chat path.
 *
 * Same round, same result, tokens delivered as they arrive. `stream` performs
 * one generation and reports its deltas (the chat route passes
 * streamForCandidate bound to its candidate); both attempts go through it, so
 * a repaired column streams twice with an onRevision between - which is
 * precisely the information the client needs to throw the first attempt away.
 *
 * The returned RepairedGeneration is identical to what generateWithRepairRound
 * returns for the same model, because it IS the same core - pinned by test.
 */
export async function streamWithRepairRound(
  candidate: { versionLabel?: string | null },
  args: GenerateArgs,
  stream: (
    a: GenerateArgs,
    onDelta: (delta: string) => void,
  ) => Promise<CandidateGeneration>,
  handlers: RepairStreamHandlers,
  opts: RepairCheckOptions = {},
  budget?: RepairRoundBudget,
): Promise<RepairedGeneration> {
  return runRepairRound(
    candidate,
    args,
    (a) => stream(a, handlers.onDelta),
    handlers.onRevision,
    opts,
    budget,
  );
}
