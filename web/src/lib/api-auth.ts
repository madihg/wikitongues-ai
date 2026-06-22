import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

export interface GuardResult {
  error: NextResponse | null;
  userId: string | null;
  role: string | null;
}

/** Server-side RESEARCHER gate for /api/arena/* routes. */
export async function requireResearcher(): Promise<GuardResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      userId: null,
      role: null,
    };
  }
  if (session.user.role !== "RESEARCHER") {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    };
  }
  return { error: null, userId: session.user.id, role: session.user.role };
}
