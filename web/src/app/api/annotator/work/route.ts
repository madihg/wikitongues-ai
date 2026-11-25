import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  canUseSpeech,
  speechLabEnabled,
  speechLayerAnnotatorsEnabled,
} from "@/lib/lab-flags";
import { toneCount } from "@/lib/tone/tone-pass";
import { countAnnotateWaiting, loadWaiting } from "@/lib/waiting";
import { parseWorkPlan, type WorkCounts } from "@/lib/work-flow";

export const dynamic = "force-dynamic";

/**
 * GET /api/annotator/work: what the one Annotate flow needs to open the right
 * kind of work for the signed-in person (lib/work-flow.ts).
 *
 *   { order: WorkKind[], runs: { [kind]: number },
 *     counts: { write, record?, check?, listen?, tone? } }
 *
 * `order` and `runs` are the leads' plan for the mixed stream
 * (ANNOTATE_ORDER, else the default: speech first, runs of 10 recordings,
 * 5 checks...). A kind is in `counts` only when the person has it: record, check
 * and listen when the speech layer is on for them, tone when tone items have
 * been given to them (waiting or already marked), write always. Each number
 * comes from the loader its queue uses (lib/waiting.ts), so a tab's count is
 * the length of the queue it opens. Unlike the sidebar counts, a research
 * lead gets numbers too: a lead may sit down and do the work like anyone.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const lab = speechLabEnabled();
  const speech = canUseSpeech(user.role, {
    lab,
    layer: lab && speechLayerAnnotatorsEnabled(),
  });
  const [write, rest, tone] = await Promise.all([
    countAnnotateWaiting(user.id),
    loadWaiting(user.id, { speech, editing: false }),
    toneCount(user.id),
  ]);
  const counts: WorkCounts = { write };
  if (speech) {
    counts.record = rest.record;
    counts.check = rest.check;
    counts.listen = rest.listen;
  }
  if (tone.waiting + tone.done > 0) counts.tone = tone.waiting;
  const plan = parseWorkPlan(process.env.ANNOTATE_ORDER);
  return NextResponse.json({ order: plan.order, runs: plan.runs, counts });
}
