"use client";

import { useCallback, useEffect, useState } from "react";
import { formatClock } from "@/lib/speech/recorder";
import type { ReviewStatus } from "@/lib/speech/limits";

/**
 * The Recordings tab: the researcher review list. Each card shows the prompt,
 * the speaker's pseudonym (never the account), duration, tier, consent
 * version and review status, with an inline player on a short-lived signed
 * URL. One-tap flags: Bad audio, Wrong text, Keep. Export runs the guarded
 * export, which releases OPEN clips only (published, rights cleared,
 * consented); LICENSED clips leave only through the future gated delivery.
 */

export interface RecordingItem {
  id: string;
  promptId: string;
  promptText: string;
  answerText: string | null;
  speaker: string;
  dialect: string | null;
  durationMs: number;
  tier: "open" | "licensed" | "community_only";
  consentVersion: string | null;
  reviewStatus: ReviewStatus | null;
  rightsStatus: string;
  url: string | null;
}

const TIER_LABEL: Record<RecordingItem["tier"], string> = {
  open: "Open",
  licensed: "Licensed",
  community_only: "Community only",
};

const FILTERS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "unreviewed", label: "Unreviewed" },
  { key: "keep", label: "Keep" },
  { key: "bad_audio", label: "Bad audio" },
  { key: "wrong_text", label: "Wrong text" },
];

const FLAGS: { status: ReviewStatus; label: string }[] = [
  { status: "bad_audio", label: "Bad audio" },
  { status: "wrong_text", label: "Wrong text" },
  { status: "keep", label: "Keep" },
];

export function RecordingCard({
  item,
  onFlag,
}: {
  item: RecordingItem;
  onFlag: (id: string, status: ReviewStatus | null) => void;
}) {
  return (
    <li className="rounded-lg border border-border bg-surface p-4">
      <p className="font-mono text-xs text-text-tertiary">{item.promptId}</p>
      <p className="mt-1 text-base text-text-primary">{item.promptText}</p>
      {item.answerText && (
        <p className="igala mt-2 text-sm text-text-secondary">
          {item.answerText}
        </p>
      )}
      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-tertiary">
        <div className="flex gap-1">
          <dt>Speaker</dt>
          <dd className="font-mono text-text-secondary">{item.speaker}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Length</dt>
          <dd className="font-mono text-text-secondary">
            {formatClock(item.durationMs)}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt>Tier</dt>
          <dd className="text-text-secondary">{TIER_LABEL[item.tier]}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Consent</dt>
          <dd className="font-mono text-text-secondary">
            {item.consentVersion ?? "none"}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt>Review</dt>
          <dd className="text-text-secondary">
            {item.reviewStatus ?? "not reviewed"}
          </dd>
        </div>
      </dl>
      {item.url ? (
        <audio
          controls
          preload="none"
          src={item.url}
          className="mt-3 w-full"
          aria-label="Recording"
        />
      ) : (
        <p className="mt-3 text-xs text-text-tertiary">
          Audio unavailable right now.
        </p>
      )}
      <div
        role="group"
        aria-label="Review flags"
        className="mt-3 flex flex-wrap gap-2"
      >
        {FLAGS.map((f) => (
          <button
            key={f.status}
            type="button"
            aria-pressed={item.reviewStatus === f.status}
            onClick={() =>
              onFlag(item.id, item.reviewStatus === f.status ? null : f.status)
            }
            className={`min-h-[44px] cursor-pointer rounded-md border px-4 py-2 text-sm font-medium ${
              item.reviewStatus === f.status
                ? "border-accent bg-accent-subtle text-accent-text"
                : "border-border-strong bg-surface text-text-secondary hover:bg-surface-sunken"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </li>
  );
}

export function RecordingsView({
  items,
  filter,
  exporting,
  message,
  onFilter,
  onFlag,
  onExport,
}: {
  items: RecordingItem[];
  filter: string;
  exporting: boolean;
  message: string | null;
  onFilter: (key: string) => void;
  onFlag: (id: string, status: ReviewStatus | null) => void;
  onExport: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Filter by review status"
          className="flex flex-wrap gap-2"
        >
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => onFilter(f.key)}
              className={`min-h-[44px] cursor-pointer rounded-full border px-4 py-2 text-sm ${
                filter === f.key
                  ? "border-accent bg-accent-subtle text-accent-text"
                  : "border-border-strong bg-surface text-text-secondary hover:bg-surface-sunken"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={exporting}
          onClick={onExport}
          className="min-h-[44px] cursor-pointer rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exporting ? "Exporting..." : "Export open manifest"}
        </button>
      </div>
      <p className="text-xs text-text-tertiary">
        The manifest lists only clips chosen Open, published, rights cleared and
        consented. Community-only and test-set clips never leave.
      </p>
      <p aria-live="polite" className="text-sm text-text-secondary">
        {message}
      </p>
      {items.length === 0 ? (
        <p className="rounded-md border border-border bg-surface p-4 text-sm text-text-secondary">
          No recordings match.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <RecordingCard key={item.id} item={item} onFlag={onFlag} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function RecordingsInterface() {
  const [items, setItems] = useState<RecordingItem[] | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (status: string) => {
    setError(null);
    try {
      const res = await fetch(
        `/api/lab/speech/recordings${status ? `?status=${encodeURIComponent(status)}` : ""}`,
      );
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Could not load recordings.");
      setItems(j.recordings as RecordingItem[]);
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : "Could not load recordings.");
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  const flag = async (id: string, status: ReviewStatus | null) => {
    setMessage(null);
    const before = items;
    // Optimistic: flip the flag, restore on failure.
    setItems(
      (cur) =>
        cur?.map((i) => (i.id === id ? { ...i, reviewStatus: status } : i)) ??
        cur,
    );
    const res = await fetch("/api/lab/speech/recordings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, reviewStatus: status }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setItems(before);
      setMessage("Could not save that flag. Try again.");
    }
  };

  const exportManifest = async () => {
    setExporting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/lab/speech/export");
      if (!res.ok) throw new Error("Export failed.");
      const text = await res.text();
      const count = text.split("\n").filter(Boolean).length;
      if (count === 0) {
        setMessage("0 clips are exportable yet. Nothing was downloaded.");
      } else {
        const url = URL.createObjectURL(
          new Blob([text], { type: "application/x-ndjson" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "igala-speech-open-manifest.jsonl";
        a.click();
        URL.revokeObjectURL(url);
        setMessage(`Exported ${count} clip${count === 1 ? "" : "s"}.`);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  if (items === null)
    return <p className="text-sm text-text-tertiary">Loading...</p>;
  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}
      <RecordingsView
        items={items}
        filter={filter}
        exporting={exporting}
        message={message}
        onFilter={setFilter}
        onFlag={(id, s) => void flag(id, s)}
        onExport={() => void exportManifest()}
      />
    </div>
  );
}
