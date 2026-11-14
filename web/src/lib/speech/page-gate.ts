import { forbidden, notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  canUseLab,
  canUseSpeech,
  speechLabEnabled,
  speechLayerAnnotatorsEnabled,
} from "@/lib/lab-flags";

/**
 * The page-level gate for /lab/speech/*: flag off is a 404, a signed-in or
 * signed-out visitor who is not a researcher is a 403. Called by the layout
 * AND by every page, so a page can never render without it. Note the HTTP
 * status stays 200: the (app) shell is a client component that renders
 * "Loading..." on the server, so the visitor sees the Next 404 or 403 page
 * (and no lab markup is ever in the HTML) but the status line cannot change.
 * The API routes enforce the same rules with real 404 and 403 statuses
 * (src/lib/speech/lab-route.ts).
 *
 * With the annotator layer on, an annotator who lands on a lab page is not
 * refused: they are sent to the matching /speak page (`annotatorRedirect`).
 * The layout passes `allowSpeakers` so it lets such a visitor through to the
 * page's own redirect; a page with no redirect (Recordings) still refuses.
 */
export async function requireLabPage(
  options: { annotatorRedirect?: string; allowSpeakers?: boolean } = {},
): Promise<"researcher" | "speaker"> {
  if (!speechLabEnabled()) notFound();
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (canUseLab(role)) return "researcher";
  if (
    canUseSpeech(role, { lab: true, layer: speechLayerAnnotatorsEnabled() })
  ) {
    if (options.annotatorRedirect) redirect(options.annotatorRedirect);
    if (options.allowSpeakers) return "speaker";
  }
  forbidden();
}

/**
 * The page gate for /speak/*: flag off is a 404; a researcher, or an
 * annotator while the annotator layer is on, may enter; anyone else is a 403.
 */
export async function requireSpeakPage(): Promise<void> {
  if (!speechLabEnabled()) notFound();
  const session = await getServerSession(authOptions);
  const allowed = canUseSpeech(session?.user?.role, {
    lab: true,
    layer: speechLayerAnnotatorsEnabled(),
  });
  if (!allowed) forbidden();
}
