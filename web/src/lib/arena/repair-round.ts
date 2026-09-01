import type { CandidateGeneration, GenerateArgs } from "@/lib/arena/providers";

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
 *
 * This is why the chat route serves rag-v4-1 BUFFERED while other arms
 * stream: the repair round must see the complete answer before anything is
 * shown, or a reviewer would watch text being judged that later silently
 * changes. The wire format already carries a final `reply` event, so a
 * buffered column is just a degenerate stream that emits only that event.
 */

/** The one versionLabel whose serving path runs the repair round. */
export const REPAIR_ROUND_VERSION_LABEL = "rag-v4-1";

export type RepairViolationKind =
  "banned-character" | "hyphenated-prefix" | "tone-saturation";

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

/** Words in `text` containing a letter or mark outside the Igala allowlist. */
export function findAllowlistViolations(text: string): string[] {
  const hits: string[] = [];
  for (const match of text.match(WORD_RE) ?? []) {
    if (wordViolatesAllowlist(match) && !hits.includes(match)) hits.push(match);
  }
  return hits;
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
  const badChars = findAllowlistViolations(output);
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
}

/**
 * Wrap one buffered generation in the repair round. `generate` is injected
 * (the routes pass generateForCandidate bound to their candidate) so this
 * module stays pure of provider concerns and the unit tests need no SDK
 * mocks.
 */
export async function generateWithRepairRound(
  candidate: { versionLabel?: string | null },
  args: GenerateArgs,
  generate: (a: GenerateArgs) => Promise<CandidateGeneration>,
  opts: RepairCheckOptions = {},
): Promise<RepairedGeneration> {
  if (candidate.versionLabel !== REPAIR_ROUND_VERSION_LABEL) {
    // The no-op guarantee: one call, untouched args, unchanged result.
    const result = await generate(args);
    return { ...result, repaired: false, repairViolations: null };
  }

  const first = await generate(args);
  const violations = checkIgalaOutput(first.text, opts);
  if (violations.length === 0) {
    return { ...first, repaired: false, repairViolations: [] };
  }

  // Re-ask ONCE, violations named, first answer in context as the model's
  // own prior turn. The second answer is kept regardless of what the checker
  // would say about it - one repair, never a loop.
  const second = await generate({
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
  };
}
