/**
 * Separate the Igala answer from the English packaging around it.
 *
 * WHY THIS MATTERS MORE THAN ANY MODELLING CHANGE HERE
 * ----------------------------------------------------
 * Community gold answers average 7.07 words. Model outputs on the same prompts
 * average 64.4. chrF is character overlap, so on a short target the English
 * wrapper dominates the score. Measured against a real 14-character Igala gold:
 *
 *   bare correct answer                       100.0
 *   + a 19-character English prefix            75.5
 *   + a short gloss                            65.0
 *   + two sentences of explanation             37.3
 *
 * A model can therefore know the right word and score 37. Reporting chrF on raw
 * output conflates "does not know Igala" with "would not stop talking", and
 * those call for completely different fixes.
 *
 * THE TRAP THIS ALSO SETS
 * -----------------------
 * Stripping raises every score, so it must never be presented as a modelling
 * gain. An oracle simulation on this corpus puts terseness alone at 26.8 -> 53.3
 * with retrieval unchanged. That is why `verbosityRatio` ships beside the score
 * rather than being folded into it: the ratio is what tells you whether an arm
 * improved at Igala or merely learned to shut up. An arm whose median ratio is
 * above ~1.5 is format-non-compliant and its chrF should not be interpreted.
 */

/** Leading English framings that wrap an answer rather than being one. */
const LEADING_FRAMES: RegExp[] = [
  // "In Igala, ..." / "In Igala: ..."
  /^\s*in igala[,:]\s*/i,
  // "The Igala word (for X) is ..." / "The Igala term is ..."
  /^\s*the igala (word|term|phrase|expression)\b[^.:\n]{0,40}?\bis\b[:,]?\s*/i,
  // A bare label: "Igala:" / "Answer:" / "Translation:"
  /^\s*(igala|answer|translation|response)\s*:\s*/i,
  // "Here is the Igala ...:" / "Here's the translation:"
  /^\s*here(?:'s| is)\b[^:\n]{0,60}:\s*/i,
];

/**
 * A leading English sentence that ends in a colon and introduces the answer.
 * Deliberately conservative: it must be ASCII-only (so it cannot eat Igala,
 * which uses ẹ ọ ñ and tone marks), reasonably short, and followed by content.
 */
const LEADING_CLAUSE = /^\s*[A-Za-z][A-Za-z0-9 ,'"()-]{0,79}:\s+(?=\S)/;

/** A trailing English gloss in brackets: "Ọma (child)" -> "Ọma". */
const TRAILING_GLOSS = /\s*[([][^)\]]{0,80}[)\]]\s*$/;

/** Trailing English explanation after an em dash or " - ". */
const TRAILING_DASH_GLOSS = /\s+[-–—]\s+[A-Za-z][A-Za-z0-9 ,'"().]{0,120}$/;

export interface StripResult {
  /** The answer with English packaging removed. */
  stripped: string;
  /** True if anything was removed - i.e. the raw output was not bare. */
  changed: boolean;
  /** Which rules fired, for auditing. */
  applied: string[];
}

/**
 * Remove English packaging from a model answer.
 *
 * Conservative by design. If a rule would empty the string it is skipped: an
 * output that is nothing but English framing should score badly, not vanish
 * into a suspiciously perfect empty comparison.
 */
export function stripAnswer(raw: string): StripResult {
  let s = raw.trim();
  const applied: string[] = [];

  const tryReplace = (re: RegExp, label: string) => {
    const next = s.replace(re, "").trim();
    if (next !== s && next.length > 0) {
      s = next;
      applied.push(label);
    }
  };

  for (const [i, re] of LEADING_FRAMES.entries()) {
    tryReplace(re, `leading-frame-${i}`);
  }
  tryReplace(LEADING_CLAUSE, "leading-clause");
  tryReplace(TRAILING_GLOSS, "trailing-gloss");
  tryReplace(TRAILING_DASH_GLOSS, "trailing-dash-gloss");

  // Surrounding quotes are packaging too, but only when they wrap the whole
  // thing - an internal quote may be part of the answer.
  const quoted = s.match(/^["“'']([^"”]{1,200})["”'']$/);
  if (quoted?.[1]?.trim()) {
    s = quoted[1].trim();
    applied.push("surrounding-quotes");
  }

  return { stripped: s, changed: s !== raw.trim(), applied };
}

/** Word count on whitespace, the unit the length budgets are stated in. */
export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * Length of a hypothesis relative to its reference. 1.0 is exactly on target.
 *
 * Uses the SHORTEST reference: with several valid gold answers, a model that
 * matches the most concise one has satisfied the length contract, and scoring
 * it against a verbose outlier would punish the behaviour we want.
 */
export function verbosityRatio(
  hypothesis: string,
  references: string[],
): number {
  const refLens = references.map(wordCount).filter((n) => n > 0);
  if (refLens.length === 0) return Number.NaN;
  const shortest = Math.min(...refLens);
  return wordCount(hypothesis) / shortest;
}

export interface VerbosityStats {
  median: number;
  p90: number;
  /** Share of outputs that carried English packaging the stripper removed. */
  strippedShare: number;
  n: number;
  /**
   * True when the median output is more than 1.5x the shortest reference. The
   * arm's chrF should not be interpreted as a language result until this is
   * false - the score is being driven by output shape.
   */
  formatNonCompliant: boolean;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Verbosity summary for one candidate across a benchmark. */
export function verbosityStats(
  rows: { hypothesis: string; references: string[] }[],
): VerbosityStats {
  const ratios = rows
    .map((r) => verbosityRatio(r.hypothesis, r.references))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const strippedCount = rows.filter(
    (r) => stripAnswer(r.hypothesis).changed,
  ).length;
  const median = quantile(ratios, 0.5);
  return {
    median,
    p90: quantile(ratios, 0.9),
    strippedShare: rows.length ? strippedCount / rows.length : 0,
    n: ratios.length,
    formatNonCompliant: Number.isFinite(median) && median > 1.5,
  };
}
