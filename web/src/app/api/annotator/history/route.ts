import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bucketLabel } from "@/lib/buckets";
import { needsFix } from "@/lib/answer-revisions";

/**
 * "My Work" history - the signed-in annotator's own submissions, newest first.
 * Scoped strictly to annotatorId + isDemo:false: no admin data, no other
 * annotator's rows. Merges three artifact types into one typed, sorted feed:
 *   - pairwise: blind A/B comparisons (winner/confidence/explanation)
 *   - cold:     source-free gold answers authored before models were shown
 *   - edit:     inline corrections of a winning output
 *
 * Every row carries its id and kind, which is what the Edit button opens
 * (/api/annotator/answers/[type]/[id]), and `needsFix`: an own answer with no
 * English meaning, or a correction with no reason or a very short one.
 * ?filter=fix returns only those rows ("Needs a meaning or a reason").
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

interface PairwiseRow {
  kind: "pairwise";
  id: string;
  createdAt: string;
  bucketLabel: string;
  promptText: string;
  winner: string;
  confidence: number | null;
  explanation: string;
  outputA: string;
  outputB: string;
}

interface ColdRow {
  kind: "cold";
  id: string;
  createdAt: string;
  bucketLabel: string;
  promptText: string;
  answerText: string;
  englishGloss: string | null;
  provenance: string;
  needsFix: boolean;
}

interface EditRow {
  kind: "edit";
  id: string;
  createdAt: string;
  bucketLabel: string;
  promptText: string;
  originalText: string;
  correctedText: string;
  rationale: string | null;
  needsFix: boolean;
}

type HistoryRow = PairwiseRow | ColdRow | EditRow;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const annotatorId = session.user.id;

  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  // Pull limit+offset worth of each type, merge, sort, then slice the page.
  // Simpler than a cross-model SQL union, and each type is capped by the same
  // window so a single-type page is never starved.
  // The fix filter is decided in code (a reason "under 20 characters" is not
  // a database predicate), so it reads the person's own answers and
  // corrections whole, capped, and leaves comparisons out: they have nothing
  // to fix.
  const fixOnly = url.searchParams.get("filter") === "fix";
  const FIX_CAP = 5000;
  const fetchCap = fixOnly ? FIX_CAP : limit + offset;

  const [pairwise, cold, edits] = await Promise.all([
    fixOnly
      ? Promise.resolve([])
      : prisma.pairwiseComparison.findMany({
          where: { annotatorId, isDemo: false },
          orderBy: { createdAt: "desc" },
          take: fetchCap,
          select: {
            id: true,
            promptId: true,
            bucket: true,
            winner: true,
            confidence: true,
            explanation: true,
            createdAt: true,
            modelOutputA: { select: { outputText: true } },
            modelOutputB: { select: { outputText: true } },
          },
        }),
    prisma.coldAuthorAnswer.findMany({
      where: { annotatorId, isDemo: false },
      orderBy: { createdAt: "desc" },
      take: fetchCap,
      select: {
        id: true,
        bucket: true,
        answerText: true,
        englishGloss: true,
        provenance: true,
        createdAt: true,
        prompt: { select: { text: true } },
      },
    }),
    prisma.outputEdit.findMany({
      where: { annotatorId, isDemo: false },
      orderBy: { createdAt: "desc" },
      take: fetchCap,
      select: {
        id: true,
        bucket: true,
        originalText: true,
        correctedText: true,
        rationale: true,
        createdAt: true,
        modelOutput: { select: { prompt: { select: { text: true } } } },
      },
    }),
  ]);

  // PairwiseComparison.promptId is the PUBLIC string (e.g. "ig_orth_001"), not a
  // cuid FK - look up prompt text for the set actually returned.
  const publicPromptIds = [...new Set(pairwise.map((p) => p.promptId))];
  const promptTextByPublicId = new Map(
    publicPromptIds.length
      ? (
          await prisma.prompt.findMany({
            where: { promptId: { in: publicPromptIds } },
            select: { promptId: true, text: true },
          })
        ).map((p) => [p.promptId, p.text])
      : [],
  );

  const rows: HistoryRow[] = [
    ...pairwise.map((p): PairwiseRow => ({
      kind: "pairwise",
      id: p.id,
      createdAt: p.createdAt.toISOString(),
      bucketLabel: bucketLabel(p.bucket),
      promptText: promptTextByPublicId.get(p.promptId) ?? p.promptId,
      winner: p.winner,
      confidence: p.confidence,
      explanation: p.explanation,
      outputA: p.modelOutputA.outputText,
      outputB: p.modelOutputB.outputText,
    })),
    ...cold.map((c): ColdRow => ({
      kind: "cold",
      id: c.id,
      createdAt: c.createdAt.toISOString(),
      bucketLabel: bucketLabel(c.bucket),
      promptText: c.prompt?.text ?? "(prompt removed)",
      answerText: c.answerText,
      englishGloss: c.englishGloss,
      provenance: c.provenance,
      needsFix: needsFix({ kind: "cold", englishGloss: c.englishGloss }),
    })),
    ...edits.map((e): EditRow => ({
      kind: "edit",
      id: e.id,
      createdAt: e.createdAt.toISOString(),
      bucketLabel: bucketLabel(e.bucket),
      promptText: e.modelOutput?.prompt?.text ?? "(prompt removed)",
      originalText: e.originalText,
      correctedText: e.correctedText,
      rationale: e.rationale,
      needsFix: needsFix({ kind: "edit", rationale: e.rationale }),
    })),
  ]
    .filter((r) => !fixOnly || (r.kind !== "pairwise" && r.needsFix))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const page = rows.slice(offset, offset + limit);
  const hasMore = rows.length > offset + limit;

  return NextResponse.json({
    rows: page,
    limit,
    offset,
    hasMore,
    filter: fixOnly ? "fix" : "all",
    // With the filter on, the whole list was read, so this is the true count.
    ...(fixOnly ? { fixCount: rows.length } : {}),
  });
}
