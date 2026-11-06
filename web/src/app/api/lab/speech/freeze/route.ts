import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";
import { speakerPseudonym } from "@/lib/speech/manifest";

/**
 * POST /api/lab/speech/freeze { recordingIds }: freeze clips into the
 * speaker-disjoint test set (US-019). Researcher-only, 404 when the lab flag
 * is off. Sets isTestSet and nothing else.
 *
 * Refuses (409, nothing written) when:
 *  - any chosen clip is a demo clip;
 *  - any speaker of the chosen clips already has a kept, non-test clip that
 *    is not also being frozen: that speaker would sit on both sides of the
 *    exam. Freeze all of a speaker's kept clips together, or none.
 * There is no unfreeze: that is a database edit (US-019).
 */
const MAX_IDS = 500;

export async function POST(req: Request) {
  const gate = await labGate();
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => null);
  const raw = (body as { recordingIds?: unknown } | null)?.recordingIds;
  if (
    !Array.isArray(raw) ||
    raw.length === 0 ||
    raw.length > MAX_IDS ||
    !raw.every((x) => typeof x === "string" && x)
  ) {
    return NextResponse.json(
      { error: `recordingIds must be 1 to ${MAX_IDS} ids` },
      { status: 400 },
    );
  }
  const ids = [...new Set(raw as string[])];

  const chosen = await prisma.speechRecording.findMany({
    where: { id: { in: ids } },
    select: { id: true, annotatorId: true, isDemo: true },
  });
  if (chosen.length !== ids.length) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }
  if (chosen.some((c) => c.isDemo)) {
    return NextResponse.json(
      { error: "Demo clips cannot join the test set." },
      { status: 409 },
    );
  }

  const speakers = [
    ...new Set(
      chosen.map((c) => c.annotatorId).filter((s): s is string => s !== null),
    ),
  ];
  if (speakers.length > 0) {
    const others = await prisma.speechRecording.findMany({
      where: {
        annotatorId: { in: speakers },
        isTestSet: false,
        isDemo: false,
        reviewStatus: "keep",
        id: { notIn: ids },
      },
      select: { id: true, annotatorId: true },
    });
    if (others.length > 0) {
      const clash = [...new Set(others.map((o) => speakerPseudonym(o.annotatorId)))];
      return NextResponse.json(
        {
          error: `Not frozen: ${clash.length} speaker${clash.length === 1 ? "" : "s"} (${clash.join(", ")}) still ${clash.length === 1 ? "has" : "have"} kept clips outside the test set. Freeze all of a speaker's kept clips together, or none.`,
          speakers: clash,
          clips: others.length,
        },
        { status: 409 },
      );
    }
  }

  await prisma.speechRecording.updateMany({
    where: { id: { in: ids } },
    data: { isTestSet: true },
  });
  return NextResponse.json({ frozen: ids.length, ids });
}
