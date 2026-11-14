import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireLabPage } from "@/lib/speech/page-gate";
import { loadSpeechMeasure } from "@/lib/admin/measure/data";
import { buildMeasureView, type MeasureParams } from "@/lib/admin/measure/view";
import { SpeechAlerts } from "@/components/admin/speech-alerts";
import { SpeechMeasureAuto } from "@/components/admin/speech-measure-auto";
import { SpeechMeasureHuman } from "@/components/admin/speech-measure-human";
import { SpeechVersions } from "@/components/admin/speech-versions";
import { InfoTip } from "@/components/info-tip";

/**
 * Speech model, Measure: how good is the speech model, and how sure are we?
 *
 * Two halves, one version at a time. Automatic is what we can compute on our
 * own, with no listener. Human is what listeners decided when they heard the
 * model and a person say the same sentence without knowing which was which.
 * On a wide screen they sit side by side; on a narrow one Automatic comes
 * first.
 *
 * Every number has its plain sentence one tap away, and every percentage
 * carries the word that says how much evidence is behind it. With nothing
 * measured the page still renders: it says what is missing and how far the
 * first threshold is.
 *
 * Computed from the database per request. Numbers and ids only: this page
 * never reads a clip's audio, its text or a speaker's name.
 */
export const dynamic = "force-dynamic";

export default async function SpeechMeasurePage({
  searchParams,
}: {
  searchParams?: Promise<MeasureParams>;
}) {
  await requireLabPage();
  const params = (await searchParams) ?? {};
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 86_400_000);
  const [data, alerts] = await Promise.all([
    loadSpeechMeasure(prisma),
    // The banner the Loop tab shows: unread alerts of the last three days.
    prisma.speechAlert.findMany({
      where: {
        readAt: null,
        createdAt: { gte: threeDaysAgo },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, kind: true, message: true, createdAt: true },
    }),
  ]);
  const view = buildMeasureView(data, params);
  const options =
    view.system === "asr" ? view.recognition.options : view.voice.options;
  const selected =
    view.system === "asr" ? view.recognition.selected : view.voice.selected;

  const systemLink = (label: string, system: "asr" | "tts") => {
    const active = view.system === system;
    return (
      <Link
        href={system === "asr" ? "/admin/speech" : "/admin/speech?system=tts"}
        aria-current={active ? "page" : undefined}
        className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
          active
            ? "bg-accent-subtle text-accent-text"
            : "text-text-tertiary hover:text-text-primary"
        }`}
      >
        {label}
      </Link>
    );
  };
  const select =
    "rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text-primary";

  return (
    <div>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-text-primary">
          Speech model
          <InfoTip label="About this view" width="w-80">
            One question: is this version of the speech model better than the
            one before, and how sure are we? The left half needs no people. The
            right half is what listeners decided. Tap the i beside any number
            for what it means and when to trust it.
          </InfoTip>
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-text-tertiary">
          How good the speech model is, measured two ways: what we can compute
          on our own, and what listeners decided.
        </p>
      </div>

      <SpeechAlerts
        alerts={alerts.map((a) => ({
          ...a,
          createdAt: a.createdAt.toISOString(),
        }))}
      />

      <div className="mb-6 mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div
          role="group"
          aria-label="Which system"
          className="inline-flex rounded-md border border-border bg-surface p-0.5"
        >
          {systemLink("Recognition (speech to text)", "asr")}
          {systemLink("Voice (text to speech)", "tts")}
        </div>

        {options.length > 0 && (
          <form
            method="get"
            action="/admin/speech"
            className="flex flex-wrap items-center gap-2 text-sm text-text-secondary"
          >
            {view.system === "tts" && (
              <input type="hidden" name="system" value="tts" />
            )}
            <label className="flex items-center gap-2">
              Version
              <select name="v" defaultValue={selected ?? ""} className={select}>
                {options.map((o) => (
                  <option key={o.modelRef} value={o.modelRef}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {view.system === "asr" && options.length > 1 && (
              <label className="flex items-center gap-2">
                Compared with
                <select
                  name="vs"
                  defaultValue={view.recognition.compare ?? "none"}
                  className={select}
                >
                  <option value="none">nothing</option>
                  {options
                    .filter((o) => o.modelRef !== selected)
                    .map((o) => (
                      <option key={o.modelRef} value={o.modelRef}>
                        {o.label}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <button
              type="submit"
              className="cursor-pointer rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-sunken"
            >
              Show
            </button>
          </form>
        )}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <SpeechMeasureAuto
          system={view.system}
          recognition={view.recognition.block}
          voice={view.voice.block}
          voiceSelected={view.voice.selected}
          levels={view.levels}
          held={view.held}
          autoTableReady={view.autoTableReady}
        />
        <SpeechMeasureHuman
          half={view.human}
          checks={view.checks}
          tone={view.tone}
        />
      </div>

      <div className="mt-8">
        <SpeechVersions rows={view.versions} />
      </div>
    </div>
  );
}
