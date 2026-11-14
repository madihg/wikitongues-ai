import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { requireResearcher } from "@/lib/api-auth";
import { authOptions } from "@/lib/auth";
import {
  canUseSpeech,
  speechLabEnabled,
  speechLayerAnnotatorsEnabled,
} from "@/lib/lab-flags";

/**
 * Who a route is for. "researcher" (the default) is requireResearcher, as
 * before. "speaker" is the speaker side of the lab: researchers always, and
 * annotators when SPEECH_LAYER_ANNOTATORS is also on (canUseSpeech).
 */
export type LabAudience = "researcher" | "speaker";

/**
 * The gate every /api/lab/speech/* and /api/lab/consent route opens with:
 *   1. flag off  -> 404, before anything else, so a dark lab looks absent
 *      to everyone including signed-out callers;
 *   2. not signed in -> 401, not allowed for the audience -> 403.
 * The order matters: the 404 must not depend on who is asking. With the
 * annotator layer off, the speaker audience behaves exactly like the
 * researcher audience.
 */
export async function labGate(
  options: { audience?: LabAudience } = {},
): Promise<
  { error: NextResponse; userId: null } | { error: null; userId: string }
> {
  if (!speechLabEnabled()) {
    return {
      error: NextResponse.json({ error: "Not found" }, { status: 404 }),
      userId: null,
    };
  }
  const guard = await requireResearcher();
  if (
    options.audience === "speaker" &&
    guard.error?.status === 403 &&
    speechLayerAnnotatorsEnabled()
  ) {
    const session = await getServerSession(authOptions);
    if (
      session?.user?.id &&
      canUseSpeech(session.user.role, { lab: true, layer: true })
    ) {
      return { error: null, userId: session.user.id };
    }
  }
  if (guard.error || !guard.userId) {
    return {
      error:
        guard.error ??
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      userId: null,
    };
  }
  return { error: null, userId: guard.userId };
}
