import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";
import { isFrozenPrompt } from "@/lib/speech/guard";
import { minimalPairCoverage, validatePair } from "@/lib/speech/minimal-pairs";

/**
 * Tone minimal pairs (PRD US-011). Researcher-only; 404 when the flag is off.
 *
 * POST {promptId (the public code), targetSpelling, foilSpelling}: mark a
 * train-side prompt. The target is the spelling the prompt's clips are meant
 * to say; the foil differs from it in tone marks only. One pair per prompt;
 * marking again replaces it (and keeps answers already given, which were
 * scored against the pair then in force).
 *   400  malformed body, or spellings that are not a tone minimal pair
 *   404  unknown prompt
 *   403  frozen prompt (isHoldout or split test), no detail
 *
 * GET: the marked prompts (ids only) and the coverage cell they fill.
 */
export async function POST(req: Request) {
  const gate = await labGate();
  if (gate.error) return gate.error;

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof b.promptId !== "string" || !b.promptId) {
    return NextResponse.json({ error: "promptId is required" }, { status: 400 });
  }
  const check = validatePair(b.targetSpelling, b.foilSpelling);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const prompt = await prisma.prompt.findUnique({
    where: { promptId: b.promptId },
    select: { id: true, promptId: true, isHoldout: true, split: true },
  });
  if (!prompt) return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
  if (isFrozenPrompt(prompt)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const row = await prisma.speechMinimalPair.upsert({
    where: { promptId: prompt.id },
    create: {
      promptId: prompt.id,
      targetSpelling: check.target,
      foilSpelling: check.foil,
      createdById: gate.userId,
    },
    update: { targetSpelling: check.target, foilSpelling: check.foil },
    select: { id: true },
  });
  return NextResponse.json({ id: row.id }, { status: 201 });
}

export async function GET() {
  const gate = await labGate();
  if (gate.error) return gate.error;
  const pairs = await prisma.speechMinimalPair.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, promptId: true, createdAt: true },
  });
  return NextResponse.json({ pairs, coverage: minimalPairCoverage(pairs) });
}
