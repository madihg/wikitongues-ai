import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isResearcher } from "@/lib/personas";
import { isResearchLead } from "@/lib/admin/leads";

/**
 * GET /api/admin/lead: is the signed-in account a research lead? One boolean
 * about the caller, nothing about anyone else, and never the list. The
 * sidebar asks it so it can leave out the People link for a researcher the
 * People page would refuse. It grants nothing: the page and the data routes
 * check for themselves.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isResearcher(user.role, user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ lead: isResearchLead(user.email) });
}
