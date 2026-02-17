import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma, PromptCategory, DifficultyLevel } from "@prisma/client";

const CATEGORY_ABBREV: Record<string, string> = {
  real_world_use: "rw",
  words_concepts: "wc",
  frontier_aspirations: "fa",
  abstract_vs_everyday: "ae",
};

const LANG_CODES: Record<string, string> = {
  igala: "ig",
  lebanese_arabic: "la",
};

function getLangCode(language: string): string {
  return LANG_CODES[language] ?? language.slice(0, 2).toLowerCase();
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const language = searchParams.get("language");
  const difficulty = searchParams.get("difficulty");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = 20;

  const where: Prisma.PromptWhereInput = {};

  if (category) {
    where.category = category as PromptCategory;
  }
  if (language) {
    where.language = language;
  }
  if (difficulty) {
    where.difficultyLevel = difficulty as DifficultyLevel;
  }
  if (search) {
    where.text = { contains: search, mode: "insensitive" };
  }

  const [prompts, total] = await Promise.all([
    prisma.prompt.findMany({
      where,
      include: { createdBy: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.prompt.count({ where }),
  ]);

  return NextResponse.json({
    prompts,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    category,
    language,
    text,
    sourceLanguage,
    targetCulture,
    expectedCulturalContext,
    difficultyLevel,
  } = body;

  if (!category || !language || !text) {
    return NextResponse.json(
      { error: "category, language, and text are required" },
      { status: 400 },
    );
  }

  const langCode = getLangCode(language);
  const catAbbrev = CATEGORY_ABBREV[category] ?? category.slice(0, 2);

  // Find the highest existing number for this lang+category combo
  const existing = await prisma.prompt.findMany({
    where: {
      promptId: { startsWith: `${langCode}_${catAbbrev}_` },
    },
    select: { promptId: true },
    orderBy: { promptId: "desc" },
    take: 1,
  });

  let nextNum = 1;
  if (existing.length > 0) {
    const parts = existing[0].promptId.split("_");
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) {
      nextNum = lastNum + 1;
    }
  }

  const promptId = `${langCode}_${catAbbrev}_${String(nextNum).padStart(3, "0")}`;

  const prompt = await prisma.prompt.create({
    data: {
      promptId,
      category: category as PromptCategory,
      language,
      text,
      sourceLanguage: sourceLanguage || null,
      targetCulture: targetCulture || null,
      expectedCulturalContext: expectedCulturalContext || null,
      difficultyLevel: (difficultyLevel as DifficultyLevel) || "intermediate",
      createdById: session.user.id,
    },
    include: { createdBy: { select: { name: true, email: true } } },
  });

  return NextResponse.json(prompt, { status: 201 });
}
