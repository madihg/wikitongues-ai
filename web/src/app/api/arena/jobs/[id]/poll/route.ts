import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import { getFineTuneProvider } from "@/lib/arena/fine-tune-providers";
import { registerFineTuneOutput } from "@/lib/arena/register-fine-tune";

/**
 * Poll a running job. On success this is where the flywheel closes:
 *   1. auto-register the trained checkpoint as a new CandidateModel,
 *   2. mark the job `registered` and link it to that candidate,
 *   3. queue a post-finetune EvalRun on the held-out bank.
 * Steps 1-3 live in register-fine-tune.ts so an operational runner registers a
 * checkpoint through exactly this code path.
 */
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
      baseCandidate: {
        select: {
          id: true,
          name: true,
          provider: true,
          family: true,
          decodingParams: true,
        },
      },
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

  // result.status === "succeeded". A provider that reports success without a
  // servable model id is a bug on their side, but the synthetic fallback keeps
  // the flywheel's bookkeeping intact (the mock provider relies on it).
  const outputModelId =
    result.outputModelId ?? `${job.baseModelId}:ft-${id.slice(0, 8)}`;

  const registered = await registerFineTuneOutput({
    job,
    outputModelId,
    costUsd: result.costUsd,
    userId: guard.userId,
  });

  return NextResponse.json({
    status: "registered",
    candidateId: registered.candidateId,
    evalRunId: registered.evalRunId,
  });
}
