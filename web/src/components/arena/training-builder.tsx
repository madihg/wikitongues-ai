"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BUCKETS, bucketLabel } from "@/lib/buckets";
import { InfoTip } from "@/components/info-tip";
import type { EvalBucket, VerificationStatus } from "@prisma/client";

interface Options {
  dpo: {
    total: number;
    byBucket: Record<string, number>;
  };
  sft: {
    total: number;
    byBucket: Record<string, number>;
    byVerification: Record<string, number>;
  };
}

interface Candidate {
  id: string;
  name: string;
  kind: string;
  baseModelId: string;
}

type Method = "sft" | "dpo";

const PROVIDERS = ["mock", "openai", "together"];
const VERIFICATIONS: VerificationStatus[] = [
  "seed",
  "single_annotator",
  "multi_annotator_verified",
  "expert_reviewed",
];

const field =
  "rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary focus-visible:border-accent";

export function TrainingBuilder() {
  const router = useRouter();
  const [options, setOptions] = useState<Options | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [method, setMethod] = useState<Method>("dpo");
  const [provider, setProvider] = useState("mock");
  const [baseCandidateId, setBaseCandidateId] = useState("");
  const [buckets, setBuckets] = useState<EvalBucket[]>([]);
  const [minVerification, setMinVerification] =
    useState<VerificationStatus>("single_annotator");

  const [submitting, setSubmitting] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [optRes, candRes] = await Promise.all([
          fetch("/api/arena/jobs/options"),
          fetch("/api/arena/candidates"),
        ]);
        if (!optRes.ok)
          throw new Error((await optRes.json()).error ?? "Failed to load");
        if (!candRes.ok)
          throw new Error((await candRes.json()).error ?? "Failed to load");
        setOptions(await optRes.json());
        setCandidates((await candRes.json()).candidates);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggleBucket(b: EvalBucket) {
    setBuckets((prev) =>
      prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b],
    );
  }

  function log(line: string) {
    setSteps((prev) => [...prev, line]);
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSteps([]);
    try {
      // 1. Create the draft job.
      log("Creating draft job…");
      const createRes = await fetch("/api/arena/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          provider,
          baseCandidateId: baseCandidateId || undefined,
          bucketFilter: buckets,
          hyperparameters:
            method === "sft" ? { minVerification } : { method: "dpo" },
        }),
      });
      if (!createRes.ok)
        throw new Error((await createRes.json()).error ?? "Create failed");
      const { job } = await createRes.json();
      log(`Job ${job.id.slice(0, 8)} created (${job.status}).`);

      // 2. Build the dataset.
      log("Building dataset (excluding held-out prompts)…");
      const buildRes = await fetch(`/api/arena/jobs/${job.id}/build`, {
        method: "POST",
      });
      if (!buildRes.ok)
        throw new Error((await buildRes.json()).error ?? "Build failed");
      const { nTrainingRows } = await buildRes.json();
      log(`Dataset built: ${nTrainingRows} training rows.`);
      if (nTrainingRows === 0) {
        log("No usable rows for this filter — nothing to launch.");
        return;
      }

      // 3. Launch with the provider.
      log(`Launching on provider "${provider}"…`);
      const launchRes = await fetch(`/api/arena/jobs/${job.id}/launch`, {
        method: "POST",
      });
      const launchBody = await launchRes.json();
      if (launchBody.error) {
        log(`Launch reported: ${launchBody.error}`);
      } else {
        log(`Launched. Status: ${launchBody.status}.`);
      }
      log("Done. View it in the job monitor.");
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      setError(msg);
      log(`Error: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  const usable =
    method === "dpo" ? (options?.dpo.total ?? 0) : (options?.sft.total ?? 0);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-danger/30 bg-danger-subtle p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Live availability */}
      <div className="grid gap-4 sm:grid-cols-2">
        <AvailabilityCard
          title="DPO pairs (from pairwise)"
          total={options?.dpo.total ?? 0}
          byBucket={options?.dpo.byBucket}
          active={method === "dpo"}
          loading={loading}
        />
        <AvailabilityCard
          title="SFT edits (from corrections)"
          total={options?.sft.total ?? 0}
          byBucket={options?.sft.byBucket}
          byVerification={options?.sft.byVerification}
          active={method === "sft"}
          loading={loading}
        />
      </div>

      <form
        onSubmit={run}
        className="grid gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm sm:grid-cols-2"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="flex items-center gap-2 text-text-secondary">
            Method
            <InfoTip width="w-80">
              Build a training set from collected annotations and launch a
              fine-tune. DPO uses winner/loser pairs from pairwise comparisons;
              SFT uses annotator corrections and cold-authored gold as
              completions. Target specific <strong>prompt categories</strong>{" "}
              (the same categories annotators work in) with the filter below;
              the per-axis rubric scores are the evaluation signal, not a
              training target yet. Held-out (test-split) prompts are always
              excluded. The &quot;mock&quot; provider simulates training; wire
              Together (or another provider) to train for real.
            </InfoTip>
          </span>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as Method)}
            className={field}
          >
            <option value="dpo">DPO (preference, from pairwise)</option>
            <option value="sft">SFT (supervised, from edits)</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-secondary">Provider</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className={field}
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
                {p === "mock" ? " (offline, default)" : " (not configured)"}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-text-secondary">
            Base candidate (the model to fine-tune from)
          </span>
          <select
            value={baseCandidateId}
            onChange={(e) => setBaseCandidateId(e.target.value)}
            className={field}
          >
            <option value="">— none / use provider default —</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.baseModelId})
              </option>
            ))}
          </select>
        </label>

        {method === "sft" && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-secondary">Min verification</span>
            <select
              value={minVerification}
              onChange={(e) =>
                setMinVerification(e.target.value as VerificationStatus)
              }
              className={field}
            >
              {VERIFICATIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        )}

        <fieldset className="flex flex-col gap-2 text-sm sm:col-span-2">
          <span className="text-text-secondary">
            Prompt-category filter (empty = all categories)
          </span>
          <div className="flex flex-wrap gap-2">
            {BUCKETS.map((b) => {
              const on = buckets.includes(b.key);
              return (
                <button
                  type="button"
                  key={b.key}
                  onClick={() => toggleBucket(b.key)}
                  className={
                    "cursor-pointer rounded-md border px-2.5 py-1 text-xs transition-colors " +
                    (on
                      ? "border-accent bg-accent-subtle text-accent-text"
                      : "border-border-strong text-text-secondary hover:bg-surface-sunken")
                  }
                >
                  {b.short}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex items-center justify-between sm:col-span-2">
          <p className="text-xs text-text-tertiary">
            {usable} usable {method.toUpperCase()} rows available before
            filtering. Held-out prompts are always excluded.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting ? "Running…" : "Create, build & launch"}
          </button>
        </div>
      </form>

      {steps.length > 0 && (
        <div className="rounded-lg border border-border bg-surface-sunken p-4">
          <p className="mb-2 text-xs font-medium text-text-secondary">
            Pipeline log
          </p>
          <ol className="space-y-1 font-mono text-xs text-text-secondary">
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function AvailabilityCard({
  title,
  total,
  byBucket,
  byVerification,
  active,
  loading,
}: {
  title: string;
  total: number;
  byBucket?: Record<string, number>;
  byVerification?: Record<string, number>;
  active: boolean;
  loading: boolean;
}) {
  return (
    <div
      className={
        "rounded-lg border bg-surface p-4 shadow-sm " +
        (active ? "border-accent" : "border-border")
      }
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm text-text-primary">{title}</h3>
        <span className="font-mono text-lg tabular-nums text-text-primary">
          {loading ? "…" : total}
        </span>
      </div>
      {byBucket && Object.keys(byBucket).length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-text-tertiary">
          {Object.entries(byBucket)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span>
                  {k === "unassigned"
                    ? "Unassigned"
                    : bucketLabel(k as EvalBucket)}
                </span>
                <span className="tabular-nums">{v}</span>
              </li>
            ))}
        </ul>
      )}
      {byVerification && Object.keys(byVerification).length > 0 && (
        <div className="mt-3 border-t border-border pt-2 text-xs text-text-tertiary">
          <p className="mb-1 text-text-muted">By verification</p>
          <ul className="space-y-1">
            {Object.entries(byVerification).map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span>{k}</span>
                <span className="tabular-nums">{v}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
