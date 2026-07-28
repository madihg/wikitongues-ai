import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import { bucketLabel } from "@/lib/buckets";
import {
  parseAnnotationsQuery,
  excerpt,
  foldIgala,
  type AnnotationType,
} from "@/lib/annotations-query";
import { Prisma } from "@prisma/client";
import type { EvalBucket } from "@prisma/client";

/**
 * GET /api/admin/annotations — researcher-gated, unified list of annotation
 * events across the three annotator-authored tables, newest first.
 *
 * Query: annotatorId?, type? (pairwise|cold|edit), bucket?, includeDemo?
 *        (default false), offset? / cursor?, limit? (default 25, max 100),
 *        q? (free-text search, 2-100 chars after trim; see below).
 *
 * Row shape: { type, id, createdAt, annotator, prompt|null, summary } where
 * summary is type-specific. Also returns `total` for the current filter so the
 * UI can paginate.
 *
 * Free-text search (`q`): matches prompt text (all three types) plus each
 * type's own free-text fields (pairwise.explanation; cold.answerText,
 * englishGloss, instructionIg; edit.correctedText, originalText, rationale).
 * Matching is case- and diacritic-insensitive — see `foldIgala` in
 * annotations-query.ts and `FOLD_FROM`/`FOLD_TO` below, which must fold text
 * identically so a plain-ASCII query finds accented Igala text. Prisma's
 * `contains` can't diacritic-fold, so the search itself runs as `$queryRaw`
 * id-lookups (one per table, plus one against Prompt for prompt-text hits),
 * and the resulting id sets are merged into the normal Prisma `where` as an
 * `OR` branch alongside the existing filters — the bounded-fetch/count
 * pattern above is otherwise unchanged, so counts stay correct under search.
 *
 * Why we build the unified list in JS rather than one SQL union: the three
 * tables have different promptId semantics — PairwiseComparison.promptId is the
 * PUBLIC prompt string (e.g. "ig_orth_001"), while ColdAuthorAnswer.promptId and
 * OutputEdit.promptId are cuid FKs. Reconciling that in a single query would be
 * brittle; instead we fetch each type's own top `offset + limit` rows (same
 * bounded-fetch pattern as /api/annotator/history), merge-sort by createdAt
 * desc, and slice the requested window — never loading a full table into
 * memory. Fetching each type's own top-K is sufficient to correctly compute the
 * merged top-K: any row inside the global top K must also be inside its own
 * table's top K, since every same-table row that outranks it globally also
 * outranks it within that table. `total` comes from three cheap count()
 * queries (already true before this fix), summed.
 */

interface AnnotatorLite {
  id: string;
  name: string | null;
  email: string;
}
interface PromptLite {
  promptId: string;
  text: string;
  bucket: string | null;
}
interface EventRow {
  type: AnnotationType;
  id: string;
  createdAt: string;
  annotator: AnnotatorLite;
  prompt: PromptLite | null;
  summary: string;
}

