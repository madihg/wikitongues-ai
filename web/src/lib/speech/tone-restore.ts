import { chat } from "@/lib/llm/openrouter";
import { toneStrip } from "./normalise";
import { LLM_CONFIG } from "./llm-config";

/**
 * Tone-mark restoration (PRD US-007). Sends bare Igala text to the LLM and
 * accepts the answer only if it differs from the input by combining tone
 * marks alone.
 *
 * The check reuses normalise.ts: two strings differ by tone marks only when
 * toneStrip gives the same string for both. toneStrip keeps dot-below vowels
 * and the dotted n (they are letters) and keeps n + tilde, so changing any of
 * those counts as a violation. Everything else, including spacing and
 * punctuation, must match.
 *
 * No Igala forcing instruction is added: the prompt is exactly
 * TONE_RESTORE_SYSTEM.
 */

export const TONE_RESTORE_SYSTEM =
  "You restore tone marks on Igala text. You may only add or remove combining " +
  "tone marks: grave (U+0300), acute (U+0301), circumflex (U+0302), macron " +
  "(U+0304), breve (U+0306), hook above (U+0309) and caron (U+030C). Do not " +
  "change, add, remove or reorder any letter. Do not touch dots below, the " +
  "dotted n, spacing or punctuation. Do not translate or explain. Reply with " +
  "the restored text only.";

export interface ToneViolation {
  kind: "added" | "removed" | "changed";
  /** Word index when the word counts match, otherwise 0 for the whole text. */
  position: number;
  input: string;
  output: string;
}

export class ToneRestoreViolation extends Error {
  violations: ToneViolation[];
  constructor(violations: ToneViolation[]) {
    // A count only: the differences carry text and stay on the error object.
    super(`Tone restoration changed more than tone marks (${violations.length} difference(s)).`);
    this.name = "ToneRestoreViolation";
    this.violations = violations;
  }
}

function diffRegion(a: string, b: string, position: number): ToneViolation | null {
  if (a === b) return null;
  const x = [...a];
  const y = [...b];
  let start = 0;
  while (start < x.length && start < y.length && x[start] === y[start]) start++;
  let endX = x.length;
  let endY = y.length;
  while (endX > start && endY > start && x[endX - 1] === y[endY - 1]) {
    endX--;
    endY--;
  }
  const removed = x.slice(start, endX).join("");
  const added = y.slice(start, endY).join("");
  const kind = removed && added ? "changed" : added ? "added" : "removed";
  return { kind, position, input: removed, output: added };
}

/**
 * Differences between input and output that are not combining tone-mark
 * changes. Empty means the output is a legal restoration of the input.
 * Whitespace around the whole text is ignored.
 */
export function violations(input: string, output: string): ToneViolation[] {
  const a = toneStrip(input).trim();
  const b = toneStrip(output).trim();
  if (a === b) return [];
  const wa = a.split(/\s+/);
  const wb = b.split(/\s+/);
  if (wa.length === wb.length) {
    const out: ToneViolation[] = [];
    wa.forEach((w, i) => {
      const d = diffRegion(w, wb[i], i);
      if (d) out.push(d);
    });
    return out;
  }
  const whole = diffRegion(a, b, 0);
  return whole ? [whole] : [];
}

export interface RestoreOptions {
  refType?: string;
  refId?: string;
  label?: string;
}

/** Restore tone marks. Throws ToneRestoreViolation if anything but marks changed. */
export async function restoreTones(
  text: string,
  opts: RestoreOptions = {},
): Promise<string> {
  if (!text.trim()) return text;
  const res = await chat(
    [
      { role: "system", content: TONE_RESTORE_SYSTEM },
      { role: "user", content: text },
    ],
    {
      model: LLM_CONFIG.toneRestore,
      // Headroom for a reasoning model: thinking tokens count against the cap.
      maxTokens: Math.max(2048, text.length * 4),
      temperature: 0,
      refType: opts.refType,
      refId: opts.refId,
      label: opts.label ?? "tone restore",
    },
  );
  const restored = res.text.trim();
  const bad = violations(text, restored);
  if (bad.length > 0) throw new ToneRestoreViolation(bad);
  return restored;
}
