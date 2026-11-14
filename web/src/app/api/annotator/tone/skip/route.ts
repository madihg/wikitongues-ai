import { NextResponse } from "next/server";
import { jsonBody, toneUser } from "@/lib/tone/tone-auth";
import { skipToneItem } from "@/lib/tone/tone-pass";

/** POST /api/annotator/tone/skip: "Skip this one". Body: { itemId }. The
 *  item does not come back to the caller. */
export async function POST(req: Request) {
  const me = await toneUser();
  if ("error" in me) return me.error;
  const body = await jsonBody(req);
  const itemId = typeof body?.itemId === "string" ? body.itemId : "";
  if (!itemId) {
    return NextResponse.json({ error: "itemId is required" }, { status: 400 });
  }
  const res = await skipToneItem(me.userId, itemId);
  return NextResponse.json(res.body, { status: res.status });
}
