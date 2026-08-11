import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  exportPrompts,
  exportGold,
  exportEdits,
  exportPairwise,
  exportRubric,
  exportReadme,
  exportReport,
} from "@/lib/exports";

/** Dispatcher for the downloadable research exports. RESEARCHER only. */

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ type: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "RESEARCHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { type } = await params;

  const csv = (body: string, filename: string) =>
    new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });

  switch (type) {
    case "prompts":
      return csv(await exportPrompts(), "igala_prompts.csv");
    case "gold":
      return csv(await exportGold(), "igala_gold_answers.csv");
    case "edits":
      return csv(await exportEdits(), "igala_edits.csv");
    case "pairwise":
      return csv(await exportPairwise(), "pairwise_comparisons.csv");
    case "rubric":
      return csv(await exportRubric(), "rubric_scores.csv");
    case "readme":
      return new NextResponse(await exportReadme(), {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": 'attachment; filename="COLUMNS.md"',
        },
      });
    case "report":
      return new NextResponse(await exportReport(), {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": 'attachment; filename="benchmark_report.md"',
        },
      });
    default:
      return NextResponse.json(
        {
          error:
            "Invalid export type. Use: prompts, gold, edits, pairwise, rubric, readme, or report",
        },
        { status: 400 },
      );
  }
}
