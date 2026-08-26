import { wordDiff } from "@/lib/diff";
import { sanitizeEditReasonTags } from "@/lib/failure-tags";

/**
 * THE EDITING GROUND'S PURE CORE (tasks/editing-ground-spec.md).
 *
 * A correction is stored twice: `correctedText` (the applied result, the ONLY
 * training-facing text) and `segments` (span-level suggestions - what changed,
 * where, and why). Segments are ENRICHMENT: the server verifies that applying
 * them to the original reproduces the corrected text exactly, and drops them
 * (never the edit) when they do not - enrichment must never cost an annotator
 * their episode, the same rule sanitizeFailureTags follows.
 *
 * GRAPHEME SAFETY - why this can never split an Igala diacritic:
 *   1. Both texts are NFC-normalized before diffing (precedent and rationale in
 *      normaliseSpacing, src/lib/answer-variants.ts: production text arrives in
 *      both Unicode shapes, and NFD/NFC pairs render identically but compare
 *      unequal - without NFC an identical retyped answer shows phantom diffs).
 *   2. The diff tokenizes by whitespace runs only (src/lib/diff.ts). Combining
 *      marks are non-whitespace, so they always travel with their base letter
 *      inside a token; a whitespace-boundary diff CANNOT split a grapheme.
 *      This is the actual guarantee - no character-level diffing exists
 *      anywhere in this feature. (Intl.Segmenter is deliberately not used:
 *      there is no Igala locale, so its "und" word boundaries are less
 *      predictable than whitespace tokens, for zero benefit.)
 */

export interface EditSegment {
  /** Inclusive, UTF-16 code units into NFC(originalText). */
  start: number;
  /** Exclusive; start === end means pure insertion. */
  end: number;
  /** Exact NFC(originalText).slice(start, end) - the validation anchor. */
  original: string;
  /** Inserted text, NFC ("" means pure deletion). */
  replacement: string;
  /** Free text, English or Igala. */
  reason?: string;
  /** Subset of EDIT_REASON_TAGS keys (src/lib/failure-tags.ts). */
  reasonTags?: string[];
}

/** Version stamp of the stored envelope: { v: 1, segments: [...] }. */
export const SEGMENTS_VERSION = 1;

/** Free-text reasons are capped, never rejected - a long reason is enthusiasm. */
export const REASON_MAX_CHARS = 2000;

export function nfc(s: string): string {
  return s.normalize("NFC");
}

/** The jsonb envelope stored on OutputEdit.segments. */
export function segmentsEnvelope(segments: EditSegment[]): {
  v: number;
  segments: EditSegment[];
} {
  return { v: SEGMENTS_VERSION, segments };
}

/**
 * Recover span-level segments from a free-typed correction: NFC both texts,
 * word-diff them, then merge each maximal run of non-"same" diff segments into
 * ONE EditSegment. Merging runs (rather than emitting per-token spans) is what
 * makes a full paragraph rewrite collapse to a single segment - one card, one
 * reason, which is exactly right for paragraph-scale corrections.
 *
 * Within one run every removed token is contiguous in the original (a "same"
 * token would have ended the run), so `end = start + removed.length` is sound.
 */
export function diffToSegments(
  original: string,
  corrected: string,
): EditSegment[] {
  const o = nfc(original);
  const c = nfc(corrected);
  if (o === c) return [];

  const out: EditSegment[] = [];
  let cursor = 0; // offset into o
  let runStart = -1;
  let removed = "";
  let added = "";
  const flush = () => {
    if (runStart < 0) return;
    out.push({
      start: runStart,
      end: runStart + removed.length,
      original: removed,
      replacement: added,
    });
    runStart = -1;
    removed = "";
    added = "";
  };

  for (const seg of wordDiff(o, c)) {
    if (seg.type === "same") {
      flush();
      cursor += seg.value.length;
    } else if (seg.type === "removed") {
      if (runStart < 0) runStart = cursor;
      removed += seg.value;
      cursor += seg.value.length;
    } else {
      if (runStart < 0) runStart = cursor;
      added += seg.value;
    }
  }
  flush();

  // Merge changed runs separated by WHITESPACE-ONLY unchanged gaps. The
  // word-LCS matches single spaces promiscuously, so without this a joint
  // two-word respell ("Àgbá Ọ́jọ́" -> "Agba ọjọ") splits into two per-word
  // segments and a full-paragraph rewrite splinters into dozens - one card per
  // word instead of one card per change. Real gaps (an unchanged WORD between
  // two fixes) contain non-whitespace and never merge.
  const merged: EditSegment[] = [];
  for (const seg of out) {
    const prev = merged[merged.length - 1];
    const gap = prev ? o.slice(prev.end, seg.start) : "";
    if (prev && gap.length > 0 && /^\s+$/.test(gap)) {
      prev.end = seg.end;
      prev.original = o.slice(prev.start, prev.end);
      prev.replacement = prev.replacement + gap + seg.replacement;
    } else {
      merged.push(seg);
    }
  }
  return merged;
}

