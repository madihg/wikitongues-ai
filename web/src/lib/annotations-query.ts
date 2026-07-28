import type { EvalBucket } from "@prisma/client";
import { BUCKET_KEYS } from "@/lib/buckets";

/**
 * Query-param parsing for the researcher annotation-review surface
 * (GET /api/admin/annotations). Kept pure and dependency-light so the filter +
 * pagination contract is unit-testable in isolation from Prisma / NextAuth.
 *
 * The three annotation event types the surface unifies:
 *   - "pairwise": a PairwiseComparison  (READ-ONLY — annotator judgment)
 *   - "cold":     a ColdAuthorAnswer    (source-free / salvage gold)
 *   - "edit":     an OutputEdit         (inline correction of a model output)
 */
export const ANNOTATION_TYPES = ["pairwise", "cold", "edit"] as const;
export type AnnotationType = (typeof ANNOTATION_TYPES)[number];

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;
export const MAX_QUERY_LENGTH = 100;
export const MIN_QUERY_LENGTH = 2;

export interface AnnotationsQuery {
  annotatorId: string | null;
  type: AnnotationType | null;
  bucket: EvalBucket | null;
  includeDemo: boolean;
  limit: number;
  offset: number;
  /** Free-text search, already capped/trimmed; null when absent or too short
   * to be worth searching (see `parseSearchQuery`). Matching against stored
   * text still needs diacritic folding — see `foldIgala` below. */
  q: string | null;
}

export function isAnnotationType(value: unknown): value is AnnotationType {
  return (
    typeof value === "string" &&
    (ANNOTATION_TYPES as readonly string[]).includes(value)
  );
}

function isBucket(value: unknown): value is EvalBucket {
  return typeof value === "string" && BUCKET_KEYS.includes(value as EvalBucket);
}

/**
 * Parse and clamp the annotation-list query. Unknown / malformed values fall
 * back to safe defaults rather than throwing, so a bad deep-link never 500s the
 * list — it just widens the filter. `includeDemo` is opt-in (defaults off);
 * demo rows must never appear unless explicitly requested. `cursor` is accepted
 * as an alias for `offset` (the route exposes both names in its contract).
 */
export function parseAnnotationsQuery(
  params: URLSearchParams,
): AnnotationsQuery {
  const rawType = params.get("type");
  const rawBucket = params.get("bucket");
  const rawAnnotator = params.get("annotatorId") ?? params.get("annotator");

  const includeDemo =
    params.get("includeDemo") === "true" || params.get("includeDemo") === "1";

  const limit = clampInt(params.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clampInt(
    params.get("offset") ?? params.get("cursor"),
    0,
    0,
    Number.MAX_SAFE_INTEGER,
  );

  return {
    annotatorId:
      typeof rawAnnotator === "string" && rawAnnotator.length > 0
        ? rawAnnotator
        : null,
    type: isAnnotationType(rawType) ? rawType : null,
    bucket: isBucket(rawBucket) ? rawBucket : null,
    includeDemo,
    limit,
    offset,
    q: parseSearchQuery(params.get("q")),
  };
}

/** Cap at MAX_QUERY_LENGTH chars, trim, then drop anything left shorter than
 * MIN_QUERY_LENGTH — a 1-char search is too broad to be useful and would
 * force a full-table LIKE scan on every keystroke. */
function parseSearchQuery(raw: string | null): string | null {
  if (typeof raw !== "string") return null;
  const capped = raw.slice(0, MAX_QUERY_LENGTH).trim();
  return capped.length >= MIN_QUERY_LENGTH ? capped : null;
}

function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw == null) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** First `n` chars of a body, single-lined, with an ellipsis when truncated. */
export function excerpt(text: string, n = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= n) return flat;
  return flat.slice(0, n).trimEnd() + "…";
}

/**
 * Diacritic-fold Igala/Latin text for search, e.g. "Ọdudu" / "ódùdù" /
 * "ọdúdù" all fold to "odudu" so a researcher typing plain "odudu" finds
 * them all.
 *
 * NFD-decomposes the string (splitting every precomposed accented letter
 * into a plain base letter + one or more combining marks), strips every
 * Unicode combining diacritical mark (U+0300-U+036F), then lowercases.
 * Checked against production annotation text (ColdAuthorAnswer.answerText,
 * PairwiseComparison.explanation, Prompt.text): diacritics there are a mix
 * of precomposed letters (e.g. "ẹ" U+1EB9, "ọ" U+1ECD, "á" U+00E1) AND, for
 * toned dotted vowels that have no single precomposed codepoint (e.g. "ẹ"
 * with an acute tone), a precomposed base followed by a standalone
 * combining mark (e.g. "ẹ" + U+0301). NFD-then-strip handles both shapes
 * uniformly: a precomposed letter decomposes into base + mark before
 * stripping, and an already-standalone mark is stripped directly.
 *
 * Must fold identically to the `translate()` SQL expression the annotations
 * route runs against the database columns, so both sides of the search
 * agree — see src/app/api/admin/annotations/route.ts.
 */
export function foldIgala(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
