import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import { isBucket } from "@/lib/buckets";
import { FINE_TUNE_PROVIDERS } from "@/lib/arena/fine-tune-providers";
import type { EvalBucket, FineTuneMethod, Prisma } from "@prisma/client";

/**
 * Fine-tune jobs: turn the platform's collected annotations into training jobs
 * behind a provider-adapter interface. POST creates a draft job and freezes the
 * held-out (test-split) prompt ids so the dataset builder can never leak them.
 */

const VALID_METHODS: FineTuneMethod[] = ["sft", "dpo", "continued_pretrain"];

/** Each method has one canonical on-the-wire training format. */
const TRAINING_FORMAT: Record<FineTuneMethod, string> = {
  sft: "openai-chat",
  dpo: "dpo-pairs",
  continued_pretrain: "raw-text-cpt",
};

export async function GET() {
  const guard = await requireResearcher();
  if (guard.error) return guard.error;

  const jobs = await prisma.fineTuneJob.findMany({
    where: { language: "igala" },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      baseCandidate: { select: { id: true, name: true, color: true } },
      outputCandidate: { select: { id: true, name: true, color: true } },
    },
  });

  return NextResponse.json({ jobs });
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

  const method = body.method as FineTuneMethod;
  if (!VALID_METHODS.includes(method))
    return NextResponse.json(
      { error: `method must be one of ${VALID_METHODS.join(", ")}` },
      { status: 400 },
    );

  const provider =
    typeof body.provider === "string" && body.provider ? body.provider : "mock";
  if (!FINE_TUNE_PROVIDERS.includes(provider))
    return NextResponse.json(
      { error: `provider must be one of ${FINE_TUNE_PROVIDERS.join(", ")}` },
      { status: 400 },
    );

  const baseCandidateId =
    typeof body.baseCandidateId === "string" && body.baseCandidateId
      ? body.baseCandidateId
      : null;
  let baseModelId =
    typeof body.baseModelId === "string" ? body.baseModelId.trim() : "";

  // Need either an explicit base model id or a candidate to derive it from.
  let baseCandidate: { id: string; baseModelId: string } | null = null;
  if (baseCandidateId) {
    baseCandidate = await prisma.candidateModel.findUnique({
      where: { id: baseCandidateId },
      select: { id: true, baseModelId: true },
    });
    if (!baseCandidate)
      return NextResponse.json(
        { error: "baseCandidateId not found" },
        { status: 404 },
      );
    if (!baseModelId) baseModelId = baseCandidate.baseModelId;
  }
  if (!baseModelId)
    return NextResponse.json(
      { error: "baseModelId or baseCandidateId is required" },
      { status: 400 },
    );

  // bucketFilter: keep only valid EvalBucket values.
  const bucketFilter: EvalBucket[] = Array.isArray(body.bucketFilter)
    ? body.bucketFilter.filter(isBucket)
    : [];

  const sourcePairwiseIds = Array.isArray(body.sourcePairwiseIds)
    ? body.sourcePairwiseIds.filter((x): x is string => typeof x === "string")
    : [];
  const sourceEditIds = Array.isArray(body.sourceEditIds)
    ? body.sourceEditIds.filter((x): x is string => typeof x === "string")
    : [];

  const hyperparameters =
    body.hyperparameters && typeof body.hyperparameters === "object"
      ? (body.hyperparameters as Prisma.InputJsonValue)
      : undefined;

  // Freeze the held-out bank (test split). These ids are carried so the dataset
  // builder can hard-exclude them — held-out data is NEVER trained on.
  const holdout = await prisma.prompt.findMany({
    where: { language: "igala", split: "test" },
    select: { id: true },
  });

  const job = await prisma.fineTuneJob.create({
    data: {
      method,
      provider,
      baseModelId,
      baseCandidateId,
      language: "igala",
      trainingFormat: TRAINING_FORMAT[method],
      systemPrompt:
        typeof body.systemPrompt === "string" ? body.systemPrompt : null,
      sourcePairwiseIds,
      sourceEditIds,
      holdoutPromptIds: holdout.map((p) => p.id),
      bucketFilter,
      hyperparameters,
      status: "draft",
      triggeredById: guard.userId,
    },
  });

  return NextResponse.json({ job }, { status: 201 });
}
