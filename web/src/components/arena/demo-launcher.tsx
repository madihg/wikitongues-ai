"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface DemoSession {
  id: string;
  label: string;
  createdAt: string;
  endedAt: string | null;
}

export function DemoLauncher() {
  const [sessions, setSessions] = useState<DemoSession[]>([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<{ id: string; url: string } | null>(
    null,
  );

  async function load() {
    try {
      const r = await fetch("/api/arena/demo-sessions");
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
      setSessions((await r.json()).sessions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/arena/demo-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label || "Demo session" }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed to start");
      const d = await r.json();
      setLatest({ id: d.session.id, url: d.annotateUrl });
      setLabel("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm text-text-secondary">
        Start a testing session to walk someone through the real annotation
        episode live. Everything submitted under it is flagged as demo data and
        is <strong>never</strong> exported for training, counted on the
        leaderboard, or used as a fine-tune source.
      </p>

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger-subtle p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 shadow-sm sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-text-secondary">Session label</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Demo for the advisory council"
            className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-accent"
          />
        </label>
        <button
          onClick={start}
          disabled={busy}
          className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? "Starting…" : "Start demo session"}
        </button>
      </div>

      {latest && (
        <div className="rounded-lg border border-success/30 bg-success-subtle p-5">
          <div className="text-sm font-medium text-success">
            Demo session ready
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            Open this link (or share your screen) to run the walkthrough:
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link
              href={latest.url}
              className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-hover"
            >
              Open the demo episode
            </Link>
            <code className="rounded bg-surface px-2 py-1 font-mono text-xs text-text-tertiary">
              {latest.url}
            </code>
          </div>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">
          Recent demo sessions
        </h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-text-tertiary">No demo sessions yet.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface p-3 text-sm shadow-sm"
              >
                <div>
                  <span className="text-text-primary">{s.label}</span>
                  <span className="ml-2 font-mono text-xs text-text-muted">
                    {s.id.slice(0, 8)}
                  </span>
                </div>
                <Link
                  href={`/annotator/annotate?demo=${s.id}`}
                  className="cursor-pointer rounded-md border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-sunken"
                >
                  Open
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
