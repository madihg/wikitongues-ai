import { NextResponse } from "next/server";
import { requireResearcher } from "@/lib/api-auth";
import { jsonBody } from "@/lib/tone/tone-auth";
import { adjudicateTone } from "@/lib/tone/tone-pass";

/**
 * POST /api/admin/tone/adjudicate: the adjudicator's decision for one item.
 * Body: { itemId, agreedText }. The agreed text may differ from the first
 * version in tone marks only. Researcher only.
 */
export async function POST(req: Request) {
  const { error, userId } = await requireResearcher();
  if (error) return error;
  const body = await jsonBody(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const res = await adjudicateTone({ adjudicatorId: userId as string, body });
  return NextResponse.json(res.body, { status: res.status });
}
