import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import { getFineTuneProvider } from "@/lib/arena/fine-tune-providers";
import type { CandidateKind, FineTuneMethod } from "@prisma/client";

/**
 * Poll a running job. On success this is where the flywheel closes:
 *   1. auto-register the trained checkpoint as a new CandidateModel,
 *   2. mark the job `registered` and link it to that candidate,
 *   3. queue a post-finetune EvalRun on the held-out bank.
 * The result so far is a deterministic mock, so this runs with no GPU.
 */

// Method -> the candidate kind it produces. continued_pretrain maps 1:1.
const METHOD_TO_KIND: Record<FineTuneMethod, CandidateKind> = {
  sft: "sft",
  dpo: "dpo",
  continued_pretrain: "continued_pretrain",
};

// Distinct-from-baseline palette for auto-registered output models.
const FT_PALETTE = ["#7a4f9c", "#2f8a8a", "#b5512f", "#4f7a5e", "#9c6a13"];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 50);
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireResearcher();
  if (guard.error) return guard.error;

  const { id } = await params;

  const job = await prisma.fineTuneJob.findUnique({
    where: { id },
    include: {
      baseCandidate: { select: { id: true, name: true, provider: true } },
      outputCandidate: { select: { id: true } },
    },
  });
  if (!job)
    return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const provider = getFineTuneProvider(job.provider);

  let result;
  try {
    result = await provider.poll(job);
  } catch (e) {
    const errorMessage =
      e instanceof Error ? e.message : "Provider poll failed";
    await prisma.fineTuneJob.update({
      where: { id },
      data: { status: "failed", errorMessage },
    });
    return NextResponse.json({ status: "failed", error: errorMessage });
  }

  if (result.status === "running") {
    return NextResponse.json({ status: "running" });
  }

  if (result.status === "failed") {
    await prisma.fineTuneJob.update({
      where: { id },
      data: {
        status: "failed",
        errorMessage: result.error ?? "Provider reported failure",
      },
    });
    return NextResponse.json({
      status: "failed",
      error: result.error ?? "Provider reported failure",
    });
  }

  // result.status === "succeeded".
  const outputModelId =
    result.outputModelId ?? `${job.baseModelId}:ft-${id.slice(0, 8)}`;

  // Idempotency: if the job already registered a candidate, don't double up.
  if (job.outputCandidate) {
    await prisma.fineTuneJob.update({
      where: { id },
      data: { status: "registered" },
    });
    return NextResponse.json({
      status: "registered",
      candidateId: job.outputCandidate.id,
    });
  }

  const kind = METHOD_TO_KIND[job.method];
  const baseName = job.baseCandidate?.name ?? job.baseModelId;
  const name = `${baseName} ${job.method.toUpperCase()}`;
  // Unique slug: derive from name + job id so re-runs never collide.
  const slug = `${slugify(name)}-${id.slice(0, 8)}`;
  const color = FT_PALETTE[Math.abs(hashCode(id)) % FT_PALETTE.length];

  // 1. Auto-register the trained checkpoint as a candidate, linked to the job
  //    via the fineTuneJobId 1:1 relation (this also sets job.outputCandidate).
  const candidate = await prisma.candidateModel.create({
    data: {
      name,
      slug,
      family: job.baseCandidate?.provider ?? "openai-compatible",
      kind,
      language: "igala",
      baseModelId: outputModelId,
      provider: job.baseCandidate?.provider ?? "openai-compatible",
      adapterUri: outputModelId,
      parentCandidateId: job.baseCandidateId,
      fineTuneJobId: job.id,
      fineTuneSource: `${job.method} job ${id.slice(0, 8)}`,
      color,
      createdById: guard.userId,
    },
  });

  // 2. Close out the job.
  await prisma.fineTuneJob.update({
    where: { id },
    data: {
      status: "registered",
      costUsd: result.costUsd ?? null,
      completedAt: new Date(),
    },
  });

  // 3. Queue a post-finetune eval on the same frozen held-out bank.
  const evalRun = await prisma.evalRun.create({
    data: {
      candidateModelId: candidate.id,
      language: "igala",
      promptSetLabel: "igala-heldout",
      holdoutPromptIds: job.holdoutPromptIds,
      trigger: "post_finetune",
      status: "draft",
      nPrompts: job.holdoutPromptIds.length,
      triggeredById: guard.userId,
    },
  });

  return NextResponse.json({
    status: "registered",
    candidateId: candidate.id,
    evalRunId: evalRun.id,
  });
}

/** Tiny stable hash for deterministic palette selection. */
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}
