import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Flag a prompt as malformed / untranslatable so it can be culled. Shaping the
 * instrument is part of the annotator's role.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { promptId, reason } = body as Record<string, unknown>;

  if (typeof promptId !== "string" || !promptId) {
    return NextResponse.json(
      { error: "promptId is required" },
      { status: 400 },
    );
  }
  if (typeof reason !== "string" || reason.trim().length < 3) {
    return NextResponse.json(
      { error: "A short reason is required" },
      { status: 400 },
    );
  }

  try {
    // promptId here is the public promptId (e.g. ig_orth_001) used by the UI.
    const prompt = await prisma.prompt.findUnique({
      where: { promptId },
      select: { id: true },
    });
    if (!prompt) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    await prisma.promptFlag.create({
      data: {
        promptId: prompt.id,
        annotatorId: session.user.id,
        reason: reason.trim(),
      },
    });
  } catch (e) {
    console.error("prompt flag failed:", e);
    return NextResponse.json(
      { error: "Could not flag this prompt. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
