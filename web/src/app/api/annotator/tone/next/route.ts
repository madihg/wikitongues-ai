import { NextResponse } from "next/server";
import { toneUser } from "@/lib/tone/tone-auth";
import { nextToneTask } from "@/lib/tone/tone-pass";

/**
 * GET /api/annotator/tone/next: the next pass-2 item given to the caller,
 * or `complete`. With ?item=<id> it reopens the caller's own saved copy of
 * that item ("Edit previous"). The task never says who wrote the first
 * version or who else is marking it.
 */
export async function GET(req: Request) {
  const me = await toneUser();
  if ("error" in me) return me.error;
  const reopen = new URL(req.url).searchParams.get("item");
  const res = await nextToneTask(me.userId, reopen);
  return NextResponse.json(res.body, { status: res.status });
}
