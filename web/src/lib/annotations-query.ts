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

export interface AnnotationsQuery {
  annotatorId: string | null;
  type: AnnotationType | null;
  bucket: EvalBucket | null;
  includeDemo: boolean;
  limit: number;
  offset: number;
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
  };
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
