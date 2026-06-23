"use client";

import { useCallback, useEffect, useState } from "react";
import { InfoTip } from "@/components/info-tip";

interface JobCandidateRef {
  id: string;
  name: string;
  color: string | null;
}

interface Job {
  id: string;
  method: string;
  provider: string;
  status: string;
  baseModelId: string;
  nTrainingRows: number | null;
  costUsd: number | null;
  errorMessage: string | null;
  baseCandidate: JobCandidateRef | null;
  outputCandidate: JobCandidateRef | null;
  createdAt: string;
}

// status -> design-token pill classes
const STATUS_PILL: Record<string, string> = {
  draft: "bg-surface-sunken text-text-secondary",
  building_dataset: "bg-info-subtle text-info",
  uploading: "bg-info-subtle text-info",
  queued: "bg-info-subtle text-info",
  running: "bg-warning-subtle text-warning",
  succeeded: "bg-success-subtle text-success",
  registered: "bg-success-subtle text-success",
  failed: "bg-danger-subtle text-danger",
  cancelled: "bg-surface-sunken text-text-muted",
};

export function JobMonitor() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/arena/jobs");
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load");
      setJobs((await r.json()).jobs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function poll(id: string) {
    setPolling(id);
    setError(null);
    try {
      const r = await fetch(`/api/arena/jobs/${id}/poll`, { method: "POST" });
      const body = await r.json();
      if (body.error) setError(body.error);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Poll failed");
    } finally {
      setPolling(null);
    }
  }

  function pill(status: string) {
    return (
      <span
        className={
          "inline-block rounded-md px-2 py-0.5 text-xs font-medium " +
          (STATUS_PILL[status] ?? "bg-surface-sunken text-text-secondary")
        }
      >
        {status}
      </span>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          Each job turns collected annotations into a training set, runs it
          through a provider, and (on success) auto-registers the result as a
          new candidate with a queued held-out eval.
          <InfoTip width="w-80">
            Fine-tune jobs and their status. On success a job auto-registers its
            output as a new candidate and queues an evaluation against the
            held-out bank — closing the loop.
          </InfoTip>
        </p>
        <button
          onClick={load}
          className="cursor-pointer rounded-md border border-border-strong px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-sunken"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger-subtle p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-strong text-left text-text-secondary">
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Method</th>
              <th className="px-3 py-2 font-medium">Provider</th>
              <th className="px-3 py-2 text-right font-medium">Rows</th>
              <th className="px-3 py-2 font-medium">Base → Output</th>
              <th className="px-3 py-2 text-right font-medium">Cost</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-center text-text-tertiary"
                >
                  Loading…
                </td>
              </tr>
            ) : jobs.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-center text-text-tertiary"
                >
                  No fine-tune jobs yet. Create one to start the flywheel.
                </td>
              </tr>
            ) : (
              jobs.map((j) => (
                <tr key={j.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    {pill(j.status)}
                    {j.errorMessage && (
                      <div className="mt-1 max-w-xs truncate text-xs text-danger">
                        {j.errorMessage}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs uppercase text-text-secondary">
                    {j.method}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">
                    {j.provider}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                    {j.nTrainingRows ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">
                        {j.baseCandidate?.name ?? (
                          <span className="font-mono text-xs">
                            {j.baseModelId}
                          </span>
                        )}
                      </span>
                      <span className="text-text-muted">→</span>
                      {j.outputCandidate ? (
                        <span className="flex items-center gap-1 font-medium text-text-primary">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{
                              background:
                                j.outputCandidate.color ?? "var(--text-muted)",
                            }}
                          />
                          {j.outputCandidate.name}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                    {j.costUsd != null ? `$${j.costUsd.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {(j.status === "running" || j.status === "queued") && (
                      <button
                        onClick={() => poll(j.id)}
                        disabled={polling === j.id}
                        className="cursor-pointer rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-contrast transition-colors hover:bg-accent-hover disabled:opacity-50"
                      >
                        {polling === j.id ? "Polling…" : "Poll"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
