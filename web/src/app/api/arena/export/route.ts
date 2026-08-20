import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import {
  buildDpoExamples,
  buildSftExamples,
  toJsonl,
  type DpoSourceRow,
} from "@/lib/arena/training-export";
import { loadSftSourceRows } from "@/lib/arena/sft-source";
import { isBucket } from "@/lib/buckets";
import type { EvalBucket, VerificationStatus } from "@prisma/client";

/**
 * Training-set export. `?type=dpo` (from pairwise) or `?type=sft` (cold gold,
 * plus edits only behind `?includeEdits=1`, capped — see training-export.ts).
 * Held-out prompts are excluded in the pure builders, and every SFT example
 * carries its provenance (cold_sourcefree | cold_salvage | edit) so an
 * exported set is self-auditing.
 */
export async function GET(req: Request) {
  const guard = await requireResearcher();
  if (guard.error) return guard.error;

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "dpo";
  const bucketParam = url.searchParams.get("buckets");
  const buckets = bucketParam
    ? bucketParam.split(",").filter(isBucket)
    : undefined;
  const minVerification = url.searchParams.get(
    "minVerification",
  ) as VerificationStatus | null;

  if (type === "dpo") {
    const comparisons = await prisma.pairwiseComparison.findMany({
      where: { winner: { in: ["a", "b"] }, isDemo: false },
      select: {
        winner: true,
        bucket: true,
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
      const aText = c.modelOutputA?.outputText ?? "";
      const bText = c.modelOutputB?.outputText ?? "";
      const chosen = c.winner === "a" ? aText : bText;
      const rejected = c.winner === "a" ? bText : aText;
      return {
        promptId: c.modelOutputA?.prompt?.id ?? "",
        promptText: c.modelOutputA?.prompt?.text ?? "",
        chosenText: chosen,
        rejectedText: rejected,
        bucket: (c.bucket ??
          c.modelOutputA?.prompt?.bucket ??
          null) as EvalBucket | null,
        isHoldout: c.modelOutputA?.prompt?.isHoldout ?? false,
      };
    });

    const examples = buildDpoExamples(rows, { buckets });
    return new NextResponse(toJsonl(examples), {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Content-Disposition": `attachment; filename="igala-dpo-${examples.length}.jsonl"`,
      },
    });
  }

  if (type === "sft") {
    // The shared loader (cold gold + edits, provenance carried per row). The
    // builder excludes edit-provenance rows unless includeEdits is passed,
    // and caps them even then - the pivot's anti-post-editese default.
    const rows = await loadSftSourceRows({ sourceEditIds: [] });
    const includeEdits = url.searchParams.get("includeEdits") === "1";

    const examples = buildSftExamples(rows, {
      buckets,
      minVerification: minVerification ?? undefined,
      includeEdits,
    });
    return new NextResponse(toJsonl(examples), {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Content-Disposition": `attachment; filename="igala-sft-${examples.length}.jsonl"`,
      },
    });
  }

  return NextResponse.json(
    { error: "type must be 'dpo' or 'sft'" },
    { status: 400 },
  );
}
