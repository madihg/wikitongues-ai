import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireResearcher } from "@/lib/api-auth";

/**
 * Demo / testing sessions. A researcher starts one to walk a guest through the
 * real annotation episode live; everything submitted under the returned session
 * id is flagged isDemo=true and excluded from training exports, the leaderboard,
 * and fine-tune source selection.
 */

export async function GET() {
  const guard = await requireResearcher();
  if (guard.error) return guard.error;

  const sessions = await prisma.demoSession.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  return NextResponse.json({ sessions });
}

export async function POST(req: Request) {
  const guard = await requireResearcher();
  if (guard.error) return guard.error;

  const body = await req.json().catch(() => ({}));
  const label =
    typeof body.label === "string" && body.label.trim()
      ? body.label.trim()
      : "Demo session";

  const session = await prisma.demoSession.create({
    data: { label, createdById: guard.userId },
  });

  return NextResponse.json({
    session,
    annotateUrl: `/annotator/annotate?demo=${session.id}`,
  });
}
