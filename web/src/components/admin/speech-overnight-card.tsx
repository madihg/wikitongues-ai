import { InfoTip } from "@/components/info-tip";
import {
  pct,
  signedPoints,
  type MetricSet,
  type OvernightView,
} from "@/lib/speech/overnight";

/**
 * "What changed overnight": the latest nightly run in one card. Three
 * states, one headline each: trained (a model was launched, with the
 * candidate's scores once they exist), skipped (nothing met a threshold, the
 * reasons say why) and failed (a step broke, the errors say which). Numbers,
 * reasons and ids only.
 */

const HEADLINE: Record<OvernightView["state"], string> = {
  trained: "Trained",
  skipped: "Skipped",
  failed: "Failed",
  running: "Running",
};

const BADGE: Record<OvernightView["state"], string> = {
  trained: "bg-success-subtle text-success",
  skipped: "bg-surface-sunken text-text-secondary",
  failed: "bg-danger-subtle text-danger",
  running: "bg-info-subtle text-info",
};

const ROWS: Array<{ key: keyof MetricSet; label: string }> = [
  { key: "cer", label: "CER" },
  { key: "werStripped", label: "WER, tones stripped" },
  { key: "werRetained", label: "WER, tones kept" },
  { key: "ter", label: "TER" },
];

function Metrics({ view }: { view: OvernightView }) {
  const c = view.candidate;
  if (!c) {
    return (
      <p className="mt-3 text-sm text-text-tertiary">
        The new model has not been scored on the exam set yet.
      </p>
    );
  }
  return (
    <table className="mt-3 w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-text-tertiary">
          <th className="py-1 font-medium">Candidate</th>
          <th className="py-1 text-right font-medium">Score</th>
          <th className="py-1 text-right font-medium">
            vs promoted
            <span className="font-normal"> (points)</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map((r) => {
          const d = view.delta?.[r.key];
          return (
            <tr key={r.key} className="border-t border-border">
              <td className="py-1.5 text-text-secondary">{r.label}</td>
              <td className="py-1.5 text-right font-mono text-text-primary">
                {pct(c.metrics[r.key])}
              </td>
              <td
                className={`py-1.5 text-right font-mono ${
                  d === undefined
                    ? "text-text-muted"
                    : d > 0
                      ? "text-danger"
                      : "text-success"
                }`}
              >
                {d === undefined ? "none promoted" : signedPoints(d)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function SpeechOvernightCard({ view }: { view: OvernightView | null }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
        What changed overnight
        <InfoTip>
          The latest nightly run. Each night the loop counts the new kept clips,
          decides whether to retrain, launches the job and scores the result on
          the frozen exam set. A person promotes; nothing goes live by itself.
        </InfoTip>
      </h2>

      {!view ? (
        <p className="mt-3 text-sm text-text-tertiary">
          The loop has not run yet. It starts at 02:00 UTC once it is switched
          on.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-semibold ${BADGE[view.state]}`}
            >
              {HEADLINE[view.state]}
            </span>
            <span className="text-sm text-text-tertiary">{view.runDate}</span>
          </div>

          <dl className="mt-3 grid grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-xs text-text-tertiary">New clips</dt>
              <dd className="font-mono text-text-primary">{view.newClips}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-tertiary">New hours</dt>
              <dd className="font-mono text-text-primary">
                {view.newHours.toFixed(1)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-tertiary">Cost</dt>
              <dd className="font-mono text-text-primary">
                ${view.costUsd.toFixed(2)}
              </dd>
            </div>
          </dl>

          {view.state === "trained" && <Metrics view={view} />}
          {view.state === "trained" && view.candidate?.regressed && (
            <p className="mt-3 rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning">
              This candidate is worse than the promoted model. Promoting it
              needs a written reason.
            </p>
          )}

          {view.reasons.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-text-secondary">
              {view.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          {view.errors.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-danger">
              {view.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          <p className="mt-4 text-xs text-text-tertiary">
            Run {view.runId}. Every step is in its log
            {view.launched.length > 0
              ? `; jobs ${view.launched.map((l) => `${l.kind} ${l.jobId}`).join(", ")}`
              : ""}
            .
          </p>
        </>
      )}
    </section>
  );
}
