import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import type { CandidateKind } from "@prisma/client";

const VALID_KINDS: CandidateKind[] = [
  "baseline",
  "rag",
  "sft",
  "dpo",
  "continued_pretrain",
  "composite",
];
const VALID_PROVIDERS = ["anthropic", "openai", "google", "openai-compatible"];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export async function GET() {
  const guard = await requireResearcher();
  if (guard.error) return guard.error;

  const candidates = await prisma.candidateModel.findMany({
    where: { language: "igala" },
    orderBy: [{ archived: "asc" }, { createdAt: "asc" }],
    include: {
      _count: { select: { evalRuns: true, modelOutputs: true } },
      parent: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ candidates });
}

export async function POST(req: Request) {
  const guard = await requireResearcher();
  if (guard.error) return guard.error;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const provider = typeof body.provider === "string" ? body.provider : "";
  const baseModelId =
    typeof body.baseModelId === "string" ? body.baseModelId.trim() : "";
  const kind = body.kind as CandidateKind;

  if (!name)
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!VALID_PROVIDERS.includes(provider))
    return NextResponse.json(
      { error: `provider must be one of ${VALID_PROVIDERS.join(", ")}` },
      { status: 400 },
    );
  if (!baseModelId)
    return NextResponse.json(
      { error: "baseModelId is required" },
      { status: 400 },
    );
  if (!VALID_KINDS.includes(kind))
    return NextResponse.json(
      { error: `kind must be one of ${VALID_KINDS.join(", ")}` },
      { status: 400 },
    );

  const slug = (typeof body.slug === "string" && body.slug) || slugify(name);
  const existing = await prisma.candidateModel.findUnique({ where: { slug } });
  if (existing)
    return NextResponse.json(
      { error: `A candidate with slug "${slug}" already exists` },
      { status: 409 },
    );

  const candidate = await prisma.candidateModel.create({
    data: {
      name,
      slug,
      family: typeof body.family === "string" ? body.family : provider,
      versionLabel:
        typeof body.versionLabel === "string" ? body.versionLabel : null,
      kind,
      language: "igala",
      provider,
      baseModelId,
      apiEndpoint:
        typeof body.apiEndpoint === "string" ? body.apiEndpoint : null,
      hfRepo: typeof body.hfRepo === "string" ? body.hfRepo : null,
      adapterUri: typeof body.adapterUri === "string" ? body.adapterUri : null,
      systemPrompt:
        typeof body.systemPrompt === "string" ? body.systemPrompt : null,
      useSystemPrompt: body.useSystemPrompt === true,
      ragEnabled: body.ragEnabled === true,
      decodingParams:
        body.decodingParams && typeof body.decodingParams === "object"
          ? (body.decodingParams as object)
          : undefined,
      color: typeof body.color === "string" ? body.color : null,
      isPublic: body.isPublic === true,
      createdById: guard.userId,
    },
  });

  return NextResponse.json({ candidate }, { status: 201 });
}
