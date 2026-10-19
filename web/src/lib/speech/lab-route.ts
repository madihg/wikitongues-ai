import { NextResponse } from "next/server";
import { requireResearcher } from "@/lib/api-auth";
import { speechLabEnabled } from "@/lib/lab-flags";

/**
 * The gate every /api/lab/speech/* and /api/lab/consent route opens with:
 *   1. flag off  -> 404, before anything else, so a dark lab looks absent
 *      to everyone including signed-out callers;
 *   2. not signed in -> 401, not a researcher -> 403 (requireResearcher).
 * The order matters: the 404 must not depend on who is asking.
 */
export async function labGate(): Promise<
  { error: NextResponse; userId: null } | { error: null; userId: string }
> {
  if (!speechLabEnabled()) {
    return {
      error: NextResponse.json({ error: "Not found" }, { status: 404 }),
      userId: null,
    };
  }
  const guard = await requireResearcher();
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
