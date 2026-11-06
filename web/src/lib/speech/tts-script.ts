import { resolve, relative, isAbsolute } from "node:path";
import { isFrozenPrompt, type PromptFreezeFields } from "./guard";
import { toneStrip } from "./normalise";

/**
 * The pure half of scripts/speech/build-tts-script.ts (PRD US-008): which
 * cold answers may be read in the studio, how they become sentences, how
 * duplicates are found, how long the script is, and what the numbers-only
 * report says. No database, no network; the LLM step (tone restoration) is
 * passed in, so tests run on invented sentences.
 */

export const WORDS_PER_MINUTE = 130;
/** EveryVoice clips run 0.5 to 10 s; at 130 wpm, 10 s is about 21 words. */
export const MIN_WORDS = 3;
export const MAX_WORDS = 20;

/** A cold answer as the script builder reads it. */
export interface ScriptCandidate {
  /** ColdAuthorAnswer.id, used only to order candidates deterministically. */
  id: string;
  /** The public prompt code (Prompt.promptId): what a studio clip is saved against. */
  promptCode: string;
  text: string;
  prompt: PromptFreezeFields;
  isDemo: boolean;
  consentTraining: boolean;
  verificationStatus: string;
}

/**
 * The one eligibility rule. The database query narrows with the same fields;
 * this re-checks every row, so a query mistake cannot let a held-out or demo
 * answer into a script. "Kept" means a speaker-authored answer: seed rows are
 * imports, not speakers, and never go in.
 */
export function eligibleForScript(c: ScriptCandidate): boolean {
  if (isFrozenPrompt(c.prompt)) return false;
  if (c.isDemo) return false;
  if (!c.consentTraining) return false;
  if (c.verificationStatus === "seed") return false;
  return c.text.trim().length > 0;
}

/** Sentences of an answer: split after . ! ? or an ellipsis followed by space. */
export function splitSentences(text: string): string[] {
  return text
    .normalize("NFC")
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
}

