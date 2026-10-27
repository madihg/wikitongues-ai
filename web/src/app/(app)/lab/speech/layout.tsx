import { requireLabPage } from "@/lib/speech/page-gate";
import { LabBand } from "@/components/lab/lab-band";
import { SessionLine } from "@/components/lab/session-line";

/**
 * Gate and frame for the Speech Lab pages. Flag off: notFound, so a dark lab
 * looks absent. Flag on but not a researcher (an annotator, a learner, or
 * nobody): 403. The API routes enforce the same rules independently; this is
 * the page-level half. The ink band bleeds out of the app shell's padding
 * (-m-8) so it runs edge to edge, then the page continues on the light
 * surface.
 */
// Decided per request, never at build time: the flag and the session are both
// read here, and a prerendered 404 would freeze the flag into the build.
export const dynamic = "force-dynamic";

export default async function SpeechLabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireLabPage();

  return (
    <div className="-m-8 min-h-full">
      <LabBand />
      <SessionLine />
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-8 sm:py-8">
        {children}
      </div>
    </div>
  );
}
