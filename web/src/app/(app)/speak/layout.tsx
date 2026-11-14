import { requireSpeakPage } from "@/lib/speech/page-gate";
import { SpeakBand } from "@/components/lab/lab-band";
import { SessionLine } from "@/components/lab/session-line";

/**
 * Gate and frame for the speaker pages (/speak, /speak/listen, /speak/check,
 * /speak/profile): the speaker side of the Speech Lab, for researchers and,
 * with SPEECH_LAYER_ANNOTATORS on, annotators. Flag off: notFound, so the
 * layer looks absent. Anyone else: 403. The API routes enforce the same
 * rules independently (src/lib/speech/lab-route.ts).
 */
// Decided per request: the flags and the session are read here.
export const dynamic = "force-dynamic";

export default async function SpeakLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSpeakPage();

  return (
    <div className="-m-8 min-h-full">
      <SpeakBand />
      <SessionLine />
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-8 sm:py-8">
        {children}
      </div>
    </div>
  );
}
