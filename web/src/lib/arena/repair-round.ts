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
 * passthrough, unit-tested below.
 */
export const REPAIR_ROUND_VERSION_LABELS = [
  "rag-v4-1",
  "rag-v4-2",
] as const;

/** True when this label's serving path runs the repair round. */
export function labelRunsRepairRound(label: string | null | undefined): boolean {
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
  for (const w of sourceText.match(WORD_RE) ?? [])
    set.add(w.toLowerCase().normalize("NFC"));
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
    if (exempt.has(match.toLowerCase().normalize("NFC"))) continue;
    if (wordViolatesAllowlist(match) && !hits.includes(match)) hits.push(match);
  }
  return hits;
}

// ─── (d) name preservation (rag-v4-2) ───────────────────────────────────────

/**
 * Capitalized source words that are NOT proper nouns for our purposes: the
 * model may legitimately render these in Igala, so their absence is not a
 * violation. Languages and peoples have Igala names; God has an attested
 * Igala form; English weekday and month names are governed by the dates rule.
 */
const NOT_A_NAME = new Set([
  "i", "igala", "english", "yoruba", "igbo", "hausa", "nigerian", "african",
  "god", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
  "sunday", "january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december",
]);

/** True when the request is a translation - the only shape check (d) fires on. */
export function isTranslationRequest(sourceText: string | undefined): boolean {
  return !!sourceText && /\btranslat/i.test(sourceText);
}

/**
 * Proper nouns in a source text: capitalized words of 3+ letters that are not
 * sentence-initial and not in NOT_A_NAME. Sentence-initial words are skipped
 * because capitalization there carries no information - "Write the Igala..."
 * would otherwise make "Write" a name.
 */
export function findSourceProperNouns(sourceText: string): string[] {
  const out: string[] = [];
  // Sentence-initial = first word overall, or the first word after . ! ? : or
  // a newline. Tracked by scanning the raw text rather than the word list.
  const re = /[\p{L}\p{M}'’ʼ-]+|[^\p{L}\p{M}\s]|\n/gu;
  let atStart = true;
  for (const tok of sourceText.match(re) ?? []) {
    if (/^[.!?:\n]$/.test(tok)) {
      atStart = true;
      continue;
    }
    if (!/^[\p{L}\p{M}'’ʼ-]+$/u.test(tok)) continue;
    const wasStart = atStart;
    atStart = false;
    if (wasStart) continue;
    if (tok.length < 3) continue;
    if (tok[0] !== tok[0].toUpperCase() || tok[0] === tok[0].toLowerCase())
      continue;
    const key = tok.toLowerCase();
    if (NOT_A_NAME.has(key)) continue;
    if (!out.includes(tok)) out.push(tok);
  }
  return out;
}

/**
 * Proper nouns the source supplied and the answer did not keep. Only
 * meaningful on a translation request: in a question-and-answer turn the
 * answer has no obligation to repeat a name the question mentioned.
 */
export function findDroppedNames(output: string, sourceText: string): string[] {
  const present = sourceWordSet(output);
  return findSourceProperNouns(sourceText).filter(
    (n) => !present.has(n.toLowerCase().normalize("NFC")),
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
  const badChars = findAllowlistViolations(output, sourceWordSet(opts.sourceText));
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
