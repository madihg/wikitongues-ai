import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { PromptCategory, DifficultyLevel } from "@prisma/client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const prompt = await prisma.prompt.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true, email: true } },
      edits: {
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!prompt) {
    return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
  }

  return NextResponse.json(prompt);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.prompt.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
  }

  const body = await req.json();
  const editableFields = [
    "category",
    "language",
    "text",
    "sourceLanguage",
    "targetCulture",
    "expectedCulturalContext",
    "difficultyLevel",
  ] as const;

  const updates: Record<string, unknown> = {};
  const editRecords: {
    fieldName: string;
    oldValue: string | null;
    newValue: string;
  }[] = [];

  for (const field of editableFields) {
    if (
      field in body &&
      body[field] !== existing[field as keyof typeof existing]
    ) {
      const oldVal = existing[field as keyof typeof existing];
      updates[field] = body[field];
      editRecords.push({
        fieldName: field,
        oldValue: oldVal != null ? String(oldVal) : null,
        newValue: String(body[field]),
      });
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(existing);
  }

  const [prompt] = await prisma.$transaction([
    prisma.prompt.update({
      where: { id },
      data: updates as {
        category?: PromptCategory;
        language?: string;
        text?: string;
        sourceLanguage?: string | null;
        targetCulture?: string | null;
        expectedCulturalContext?: string | null;
        difficultyLevel?: DifficultyLevel;
      },
      include: { createdBy: { select: { name: true, email: true } } },
    }),
    ...editRecords.map((edit) =>
      prisma.promptEdit.create({
        data: {
          promptId: id,
          userId: session.user.id,
          fieldName: edit.fieldName,
          oldValue: edit.oldValue,
          newValue: edit.newValue,
        },
      }),
    ),
  ]);

  return NextResponse.json(prompt);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.prompt.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
  }

  // Delete related records first, then the prompt
  await prisma.$transaction([
    prisma.promptEdit.deleteMany({ where: { promptId: id } }),
    prisma.prompt.delete({ where: { id } }),
  ]);

  return NextResponse.json({ success: true });
}