export async function GET(req: Request) {
  const { error } = await requireResearcher();
  if (error) return error;

  const query = parseAnnotationsQuery(new URL(req.url).searchParams);
  const { annotatorId, type, bucket, includeDemo, limit, offset } = query;

  const demoFilter = includeDemo ? {} : { isDemo: false };
  const annotatorFilter = annotatorId ? { annotatorId } : {};
  const bucketFilter: { bucket?: EvalBucket } = bucket ? { bucket } : {};

  const wantPairwise = !type || type === "pairwise";
  const wantCold = !type || type === "cold";
  const wantEdit = !type || type === "edit";

  // Bound each per-type fetch to its own top `offset + limit` rows (newest
  // first) rather than loading the whole matching table — see file header.
  const fetchCap = offset + limit;

  // Free-text search: resolve every matching id up front (a handful of
  // bounded $queryRaw lookups), then fold the result into each type's
  // `where` below as an OR branch. `search` is null when there's no active
  // query, so the filter is a no-op in that case.
  const foldedQ = query.q ? foldIgala(query.q) : null;
  const search = foldedQ ? await resolveSearchMatches(foldedQ) : null;

  // Resolve prompt text/bucket for pairwise rows, whose promptId is the PUBLIC
  // string. One lookup keyed by that string; cold/edit use their FK relation.
  const events: EventRow[] = [];
  let total = 0;

  if (wantPairwise) {
    const where: Prisma.PairwiseComparisonWhereInput = {
      ...demoFilter,
      ...annotatorFilter,
      ...bucketFilter,
      // PairwiseComparison.promptId is the PUBLIC prompt string (see file
      // header), so prompt-text hits join on `search.promptPublicIds`.
      ...(search
        ? {
            OR: [
              { promptId: { in: search.promptPublicIds } },
              { id: { in: search.pairwiseIds } },
            ],
          }
        : {}),
    };
    const [rows, count] = await Promise.all([
      prisma.pairwiseComparison.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: fetchCap,
        select: {
          id: true,
          promptId: true,
          bucket: true,
          winner: true,
          confidence: true,
          createdAt: true,
          annotator: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.pairwiseComparison.count({ where }),
    ]);
    total += count;

    // PairwiseComparison.promptId is the public string; hydrate prompt text.
    const publicIds = Array.from(new Set(rows.map((r) => r.promptId)));
    const prompts = publicIds.length
      ? await prisma.prompt.findMany({
          where: { promptId: { in: publicIds } },
          select: { promptId: true, text: true, bucket: true },
        })
      : [];
    const byPublicId = new Map(prompts.map((p) => [p.promptId, p]));

    for (const r of rows) {
      const p = byPublicId.get(r.promptId);
      events.push({
        type: "pairwise",
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        annotator: r.annotator,
        prompt: p
          ? {
              promptId: p.promptId,
              text: p.text,
              bucket: p.bucket ? bucketLabel(p.bucket) : null,
            }
          : { promptId: r.promptId, text: "", bucket: null },
        summary: pairwiseSummary(r.winner, r.confidence),
      });
    }
  }

  if (wantCold) {
    const where: Prisma.ColdAuthorAnswerWhereInput = {
      ...demoFilter,
      ...annotatorFilter,
      ...bucketFilter,
      // ColdAuthorAnswer.promptId is a cuid FK to Prompt.id, so prompt-text
      // hits join on `search.promptCuids`.
      ...(search
        ? {
            OR: [
              { promptId: { in: search.promptCuids } },
              { id: { in: search.coldIds } },
            ],
          }
        : {}),
    };
    const [rows, count] = await Promise.all([
      prisma.coldAuthorAnswer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: fetchCap,
        select: {
          id: true,
          answerText: true,
          provenance: true,
          createdAt: true,
          annotator: { select: { id: true, name: true, email: true } },
          prompt: { select: { promptId: true, text: true, bucket: true } },
        },
      }),
      prisma.coldAuthorAnswer.count({ where }),
    ]);
    total += count;

    for (const r of rows) {
      events.push({
        type: "cold",
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        annotator: r.annotator,
        prompt: r.prompt
          ? {
              promptId: r.prompt.promptId,
              text: r.prompt.text,
              bucket: r.prompt.bucket ? bucketLabel(r.prompt.bucket) : null,
            }
          : null,
        summary: coldSummary(r.provenance, r.answerText),
      });
    }
  }

  if (wantEdit) {
    const where: Prisma.OutputEditWhereInput = {
      ...demoFilter,
      ...annotatorFilter,
      ...bucketFilter,
      // OutputEdit reaches its prompt via modelOutput (see file header) —
      // its own `promptId` column is a denormalized copy we don't rely on —
      // so prompt-text hits join through that relation on `search.promptCuids`.
      ...(search
        ? {
            OR: [
              { modelOutput: { promptId: { in: search.promptCuids } } },
              { id: { in: search.editIds } },
            ],
          }
        : {}),
    };
    const [rows, count] = await Promise.all([
      prisma.outputEdit.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: fetchCap,
        select: {
          id: true,
          correctedText: true,
          createdAt: true,
          annotator: { select: { id: true, name: true, email: true } },
          modelOutput: {
            select: {
              prompt: { select: { promptId: true, text: true, bucket: true } },
            },
          },
        },
      }),
      prisma.outputEdit.count({ where }),
    ]);
    total += count;

    for (const r of rows) {
      const p = r.modelOutput?.prompt ?? null;
      events.push({
        type: "edit",
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        annotator: r.annotator,
        prompt: p
          ? {
              promptId: p.promptId,
              text: p.text,
              bucket: p.bucket ? bucketLabel(p.bucket) : null,
            }
          : null,
        summary: excerpt(r.correctedText),
      });
    }
  }

  // Merge the (already-bounded) type streams into one createdAt-desc list,
  // then slice the requested window. `events` holds each type's own top
  // `fetchCap` rows, which is provably sufficient to compute the correct
  // merged top `fetchCap` — see file header.
  events.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const page = events.slice(offset, offset + limit);

  // Annotator facet for the filter dropdown: distinct annotators with visible
  // work under the current type/bucket/demo filters, but IGNORING the annotator
  // filter itself, so selecting one annotator doesn't collapse the dropdown.
  const annotators = await distinctAnnotators({
    type,
    bucket,
    demoFilter,
  });

  return NextResponse.json({
    events: page,
    total,
    limit,
    offset,
    // total (not events.length) is the true count, since events is bounded to
    // fetchCap per type rather than the full matching set.
    hasMore: offset + page.length < total,
    annotators,
  });
}

