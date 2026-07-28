import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import {
  buildDpoExamples,
  buildSftExamples,
  type DpoSourceRow,
  type ExportFilters,
} from "@/lib/arena/training-export";
import { loadSftSourceRows } from "@/lib/arena/sft-source";

/**
 * Build the training set for a draft job. Reads the collected signal the job
 * points at (or all of it, if no explicit source ids), maps it to the pure
 * builders' source rows, and lets the builders drop held-out prompts, degenerate
 * pairs, and below-threshold edits. We store only the resulting row count and a
 * synthetic dataset uri — nothing is written to disk.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireResearcher();
  if (guard.error) return guard.error;

  const { id } = await params;

  const job = await prisma.fineTuneJob.findUnique({ where: { id } });
  if (!job)
    return NextResponse.json({ error: "Job not found" }, { status: 404 });

  await prisma.fineTuneJob.update({
    where: { id },
    data: { status: "building_dataset" },
  });

  const filters: ExportFilters = {
    buckets: job.bucketFilter.length > 0 ? job.bucketFilter : undefined,
  };

  let nTrainingRows = 0;

  if (job.method === "dpo") {
    const comparisons = await prisma.pairwiseComparison.findMany({
      where: {
        winner: { in: ["a", "b"] },
        isDemo: false,
        ...(job.sourcePairwiseIds.length > 0
          ? { id: { in: job.sourcePairwiseIds } }
          : {}),
      },
      include: {
        modelOutputA: {
          select: {
            outputText: true,
            prompt: {
              select: { id: true, text: true, isHoldout: true, bucket: true },
            },
          },
        },
        modelOutputB: { select: { outputText: true } },
      },
    });

    const rows: DpoSourceRow[] = comparisons.map((c) => {
      const winnerIsA = c.winner === "a";
      return {
        promptId: c.modelOutputA.prompt.id,
        promptText: c.modelOutputA.prompt.text,
        chosenText: winnerIsA
          ? c.modelOutputA.outputText
          : c.modelOutputB.outputText,
        rejectedText: winnerIsA
          ? c.modelOutputB.outputText
          : c.modelOutputA.outputText,
        // Prefer the comparison's bucket; fall back to the prompt's.
        bucket: c.bucket ?? c.modelOutputA.prompt.bucket,
        // Carry the REAL held-out flag so the builder can hard-exclude it.
        isHoldout: c.modelOutputA.prompt.isHoldout,
      };
    });

    nTrainingRows = buildDpoExamples(rows, filters).length;
  } else {
    // sft and continued_pretrain train off the platform's Igala gold: cold author
    // answers (source-free, the bulk) plus annotator edits. buildSftExamples
    // hard-excludes any held-out prompt via the carried isHoldout flag.
    const rows = await loadSftSourceRows(job);
    nTrainingRows = buildSftExamples(rows, filters).length;
  }

  const job2 = await prisma.fineTuneJob.update({
    where: { id },
    data: {
      nTrainingRows,
      // In-memory dataset: we record the count, not bytes on disk.
      datasetUri: `mem://job/${job.id}.jsonl`,
      status: "queued",
    },
  });

  return NextResponse.json({ nTrainingRows: job2.nTrainingRows });
}
