import { forbidden, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isOwner, isResearcher } from "@/lib/personas";

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
  };
}
