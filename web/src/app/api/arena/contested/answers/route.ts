import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import type { EvalBucket } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import {
  buildAnswerVariantGroups,
  countByKind,
  type AnswerRow,
  type AnswerVariantGroup,
} from "@/lib/answer-variants";

/**
 * GET /api/arena/contested/answers - researcher-gated.
 *
 * The second kind of annotator disagreement, and the one that actually has
 * data in it: prompts where two or more DIFFERENT annotators wrote a gold
 * answer and the answers came back written differently. Classification (same
 * word spelled differently vs genuinely different words) lives in
 * src/lib/answer-variants.ts and is unit-tested there; this route only feeds
 * it rows and hydrates prompt text for the page it returns.
 *
 * Demo rows are excluded, always - they must never reach a researcher surface.
 *
 * BOUNDED: never loads the whole answer table. Two capped queries:
 *   1. one grouped id-only scan picks at most CANDIDATE_CAP prompts that have
 *      2+ distinct annotators and 2+ distinct answer strings - most prompts
 *      fail that test and are never fetched at all;
 *   2. one findMany capped at ROW_CAP fetches answers for those prompts only.
 * Classification then runs over every candidate group so the badge counts are
 * true for the whole dataset, while `groups` returns only the first `limit`
 * (see the sort order in buildAnswerVariantGroups: spelling first).
 */

/** Most prompts we will ever classify in one request. ~145 qualify today
 *  against 937 answers, so this leaves a lot of headroom before the counts
 *  start under-reporting. */
const CANDIDATE_CAP = 500;
/** Backstop on the row fetch. ~5 answers per qualifying prompt today. */
const ROW_CAP = 8000;
const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 200;

interface CandidateRow {
  promptId: string;
}

export async function GET(req: Request) {
  const guard = await requireResearcher();
  if (guard.error) return guard.error;

  const limit = clampInt(
    new URL(req.url).searchParams.get("limit"),
    DEFAULT_LIMIT,
    1,
    MAX_LIMIT,
  );

  // Prompts worth looking at: answered by 2+ distinct people, and with 2+
  // distinct answer strings (a prompt everyone wrote identically is
  // agreement). Ordered most-reviewed first so the cap, if it ever bites,
  // drops the thinnest evidence.
  const candidates = await prisma.$queryRaw<CandidateRow[]>(
    Prisma.sql`
      SELECT "promptId"
      FROM wikitongues."ColdAuthorAnswer"
      WHERE "isDemo" = false
      GROUP BY "promptId"
      HAVING COUNT(DISTINCT "annotatorId") >= 2
         AND COUNT(DISTINCT "answerText") >= 2
      ORDER BY COUNT(DISTINCT "annotatorId") DESC, COUNT(*) DESC, "promptId" ASC
      LIMIT ${CANDIDATE_CAP}
    `,
  );
  const candidateIds = candidates.map((c) => c.promptId);

  if (candidateIds.length === 0) {
    return NextResponse.json({
      counts: countByKind([]),
      groups: [],
      returned: 0,
      truncated: false,
    });
  }

  const answers = await prisma.coldAuthorAnswer.findMany({
    where: { isDemo: false, promptId: { in: candidateIds } },
    orderBy: { createdAt: "asc" },
    take: ROW_CAP,
    select: {
      promptId: true,
      answerText: true,
      englishGloss: true,
      dialect: true,
      annotatorId: true,
      annotator: { select: { name: true, email: true } },
    },
  });

  const rows: AnswerRow[] = answers.map((a) => ({
    promptId: a.promptId,
    answerText: a.answerText,
    englishGloss: a.englishGloss,
    dialect: a.dialect,
    annotatorId: a.annotatorId,
    annotatorName: a.annotator?.name ?? a.annotator?.email ?? "unknown",
  }));

  const allGroups = buildAnswerVariantGroups(rows);
  const counts = countByKind(allGroups);
  const page = allGroups.slice(0, limit);

  // ColdAuthorAnswer.promptId is the Prompt cuid (unlike PairwiseComparison,
  // where it is the public "ig_orth_001" string) - hydrate by id.
  const prompts = page.length
    ? await prisma.prompt.findMany({
        where: { id: { in: page.map((g) => g.promptId) } },
        select: { id: true, promptId: true, text: true, bucket: true },
      })
    : [];
  const promptById = new Map(prompts.map((p) => [p.id, p]));

  return NextResponse.json({
    counts,
    groups: page.map((group) => serialise(group, promptById)),
    returned: page.length,
    truncated:
      allGroups.length > page.length ||
      candidates.length === CANDIDATE_CAP ||
      answers.length === ROW_CAP,
  });
}

function serialise(
  group: AnswerVariantGroup,
  promptById: Map<
    string,
    { id: string; promptId: string; text: string; bucket: EvalBucket }
  >,
) {
  const prompt = promptById.get(group.promptId);
  return {
    id: group.promptId,
    promptSlug: prompt?.promptId ?? null,
    promptText: prompt?.text ?? "(prompt not found)",
    bucket: prompt?.bucket ?? null,
    kind: group.kind,
    variants: group.variants,
    clusters: group.clusters,
    annotatorCount: group.annotatorCount,
    answerCount: group.answerCount,
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
