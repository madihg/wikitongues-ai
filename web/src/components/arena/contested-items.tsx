"use client";

import { useEffect, useState } from "react";
import { bucketLabel } from "@/lib/buckets";
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

export function ContestedItems() {
  const [contested, setContested] = useState<Contested[]>([]);
  const [pending, setPending] = useState<PendingEdit[]>([]);
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

  if (loading)
    return <div className="py-10 text-sm text-text-tertiary">Loading…</div>;
  if (error)
    return (
      <div className="rounded-md border border-danger/30 bg-danger-subtle p-4 text-sm text-danger">
        {error}
      </div>
    );

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-1 text-lg text-text-primary">
          Contested comparisons
        </h2>
        <p className="mb-4 text-sm text-text-secondary">
          Prompts where annotators disagreed on the winner. Resolve these
          together in a session.
        </p>
        {contested.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-tertiary">
            No disagreements yet.
          </div>
        ) : (
          <div className="space-y-4">
            {contested.map((c) => (
              <div
                key={c.promptId}
                className="rounded-lg border border-border bg-surface p-5 shadow-sm"
              >
                <div className="mb-2 flex items-center gap-2">
                  {c.bucket && (
                    <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-xs text-accent-text">
                      {bucketLabel(c.bucket)}
                    </span>
                  )}
                  <span className="font-mono text-xs text-text-muted">
                    {c.promptId}
                  </span>
                </div>
                <p className="mb-3 text-sm text-text-primary">{c.text}</p>
                <div className="space-y-2">
                  {c.votes.map((v, i) => (
                    <div key={i} className="flex gap-3 text-sm">
                      <span
                        className={`font-mono font-medium ${v.winner === "a" ? "text-pick-a" : "text-pick-b"}`}
                      >
                        {v.winner.toUpperCase()}
                      </span>
                      <span className="text-text-tertiary">{v.annotator}:</span>
                      <span className="text-text-secondary">
                        {v.explanation}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-lg text-text-primary">
          Edits pending verification
        </h2>
        <p className="mb-4 text-sm text-text-secondary">
          Single-annotator corrections. Promote to multi-annotator-verified once
          a session confirms them.
        </p>
        {pending.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-tertiary">
            No edits pending.
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((e) => (
              <div
                key={e.id}
                className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs text-text-tertiary">
                    {e.modelOutput?.prompt?.text ?? ""}
                  </p>
                  <p className="mt-1 font-mono text-sm text-text-primary">
                    {e.correctedText}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    {e.annotator.name ?? e.annotator.email}
                  </p>
                </div>
                <button
                  onClick={() => promote(e.id)}
                  className="shrink-0 cursor-pointer rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-contrast hover:bg-accent-hover"
                >
                  Mark verified
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
