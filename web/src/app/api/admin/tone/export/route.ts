import { NextResponse } from "next/server";
import { requireResearcher } from "@/lib/api-auth";
import { isMissingTable } from "@/lib/answer-revisions";
import { agreementCsv, exportTonePass } from "@/lib/tone/tone-export";
import { toneAdminData } from "@/lib/tone/tone-pass";

/**
 * GET /api/admin/tone/export?file=layers|agreement. Researcher only.
 *   layers     tone_pass.csv: pass 1, every pass 2 with its marker, and the
 *              agreed text, one row per layer.
 *   agreement  tone_agreement.csv: items done per marker, agreement per pair
 *              and per coverage cell.
 */
export async function GET(req: Request) {
  const { error } = await requireResearcher();
  if (error) return error;
  const file = new URL(req.url).searchParams.get("file") ?? "layers";
  const csv = (body: string, filename: string) =>
    new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  try {
    if (file === "layers") return csv(await exportTonePass(), "tone_pass.csv");
    if (file === "agreement") {
      const data = await toneAdminData();
      return csv(agreementCsv(data.summary, data.names), "tone_agreement.csv");
    }
    return NextResponse.json(
      { error: "file must be layers or agreement" },
      { status: 400 },
    );
  } catch (e) {
    if (isMissingTable(e)) {
      return NextResponse.json(
        { error: "The tone pass is not switched on yet." },
        { status: 503 },
      );
    }
    throw e;
  }
}
