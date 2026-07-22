import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Skip a prompt: the annotator declines to compare it (not because it's
 * malformed - that's /api/annotations/flag - just "not this one, not now").
 * Persisted as a PromptFlag scoped to this annotator with reason "skip", a
 * fixed sentinel distinct from the free-text reasons /flag writes, so a
 * future researcher view can filter { reason: { not: "skip" } } to see only
 * real malformed-prompt reports.
 *
 * /api/annotations/next and /api/annotator/summary both treat a skipped
 * prompt as excluded from this annotator's remaining queue (see
 * computeQueueState in src/lib/pairing.ts) - once skipped, that prompt is
 * never served to this annotator again.
 *
 * Idempotent: PromptFlag has no unique constraint on (promptId, annotatorId,
 * reason), so skipping the same prompt twice is guarded here with a
 * find-before-create instead of relying on a DB constraint - the second call
 * still returns 200 and never creates a duplicate row.
 */
const SKIP_REASON = "skip";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const annotatorId = session.user.id;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { promptId } = body as Record<string, unknown>;
  if (typeof promptId !== "string" || !promptId) {
    return NextResponse.json(
      { error: "promptId is required" },
      { status: 400 },
    );
  }

  try {
    // promptId here is the public promptId (e.g. ig_orth_001) used by the
    // client, same convention as /api/annotations/flag.
    const prompt = await prisma.prompt.findUnique({
      where: { promptId },
      select: { id: true },
    });
    if (!prompt) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    const existing = await prisma.promptFlag.findFirst({
      where: {
        promptId: prompt.id,
        annotatorId,
        reason: SKIP_REASON,
      },
      select: { id: true },
    });

    if (!existing) {
      await prisma.promptFlag.create({
        data: {
          promptId: prompt.id,
          annotatorId,
          reason: SKIP_REASON,
        },
      });
    }
  } catch (e) {
    console.error("annotation skip failed:", e);
    return NextResponse.json(
      { error: "Could not skip this prompt. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
