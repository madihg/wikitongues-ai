/**
 * The provisional speech axes shown under a Listen verdict. One config file
 * so Lydia's rubric layer can replace the labels, the scale or the whole
 * list in one place: the route and the screen both read this and nothing
 * else. Client-safe (no server imports).
 *
 * PROVISIONAL: these five axes are a stand-in until the linguist's rubric
 * layer lands. Stored on SpeechComparison.axes with `version` so rows scored
 * under this list can be told apart from rows scored under the real one.
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

/** Which clip the scores describe: the winner, or both when it is a tie. */
export type AxesTarget = "a" | "b" | "both";

export interface StoredAxes {
  version: string;
  target: AxesTarget;
  scores: AxisScores;
}

const KEYS: readonly string[] = SPEECH_AXES.map((a) => a.key);

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
): StoredAxes | null | "invalid" {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return "invalid";
  const target = axesTargetFor(winner);
  const scores: AxisScores = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
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
  if (Object.keys(scores).length === 0) return null;
  if (target === null) return "invalid";
  return { version: AXES_VERSION, target, scores };
}
