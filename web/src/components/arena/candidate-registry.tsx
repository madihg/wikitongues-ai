"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Candidate {
  id: string;
  name: string;
  slug: string;
  family: string;
  kind: string;
  provider: string;
  baseModelId: string;
  versionLabel: string | null;
  ragEnabled: boolean;
  useSystemPrompt: boolean;
  isPublic: boolean;
  archived: boolean;
  color: string | null;
  _count?: { evalRuns: number; modelOutputs: number };
}

const PROVIDERS = ["anthropic", "openai", "google", "openai-compatible"];
const KINDS = [
  "baseline",
  "rag",
  "sft",
  "dpo",
  "continued_pretrain",
  "composite",
];

const emptyForm = {
  name: "",
  provider: "anthropic",
  baseModelId: "",
  kind: "baseline",
  ragEnabled: false,
  useSystemPrompt: false,
  systemPrompt: "",
  apiEndpoint: "",
  versionLabel: "",
};

export function CandidateRegistry() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const [evalBusy, setEvalBusy] = useState<string | null>(null);
  const [evalNote, setEvalNote] = useState<string | null>(null);

  async function runEval(candidateId: string) {
    setEvalBusy(candidateId);
    setEvalNote(null);
    try {
      const created = await fetch("/api/arena/eval-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateModelId: candidateId }),
      });
      if (!created.ok)
        throw new Error((await created.json()).error ?? "Failed to create run");
      const { run } = await created.json();
      const gen = await fetch(`/api/arena/eval-runs/${run.id}/generate`, {
        method: "POST",
      });
      const genData = await gen.json();
      if (!gen.ok) throw new Error(genData.error ?? "Generation failed");
      await fetch(`/api/arena/eval-runs/${run.id}/aggregate`, {
        method: "POST",
      });
      setEvalNote(
        `Generated ${genData.generated ?? 0}/${genData.total ?? 0} held-out answers. Now collect pairwise in the annotation queue.`,
      );
      await load();
    } catch (e) {
      setEvalNote(e instanceof Error ? e.message : "Eval failed");
    } finally {
      setEvalBusy(null);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/arena/candidates");
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load");
      setCandidates((await r.json()).candidates);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/arena/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          apiEndpoint: form.apiEndpoint || undefined,
          systemPrompt: form.systemPrompt || undefined,
          versionLabel: form.versionLabel || undefined,
        }),
      });
      if (!r.ok)
        throw new Error((await r.json()).error ?? "Failed to register");
      setForm({ ...emptyForm });
      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to register");
    } finally {
      setSubmitting(false);
    }
  }

  const field =
    "rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary focus-visible:border-accent";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          A candidate is a reproducible recipe: base model + optional RAG,
          system prompt, or fine-tune artifact.
        </p>
        <button
          onClick={() => setOpen((v) => !v)}
          className="cursor-pointer rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover"
        >
          {open ? "Cancel" : "Register candidate"}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger-subtle p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {evalNote && (
        <div className="rounded-md border border-info/30 bg-info-subtle p-3 text-sm text-info">
          {evalNote}
        </div>
      )}

      {open && (
        <form
          onSubmit={submit}
          className="grid gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-secondary">Name</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Gemma + Igala DPO v1"
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-secondary">Base model id</span>
            <input
              required
              value={form.baseModelId}
              onChange={(e) =>
                setForm({ ...form, baseModelId: e.target.value })
              }
              placeholder="claude-sonnet-4-5-20250929"
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-secondary">Provider</span>
            <select
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
              className={field}
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-secondary">Kind</span>
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
              className={field}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          {form.provider === "openai-compatible" && (
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-text-secondary">
                API endpoint (self-hosted)
              </span>
              <input
                value={form.apiEndpoint}
                onChange={(e) =>
                  setForm({ ...form, apiEndpoint: e.target.value })
                }
                placeholder="https://your-vllm-or-together-endpoint/v1"
                className={field}
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-text-secondary">
              System prompt (optional)
            </span>
            <textarea
              value={form.systemPrompt}
              onChange={(e) =>
                setForm({
                  ...form,
                  systemPrompt: e.target.value,
                  useSystemPrompt: !!e.target.value,
                })
              }
              rows={2}
              className={field}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.ragEnabled}
              onChange={(e) =>
                setForm({ ...form, ragEnabled: e.target.checked })
              }
            />
            <span className="text-text-secondary">RAG enabled</span>
          </label>
          <div className="flex items-end justify-end sm:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? "Registering…" : "Register"}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-strong text-left text-text-secondary">
              <th className="px-3 py-2 font-medium">Candidate</th>
              <th className="px-3 py-2 font-medium">Kind</th>
              <th className="px-3 py-2 font-medium">Provider / model</th>
              <th className="px-3 py-2 font-medium">RAG</th>
              <th className="px-3 py-2 text-right font-medium">Eval runs</th>
              <th className="px-3 py-2 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-text-tertiary"
                >
                  Loading…
                </td>
              </tr>
            ) : candidates.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-text-tertiary"
                >
                  No candidates yet. Register one, or run{" "}
                  <span className="font-mono">pnpm seed:arena</span>.
                </td>
              </tr>
            ) : (
              candidates.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ background: c.color ?? "var(--text-muted)" }}
                      />
                      <Link
                        href={`/admin/arena/candidates/${c.id}`}
                        className="font-medium text-text-primary hover:text-accent-text"
                      >
                        {c.name}
                      </Link>
                      {c.archived && (
                        <span className="text-xs text-text-muted">
                          (archived)
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-text-secondary">
                    {c.kind}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">
                    {c.provider} ·{" "}
                    <span className="font-mono text-xs">{c.baseModelId}</span>
                  </td>
                  <td className="px-3 py-2 text-text-secondary">
                    {c.ragEnabled ? "yes" : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                    {c._count?.evalRuns ?? 0}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => runEval(c.id)}
                      disabled={evalBusy !== null}
                      className="cursor-pointer rounded-md border border-border-strong px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-sunken disabled:opacity-40"
                    >
                      {evalBusy === c.id ? "Running…" : "Run eval"}
                    </button>
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
