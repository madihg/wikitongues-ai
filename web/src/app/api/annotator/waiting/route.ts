import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isResearcher } from "@/lib/personas";
import { isResearchLead } from "@/lib/admin/leads";
import {
  canUseSpeech,
  speechLabEnabled,
  speechLayerAnnotatorsEnabled,
} from "@/lib/lab-flags";
import { countAnnotateWaiting, loadWaiting, navWaiting } from "@/lib/waiting";

export const dynamic = "force-dynamic";

/**
 * GET /api/annotator/waiting: what is waiting for the signed-in person, for
 * the count beside each sidebar link and each Speech tab.
 *
 *   { waiting: { annotate, speech, record, listen, check, fix } }
 *   { waiting: null }   for a research lead, who is not handed a queue.
 *
 * The numbers come from the loaders the queues themselves use
 * (src/lib/waiting.ts), so a count is the length of the queue its link opens.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const lead = isResearcher(user.role, user.email) && isResearchLead(user.email);
  if (lead) return NextResponse.json({ waiting: null });

  const lab = speechLabEnabled();
  const speech = canUseSpeech(user.role, {
    lab,
    layer: lab && speechLayerAnnotatorsEnabled(),
  });
  const [annotate, rest] = await Promise.all([
    countAnnotateWaiting(user.id),
    loadWaiting(user.id, { speech, editing: true }),
  ]);
  return NextResponse.json({
    waiting: navWaiting({ annotate, ...rest }, { lead, speech }),
  });
}
