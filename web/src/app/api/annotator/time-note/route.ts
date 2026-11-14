import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fromLagosDate, weekStartOf } from "@/lib/hours";
import { isMissingTable } from "@/lib/missing-table";

/**
 * POST /api/annotator/time-note: "Does this look wrong? Tell us." The
 * signed-in person says which day and what they worked on. The note is saved
 * beside that week in the researcher's hours table. It sends no email and
 * changes no figure: a person settles it, not the platform.
 *
 * Body: { day: "2026-11-12", note: "..." }. The day is a Lagos calendar
 * date, not in the future and not older than 90 days.
 */
const MAX_NOTE_CHARS = 500;
const MAX_AGE_MS = 90 * 86_400_000;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { day?: unknown; note?: unknown } | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const day = typeof body?.day === "string" ? body.day : "";
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  const dayStart = fromLagosDate(day);
  const now = Date.now();
  if (
    !dayStart ||
    dayStart.getTime() > now ||
    dayStart.getTime() < now - MAX_AGE_MS
  ) {
    return NextResponse.json(
      { error: "Choose a day in the last 90 days." },
      { status: 400 },
    );
  }
  if (!note) {
    return NextResponse.json(
      { error: "Say what you worked on." },
      { status: 400 },
    );
  }
  if (note.length > MAX_NOTE_CHARS) {
    return NextResponse.json(
      { error: `Keep the note under ${MAX_NOTE_CHARS} characters.` },
      { status: 400 },
    );
  }

  try {
    await prisma.timeNote.create({
      data: { userId, weekStart: weekStartOf(dayStart), day, note },
    });
  } catch (e) {
    if (isMissingTable(e)) {
      // The TimeNote migration is not applied yet.
      return NextResponse.json(
        { error: "Notes are not switched on yet. Please tell your team lead." },
        { status: 503 },
      );
    }
    throw e;
  }
  return NextResponse.json({ ok: true });
}
