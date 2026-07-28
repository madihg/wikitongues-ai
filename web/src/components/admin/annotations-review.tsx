"use client";

import { useCallback, useEffect, useState } from "react";
import { BUCKETS } from "@/lib/buckets";
import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH } from "@/lib/annotations-query";

/**
 * Researcher annotation-review surface. Lists every annotation event (pairwise,
 * cold, edit) with a filter bar, opens a detail drawer on row click, and lets a
 * researcher correct cold answers + edits inline and mark them expert-reviewed.
 * Pairwise picks are read-only. Reads initial annotator/type from the deep-link.
 */

type AnnotationType = "pairwise" | "cold" | "edit";

interface AnnotatorLite {
  id: string;
  name: string | null;
  email: string;
}
interface PromptLite {
  promptId: string;
  text: string;
  bucket: string | null;
}
interface EventRow {
  type: AnnotationType;
  id: string;
  createdAt: string;
  annotator: AnnotatorLite;
  prompt: PromptLite | null;
  summary: string;
}
interface ListResponse {
  events: EventRow[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  annotators: AnnotatorLite[];
}

const TYPE_LABELS: Record<AnnotationType, string> = {
  pairwise: "Pairwise",
  cold: "Cold answer",
  edit: "Edit",
};

const VERIFICATION_LABELS: Record<string, string> = {
  seed: "Seed",
  single_annotator: "Single annotator",
  multi_annotator_verified: "Multi-annotator verified",
  expert_reviewed: "Expert reviewed",
};

function annotatorName(a: AnnotatorLite): string {
  return a.name ?? a.email;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function typePill(type: AnnotationType) {
  const cls =
    type === "pairwise"
      ? "bg-accent-subtle text-accent-text"
      : type === "cold"
        ? "bg-success-subtle text-success"
        : "bg-info-subtle text-info";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {TYPE_LABELS[type]}
    </span>
  );
}

function verificationBadge(status: string) {
  const cls =
    status === "expert_reviewed"
      ? "bg-success-subtle text-success"
      : status === "multi_annotator_verified"
        ? "bg-info-subtle text-info"
        : "bg-surface-sunken text-text-tertiary";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {VERIFICATION_LABELS[status] ?? status}
    </span>
  );
}

