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
 *
 * Both clips are rated on every axis, whichever won, per the linguist's
 * Oct 13 ask: "to see systematic errors we need both", so the scores show
 * where a clip fails as well as why the other succeeds. Rows stored before
 * this change carry a `target` and one set of scores; readStoredAxes reads
 * both shapes.
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

/** The two clips of a pair. */
export type AxisSide = "a" | "b";

/** One set of scores per clip. Either side may be empty. */
export interface PairScores {
  a: AxisScores;
  b: AxisScores;
}

/** The stored shape: both clips, no target. */
export interface StoredAxes {
  version: string;
  scores: PairScores;
}

/** Rows stored under provisional-1 before both sides were rated. */
type LegacyTarget = "a" | "b" | "both";

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Whether a verdict takes axes: a, b and tie do; both_unusable does not. */
export function takesAxes(winner: string): boolean {
  return winner === "a" || winner === "b" || winner === "tie";
}

/** One clip's scores: known keys only, integer 0 to 5 or "na". */
function sanitizeSide(
  raw: unknown,
  keys: readonly string[],
): AxisScores | "invalid" {
  if (!isObject(raw)) return "invalid";
  const scores: AxisScores = {};
  for (const [k, v] of Object.entries(raw)) {
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
  return scores;
}

/**
 * Validate an axes payload `{ a?: {...}, b?: {...} }` against the verdict
 * and the rubric named by `version` (the active one by default). Returns null
 * when there is nothing to store (absent, or both sides empty) and the string
 * "invalid" for a malformed value (including the old flat one-clip shape, a
 * key from another rubric, an unknown version, or any score on a
 * both_unusable verdict), so the route can answer 400 instead of silently
 * dropping what a client meant.
 */
export function sanitizeAxes(
  raw: unknown,
  winner: string,
  version: string = AXES_VERSION,
): StoredAxes | null | "invalid" {
  if (raw === undefined || raw === null) return null;
  const set = axesSetFor(version);
  if (!set) return "invalid";
  const keys = set.axes.map((x) => x.key);
  if (!isObject(raw)) return "invalid";
  if (Object.keys(raw).some((k) => k !== "a" && k !== "b")) return "invalid";
  const a = "a" in raw ? sanitizeSide(raw.a, keys) : {};
  const b = "b" in raw ? sanitizeSide(raw.b, keys) : {};
  if (a === "invalid" || b === "invalid") return "invalid";
  if (Object.keys(a).length === 0 && Object.keys(b).length === 0) return null;
  if (!takesAxes(winner)) return "invalid";
  return { version: set.version, scores: { a, b } };
}

/**
 * Read a stored SpeechComparison.axes value, new shape or old. An old
 * provisional-1 row (`{ version, target, scores }`) lands on the side it
 * described, on both for a tie. A row is read against the rubric it was
 * scored under. Null for an empty or unreadable value, or an unknown version.
 */
export function readStoredAxes(raw: unknown): StoredAxes | null {
  if (!isObject(raw) || typeof raw.version !== "string") return null;
  const version = raw.version;
  const set = axesSetFor(version);
  if (!set) return null;
  const keys = set.axes.map((x) => x.key);
  if (!isObject(raw.scores)) return null;
  if ("target" in raw) {
    const target = raw.target as LegacyTarget;
    if (target !== "a" && target !== "b" && target !== "both") return null;
    const side = sanitizeSide(raw.scores, keys);
    if (side === "invalid") return null;
    return {
      version,
      scores: {
        a: target === "b" ? {} : side,
        b: target === "a" ? {} : side,
      },
    };
  }
  const a = sanitizeSide(raw.scores.a ?? {}, keys);
  const b = sanitizeSide(raw.scores.b ?? {}, keys);
  if (a === "invalid" || b === "invalid") return null;
  return { version, scores: { a, b } };
}
