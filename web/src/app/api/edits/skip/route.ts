import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EDIT_SKIP_REASON } from "@/lib/pairing";

/**
 * Skip a prompt in the corrections lane (the editing ground). Persisted as a
 * PromptFlag with the fixed sentinel reason "edit_skip" - zero migration,
 * same mechanism as the pairwise skip.
 *
 * Safe side effect, checked: /api/annotations/next excludes ANY-flagged
 * prompts from the pairwise queue, but every lane prompt is by construction
 * already in this annotator's donePromptIds (own-verdict servability), so
 * this flag changes nothing there. Documented tradeoff: these rows appear
 * among prompt flags in admin with the literal reason "edit_skip" -
 * acceptable for v1, and the reason string keeps them filterable. If v2 ever
 * opens the lane to OTHERS' verdicts, that is the moment a real EditSkip
 * table is required - a flag-based skip would then eat prompts out of the
 * pairwise queue.
 *
 * Idempotent: find-before-create, second call still 200s.
 */
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
  if (typeof promptId !== "string" || promptId.length < 2) {
    return NextResponse.json(
      { error: "promptId is required" },
      { status: 400 },
    );
  }

  try {
    // The public promptId (e.g. ig_orth_001), same convention as the
    // pairwise skip and flag routes.
    const prompt = await prisma.prompt.findUnique({
      where: { promptId },
      select: { id: true },
    });
    if (!prompt) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    // The "flag-based skip is free" argument (route doc above) holds ONLY
    // because every lane prompt is already in this annotator's donePromptIds.
    // A skip on a prompt they never judged would silently eat that prompt out
    // of their own pairwise queue (/api/annotations/next excludes any flag by
    // this annotator), so servability is re-derived here: no own verdict, no
    // edit-skip - the same never-trust-the-client rule as /api/edits/submit.
    const judged = await prisma.pairwiseComparison.findFirst({
      where: { annotatorId, isDemo: false, promptId },
      select: { id: true },
    });
    if (!judged) {
      return NextResponse.json(
        {
          error: "You have not judged this prompt, so there is nothing to skip",
        },
        { status: 403 },
      );
    }

    const existing = await prisma.promptFlag.findFirst({
      where: { promptId: prompt.id, annotatorId, reason: EDIT_SKIP_REASON },
      select: { id: true },
    });
    if (!existing) {
      await prisma.promptFlag.create({
        data: { promptId: prompt.id, annotatorId, reason: EDIT_SKIP_REASON },
      });
    }
  } catch (e) {
    console.error("edit skip failed:", e);
    return NextResponse.json(
      { error: "Could not skip this one. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
