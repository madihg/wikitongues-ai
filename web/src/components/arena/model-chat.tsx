"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  buildShareUrl,
  parseChatSelection,
  serializeChatSelection,
} from "@/lib/arena/chat-selection";
import {
  addCompare,
  defaultChatSelection,
  rankChatCandidates,
  removeModel,
  selectOnly,
  type PickerCandidate,
} from "@/lib/arena/chat-picker";
import { ModelPicker, type ScoresState } from "./model-picker";
import {
  ChatStreamParser,
  applyChatEvents,
  failPendingReplies,
  initStreamingReplies,
  type ChatStreamEvent,
  type StreamingReply,
} from "@/lib/arena/chat-stream";

/** What the page hands the picker; the approach label is derived server-side
 * by approachLabel so it cannot drift from the scoreboard's. */
export type ChatCandidate = PickerCandidate;

/** Live agreement scores keyed by candidate name, or the fetch's fate. */
type ScoresFetch =
  | { status: "loading" }
  | { status: "ready"; byName: Map<string, number | null> }
  | { status: "error" };

interface Exchange {
  question: string;
  /** Null until the first byte of the response; then live streaming columns. */
  replies: StreamingReply[] | null;
}

/**
 * Talk to several candidates at once and read their answers side by side.
 *
 * The selection lives in the URL, not in component state or localStorage, so a
 * curated set can be handed to a native speaker as a link and she opens exactly
 * what was chosen for her. Every selection change rewrites the query string,
 * which means the address bar is always a shareable description of what is on
 * screen.
 *
 * Broadcast rather than one-model-at-a-time: the useful judgement is
 * comparative. A speaker reading four answers to one question spots the Yoruba
 * one immediately, where four separate conversations would each look plausible.
 */
