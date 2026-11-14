import { NextResponse } from "next/server";
import { toneUser } from "@/lib/tone/tone-auth";
import { toneCount } from "@/lib/tone/tone-pass";

/**
 * GET /api/annotator/tone/count: { waiting, done } for the caller. The
 * sidebar shows "Pass 2: tone marks" only when one of them is above zero,
 * so nobody sees the line before items are given to them.
 */
export async function GET() {
  const me = await toneUser();
  if ("error" in me) return me.error;
  return NextResponse.json(await toneCount(me.userId));
}
