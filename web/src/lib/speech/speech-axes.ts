/**
 * The speech axes shown under a Listen verdict. One config file so Lydia's
 * rubric layer can replace the labels, the scale or the whole list in one
 * place: the route and the screen both read this and nothing else.
 * Client-safe (no server imports).
 *
 * PROVISIONAL: the five axes of provisional-1 are a stand-in until the
 * linguist's rubric lands. Every judgment stores the `version` it was scored
 * under (SpeechComparison.axes.version), so rows scored under one set are
 * never read as another. A new rubric is a new entry in AXES_SETS and a flip
 * of LYDIA_RUBRIC_READY; old rows keep their version.
 */

export interface AxisDef {
  key: string;
  label: string;
  hint: string;
}

/** One rubric: a version string stored with every judgment, a label and its axes. */
export interface AxesSet {
  version: string;
  /** The block's visible label, verbatim. */
  blockLabel: string;
  axes: readonly AxisDef[];
}

export const PROVISIONAL_AXES: AxesSet = {
  version: "provisional-1",
  blockLabel: "Provisional speech axes, Lydia's rubric layer replaces these",
  axes: [
    {
      key: "intelligibility",
      label: "Intelligibility",
      hint: "Can every word be made out?",
    },
    {
      key: "pronunciation",
      label: "Pronunciation",
      hint: "Do the sounds match the word?",
    },
    { key: "tone", label: "Tone", hint: "Are the tone patterns right?" },
    {
      key: "naturalness",
      label: "Naturalness",
      hint: "Does it sound like a person talking?",
    },
    { key: "pace", label: "Pace", hint: "Is the speed comfortable?" },
  ],
};

/**
 * PLACEHOLDER for Lydia's rubric (PRD US-027). One slot axis so the mechanism
 * is testable end to end; her real axes replace `axes` here, in this file
 * only, and nothing else changes. Never shown while LYDIA_RUBRIC_READY is
 * false.
 */
export const LYDIA_AXES: AxesSet = {
  version: "lydia-1",
  blockLabel: "Speech rubric",
  axes: [
    {
      key: "rubric_slot",
      label: "Rubric slot",
      hint: "Replaced when the rubric is entered",
    },
  ],
};

/** Flip to true, once LYDIA_AXES holds her axes, to score new judgments under lydia-1. */
export const LYDIA_RUBRIC_READY = false;

/** Every rubric a stored judgment may carry; old judgments keep the version they were scored under. */
export const AXES_SETS: Readonly<Record<string, AxesSet>> = {
  [PROVISIONAL_AXES.version]: PROVISIONAL_AXES,
  [LYDIA_AXES.version]: LYDIA_AXES,
};

export function axesSetFor(version: string): AxesSet | null {
  return Object.prototype.hasOwnProperty.call(AXES_SETS, version)
    ? AXES_SETS[version]
    : null;
}

/** The rubric new judgments are scored under. */
export function activeAxesSet(ready: boolean): AxesSet {
  return ready ? LYDIA_AXES : PROVISIONAL_AXES;
}

const ACTIVE = activeAxesSet(LYDIA_RUBRIC_READY);
export const AXES_VERSION = ACTIVE.version;
export const AXES_BLOCK_LABEL = ACTIVE.blockLabel;

/** The scale: 0 to 5, or N/A when the axis does not apply to this pair. */
export const AXIS_MIN = 0;
export const AXIS_MAX = 5;

export const SPEECH_AXES = ACTIVE.axes;

export type SpeechAxisKey = string;
export type AxisValue = number | "na";
export type AxisScores = Partial<Record<SpeechAxisKey, AxisValue>>;

/** Which clip the scores describe: the winner, or both when it is a tie. */
export type AxesTarget = "a" | "b" | "both";

export interface StoredAxes {
  version: string;
  target: AxesTarget;
  scores: AxisScores;
}

/** The target for a verdict, or null when the verdict takes no axes. */
export function axesTargetFor(winner: string): AxesTarget | null {
  if (winner === "a") return "a";
  if (winner === "b") return "b";
  if (winner === "tie") return "both";
  return null;
}

/**
 * Validate an axes payload against the verdict. Returns null when there is
 * nothing to store (absent, empty, or a verdict that takes no axes) and the
 * string "invalid" for a malformed value, so the route can answer 400 instead
 * of silently dropping what a client meant.
 */
export function sanitizeAxes(
  raw: unknown,
  winner: string,
  version: string = AXES_VERSION,
): StoredAxes | null | "invalid" {
  if (raw === undefined || raw === null) return null;
  const set = axesSetFor(version);
  if (!set) return "invalid";
  const keys = set.axes.map((a) => a.key);
  if (typeof raw !== "object" || Array.isArray(raw)) return "invalid";
  const target = axesTargetFor(winner);
  const scores: AxisScores = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!keys.includes(k)) return "invalid";
    if (v === "na") {
      scores[k as SpeechAxisKey] = "na";
    } else if (
      typeof v === "number" &&
      Number.isInteger(v) &&
      v >= AXIS_MIN &&
      v <= AXIS_MAX
    ) {
      scores[k as SpeechAxisKey] = v;
    } else {
      return "invalid";
    }
  }
  if (Object.keys(scores).length === 0) return null;
  if (target === null) return "invalid";
  return { version: set.version, target, scores };
}
