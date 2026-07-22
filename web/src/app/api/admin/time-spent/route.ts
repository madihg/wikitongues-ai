import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";
import { sessionize, minutesSince } from "@/lib/time-sessions";

/**
 * GET /api/admin/time-spent — researcher-gated estimate of time-on-platform
 * per person with a login.
 *
 * There is no session tracking (JWT auth, no heartbeats), so "time spent"
 * cannot be measured directly. Instead we collect every timestamp of real
 * (isDemo=false, where that column exists) annotation activity per user -
 * pairwise picks, cold answers, output edits, rubric axis scores, and prompt
 * flags/skips - and derive an estimate via src/lib/time-sessions.ts:
 * consecutive events close together fold into one session, plus a small
 * lead-in per session for the reading/writing that preceded it.
 *
 * Only annotatorId + createdAt are selected from each work table to keep the
 * queries lean; only users with at least one event are returned.
 */
export async function GET() {
  const { error } = await requireResearcher();
  if (error) return error;

  const [pairwise, coldAnswers, outputEdits, rubricScores, promptFlags] =
    await Promise.all([
      prisma.pairwiseComparison.findMany({
        where: { isDemo: false },
        select: { annotatorId: true, createdAt: true },
      }),
      prisma.coldAuthorAnswer.findMany({
        where: { isDemo: false },
        select: { annotatorId: true, createdAt: true },
      }),
      prisma.outputEdit.findMany({
        where: { isDemo: false },
        select: { annotatorId: true, createdAt: true },
      }),
      prisma.rubricAxisScore.findMany({
        where: { isDemo: false },
        select: { annotatorId: true, createdAt: true },
      }),
      // Flags/skips are activity too, and PromptFlag has no isDemo column.
      prisma.promptFlag.findMany({
        select: { annotatorId: true, createdAt: true },
      }),
    ]);

  const timestampsByUser = new Map<string, Date[]>();
  for (const row of [
    ...pairwise,
    ...coldAnswers,
    ...outputEdits,
    ...rubricScores,
    ...promptFlags,
  ]) {
    const list = timestampsByUser.get(row.annotatorId);
    if (list) {
      list.push(row.createdAt);
    } else {
      timestampsByUser.set(row.annotatorId, [row.createdAt]);
    }
  }

  if (timestampsByUser.size === 0) {
    return NextResponse.json({ users: [] });
  }

  const users = await prisma.user.findMany({
    where: { id: { in: [...timestampsByUser.keys()] } },
    select: { id: true, name: true, email: true, role: true },
  });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const result = users.map((user) => {
    const timestamps = timestampsByUser.get(user.id) ?? [];
    const { totalMinutes, sessionCount, lastActive } = sessionize(timestamps);
    return {
      id: user.id,
      name: user.name ?? user.email,
      email: user.email,
      role: user.role,
      totalMinutes,
      sessionCount,
      lastActive: lastActive?.toISOString() ?? null,
      last7DaysMinutes: minutesSince(timestamps, sevenDaysAgo),
    };
  });

  result.sort((a, b) => b.totalMinutes - a.totalMinutes);

  return NextResponse.json({ users: result });
}