export function countWords(text: string): number {
  return text.split(/\s+/u).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Two sentences are the same when their tone-stripped, lower-cased words match. */
export function dedupeKey(text: string): string {
  return toneStrip(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ScriptSentence {
  /** Public prompt code of the answer this sentence came from. */
  promptCode: string;
  text: string;
}

export interface Selection {
  /** Candidate sentences in a fixed order, one per tone-stripped form. */
  sentences: ScriptSentence[];
  counts: {
    answersConsidered: number;
    answersEligible: number;
    answersRefused: number;
    sentencesSplit: number;
    sentencesTooShort: number;
    sentencesTooLong: number;
    sentencesDuplicate: number;
    sentencesKept: number;
  };
}

/**
 * Eligible answers to deduplicated, length-bounded sentences. Order is by
 * answer id, so the same input gives the same script. When two copies of a
 * sentence differ only in tone marks, the one with more marks wins.
 */
export function selectSentences(candidates: ScriptCandidate[]): Selection {
  const counts: Selection["counts"] = {
    answersConsidered: candidates.length,
    answersEligible: 0,
    answersRefused: 0,
    sentencesSplit: 0,
    sentencesTooShort: 0,
    sentencesTooLong: 0,
    sentencesDuplicate: 0,
    sentencesKept: 0,
  };
  const ordered = [...candidates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const byKey = new Map<string, ScriptSentence>();
  const order: string[] = [];
  const markCount = (s: string) => [...s.normalize("NFD")].length - [...toneStrip(s).normalize("NFD")].length;

  for (const c of ordered) {
    if (!eligibleForScript(c)) {
      counts.answersRefused++;
      continue;
    }
    counts.answersEligible++;
    for (const s of splitSentences(c.text)) {
      counts.sentencesSplit++;
      const words = countWords(s);
      if (words < MIN_WORDS) {
        counts.sentencesTooShort++;
        continue;
      }
      if (words > MAX_WORDS) {
        counts.sentencesTooLong++;
        continue;
      }
      const key = dedupeKey(s);
      const seen = byKey.get(key);
      if (seen) {
        counts.sentencesDuplicate++;
        if (markCount(s) > markCount(seen.text)) seen.text = s;
        continue;
      }
      byKey.set(key, { promptCode: c.promptCode, text: s });
      order.push(key);
    }
  }
  const sentences = order.map((k) => byKey.get(k)!);
  counts.sentencesKept = sentences.length;
  return { sentences, counts };
}

export interface BuiltScript {
  lines: ScriptSentence[];
  words: number;
  minutes: number;
  targetMinutes: number;
  reachedTarget: boolean;
  /** Sentences sent for restoration, restored, refused for changing letters. */
  restore: { attempted: number; restored: number; alreadyMarked: number; violations: number; failed: number };
}

export type RestoreFn = (text: string) => Promise<string>;

/**
 * Walk the selection in order, restore tone marks on sentences that carry none,
 * and stop once the reading length reaches the target. Restoration is lazy so
 * a script that is already long enough costs no more calls than it needs. A
 * sentence the restorer refuses (it changed more than tone marks) is skipped
 * and counted; a sentence that carries marks already is kept as the speaker
 * wrote it. After restoration a sentence is checked against the lines already
 * taken, so two sentences that differ only in tone never both enter.
 */
export async function buildScript(
  sentences: ScriptSentence[],
  hours: number,
  restoreTones: RestoreFn,
  isViolation: (e: unknown) => boolean,
): Promise<BuiltScript> {
  const targetMinutes = hours * 60;
  const lines: ScriptSentence[] = [];
  const taken = new Set<string>();
  const restore = { attempted: 0, restored: 0, alreadyMarked: 0, violations: 0, failed: 0 };
  let words = 0;

  for (const s of sentences) {
    if (words / WORDS_PER_MINUTE >= targetMinutes) break;
    let text = s.text;
    if (toneStrip(text) !== text.normalize("NFC")) {
      restore.alreadyMarked++;
    } else {
      restore.attempted++;
      try {
        text = (await restoreTones(text)).normalize("NFC");
        restore.restored++;
      } catch (e) {
        if (isViolation(e)) restore.violations++;
        else restore.failed++;
        continue;
      }
    }
    const key = dedupeKey(text);
    if (taken.has(key)) continue;
    taken.add(key);
    lines.push({ promptCode: s.promptCode, text });
    words += countWords(text);
  }
  const minutes = words / WORDS_PER_MINUTE;
  return { lines, words, minutes, targetMinutes, reachedTarget: minutes >= targetMinutes, restore };
}

/** The letters and digraphs the report counts, as tone-stripped lower-case strings. */
export const DIGRAPHS = ["kw", "gw", "nw", "ch", "gb", "kp"] as const;
export const DOTTED_VOWELS = ["a", "e", "i", "o", "u"].map((v) => `${v}̣`);

export interface Coverage {
  digraphs: Record<string, number>;
  dottedVowels: Record<string, number>;
  /** Letter counts a-z over the whole script. */
  letters: Record<string, number>;
  /** Names of units with a count of zero (letter names, never text). */
  missing: string[];
}

function countOccurrences(hay: string, needle: string): number {
  let n = 0;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) n++;
  return n;
}

/** Letter and digraph coverage of the finished script. */
export function coverageReport(lines: ScriptSentence[]): Coverage {
  const body = lines.map((l) => toneStrip(l.text).normalize("NFD").toLowerCase()).join("\n");
  const digraphs: Record<string, number> = {};
  for (const d of DIGRAPHS) digraphs[d] = countOccurrences(body, d);
  const dottedVowels: Record<string, number> = {};
  for (const v of DOTTED_VOWELS) dottedVowels[v.normalize("NFC")] = countOccurrences(body, v);
  const letters: Record<string, number> = {};
  for (let c = 97; c <= 122; c++) {
    const ch = String.fromCharCode(c);
    letters[ch] = countOccurrences(body, ch);
  }
  const missing = [
    ...Object.entries(digraphs),
    ...Object.entries(dottedVowels),
    ...Object.entries(letters),
  ]
    .filter(([, n]) => n === 0)
    .map(([k]) => k);
  return { digraphs, dottedVowels, letters, missing };
}

export interface LengthStats {
  sentences: number;
  wordsMin: number;
  wordsMedian: number;
  wordsMean: number;
  wordsP90: number;
  wordsMax: number;
  charsMean: number;
}

/** Sentence length statistics in words (and mean characters). */
export function lengthStats(lines: ScriptSentence[]): LengthStats {
  const w = lines.map((l) => countWords(l.text)).sort((a, b) => a - b);
  const n = w.length;
  if (n === 0) {
    return { sentences: 0, wordsMin: 0, wordsMedian: 0, wordsMean: 0, wordsP90: 0, wordsMax: 0, charsMean: 0 };
  }
  const at = (q: number) => w[Math.min(n - 1, Math.floor(q * (n - 1) + 0.5))];
  const sum = w.reduce((a, b) => a + b, 0);
  const chars = lines.reduce((a, l) => a + [...l.text].length, 0);
  return {
    sentences: n,
    wordsMin: w[0],
    wordsMedian: at(0.5),
    wordsMean: sum / n,
    wordsP90: at(0.9),
    wordsMax: w[n - 1],
    charsMean: chars / n,
  };
}

/** True when `out` is not inside `repoRoot`. The script never lands in the repo. */
export function isOutsideRepo(out: string, repoRoot: string): boolean {
  const rel = relative(resolve(repoRoot), resolve(out));
  return rel.startsWith("..") || isAbsolute(rel);
}

/** One JSON object per line: {"n", "promptCode", "text"}. The studio page reads this. */
export function scriptToJsonl(lines: ScriptSentence[]): string {
  return lines.map((l, i) => JSON.stringify({ n: i + 1, promptCode: l.promptCode, text: l.text })).join("\n") + (lines.length ? "\n" : "");
}
