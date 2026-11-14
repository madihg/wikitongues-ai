import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { applyAnswerEdit, loadEditEpisode } from "@/lib/answer-edit";
import { isRevisionTarget } from "@/lib/answer-revisions";
import {
  canUseSpeech,
  speechLabEnabled,
  speechLayerAnnotatorsEnabled,
} from "@/lib/lab-flags";

/**
 * The author's own door to a submitted row (annotator experience spec,
 * section 6). Any signed-in ANNOTATOR or RESEARCHER, on their OWN rows only.
 *
 * GET   the row and the other rows of the same episode, for the edit drawer.
 * PATCH change what you wrote: the answer, its meaning, the variety, the
 *       question in Igala, a correction and its reasons, the written "why",
 *       the reason on a Listen judgment. Never the choice or a score (405).
 *
 * type is one of cold | edit | pairwise | listen.
 */

const ROLES = ["ANNOTATOR", "RESEARCHER"];

type Who = { error: NextResponse } | { userId: string; role: string };

async function who(): Promise<Who> {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!ROLES.includes(user.role)) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { userId: user.id as string, role: user.role as string };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const me = await who();
  if ("error" in me) return me.error;
  const { type, id } = await params;
  if (!isRevisionTarget(type)) {
    return NextResponse.json({ error: "Unknown answer type" }, { status: 404 });
  }
  const withClips = canUseSpeech(me.role, {
    lab: speechLabEnabled(),
    layer: speechLayerAnnotatorsEnabled(),
  });
  const res = await loadEditEpisode({ type, id, userId: me.userId, withClips });
  // Where "Re-record" goes: the Record page this person already knows.
  const recordHref = !withClips
    ? null
    : me.role === "RESEARCHER"
      ? "/lab/speech"
      : "/speak";
  return NextResponse.json(
    res.status === 200 ? { ...res.body, recordHref } : res.body,
    { status: res.status },
  );
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const me = await who();
  if ("error" in me) return me.error;
  const { type, id } = await params;
  if (!isRevisionTarget(type)) {
    return NextResponse.json({ error: "Unknown answer type" }, { status: 404 });
  }
  // Guard req.json() so a bad body returns JSON 400, never a bare 500.
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const res = await applyAnswerEdit({
    type,
    id,
    body: body as Record<string, unknown>,
    userId: me.userId,
    // This door is for one's own rows only. A researcher changes another
    // person's answer text in Annotations, not here.
    role: null,
  });
  return NextResponse.json(res.body, { status: res.status });
}
