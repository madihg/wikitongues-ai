import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  canUseSpeech,
  speechLabEnabled,
  speechLayerAnnotatorsEnabled,
} from "@/lib/lab-flags";

/**
 * What the signed-in account may see of the labs, for the sidebar (a client
 * component that cannot read a server env var). Always 200 for a signed-in
 * user. `speech` is true when this account may use the speaker side of the
 * lab (canUseSpeech: a researcher with the lab on, an annotator with the lab
 * and the annotator layer on). `layer` is true when the annotator layer is
 * live (lab and SPEECH_LAYER_ANNOTATORS both on), whoever asks. With
 * SPEECH_LAYER_ANNOTATORS unset an annotator's answer is {false, false},
 * the same whether or not the lab is on, so it reveals nothing.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const lab = speechLabEnabled();
  const layer = lab && speechLayerAnnotatorsEnabled();
  return NextResponse.json({
    speech: canUseSpeech(session.user.role, { lab, layer }),
    layer,
  });
}