export function AnnotationsReview({
  initialAnnotator,
  initialType,
}: {
  initialAnnotator: string;
  initialType: string;
}) {
  const [annotatorId, setAnnotatorId] = useState(initialAnnotator);
  const [type, setType] = useState<string>(initialType);
  const [bucket, setBucket] = useState<string>("");
  const [includeDemo, setIncludeDemo] = useState(false);
  const [offset, setOffset] = useState(0);

  // `searchInput` is the live textbox value; `search` is the debounced value
  // that actually drives the fetch + pagination reset + "Showing..." label,
  // so typing doesn't fire a request (and reset to page 1) per keystroke.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EventRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (annotatorId) params.set("annotator", annotatorId);
    if (type) params.set("type", type);
    if (bucket) params.set("bucket", bucket);
    if (includeDemo) params.set("includeDemo", "true");
    if (offset > 0) params.set("offset", String(offset));
    if (search.trim()) params.set("q", search.trim());
    try {
      const res = await fetch(`/api/admin/annotations?${params.toString()}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to load annotations");
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load annotations");
    } finally {
      setLoading(false);
    }
  }, [annotatorId, type, bucket, includeDemo, offset, search]);

  useEffect(() => {
    load();
  }, [load]);

  // Any filter change resets to page 1. Setting offset in the same handler as
  // the filter (rather than in a separate effect keyed off the filters) keeps
  // it a single batched state update, so `load` only ever fires once per
  // change instead of once with the stale offset and once with the reset one.
  function updateAnnotator(v: string) {
    setAnnotatorId(v);
    setOffset(0);
  }
  function updateType(v: string) {
    setType(v);
    setOffset(0);
  }
  function updateBucket(v: string) {
    setBucket(v);
    setOffset(0);
  }
  function updateIncludeDemo(v: boolean) {
    setIncludeDemo(v);
    setOffset(0);
  }

  // Search is debounced 300ms: `updateSearch` only updates the live textbox
  // value, and the effect below commits it to `search` (which resets
  // pagination, same as the other updateX handlers) once typing pauses -
  // so a fetch + page reset only fires once per pause, not per keystroke.
  function updateSearch(v: string) {
    setSearchInput(v);
  }
  function clearSearch() {
    setSearchInput("");
    setSearch("");
    setOffset(0);
  }
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput);
      setOffset(0);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // Keep the deep-link in the address bar in sync with the annotator/type
  // filters, so a researcher can copy the URL and it reproduces the view.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (annotatorId) params.set("annotator", annotatorId);
    else params.delete("annotator");
    if (type) params.set("type", type);
    else params.delete("type");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
    );
  }, [annotatorId, type]);

  const annotators = data?.annotators ?? [];

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
        <label className="flex flex-col gap-1 text-xs font-medium text-text-tertiary">
          Annotator
          <select
            value={annotatorId}
            onChange={(e) => updateAnnotator(e.target.value)}
            className="min-w-48 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary"
          >
            <option value="">All annotators</option>
            {annotators.map((a) => (
              <option key={a.id} value={a.id}>
                {annotatorName(a)}
              </option>
            ))}
            {/* A deep-linked annotator with no visible rows still needs an entry */}
            {annotatorId && !annotators.some((a) => a.id === annotatorId) && (
              <option value={annotatorId}>Selected annotator</option>
            )}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-text-tertiary">
          Type
          <select
            value={type}
            onChange={(e) => updateType(e.target.value)}
            className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary"
          >
            <option value="">All types</option>
            <option value="pairwise">Pairwise</option>
            <option value="cold">Cold answer</option>
            <option value="edit">Edit</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-text-tertiary">
          Prompt category
          <select
            value={bucket}
            onChange={(e) => updateBucket(e.target.value)}
            className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary"
          >
            <option value="">All categories</option>
            {BUCKETS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={includeDemo}
            onChange={(e) => updateIncludeDemo(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Include demo sessions
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-text-tertiary">
          Search
          <div className="relative">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => updateSearch(e.target.value)}
              maxLength={MAX_QUERY_LENGTH}
              placeholder="Search text, answers, explanations..."
              className="w-64 rounded-md border border-border-strong bg-surface px-3 py-2 pr-7 text-sm text-text-primary"
            />
            {searchInput && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary transition-colors hover:text-text-primary"
              >
                ×
              </button>
            )}
          </div>
        </label>
      </div>

      {/* Event table */}
      {loading ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-muted shadow-sm">
          Loading annotations…
        </div>
      ) : error ? (
        <div className="rounded-md border border-danger/30 bg-danger-subtle p-4 text-sm text-danger">
          {error}
        </div>
      ) : !data || data.events.length === 0 ? (
        <EmptyState
          hasFilters={
            !!(
              annotatorId ||
              type ||
              bucket ||
              search.trim().length >= MIN_QUERY_LENGTH
            )
          }
        />
      ) : (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm text-text-secondary">
              Showing {data.offset + 1}-{data.offset + data.events.length} of{" "}
              {data.total} event{data.total === 1 ? "" : "s"}
              {search.trim().length >= MIN_QUERY_LENGTH && (
                <> for &quot;{search.trim()}&quot;</>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOffset(Math.max(0, offset - data.limit))}
                disabled={loading || data.offset === 0}
                className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-50"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setOffset(offset + data.limit)}
                disabled={loading || !data.hasMore}
                className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Annotator</th>
                  <th className="px-4 py-3">Prompt</th>
                  <th className="px-4 py-3">Summary</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((ev) => (
                  <tr
                    key={`${ev.type}:${ev.id}`}
                    onClick={() => setSelected(ev)}
                    className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-surface-sunken"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-text-tertiary">
                      {formatDateTime(ev.createdAt)}
                    </td>
                    <td className="px-4 py-3">{typePill(ev.type)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-text-primary">
                      {annotatorName(ev.annotator)}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-text-secondary">
                      {ev.prompt ? (
                        <span className="block">
                          <span className="font-mono text-xs text-text-muted">
                            {ev.prompt.promptId}
                          </span>
                          {ev.prompt.bucket && (
                            <span className="ml-2 text-xs text-text-tertiary">
                              {ev.prompt.bucket}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="max-w-sm truncate px-4 py-3 text-text-secondary">
                      {ev.summary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <DetailDrawer
          event={selected}
          onClose={() => setSelected(null)}
          onSaved={() => load()}
        />
      )}
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-10 text-center shadow-sm">
      <p className="text-sm font-medium text-text-primary">
        {hasFilters ? "No matching annotations" : "No annotations yet"}
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm text-text-tertiary">
        {hasFilters
          ? "Nothing matches these filters. Widen the annotator, type, or category, or turn on demo sessions."
          : "As annotators submit work, every pairwise pick, cold-authored answer, and inline edit will appear here — newest first — so you can read exactly what each person contributed."}
      </p>
    </div>
  );
}

// ─── Detail drawer ───────────────────────────────────────────────────────────

interface DetailBase {
  type: AnnotationType;
  id: string;
  createdAt: string;
  editable: boolean;
  annotator: AnnotatorLite;
  prompt: PromptLite | null;
}
interface PairwiseDetail extends DetailBase {
  type: "pairwise";
  winner: string;
  confidence: number | null;
  explanation: string;
  outputA: { id: string; model: string; text: string; isWinner: boolean };
  outputB: { id: string; model: string; text: string; isWinner: boolean };
  context: {
    rubricAxes: {
      axis: string;
      axisLabel: string;
      score: number | null;
      note: string | null;
    }[];
    edits: {
      id: string;
      onOutput: string;
      correctedText: string;
      rationale: string | null;
      verificationStatus: string;
    }[];
    coldAnswers: {
      id: string;
      answerText: string;
      provenance: string;
      verificationStatus: string;
    }[];
  };
}
interface ColdDetail extends DetailBase {
  type: "cold";
  answerText: string;
  provenance: string;
  consentBenchmark: boolean;
  consentTraining: boolean;
  verificationStatus: string;
}
interface EditDetail extends DetailBase {
  type: "edit";
  model: string | null;
  originalText: string;
  correctedText: string;
  rationale: string | null;
  provenance: string | null;
  consentBenchmark: boolean;
  consentTraining: boolean;
  verificationStatus: string;
}
type Detail = PairwiseDetail | ColdDetail | EditDetail;

function DetailDrawer({
  event,
  onClose,
  onSaved,
}: {
  event: EventRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/annotations/${event.type}/${event.id}`,
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to load detail");
      }
      setDetail(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load detail");
    } finally {
      setLoading(false);
    }
  }, [event.type, event.id]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // Escape closes the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-border bg-surface-raised shadow-lg">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface-raised px-6 py-4">
          <div className="flex items-center gap-2">
            {typePill(event.type)}
            <span className="text-sm text-text-tertiary">
              {formatDateTime(event.createdAt)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-border-strong px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-sunken"
          >
            Close
          </button>
        </div>

        <div className="flex-1 space-y-6 px-6 py-6">
          {loading ? (
            <p className="text-sm text-text-muted">Loading detail…</p>
          ) : error ? (
            <div className="rounded-md border border-danger/30 bg-danger-subtle p-4 text-sm text-danger">
              {error}
            </div>
          ) : detail ? (
            <DetailBody detail={detail} onSaved={onSaved} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DetailBody({
  detail,
  onSaved,
}: {
  detail: Detail;
  onSaved: () => void;
}) {
  return (
    <>
      <section>
        <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
          Annotator
        </p>
        <p className="mt-1 text-sm font-medium text-text-primary">
          {annotatorName(detail.annotator)}
        </p>
        <p className="text-xs text-text-tertiary">{detail.annotator.email}</p>
      </section>

      {detail.prompt && (
        <section>
          <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Prompt
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-xs text-text-muted">
              {detail.prompt.promptId}
            </span>
            {detail.prompt.bucket && (
              <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-xs text-accent-text">
                {detail.prompt.bucket}
              </span>
            )}
          </div>
          {detail.prompt.text && (
            <p className="mt-2 text-sm text-text-primary">
              {detail.prompt.text}
            </p>
          )}
        </section>
      )}

      {detail.type === "pairwise" && <PairwiseBody detail={detail} />}
      {detail.type === "cold" && <ColdBody detail={detail} onSaved={onSaved} />}
      {detail.type === "edit" && <EditBody detail={detail} onSaved={onSaved} />}
    </>
  );
}

function OutputCard({
  label,
  model,
  text,
  isWinner,
}: {
  label: string;
  model: string;
  text: string;
  isWinner: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        isWinner
          ? "border-success bg-success-subtle"
          : "border-border bg-surface"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-text-tertiary">
          {label} · {model}
        </span>
        {isWinner && (
          <span className="rounded-full bg-success px-2 py-0.5 text-xs font-medium text-white">
            Winner
          </span>
        )}
      </div>
      <p className="whitespace-pre-wrap text-sm text-text-primary">{text}</p>
    </div>
  );
}

function PairwiseBody({ detail }: { detail: PairwiseDetail }) {
  const winnerLabel =
    detail.winner === "a"
      ? "Picked A"
      : detail.winner === "b"
        ? "Picked B"
        : detail.winner === "tie"
          ? "Tie"
          : "Both inadequate";
  return (
    <>
      <section className="rounded-md border border-border bg-surface-sunken p-3 text-sm">
        <span className="font-medium text-text-primary">{winnerLabel}</span>
        {detail.confidence != null && (
          <span className="ml-2 text-text-tertiary">
            confidence {detail.confidence}/4
          </span>
        )}
        <p className="mt-2 text-xs text-text-tertiary">
          Pairwise picks are read-only to preserve methodological integrity.
        </p>
      </section>

      <section className="space-y-3">
        <OutputCard
          label="Output A"
          model={detail.outputA.model}
          text={detail.outputA.text}
          isWinner={detail.outputA.isWinner}
        />
        <OutputCard
          label="Output B"
          model={detail.outputB.model}
          text={detail.outputB.text}
          isWinner={detail.outputB.isWinner}
        />
      </section>

      {detail.explanation && (
        <section>
          <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Explanation
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary">
            {detail.explanation}
          </p>
        </section>
      )}

      {detail.context.rubricAxes.length > 0 ? (
        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Rubric on the winner
          </p>
          <div className="space-y-1">
            {detail.context.rubricAxes.map((r) => (
              <div
                key={r.axis}
                className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 text-sm last:border-0"
              >
                <span className="text-text-secondary">{r.axisLabel}</span>
                <span className="tabular-nums font-medium text-text-primary">
                  {r.score == null ? "N/A" : `${r.score}/5`}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : (
        (detail.winner === "tie" || detail.winner === "both_inadequate") && (
          <p className="text-xs text-text-tertiary">
            No rubric scores - the rubric scores the winning output, and this
            comparison had no winner.
          </p>
        )
      )}

      {detail.context.edits.length > 0 && (
        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Related edits (same annotator)
          </p>
          <div className="space-y-2">
            {detail.context.edits.map((e) => (
              <div
                key={e.id}
                className="rounded-md border border-border bg-surface p-3"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs text-text-tertiary">
                    on Output {e.onOutput}
                  </span>
                  {verificationBadge(e.verificationStatus)}
                </div>
                <p className="whitespace-pre-wrap text-sm text-text-primary">
                  {e.correctedText}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {detail.context.coldAnswers.length > 0 && (
        <section>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Cold / salvage answers for this prompt (same annotator)
          </p>
          <div className="space-y-2">
            {detail.context.coldAnswers.map((a) => (
              <div
                key={a.id}
                className="rounded-md border border-border bg-surface p-3"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs text-text-tertiary">
                    {a.provenance === "corrected_from_inadequate"
                      ? "Salvage"
                      : "Cold answer"}
                  </span>
                  {verificationBadge(a.verificationStatus)}
                </div>
                <p className="whitespace-pre-wrap text-sm text-text-primary">
                  {a.answerText}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function ColdBody({
  detail,
  onSaved,
}: {
  detail: ColdDetail;
  onSaved: () => void;
}) {
  return (
    <>
      <section className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
        <span className="rounded-full bg-surface-sunken px-2 py-0.5">
          {detail.provenance === "corrected_from_inadequate"
            ? "Salvage rewrite"
            : "Cold-authored (source-free)"}
        </span>
        <span>Benchmark: {detail.consentBenchmark ? "yes" : "no"}</span>
        <span>Training: {detail.consentTraining ? "yes" : "no"}</span>
      </section>

      <EditableText
        type="cold"
        id={detail.id}
        label="Answer text"
        field="answerText"
        initial={detail.answerText}
        onSaved={onSaved}
      />

      <VerificationControl
        type="cold"
        id={detail.id}
        status={detail.verificationStatus}
        onSaved={onSaved}
      />
    </>
  );
}

function EditBody({
  detail,
  onSaved,
}: {
  detail: EditDetail;
  onSaved: () => void;
}) {
  return (
    <>
      <section className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
        {detail.model && (
          <span className="rounded-full bg-surface-sunken px-2 py-0.5">
            {detail.model}
          </span>
        )}
        <span>Benchmark: {detail.consentBenchmark ? "yes" : "no"}</span>
        <span>Training: {detail.consentTraining ? "yes" : "no"}</span>
      </section>

      <section>
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-text-tertiary">
          Original output
        </p>
        <p className="whitespace-pre-wrap rounded-md border border-border bg-surface-sunken p-3 text-sm text-text-secondary">
          {detail.originalText}
        </p>
      </section>

      <EditableText
        type="edit"
        id={detail.id}
        label="Corrected text"
        field="correctedText"
        initial={detail.correctedText}
        onSaved={onSaved}
      />

      {detail.rationale && (
        <section>
          <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Rationale
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary">
            {detail.rationale}
          </p>
        </section>
      )}

      <VerificationControl
        type="edit"
        id={detail.id}
        status={detail.verificationStatus}
        onSaved={onSaved}
      />
    </>
  );
}

function EditableText({
  type,
  id,
  label,
  field,
  initial,
  onSaved,
}: {
  type: "cold" | "edit";
  id: string;
  label: string;
  field: "answerText" | "correctedText";
  initial: string;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const dirty = value.trim() !== initial.trim();

  async function save() {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/annotations/${type}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Save failed");
      setMsg("Saved");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-tertiary">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setMsg(null);
        }}
        rows={4}
        className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={save}
          disabled={!dirty || saving || value.trim().length === 0}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {msg && <span className="text-xs text-success">{msg}</span>}
        {err && <span className="text-xs text-danger">{err}</span>}
      </div>
    </section>
  );
}

function VerificationControl({
  type,
  id,
  status,
  onSaved,
}: {
  type: "cold" | "edit";
  id: string;
  status: string;
  onSaved: () => void;
}) {
  const [current, setCurrent] = useState(status);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const alreadyReviewed = current === "expert_reviewed";

  async function markReviewed() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/annotations/${type}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationStatus: "expert_reviewed" }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Update failed");
      setCurrent("expert_reviewed");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
      <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
        Verification
      </span>
      {verificationBadge(current)}
      {!alreadyReviewed && (
        <button
          onClick={markReviewed}
          disabled={saving}
          className="rounded-md border border-border-strong px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-sunken disabled:opacity-50"
        >
          {saving ? "Saving…" : "Mark expert reviewed"}
        </button>
      )}
      {err && <span className="text-xs text-danger">{err}</span>}
    </section>
  );
}
