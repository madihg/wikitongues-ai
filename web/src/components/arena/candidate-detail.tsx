"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Lineage {
  id: string;
  name: string;
  kind: string;
}

interface EvalRun {
  id: string;
  promptSetLabel: string;
  judgeModel: string | null;
  status: string;
  trigger: string;
  nPrompts: number;
  winRate: number | null;
  meanRubric: number | null;
  published: boolean;
  createdAt: string;
  completedAt: string | null;
  _count: { scores: number };
}

interface Candidate {
  id: string;
  name: string;
  slug: string;
  family: string;
  versionLabel: string | null;
  kind: string;
  provider: string;
  baseModelId: string;
  apiEndpoint: string | null;
  hfRepo: string | null;
  adapterUri: string | null;
  systemPrompt: string | null;
  useSystemPrompt: boolean;
  ragEnabled: boolean;
  decodingParams: Record<string, unknown> | null;
  color: string | null;
  isChampion: boolean;
  archived: boolean;
  createdAt: string;
  parent: Lineage | null;
  children: Lineage[];
  evalRuns: EvalRun[];
  _count: { evalRuns: number; modelOutputs: number };
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 border-b border-border py-2.5 last:border-0">
      <dt className="text-sm text-text-tertiary">{label}</dt>
      <dd className="text-sm text-text-primary">{children}</dd>
    </div>
  );
}

function Pill({
  on,
  onLabel,
  offLabel,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
}) {
  return on ? (
    <span className="rounded-md bg-success-subtle px-2 py-0.5 text-xs font-medium text-success">
      {onLabel}
    </span>
  ) : (
    <span className="rounded-md bg-surface-sunken px-2 py-0.5 text-xs font-medium text-text-tertiary">
      {offLabel}
    </span>
  );
}

const STATUS_TINT: Record<string, string> = {
  complete: "bg-success-subtle text-success",
  failed: "bg-danger-subtle text-danger",
};

export function CandidateDetail({ id }: { id: string }) {
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/arena/candidates/${id}`);
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load");
        const data = await r.json();
        if (active) setCandidate(data.candidate);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return <p className="text-sm text-text-tertiary">Loading candidate…</p>;
  }
  if (error) {
    return (
      <div className="rounded-md border border-danger/30 bg-danger-subtle p-3 text-sm text-danger">
        {error}
      </div>
    );
  }
  if (!candidate) return null;

  const c = candidate;
  const decoding = c.decodingParams
    ? Object.entries(c.decodingParams)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join("  ")
    : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <span
          className="inline-block h-4 w-4 shrink-0 rounded-full"
          style={{ background: c.color ?? "var(--text-muted)" }}
        />
        <h1 className="text-2xl text-text-primary">{c.name}</h1>
        {c.versionLabel && (
          <span className="font-mono text-sm text-text-tertiary">
            {c.versionLabel}
          </span>
        )}
        {c.isChampion && (
          <span className="rounded-md bg-accent-subtle px-2 py-0.5 text-xs font-medium text-accent-text">
            champion
          </span>
        )}
        {c.archived && (
          <span className="rounded-md bg-surface-sunken px-2 py-0.5 text-xs font-medium text-text-muted">
            archived
          </span>
        )}
      </header>

      {/* Lineage breadcrumb */}
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-text-secondary">
        {c.parent ? (
          <Link
            href={`/admin/arena/candidates/${c.parent.id}`}
            className="rounded-md px-2 py-1 text-accent-text transition-colors hover:bg-surface-sunken"
          >
            {c.parent.name}
          </Link>
        ) : (
          <span className="px-2 py-1 text-text-tertiary">root</span>
        )}
        <span className="text-text-muted">/</span>
        <span className="rounded-md bg-surface-sunken px-2 py-1 font-medium text-text-primary">
          {c.name}
        </span>
        {c.children.length > 0 && (
          <>
            <span className="text-text-muted">→</span>
            {c.children.map((child) => (
              <Link
                key={child.id}
                href={`/admin/arena/candidates/${child.id}`}
                className="rounded-md px-2 py-1 text-accent-text transition-colors hover:bg-surface-sunken"
              >
                {child.name}
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* Recipe card */}
      <section className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <h2 className="mb-3 text-base text-text-primary">Recipe</h2>
        <dl>
          <Row label="Kind">
            <span className="font-mono text-xs">{c.kind}</span>
          </Row>
          <Row label="Family">{c.family}</Row>
          <Row label="Base model">
            <span className="font-mono text-xs">{c.baseModelId}</span>
          </Row>
          <Row label="Provider">{c.provider}</Row>
          {c.apiEndpoint && (
            <Row label="API endpoint">
              <span className="font-mono text-xs break-all">
                {c.apiEndpoint}
              </span>
            </Row>
          )}
          {c.hfRepo && (
            <Row label="HF repo">
              <span className="font-mono text-xs break-all">{c.hfRepo}</span>
            </Row>
          )}
          {c.adapterUri && (
            <Row label="Adapter">
              <span className="font-mono text-xs break-all">
                {c.adapterUri}
              </span>
            </Row>
          )}
          <Row label="RAG">
            <Pill on={c.ragEnabled} onLabel="enabled" offLabel="off" />
          </Row>
          <Row label="System prompt">
            {c.useSystemPrompt && c.systemPrompt ? (
              <pre className="max-h-48 overflow-auto rounded-md bg-surface-sunken p-3 font-mono text-xs whitespace-pre-wrap text-text-secondary">
                {c.systemPrompt}
              </pre>
            ) : (
              <Pill on={false} onLabel="" offLabel="none" />
            )}
          </Row>
          <Row label="Decoding">
            {decoding ? (
              <span className="font-mono text-xs">{decoding}</span>
            ) : (
              <span className="text-text-tertiary">provider default</span>
            )}
          </Row>
          <Row label="Outputs">
            <span className="tabular-nums">{c._count.modelOutputs}</span>
          </Row>
        </dl>
      </section>

      {/* Eval runs */}
      <section className="rounded-lg border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between px-5 py-3">
          <h2 className="text-base text-text-primary">Eval runs</h2>
          <span className="text-xs text-text-tertiary">
            {c._count.evalRuns} total
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border text-left text-text-secondary">
                <th className="px-5 py-2 font-medium">Prompt set</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Judge</th>
                <th className="px-3 py-2 text-right font-medium">Prompts</th>
                <th className="px-3 py-2 text-right font-medium">Win rate</th>
                <th className="px-3 py-2 text-right font-medium">Scores</th>
                <th className="px-5 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {c.evalRuns.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-6 text-center text-text-tertiary"
                  >
                    No eval runs yet for this candidate.
                  </td>
                </tr>
              ) : (
                c.evalRuns.map((run) => (
                  <tr
                    key={run.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-5 py-2 text-text-primary">
                      {run.promptSetLabel}
                      {run.published && (
                        <span className="ml-2 text-xs text-success">
                          published
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                          STATUS_TINT[run.status] ??
                          "bg-surface-sunken text-text-secondary"
                        }`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-text-secondary">
                      {run.judgeModel ? (
                        <span className="font-mono text-xs">
                          {run.judgeModel}
                        </span>
                      ) : (
                        <span className="text-text-tertiary">human-only</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                      {run.nPrompts}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                      {run.winRate != null
                        ? `${Math.round(run.winRate * 100)}%`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                      {run._count.scores}
                    </td>
                    <td className="px-5 py-2 text-text-tertiary">
                      {new Date(run.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
