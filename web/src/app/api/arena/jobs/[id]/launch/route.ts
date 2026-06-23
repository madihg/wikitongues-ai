import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import { getFineTuneProvider } from "@/lib/arena/fine-tune-providers";

/**
 * Hand a built job to its provider. The mock provider runs offline; the stub
 * providers throw a clear "not configured" error. Either way we never 500 on a
 * provider failure — we capture it on the job (status failed + errorMessage)
 * and return 200 so the UI can surface it cleanly.
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

  const provider = getFineTuneProvider(job.provider);

  try {
    const result = await provider.launch(job);
    const updated = await prisma.fineTuneJob.update({
      where: { id },
      data: {
        providerJobId: result.providerJobId,
        providerFileId: result.providerFileId ?? null,
        status: "running",
        startedAt: new Date(),
        errorMessage: null,
      },
    });
    return NextResponse.json({ status: updated.status, job: updated });
  } catch (e) {
    const errorMessage =
      e instanceof Error ? e.message : "Provider launch failed";
    const updated = await prisma.fineTuneJob.update({
      where: { id },
      data: { status: "failed", errorMessage },
    });
    return NextResponse.json({ status: updated.status, error: errorMessage });
  }
}
