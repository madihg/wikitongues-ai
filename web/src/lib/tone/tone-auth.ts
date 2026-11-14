import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/** Who may mark tone: a signed-in annotator or researcher. Which items they
 *  get is decided by their assignments, never by the role. */
export type ToneUser =
  { error: NextResponse } | { userId: string; role: string };

export async function toneUser(): Promise<ToneUser> {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (user.role !== "ANNOTATOR" && user.role !== "RESEARCHER") {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { userId: user.id, role: user.role };
}

/** A JSON object body, or null. Never throws. */
export async function jsonBody(
  req: Request,
): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}