export function ModelChat({ candidates }: { candidates: ChatCandidate[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const availableSlugs = useMemo(
    () => candidates.map((c) => c.slug),
    [candidates],
  );

  // Live agreement scores, from the same computation as the scoreboard
  // (computeMethodMetrics behind /api/public/method-metrics, cached
  // server-side). The picker's order and its default both fall out of this
  // data - nothing here names a model.
  const [scores, setScores] = useState<ScoresFetch>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/public/method-metrics");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: {
          candidates?: { name: string; agreementScore: number | null }[];
        } = await res.json();
        if (cancelled) return;
        setScores({
          status: "ready",
          byName: new Map(
            (data.candidates ?? []).map((c) => [c.name, c.agreementScore]),
          ),
        });
      } catch {
        if (!cancelled) setScores({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const scoresState: ScoresState = scores.status;
  const ranked = useMemo(
    () =>
      rankChatCandidates(
        candidates,
        scores.status === "ready" ? scores.byName : null,
      ),
    [candidates, scores],
  );

  const {
    slugs: parsedSlugs,
    droppedUnknown,
    usedDefault,
  } = useMemo(
    () => parseChatSelection(searchParams.toString(), availableSlugs),
    [searchParams, availableSlugs],
  );

  // The default (URL names nothing) is the live leader, alone. While scores
  // are still loading the default is deliberately empty rather than a guess:
  // preselecting the fallback leader and then swapping it once scores land
  // would silently change which model the first question goes to.
  const selected = useMemo(() => {
    if (!usedDefault) return parsedSlugs;
    if (scores.status === "loading") return [];
    return defaultChatSelection(ranked);
  }, [usedDefault, parsedSlugs, scores.status, ranked]);

  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [exchanges]);

  const setSelection = useCallback(
    (next: string[]) => {
      const qs = serializeChatSelection(next);
      // replace, not push: flipping models is not a navigation step a reviewer
      // should have to click Back through.
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const send = useCallback(async () => {
    const question = draft.trim();
    if (!question || busy || selected.length === 0) return;

    // The history each model sees is its OWN prior turns. Interleaving another
    // model's answers would make every model's context depend on its
    // neighbours, and the comparison would stop being independent.
    const index = exchanges.length;
    setExchanges((prev) => [...prev, { question, replies: null }]);
    setDraft("");
    setBusy(true);

    // Patch this exchange's columns in place; every stream event funnels
    // through here so React re-renders as tokens arrive.
    const patch = (
      fn: (replies: StreamingReply[] | null) => StreamingReply[],
    ) =>
      setExchanges((prev) =>
        prev.map((ex, i) =>
          i === index ? { ...ex, replies: fn(ex.replies) } : ex,
        ),
      );

    try {
      const res = await fetch("/api/arena/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slugs: selected,
          messages: [
            ...exchanges.flatMap((ex) => {
              const mine = ex.replies?.[0];
              return mine
                ? [
                    { role: "user" as const, content: ex.question },
                    { role: "assistant" as const, content: mine.text },
                  ]
                : [{ role: "user" as const, content: ex.question }];
            }),
            { role: "user" as const, content: question },
          ],
        }),
      });
      if (!res.ok) {
        // Errors keep the old JSON contract (auth, validation).
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (res.body && contentType.includes("ndjson")) {
        // The streaming path: one NDJSON event per line, deltas filling each
        // model's column as its provider produces tokens (see chat-stream.ts).
        const initial = initStreamingReplies(
          selected.map((slug) => ({
            slug,
            name: candidates.find((c) => c.slug === slug)?.name ?? slug,
          })),
        );
        patch(() => initial);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parser = new ChatStreamParser();
        const apply = (events: ChatStreamEvent[]) => {
          if (events.length > 0)
            patch((replies) => applyChatEvents(replies ?? initial, events));
        };
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          apply(parser.push(decoder.decode(value, { stream: true })));
        }
        apply(parser.flush());
        // A stream that ended without closing every column (proxy cut the
        // connection) must not leave columns spinning forever.
        patch((replies) =>
          failPendingReplies(replies ?? initial, "Response ended early"),
        );
      } else {
        // Buffered JSON fallback, the pre-streaming contract.
        const data = await res.json();
        patch(() =>
          (data.replies as Omit<StreamingReply, "done">[]).map((r) => ({
            ...r,
            done: true,
          })),
        );
      }
    } catch (e) {
      // Keep whatever already streamed in; only the unfinished columns carry
      // the failure.
      patch((replies) =>
        failPendingReplies(
          replies ??
            initStreamingReplies(
              selected.map((slug) => ({
                slug,
                name: candidates.find((c) => c.slug === slug)?.name ?? slug,
              })),
            ),
          (e as Error).message,
        ),
      );
    } finally {
      setBusy(false);
    }
  }, [draft, busy, selected, exchanges, candidates]);

  const copyLink = useCallback(async () => {
    const url = buildShareUrl(window.location.origin, pathname, selected);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the URL is in the address bar regardless.
    }
  }, [pathname, selected]);

  const gridCols =
    selected.length >= 4
      ? "lg:grid-cols-4"
      : selected.length === 3
        ? "lg:grid-cols-3"
        : selected.length === 2
          ? "lg:grid-cols-2"
          : "lg:grid-cols-1";

  return (
    <div className="flex flex-col gap-4">
      {/* ── model picker ─────────────────────────────────────────────── */}
      <ModelPicker
        ranked={ranked}
        selected={selected}
        scoresState={scoresState}
        onSelectOnly={(slug) => setSelection(selectOnly(slug))}
        onAddCompare={(slug) => setSelection(addCompare(selected, slug))}
        onRemove={(slug) => setSelection(removeModel(selected, slug))}
        onCopyLink={() => void copyLink()}
        copied={copied}
        droppedUnknown={droppedUnknown}
      />

      {/* ── transcript ───────────────────────────────────────────────── */}
      <div className="flex flex-col gap-6">
        {exchanges.length === 0 && (
          <div className="rounded border border-dashed border-border p-8 text-center">
            <p className="text-sm text-text-secondary">
              Ask something in Igala or in English. Every selected model answers
              the same question, side by side.
            </p>
            <p className="mx-auto mt-2 max-w-xl text-xs text-text-tertiary">
              Useful things to try: a greeting for a particular time of day, a
              word you expect models to confuse with Yoruba, a proverb, or a
              question that needs the respectful register.
            </p>
          </div>
        )}

        {exchanges.map((ex, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="flex justify-end">
              <p className="max-w-2xl rounded-lg bg-surface-sunken px-3 py-2 text-sm text-text-primary">
                {ex.question}
              </p>
            </div>

            {ex.replies === null ? (
              <p className="text-xs text-text-tertiary">
                Asking {selected.length} model
                {selected.length === 1 ? "" : "s"}…
              </p>
            ) : (
              <div className={`grid grid-cols-1 gap-3 ${gridCols}`}>
                {ex.replies.map((r) => (
                  <div
                    key={r.slug}
                    className={[
                      "flex flex-col rounded border p-3",
                      r.error
                        ? "border-danger bg-danger-subtle"
                        : "border-border bg-surface",
                    ].join(" ")}
                  >
                    <p className="mb-2 text-xs font-medium text-text-secondary">
                      {r.name}
                    </p>
                    {r.error ? (
                      <p className="text-xs text-danger">{r.error}</p>
                    ) : (
                      <p className="flex-1 whitespace-pre-wrap text-base leading-relaxed text-text-primary">
                        {r.text ||
                          (r.done ? (
                            <span className="text-text-tertiary">
                              (empty response)
                            </span>
                          ) : (
                            <span className="text-text-tertiary">…</span>
                          ))}
                      </p>
                    )}
                    <p className="mt-3 text-[11px] text-text-tertiary">
                      {r.done ? (
                        <>
                          {(r.latencyMs / 1000).toFixed(1)}s
                          {r.retrievedExemplars > 0 &&
                            ` · ${r.retrievedExemplars} gold examples, ${r.retrievedChunks} reference chunks`}
                        </>
                      ) : (
                        "streaming…"
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* ── composer ─────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 -mx-2 bg-surface px-2 pb-4 pt-2">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder={
              selected.length === 0
                ? scoresState === "loading" && usedDefault
                  ? "Finding the leading model…"
                  : "Select at least one model above"
                : "Ask all selected models the same question…  (Enter to send, Shift+Enter for a new line)"
            }
            disabled={selected.length === 0}
            aria-label="Message to send to every selected model"
            className="flex-1 resize-y rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || !draft.trim() || selected.length === 0}
            className="rounded bg-accent px-4 py-2 text-sm text-accent-contrast hover:bg-accent-hover disabled:opacity-40"
          >
            {busy ? "Asking…" : "Ask"}
          </button>
        </div>
        {exchanges.length > 0 && (
          <button
            type="button"
            onClick={() => setExchanges([])}
            className="mt-2 text-xs text-text-tertiary hover:text-text-secondary"
          >
            Clear conversation
          </button>
        )}
      </div>
    </div>
  );
}
