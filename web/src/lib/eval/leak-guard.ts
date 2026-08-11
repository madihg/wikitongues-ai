import { fullFold, toneFold } from "./normalize";

/**
 * Contamination guard for the frozen benchmark.
 *
 * THE PROBLEM THIS EXISTS FOR, measured 2026-08-09
 * -------------------------------------------------
 * 17 of the 43 frozen prompts (39.5%) were served, in their own retrieved
 * context, a verbatim copy of one of their own gold answers. The models copy
 * it: on those prompts GPT-4.1 + RAG reproduces a gold answer exactly 70.6% of
 * the time, against 7.7% on the clean prompts. Non-RAG baselines are flat, so
 * this is leakage and not prompt difficulty.
 *
 * The existing guard in scripts/igala-rag-run.ts blocks the prompt's own gold
 * from the EXEMPLAR path, by promptId, and throws when one slips past. Right
 * shape, wrong coverage: it applies nothing at all to the retrieved knowledge
 * chunks, which is exactly the hole the 39.5% came through. It also cannot
 * catch a leak by content rather than by id - "the Igala word for water" is the
 * same word whichever split its prompt landed in.
 *
 * WHY MATCHING IS ON STRINGS, NOT IDS
 * -----------------------------------
 * Building the corpus from train-split material only does NOT protect the
 * benchmark: train-split gold alone contains a verbatim frozen answer for 23 of
 * 43 prompts (53.5%), marginally worse than the live corpus. The split was
 * drawn on prompt ids while contamination is lexical.
 *
 * INFORMATION HYGIENE - READ BEFORE CHANGING THE RETURN TYPE
 * ----------------------------------------------------------
 * This module reads gold answers. What it hands back to a human or an agent
 * authoring a prompt is a verdict, a count, and a location. It must NEVER
 * return the matched string or the gold it matched, because a guard that says
 * "the string X leaked" has just handed X to the person writing the prompt and
 * has become the leak. That is why `LeakHit` carries `where` but no `what`.
 */

/** A protected answer string, pre-folded at both tiers. */
export interface ProtectedString {
  /** All combining marks stripped, lowercased. */
  full: string;
  /** Tone stripped, dot-below preserved. */
  tone: string;
  /** Which frozen prompt this answer belongs to (a slug, never the text). */
  promptId: string;
}

/**
 * One leak, described by location only. Deliberately carries no copy of the
 * offending text - see the information-hygiene note above.
 */
export interface LeakHit {
  /** Caller-supplied label for the haystack: a file, a chunk id, a section. */
  where: string;
  /** Frozen prompt whose answer leaked. */
  promptId: string;
  /** Which fold caught it. `tone` implies the leak survives tone-stripping. */
  tier: "full" | "tone";
}

export interface LeakReport {
  pass: boolean;
  hitCount: number;
  hits: LeakHit[];
}

/** Minimum protected length. Measured floor of the real set is 3 characters. */
export const MIN_PROTECTED_LENGTH = 3;

/**
 * Build the protected set from raw gold answers.
 *
 * Answers shorter than MIN_PROTECTED_LENGTH after folding are dropped: a
 * one-or-two character protected string would match inside ordinary words and
 * make the guard unsatisfiable. On the real frozen set nothing is lost - the
 * shortest folded answer is exactly 3 characters.
 */
export function buildProtectedSet(
  golds: { promptId: string; answerText: string }[],
): ProtectedString[] {
  const seen = new Set<string>();
  const out: ProtectedString[] = [];
  for (const g of golds) {
    const full = fullFold(g.answerText).trim();
    if (full.length < MIN_PROTECTED_LENGTH) continue;
    const key = `${g.promptId}::${full}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      full,
      tone: toneFold(g.answerText).trim(),
      promptId: g.promptId,
    });
  }
  return out;
}

/** Escape a folded string for literal use inside a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whole-word containment over folded text.
 *
 * Word-boundary rather than naive substring: on the real data naive matching
 * fires 96/238 against 95/238 word-boundary, and the extra hit is spurious.
 * \b is no use here because the folded alphabet is Unicode, so the boundary is
 * expressed as "not preceded or followed by a letter or a digit".
 */
export function containsWholeWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRe(needle)}(?![\\p{L}\\p{N}])`,
    "u",
  );
  return re.test(haystack);
}

