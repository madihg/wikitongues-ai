"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InfoTip } from "@/components/info-tip";
import { DECIDE_CONFIG } from "@/lib/speech/decide";

/**
 * The pause switch, the retrain thresholds and the month's spend against the
 * cap. Pausing writes the persisted row; the nightly run and every launch
 * read it.
 */
export function SpeechLoopControls({
  paused,
  monthSpendUsd,
  monthlyCapUsd,
}: {
  paused: boolean;
  monthSpendUsd: number;
  monthlyCapUsd: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const share = Math.min(1, monthlyCapUsd > 0 ? monthSpendUsd / monthlyCapUsd : 1);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/speech/loop/pause", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paused: !paused }),
      });
      if (!res.ok) setError(`Could not change the pause (${res.status})`);
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
        Loop controls
        <InfoTip>
          Pause stops every launch, including scoring, until you resume. The
          environment switch SPEECH_LOOP_ENABLED stops the nightly route
          entirely. Spend counts fine-tune jobs this month, estimated at launch
          and replaced by the worker&apos;s figure.
        </InfoTip>
      </h2>

      <div className="mt-3 flex items-center justify-between gap-4">
        <p className="text-sm text-text-secondary">
          The loop is{" "}
          <strong className="text-text-primary">{paused ? "paused" : "running"}</strong>.
        </p>
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          className="cursor-pointer rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface-sunken disabled:opacity-50"
        >
          {paused ? "Resume" : "Pause"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-5">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-text-secondary">Spend this month</span>
          <span className="font-mono text-text-primary">
            ${monthSpendUsd.toFixed(2)} of ${monthlyCapUsd.toFixed(2)}
          </span>
        </div>
        <div
          className="mt-1 h-2 overflow-hidden rounded bg-surface-sunken"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={monthlyCapUsd}
          aria-valuenow={Math.min(monthSpendUsd, monthlyCapUsd)}
          aria-label="Month spend against the cap"
        >
          <div
            className={`h-full ${share >= 1 ? "bg-danger" : "bg-accent"}`}
            style={{ width: `${(share * 100).toFixed(1)}%` }}
          />
        </div>
      </div>

      <dl className="mt-5 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-text-secondary">ASR retrains at</dt>
          <dd className="font-mono text-text-primary">
            {DECIDE_CONFIG.asrMinNewMinutes} new minutes
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-secondary">TTS retrains at</dt>
          <dd className="font-mono text-text-primary">
            {DECIDE_CONFIG.ttsMinNewStudioMinutes} new studio minutes and{" "}
            {DECIDE_CONFIG.ttsMinStudioHours} h in total
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-secondary">Per night</dt>
          <dd className="font-mono text-text-primary">at most 1 ASR and 1 TTS job</dd>
        </div>
      </dl>
    </section>
  );
}