async function distinctAnnotators(opts: {
  type: AnnotationType | null;
  bucket: EvalBucket | null;
  demoFilter: { isDemo?: boolean };
}): Promise<AnnotatorLite[]> {
  const { type, bucket, demoFilter } = opts;
  const bucketFilter: { bucket?: EvalBucket } = bucket ? { bucket } : {};
  const ids = new Set<string>();

  const collectors: Promise<{ annotatorId: string }[]>[] = [];
  if (!type || type === "pairwise") {
    collectors.push(
      prisma.pairwiseComparison.findMany({
        where: { ...demoFilter, ...bucketFilter },
        distinct: ["annotatorId"],
        select: { annotatorId: true },
      }),
    );
  }
  if (!type || type === "cold") {
    collectors.push(
      prisma.coldAuthorAnswer.findMany({
        where: { ...demoFilter, ...bucketFilter },
        distinct: ["annotatorId"],
        select: { annotatorId: true },
      }),
    );
  }
  if (!type || type === "edit") {
    collectors.push(
      prisma.outputEdit.findMany({
        where: { ...demoFilter, ...bucketFilter },
        distinct: ["annotatorId"],
        select: { annotatorId: true },
      }),
    );
  }

  for (const rows of await Promise.all(collectors)) {
    for (const r of rows) ids.add(r.annotatorId);
  }
  if (ids.size === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  return users;
}

// ─── Free-text search ───────────────────────────────────────────────────
//
// Diacritic fold for the SQL side: lower() the column (Postgres's built-in
// lower() correctly downcases the Latin Extended-A/B codepoints below — this
// was verified against this database, not assumed), then translate() every
// precomposed accented letter actually used across ColdAuthorAnswer.
// {answerText,englishGloss,instructionIg}, PairwiseComparison.explanation,
// OutputEdit.{correctedText,originalText,rationale}, and Prompt.text (all
// rows scanned, not sampled) to its plain ASCII base, and delete the
// standalone combining marks that show up trailing a dot-below vowel + tone
// (Unicode has no single codepoint for e.g. "dot-below e + acute", so it's
// stored as the precomposed dot-below letter followed by a bare combining
// acute — confirmed present in production ColdAuthorAnswer rows). Must fold
// identically to `foldIgala` in annotations-query.ts, which folds the query
// string on the JS side — see that function's doc comment for the full
// data-shape writeup.
const FOLD_FROM = "àáãāèéẹẽìíîīòóõọùúụñǹṅ" + "̣̀́̃̄̇";
const FOLD_TO = "aaaaeeeeiiiioooouuunnn";

interface SearchMatches {
  promptCuids: string[]; // Prompt.id hits — join target for cold + edit
  promptPublicIds: string[]; // Prompt.promptId hits — join target for pairwise
  pairwiseIds: string[];
  coldIds: string[];
  editIds: string[];
}

/** Resolve every id a free-text search matches, across the Prompt table and
 * each annotation type's own free-text columns. Called once per request
 * (not once per type) since Prompt is shared across all three. */
async function resolveSearchMatches(foldedQ: string): Promise<SearchMatches> {
  const [promptRows, pairwiseIds, coldIds, editIds] = await Promise.all([
    prisma.$queryRaw<{ id: string; promptId: string }[]>(
      Prisma.sql`SELECT id, "promptId" FROM wikitongues."Prompt" WHERE translate(lower("text"), ${FOLD_FROM}, ${FOLD_TO}) LIKE '%' || ${foldedQ} || '%'`,
    ),
    searchIds('wikitongues."PairwiseComparison"', ["explanation"], foldedQ),
    searchIds(
      'wikitongues."ColdAuthorAnswer"',
      ["answerText", "englishGloss", "instructionIg"],
      foldedQ,
    ),
    searchIds(
      'wikitongues."OutputEdit"',
      ["correctedText", "originalText", "rationale"],
      foldedQ,
    ),
  ]);

  return {
    promptCuids: promptRows.map((p) => p.id),
    promptPublicIds: promptRows.map((p) => p.promptId),
    pairwiseIds,
    coldIds,
    editIds,
  };
}

/** Diacritic-folded, case-insensitive `id` lookup across one or more text
 * columns on a single table. `table` and `columns` are always literals
 * hardcoded in this file (never request-derived) so splicing them as raw SQL
 * is safe; `foldedQ` is the only untrusted value and is always passed as a
 * bound parameter, never interpolated into the query text. */
async function searchIds(
  table: string,
  columns: readonly string[],
  foldedQ: string,
): Promise<string[]> {
  const perColumn = columns.map(
    (col) =>
      Prisma.sql`translate(lower(coalesce(${Prisma.raw(`"${col}"`)}, '')), ${FOLD_FROM}, ${FOLD_TO}) LIKE '%' || ${foldedQ} || '%'`,
  );
  const rows = await prisma.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id FROM ${Prisma.raw(table)} WHERE ${Prisma.join(perColumn, " OR ")}`,
  );
  return rows.map((r) => r.id);
}

function pairwiseSummary(winner: string, confidence: number | null): string {
  const label =
    winner === "a"
      ? "Picked A"
      : winner === "b"
        ? "Picked B"
        : winner === "tie"
          ? "Tie"
          : winner === "both_inadequate"
            ? "Both inadequate"
            : winner;
  return confidence ? `${label} · confidence ${confidence}/4` : label;
}

function coldSummary(provenance: string, answerText: string): string {
  const kind =
    provenance === "corrected_from_inadequate" ? "Salvage" : "Cold answer";
  return `${kind}: ${excerpt(answerText)}`;
}
