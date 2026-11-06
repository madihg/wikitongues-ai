/**
 * The provisional speech axes shown under a Listen verdict. One config file
 * so Lydia's rubric layer can replace the labels, the scale or the whole
 * list in one place: the route and the screen both read this and nothing
 * else. Client-safe (no server imports).
 *
 * PROVISIONAL: these five axes are a stand-in until the linguist's rubric
 * layer lands. Stored on SpeechComparison.axes with `version` so rows scored
 * under this list can be told apart from rows scored under the real one.
 *
 * Both clips are rated on every axis, whichever won, per the linguist's
 * Oct 13 ask: "to see systematic errors we need both", so the scores show
 * where a clip fails as well as why the other succeeds. Rows stored before
 * this change carry a `target` and one set of scores; readStoredAxes reads
 * both shapes.
 */

export const AXES_VERSION = "provisional-1";

/** The block's visible label, verbatim. */
export const AXES_BLOCK_LABEL =
  "Provisional speech axes, Lydia's rubric layer replaces these";

/** The scale: 0 to 5, or N/A when the axis does not apply to this pair. */
export const AXIS_MIN = 0;
export const AXIS_MAX = 5;

export const SPEECH_AXES = [
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
] as const;

export type SpeechAxisKey = (typeof SPEECH_AXES)[number]["key"];
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

const KEYS: readonly string[] = SPEECH_AXES.map((a) => a.key);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Whether a verdict takes axes: a, b and tie do; both_unusable does not. */
export function takesAxes(winner: string): boolean {
  return winner === "a" || winner === "b" || winner === "tie";
}

/** One clip's scores: known keys only, integer 0 to 5 or "na". */
function sanitizeSide(raw: unknown): AxisScores | "invalid" {
  if (!isObject(raw)) return "invalid";
  const scores: AxisScores = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!KEYS.includes(k)) return "invalid";
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
 * Validate an axes payload `{ a?: {...}, b?: {...} }` against the verdict.
 * Returns null when there is nothing to store (absent, or both sides empty)
 * and the string "invalid" for a malformed value (including the old flat
 * one-clip shape, or any score on a both_unusable verdict), so the route can
 * answer 400 instead of silently dropping what a client meant.
 */
export function sanitizeAxes(
  raw: unknown,
  winner: string,
): StoredAxes | null | "invalid" {
  if (raw === undefined || raw === null) return null;
  if (!isObject(raw)) return "invalid";
  if (Object.keys(raw).some((k) => k !== "a" && k !== "b")) return "invalid";
  const a = "a" in raw ? sanitizeSide(raw.a) : {};
  const b = "b" in raw ? sanitizeSide(raw.b) : {};
  if (a === "invalid" || b === "invalid") return "invalid";
  if (Object.keys(a).length === 0 && Object.keys(b).length === 0) return null;
  if (!takesAxes(winner)) return "invalid";
  return { version: AXES_VERSION, scores: { a, b } };
}

/**
 * Read a stored SpeechComparison.axes value, new shape or old. An old
 * provisional-1 row (`{ version, target, scores }`) lands on the side it
 * described, on both for a tie. Null for an empty or unreadable value.
 */
export function readStoredAxes(raw: unknown): StoredAxes | null {
  if (!isObject(raw) || typeof raw.version !== "string") return null;
  const version = raw.version;
  if (!isObject(raw.scores)) return null;
  if ("target" in raw) {
    const target = raw.target as LegacyTarget;
    if (target !== "a" && target !== "b" && target !== "both") return null;
    const side = sanitizeSide(raw.scores);
    if (side === "invalid") return null;
    return {
      version,
      scores: {
        a: target === "b" ? {} : side,
        b: target === "a" ? {} : side,
      },
    };
  }
  const a = sanitizeSide(raw.scores.a ?? {});
  const b = sanitizeSide(raw.scores.b ?? {});
  if (a === "invalid" || b === "invalid") return null;
  return { version, scores: { a, b } };
}
