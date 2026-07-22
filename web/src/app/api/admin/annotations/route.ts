import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import { bucketLabel } from "@/lib/buckets";
import {
  parseAnnotationsQuery,
  excerpt,
  type AnnotationType,
} from "@/lib/annotations-query";
import type { EvalBucket, Prisma } from "@prisma/client";

/**
 * GET /api/admin/annotations — researcher-gated, unified list of annotation
 * events across the three annotator-authored tables, newest first.
 *
 * Query: annotatorId?, type? (pairwise|cold|edit), bucket?, includeDemo?
 *        (default false), offset? / cursor?, limit? (default 25, max 100).
 *
 * Row shape: { type, id, createdAt, annotator, prompt|null, summary } where
 * summary is type-specific. Also returns `total` for the current filter so the
 * UI can paginate.
 *
 * Why we build the unified list in JS rather than one SQL union: the three
 * tables have different promptId semantics — PairwiseComparison.promptId is the
 * PUBLIC prompt string (e.g. "ig_orth_001"), while ColdAuthorAnswer.promptId and
 * OutputEdit.promptId are cuid FKs. Reconciling that in a single query would be
 * brittle; the data is tiny (tens of rows) so fetching each type and merging in
 * memory is clean and correct.
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

  // Resolve prompt text/bucket for pairwise rows, whose promptId is the PUBLIC
  // string. One lookup keyed by that string; cold/edit use their FK relation.
  const events: EventRow[] = [];
  let total = 0;

  if (wantPairwise) {
    const where: Prisma.PairwiseComparisonWhereInput = {
      ...demoFilter,
      ...annotatorFilter,
      ...bucketFilter,
    };
    const [rows, count] = await Promise.all([
      prisma.pairwiseComparison.findMany({
        where,
        orderBy: { createdAt: "desc" },
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
    };
    const [rows, count] = await Promise.all([
      prisma.coldAuthorAnswer.findMany({
        where,
        orderBy: { createdAt: "desc" },
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
    };
    const [rows, count] = await Promise.all([
      prisma.outputEdit.findMany({
        where,
        orderBy: { createdAt: "desc" },
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

  // Merge the type streams into one createdAt-desc list, then page in memory.
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
    hasMore: offset + page.length < events.length,
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
