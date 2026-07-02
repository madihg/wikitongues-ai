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

  const body = await req.json();
  const { promptId, reason } = body;

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

  return NextResponse.json({ success: true });
}
