"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InfoTip } from "@/components/info-tip";
import type { CandidateRow } from "@/lib/speech/dashboard-data";
import { pct } from "@/lib/speech/overnight";

/**
 * Candidate models with Promote. A regressed row opens a modal that needs a
 * typed reason before the button works; the server enforces the same rule.
 */
export function SpeechCandidates({ rows }: { rows: CandidateRow[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<CandidateRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function promote(c: CandidateRow, why: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/speech/candidates/${c.id}/promote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(why ? { reason: why } : {}),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Promote failed (${res.status})`);
        return;
      }
      setTarget(null);
      setReason("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
        Candidates
        <InfoTip>
          Every model the loop trained and scored. Only a person promotes. A
          model flagged &quot;worse&quot; has CER more than 1.0 point or TER more
          than 2.0 points worse than the promoted one. &quot;Retrain
          required&quot; means a speaker whose clips trained it has since
          withdrawn.
        </InfoTip>
      </h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-text-tertiary">
          No candidates yet. One appears when a trained model has been scored.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-tertiary">
                <th className="py-1 font-medium">Model</th>
                <th className="py-1 text-right font-medium">CER</th>
                <th className="py-1 text-right font-medium">TER</th>
                <th className="py-1 pl-4 font-medium">Status</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="py-2 font-mono text-xs text-text-secondary">
                    {c.system} {c.modelRef}
                  </td>
                  <td className="py-2 text-right font-mono">
                    {c.metrics ? pct(c.metrics.cer) : "n/a"}
                  </td>
                  <td className="py-2 text-right font-mono">
                    {c.metrics ? pct(c.metrics.ter) : "n/a"}
                  </td>
                  <td className="py-2 pl-4">
                    <div className="flex flex-wrap gap-1.5">
                      {c.promoted && (
                        <span className="rounded bg-success-subtle px-1.5 py-0.5 text-xs text-success">
                          promoted
                        </span>
                      )}
                      {c.regressed && (
                        <span className="rounded bg-warning-subtle px-1.5 py-0.5 text-xs text-warning">
                          worse
                        </span>
                      )}
                      {c.retrainRequired && (
                        <span className="rounded bg-danger-subtle px-1.5 py-0.5 text-xs text-danger">
                          retrain required
                        </span>
                      )}
                    </div>
                    {c.promoted && c.promoteReason && (
                      <p className="mt-1 text-xs text-text-tertiary">
                        Reason: {c.promoteReason}
                      </p>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {!c.promoted && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setError(null);
                          if (c.regressed) setTarget(c);
                          else void promote(c, "");
                        }}
                        className="cursor-pointer rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-contrast transition-colors hover:bg-accent-hover disabled:opacity-50"
                      >
                        Promote
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && !target && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      {target && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="promote-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg">
            <h3 id="promote-title" className="text-base font-semibold text-text-primary">
              Promote a worse model?
            </h3>
            <p className="mt-2 text-sm text-text-secondary">
              This candidate scores worse than the promoted model. Say why you
              are promoting it anyway; the reason is kept with the promotion.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              aria-label="Reason for promoting"
              className="mt-3 w-full rounded-md border border-border-strong bg-background p-2 text-sm text-text-primary"
            />
            {error && (
              <p role="alert" className="mt-2 text-sm text-danger">
                {error}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setTarget(null);
                  setReason("");
                  setError(null);
                }}
                className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-sunken"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || reason.trim() === ""}
                onClick={() => void promote(target, reason.trim())}
                className="cursor-pointer rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-contrast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Promote anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
