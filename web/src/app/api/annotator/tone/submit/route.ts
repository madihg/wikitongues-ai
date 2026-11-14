import { NextResponse } from "next/server";
import { jsonBody, toneUser } from "@/lib/tone/tone-auth";
import { saveTonePass } from "@/lib/tone/tone-pass";

/**
 * POST /api/annotator/tone/submit: save the caller's tone-marked copy of one
 * item. Body: { itemId, text, keepAsCorrection?, unsureWords?, note?,
 * activeSeconds? }. If anything other than tone marks changed, the answer is
 * 409 with code "non_tone_change" unless keepAsCorrection is true; then the
 * correction is stored as a flag beside a tone-only text. Saving again for
 * the same item updates the caller's own row. Pass 1 is never written.
 */
export async function POST(req: Request) {
  const me = await toneUser();
  if ("error" in me) return me.error;
  const body = await jsonBody(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const res = await saveTonePass({ userId: me.userId, body });
  return NextResponse.json(res.body, { status: res.status });
}