/**
 * Apply segments to the original text. Walk ascending: copy
 * original[cursor..start), append the replacement, jump cursor to end; append
 * the tail. Throws on overlap / out-of-order / out-of-bounds - callers
 * sanitize first (sanitizeSegments below never lets a throwing set through).
 */
export function applySegments(
  original: string,
  segments: EditSegment[],
): string {
  let out = "";
  let cursor = 0;
  for (const s of segments) {
    if (s.start < cursor || s.end < s.start || s.end > original.length) {
      throw new Error(
        `applySegments: segment [${s.start}, ${s.end}) is out of order, overlapping, or out of bounds`,
      );
    }
    out += original.slice(cursor, s.start) + s.replacement;
    cursor = s.end;
  }
  return out + original.slice(cursor);
}

/**
 * Coerce arbitrary client input into storable segments, or null.
 *
 * Shape-checks every entry; verifies ascending, non-overlapping, in-bounds
 * spans whose `original` matches the NFC slice exactly; drops unknown
 * reasonTags and caps oversize reasons (REASON_MAX_CHARS); FINALLY verifies
 * that applying the segments to originalNfc reproduces correctedNfc exactly.
 * Any structural failure -> null, and callers store the edit WITHOUT segments
 * (deriving fresh ones server-side) - never throws on garbage.
 */
export function sanitizeSegments(
  raw: unknown,
  originalNfc: string,
  correctedNfc: string,
): EditSegment[] | null {
  if (!Array.isArray(raw)) return null;
  const out: EditSegment[] = [];
  let cursor = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const o = item as Record<string, unknown>;
    if (typeof o.start !== "number" || !Number.isInteger(o.start)) return null;
    if (typeof o.end !== "number" || !Number.isInteger(o.end)) return null;
    if (typeof o.original !== "string") return null;
    if (typeof o.replacement !== "string") return null;
    if (o.start < cursor || o.end < o.start || o.end > originalNfc.length)
      return null;
    if (originalNfc.slice(o.start, o.end) !== o.original) return null;

    const seg: EditSegment = {
      start: o.start,
      end: o.end,
      original: o.original,
      replacement: o.replacement,
    };
    if (typeof o.reason === "string" && o.reason.trim()) {
      seg.reason = o.reason.trim().slice(0, REASON_MAX_CHARS);
    }
    const tags = sanitizeEditReasonTags(o.reasonTags);
    if (tags.length > 0) seg.reasonTags = tags;

    out.push(seg);
    cursor = o.end;
  }

  try {
    if (applySegments(originalNfc, out) !== correctedNfc) return null;
  } catch {
    return null;
  }
  return out;
}

// ─── Reason state helpers (shared by SuggestingEditor and its callers) ───────
//
// Reasons live BESIDE the recomputed segments, keyed by the segment's original
// slice plus an occurrence index - so a reason survives the offset shifts
// caused by edits elsewhere in the text. A reason whose segment disappears is
// simply never attached at submit (documented, acceptable).

export interface SegmentReason {
  tags: string[];
  text: string;
}

export type ReasonMap = Record<string, SegmentReason>;

/** Stable identity of segment `index` within `segments`: original-slice text
 *  plus how many earlier segments share that exact slice. */
export function reasonKeyFor(segments: EditSegment[], index: number): string {
  const target = segments[index];
  let occurrence = 0;
  for (let i = 0; i < index; i++) {
    if (segments[i].original === target.original) occurrence++;
  }
  // U+241F (symbol for unit separator): cannot appear in normal text, so the
  // key never collides with an original slice that ends in a digit.
  return `${target.original}␟${occurrence}`;
}

/** Merge the reason map into freshly derived segments (tags sanitized, text
 *  trimmed/capped). Entries without a matching segment are dropped. */
export function attachReasons(
  segments: EditSegment[],
  reasons: ReasonMap,
): EditSegment[] {
  return segments.map((seg, i) => {
    const r = reasons[reasonKeyFor(segments, i)];
    if (!r) return seg;
    const next: EditSegment = { ...seg };
    const text = (r.text ?? "").trim();
    if (text) next.reason = text.slice(0, REASON_MAX_CHARS);
    const tags = sanitizeEditReasonTags(r.tags);
    if (tags.length > 0) next.reasonTags = tags;
    return next;
  });
}

export function segmentHasReason(seg: EditSegment): boolean {
  return !!seg.reason?.trim() || (seg.reasonTags?.length ?? 0) > 0;
}

/** How many changed regions carry a reason, for the save-button nudge. */
export function reasonCoverage(segments: EditSegment[]): {
  given: number;
  total: number;
} {
  return {
    given: segments.filter(segmentHasReason).length,
    total: segments.length,
  };
}

/**
 * The save-button label ("the nudge, not the gate"): saving is never blocked
 * by missing reasons, the label just says honestly what is being saved.
 */
export function editSaveLabel(segments: EditSegment[]): string {
  const { given, total } = reasonCoverage(segments);
  if (total === 0) return "Save";
  if (given === total) return "Save suggestions";
  if (given > 0) return `Save - ${given} of ${total} reasons given`;
  return "Save without reasons";
}
