import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isResearcher } from "@/lib/personas";
import { isResearchLead } from "./leads";

/**
 * The server gate for data routes that return pay and people data: hours per
 * person and its CSV, activity per person. Signed out: 401. Anyone who is
 * not a research lead, another researcher included: 403. Checked before
 * anything is read.
 */
export async function requireLead(): Promise<
  { error: NextResponse; userId: null } | { error: null; userId: string }
> {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      userId: null,
    };
  }
  if (!isResearcher(user.role, user.email) || !isResearchLead(user.email)) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
    };
  }
  return { error: null, userId: user.id };
}

/**
 * For a server page that shows one block to research leads only: is the
 * signed-in account a researcher and a lead? False for anyone else, and for
 * nobody. The block is then not rendered at all, so its data is not in the
 * page a rater receives.
 */
export async function sessionIsLead(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  return (
    !!user?.id &&
    isResearcher(user.role, user.email) &&
    isResearchLead(user.email)
  );
}
