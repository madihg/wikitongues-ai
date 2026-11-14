import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeBeats, planWrites } from "@/lib/activity";
import { isMissingTable } from "@/lib/missing-table";

/**
 * POST /api/activity/ping: the activity beat (annotator experience spec,
 * section 10.2). Any signed-in person; the time is always their own, taken
 * from the session, never from the body.
 *
 * Body: { sentAt, beats: [{ minute, surface, activeSeconds, demo }] }. Each
 * beat is the TOTAL active seconds the browser has counted in that minute for
 * that kind of work. The server keeps the greater of stored and sent, so:
 *   - the same beat twice changes nothing;
 *   - a beat that waited offline lands in its own minute, up to 24 hours late;
 *   - one person never gets more than 60 seconds in one minute.
 * No content is accepted or stored: a time, a kind of work, a number.
 *
 * Until the ActivityPing migration is applied the route answers 200 with
 * `pending: true` and stores nothing; the browser keeps its beats and tries
 * again later.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { sentAt?: unknown; beats?: unknown } | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || !Array.isArray(body.beats)) {
    return NextResponse.json({ error: "beats must be a list" }, { status: 400 });
  }

  const now = Date.now();
  const sentAt =
    typeof body.sentAt === "number" && Number.isFinite(body.sentAt)
      ? body.sentAt
      : null;
  const { beats, dropped } = normalizeBeats(body.beats, now, sentAt);
  if (beats.length === 0) {
    return NextResponse.json({ ok: true, stored: 0, dropped });
  }

  try {
    const minutes = [...new Set(beats.map((b) => b.minute))].map(
      (m) => new Date(m),
    );
    const stored = await prisma.activityPing.findMany({
      where: { userId, minute: { in: minutes } },
      select: { minute: true, surface: true, isDemo: true, activeSeconds: true },
    });
    const { create, raise } = planWrites(
      stored.map((s) => ({
        minute: s.minute.getTime(),
        surface: s.surface,
        demo: s.isDemo,
        activeSeconds: s.activeSeconds,
      })),
      beats,
    );
    if (create.length > 0) {
      await prisma.activityPing.createMany({
        data: create.map((b) => ({
          userId,
          minute: new Date(b.minute),
          surface: b.surface,
          isDemo: b.demo,
          activeSeconds: b.activeSeconds,
        })),
        skipDuplicates: true,
      });
    }
    // A row only ever grows: the guard `lt` makes the update a no-op when
    // another tab already wrote the same or a greater total. A small batch
    // (the live case) also re-checks the rows it meant to create, in case
    // another tab created them first with a smaller total.
    const guarded = create.length <= 5 ? [...raise, ...create] : raise;
    for (const b of guarded) {
      await prisma.activityPing.updateMany({
        where: {
          userId,
          minute: new Date(b.minute),
          surface: b.surface,
          isDemo: b.demo,
          activeSeconds: { lt: b.activeSeconds },
        },
        data: { activeSeconds: b.activeSeconds },
      });
    }
    return NextResponse.json({
      ok: true,
      stored: create.length + raise.length,
      dropped,
    });
  } catch (e) {
    if (isMissingTable(e)) {
      return NextResponse.json({ ok: true, stored: 0, dropped, pending: true });
    }
    throw e;
  }
}
