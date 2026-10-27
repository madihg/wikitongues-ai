import { forbidden, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canUseLab, speechLabEnabled } from "@/lib/lab-flags";

/**
 * The page-level gate for /lab/speech/*: flag off is a 404, a signed-in or
 * signed-out visitor who is not a researcher is a 403. Called by the layout
 * AND by every page, so a page can never render without it. Note the HTTP
 * status stays 200: the (app) shell is a client component that renders
 * "Loading..." on the server, so the visitor sees the Next 404 or 403 page
 * (and no lab markup is ever in the HTML) but the status line cannot change.
 * The API routes enforce the same rules with real 404 and 403 statuses
 * (src/lib/speech/lab-route.ts).
 */
export async function requireLabPage(): Promise<void> {
  if (!speechLabEnabled()) notFound();
  const session = await getServerSession(authOptions);
  if (!canUseLab(session?.user?.role)) forbidden();
}