/**
 * SCOPE A - static text, threshold zero.
 *
 * Static blocks appear in EVERY prompt's assembled context, so a single
 * collision anywhere in the frozen set leaks for that prompt on every query.
 * Any hit must fail the build.
 *
 * This is the check that catches the anti-Yoruba "write this instead" list:
 * five of the obvious Igala replacement forms are themselves whole gold answers
 * on frozen prompts, so shipping them statically would hand the model the
 * answer to five benchmark questions on every single request.
 */
export function checkStatic(
  blocks: { where: string; text: string }[],
  protectedSet: ProtectedString[],
): LeakReport {
  const hits: LeakHit[] = [];
  for (const b of blocks) {
    const full = fullFold(b.text);
    const tone = toneFold(b.text);
    for (const p of protectedSet) {
      if (containsWholeWord(full, p.full)) {
        hits.push({ where: b.where, promptId: p.promptId, tier: "full" });
      } else if (containsWholeWord(tone, p.tone)) {
        hits.push({ where: b.where, promptId: p.promptId, tier: "tone" });
      }
    }
  }
  return { pass: hits.length === 0, hitCount: hits.length, hits };
}

/**
 * SCOPE B - one frozen prompt's assembled context, threshold zero.
 *
 * Only that prompt's OWN answers are protected here. Another prompt's answer
 * appearing in this context is not leakage for this prompt, and treating it as
 * such would forbid writing any Igala reference material at all.
 *
 * Returns the pieces that are safe to serve plus a report on what was dropped.
 * Dropping beats throwing: a run that halts on the first collision produces no
 * data, whereas a run that drops the chunk and records it produces a valid
 * measurement with a documented exclusion.
 */
export function filterAssembled(
  promptId: string,
  pieces: { where: string; text: string }[],
  protectedSet: ProtectedString[],
): { kept: typeof pieces; report: LeakReport } {
  const own = protectedSet.filter((p) => p.promptId === promptId);
  const kept: typeof pieces = [];
  const hits: LeakHit[] = [];
  for (const piece of pieces) {
    const full = fullFold(piece.text);
    const tone = toneFold(piece.text);
    let leaks = false;
    for (const p of own) {
      if (containsWholeWord(full, p.full)) {
        hits.push({ where: piece.where, promptId, tier: "full" });
        leaks = true;
        break;
      }
      if (containsWholeWord(tone, p.tone)) {
        hits.push({ where: piece.where, promptId, tier: "tone" });
        leaks = true;
        break;
      }
    }
    if (!leaks) kept.push(piece);
  }
  return {
    kept,
    report: { pass: hits.length === 0, hitCount: hits.length, hits },
  };
}

/**
 * Which frozen prompts can still be scored honestly, given what leaked.
 *
 * Membership is derived mechanically, never hand-picked, so the leak-free
 * subset cannot drift into "the prompts where we did well".
 */
export function leakFreePrompts(
  allPromptIds: string[],
  hits: LeakHit[],
): string[] {
  const leaked = new Set(hits.map((h) => h.promptId));
  return allPromptIds.filter((id) => !leaked.has(id));
}

/**
 * Human-readable verdict. Carries counts and locations, never content - the
 * same hygiene rule as LeakHit.
 */
export function formatLeakReport(r: LeakReport): string {
  if (r.pass) return "LEAK GUARD: PASS (0 hits)";
  const byWhere = new Map<string, number>();
  for (const h of r.hits) byWhere.set(h.where, (byWhere.get(h.where) ?? 0) + 1);
  const lines = [...byWhere.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([where, n]) => `  ${where}: ${n}`);
  const prompts = new Set(r.hits.map((h) => h.promptId)).size;
  return [
    `LEAK GUARD: FAIL - ${r.hitCount} hits across ${prompts} frozen prompts`,
    ...lines,
  ].join("\n");
}
