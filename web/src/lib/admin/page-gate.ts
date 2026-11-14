import { forbidden, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isOwner, isResearcher } from "@/lib/personas";
import { isResearchLead } from "./leads";

/**
 * The server-side gate for the researcher pages.
 *
 * The (app) shell and RoleGuard are client components: they hide a page from
 * a visitor who may not see it, but a server component under them still
 * renders, and its data still travels in the response. So every researcher
 * page that reads the database calls this first, and so does the /admin
 * layout. Signed out: to the login page. Signed in but not a researcher: 403.
 * The same rule RoleGuard applies in the browser (the owner passes by email).
 */
export interface ResearcherSession {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  owner: boolean;
  /** May see pay and people data: the owner, or an email in RESEARCH_LEADS. */
  lead: boolean;
}

export async function requireResearcherPage(): Promise<ResearcherSession> {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) redirect("/login");
  if (!isResearcher(user.role, user.email)) forbidden();
  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    role: user.role,
    owner: isOwner(user.email),
    lead: isResearchLead(user.email),
  };
}

/**
 * The gate for pages that show pay and people data (People). A researcher
 * who is not a lead gets the forbidden page, like an annotator would, and
 * nothing is read.
 */
export async function requireLeadPage(): Promise<ResearcherSession> {
  const who = await requireResearcherPage();
  if (!who.lead) forbidden();
  return who;
}
