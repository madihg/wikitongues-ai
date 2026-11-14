import { NextResponse } from "next/server";
import { requireLead } from "@/lib/admin/lead-route";
import { addWeeks, lagosDate, parseWeek } from "@/lib/hours";
import { hoursCsv, hoursCsvFilename } from "@/lib/hours-csv";
import { loadHours } from "@/lib/hours-data";

/**
 * GET /api/admin/time-spent: hours per person per week, researcher-gated.
 *
 *   ?week=2026-11-09   any day of the week wanted (Lagos date). Default: this week.
 *   ?weeks=4           how many weeks, ending with that one. Default 1, at most 26.
 *   ?userId=...        one person only (the person page).
 *   ?format=csv        the same rows as a CSV for invoices.
 *
 * Each row carries three figures side by side (lib/hours.ts): measured
 * active time (null when the beat did not run for that person that week,
 * never a made-up number), the recounted estimate, and the old estimate
 * exactly as the platform showed it. Past hours are not rewritten: the old
 * figure stays beside the new one.
 */
const MAX_WEEKS = 26;

export async function GET(req: Request) {
  // Hours per person are pay data: research leads only (RESEARCH_LEADS).
  const { error } = await requireLead();
  if (error) return error;

  const params = new URL(req.url).searchParams;
  const now = new Date();
  const last = parseWeek(params.get("week"), now);
  const n = Math.min(
    MAX_WEEKS,
    Math.max(1, Math.floor(Number(params.get("weeks")) || 1)),
  );
  const weeks = Array.from({ length: n }, (_, i) => addWeeks(last, -i));
  const from = weeks[weeks.length - 1];
  const to = addWeeks(last, 1);
  const userId = params.get("userId") || undefined;

  const data = await loadHours({ weeks, from, to, userId });

  if (params.get("format") === "csv") {
    const fallback = lagosDate(from);
    return new NextResponse(hoursCsv(data.rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${hoursCsvFilename(data.rows, fallback)}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({
    week: {
      start: lagosDate(last),
      end: lagosDate(new Date(to.getTime() - 86_400_000)),
      isCurrent: parseWeek(null, now).getTime() === last.getTime(),
    },
    weeks: weeks.map(lagosDate),
    rows: data.rows,
    measuredSince: data.measuredSince?.toISOString() ?? null,
    demoMinutesLeftOut: Math.round(data.demoSecondsLeftOut / 60),
    revisionsCounted: data.revisionsCounted,
  });
}
