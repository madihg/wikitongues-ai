"use client";

import { useEffect, useState } from "react";
import { bucketLabel } from "@/lib/buckets";
import { InfoTip } from "@/components/info-tip";
import { AnswerVariants } from "@/components/arena/answer-variants";
import type { EvalBucket } from "@prisma/client";

interface Vote {
  winner: string;
  explanation: string;
  annotator: string;
}
interface Contested {
  promptId: string;
  text: string;
  bucket: EvalBucket | null;
  votes: Vote[];
}
interface PendingEdit {
  id: string;
  correctedText: string;
  bucket: EvalBucket | null;
  annotator: { name: string | null; email: string };
  modelOutput: { prompt: { text: string } | null } | null;
}

/**
 * Collective Review. Two kinds of annotator disagreement, deliberately kept
 * apart because they mean opposite things:
 *
 *   1. Disagreements about the MODELS - two annotators picked different
 *      winners on the same comparison. Structurally near-empty while the
 *      models fail everything (see the copy below).
 *   2. Differences between our OWN answers - the same prompt written
 *      differently by different annotators. This is where the data is, and
 *      it lives in <AnswerVariants />.
 *
 * Then the pending-edit queue, which is a promotion workflow rather than a
 * disagreement.
 */
export function ContestedItems() {
  const [contested, setContested] = useState<Contested[]>([]);
  const [pending, setPending] = useState<PendingEdit[]>([]);
  const [winnerCounts, setWinnerCounts] = useState<Record<string, number>>({});
  const [judgedTotal, setJudgedTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/arena/contested");
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
      const d = await r.json();
      setContested(d.contested);
      setPending(d.pendingEdits);
      setWinnerCounts(d.winnerCounts ?? {});
      setJudgedTotal(d.judgedTotal ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function promote(editId: string) {
    await fetch("/api/arena/contested", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editId, status: "multi_annotator_verified" }),
    });
    setPending((p) => p.filter((e) => e.id !== editId));
  }

  const bothInadequate = winnerCounts["both_inadequate"] ?? 0;

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-1 flex flex-wrap items-center gap-2 text-lg text-text-primary">
          Disagreements about the models
          <InfoTip width="w-80">
            Prompts where annotators disagreed on which model answered better.
            Resolving these together raises inter-annotator agreement, which is
            what makes the leaderboard trustworthy.
          </InfoTip>
        </h2>
        <div className="mb-4 max-w-3xl space-y-2 text-sm text-text-secondary">
          <p>
            Same prompt, two annotators, different winners. This fills only when
            two annotators pick different winners on the same comparison. While
            the models are failing almost every prompt, everyone marks
            &quot;both inadequate&quot; and there is nothing to disagree about.
            An empty section here is expected right now, not a bug.
          </p>
          {judgedTotal > 0 && (
            <p className="text-xs text-text-tertiary">
              {bothInadequate} of {judgedTotal} judgments so far are &quot;both
              inadequate&quot;. This section will start filling up when the
              models get good enough to argue about.
            </p>
          )}
        </div>

        {loading && (
          <div className="py-6 text-sm text-text-tertiary">Loading…</div>
        )}
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger-subtle p-4 text-sm text-danger">
            {error}
          </div>
        )}

        {!loading &&
          !error &&
          (contested.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-tertiary">
              No two annotators have picked different winners yet. Expected -
              see above.
            </div>
          ) : (
            <div className="space-y-4">
              {contested.map((c) => (
                <div
                  key={c.promptId}
                  className="rounded-lg border border-border bg-surface p-5 shadow-sm"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {c.bucket && (
                      <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-xs text-accent-text">
                        {bucketLabel(c.bucket)}
                      </span>
                    )}
                    <span className="font-mono text-xs text-text-muted">
                      {c.promptId}
                    </span>
                  </div>
                  <p className="mb-3 break-words text-sm text-text-primary">
                    {c.text}
                  </p>
                  <div className="space-y-2">
                    {c.votes.map((v, i) => (
                      <div key={i} className="flex flex-wrap gap-x-3 text-sm">
                        <span
                          className={`font-mono font-medium ${v.winner === "a" ? "text-pick-a" : "text-pick-b"}`}
                        >
                          {v.winner.toUpperCase()}
                        </span>
                        <span className="text-text-tertiary">
                          {v.annotator}:
                        </span>
                        <span className="break-words text-text-secondary">
                          {v.explanation}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
      </section>

      <AnswerVariants />

      <section>
        <h2 className="mb-1 text-lg text-text-primary">
          Edits pending verification
        </h2>
        <p className="mb-4 max-w-3xl text-sm text-text-secondary">
          Corrections one annotator made to a model answer, with nobody else
          having looked yet. Confirm one in a session and it is promoted to
          multi-annotator-verified, which is the quality bar training data has
          to clear.
        </p>

        {!loading &&
          !error &&
          (pending.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-tertiary">
              No edits pending.
            </div>
          ) : (
            <div className="space-y-3">
              {pending.map((e) => (
                <div
                  key={e.id}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="break-words text-xs text-text-tertiary">
                      {e.modelOutput?.prompt?.text ?? ""}
                    </p>
                    <p className="igala mt-1 break-words text-sm text-text-primary">
                      {e.correctedText}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      {e.annotator.name ?? e.annotator.email}
                    </p>
                  </div>
                  <button
                    onClick={() => promote(e.id)}
                    className="shrink-0 cursor-pointer self-start rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-contrast hover:bg-accent-hover"
                  >
                    Mark verified
                  </button>
                </div>
              ))}
            </div>
          ))}
      </section>
    </div>
  );
}
