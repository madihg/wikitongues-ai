import { NextResponse } from "next/server";
import { labGate } from "@/lib/speech/lab-route";
import { countRecordWaiting } from "@/lib/speech/record-queue";

/**
 * How much speech work is waiting for the caller (GET
 * /api/lab/speech/waiting): the number beside "Speech" in the sidebar. For
 * the speaker side of the lab; 404 when the lab flag is off. `speech` is the
 * count of the caller's own answers that still wait for a clip, from the same
 * loader the Record queue uses, so the number and the queue cannot drift.
 */
export async function GET() {
  const gate = await labGate({ audience: "speaker" });
  if (gate.error) return gate.error;
  return NextResponse.json({ speech: await countRecordWaiting(gate.userId) });
}
