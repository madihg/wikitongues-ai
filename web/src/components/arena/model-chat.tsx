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
import {
  applyStatusEvents,
  initColumnPhases,
  setPendingPhases,
  type ColumnPhases,
} from "@/lib/arena/column-status";
import { ColumnStatusLine } from "./column-status-line";
import { LongInputNotice } from "./long-input-notice";
import { ChatColumnBody } from "./chat-column-body";

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
  /**
   * The columns, created the moment the question is asked - never null, never
   * a global "asking N models" placeholder. A column that exists and says what
   * it is waiting for is the whole point: an empty grid tells the reviewer
   * nothing about which arm is slow.
   */
  replies: StreamingReply[];
  /** Per-column progress, folded from the same stream events (column-status). */
  phases: ColumnPhases;
  /** Wall clock at send, the origin for every column's elapsed counter. */
  startedAt: number;
}

/** How often the elapsed counters re-read the clock while a request is live.
 * Twice a second keeps the displayed whole seconds from lagging visibly
 * without re-rendering the grid on every animation frame. */
const CLOCK_TICK_MS = 500;

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
  // Set once the question has been asked but the default selection is still
  // resolving; the effect below fires it the moment a model is known.
  const [queued, setQueued] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  // The clock behind every column's elapsed counter. It only runs while a
  // request is in flight, so an idle page does no work; the counters
  // themselves appear per column and only past ELAPSED_VISIBLE_AFTER_MS.
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    if (!busy) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, [busy]);

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
    if (!question || busy) return;
    if (selected.length === 0) {
      // The default selection is still being derived from the live scores.
      // Hold the question rather than dropping it silently on the floor - the
      // reviewer pressed Enter and is entitled to know it registered.
      if (usedDefault && scoresState === "loading") setQueued(true);
      return;
    }

    const columns = selected.map((slug) => ({
      slug,
      name: candidates.find((c) => c.slug === slug)?.name ?? slug,
    }));
    const initial = initStreamingReplies(columns);

    // The history each model sees is its OWN prior turns. Interleaving another
    // model's answers would make every model's context depend on its
    // neighbours, and the comparison would stop being independent.
    const index = exchanges.length;
    const startedAt = Date.now();
    setExchanges((prev) => [
      ...prev,
      {
        question,
        replies: initial,
        phases: initColumnPhases(selected),
        startedAt,
      },
    ]);
    setDraft("");
    setBusy(true);
    setNowMs(startedAt);

    // Patch this exchange in place; every stream event funnels through here so
    // React re-renders as tokens - and as status transitions - arrive.
    const patch = (fn: (ex: Exchange) => Exchange) =>
      setExchanges((prev) => prev.map((ex, i) => (i === index ? fn(ex) : ex)));

    const fail = (message: string) =>
      patch((ex) => ({
        ...ex,
        replies: failPendingReplies(ex.replies, message),
        phases: setPendingPhases(ex.phases, "failed"),
      }));

    try {
      const responded = fetch("/api/arena/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slugs: selected,
          messages: [
            ...exchanges.flatMap((ex) => {
              const mine = ex.replies[0];
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
      // The request is out. Everything the server does before the response
      // head - auth, the per-version retrieval builds - happens in exactly
      // this window, which is why "retrieving context" is what the columns say
      // until the first byte for them arrives. (Those same stages are timed
      // into the response's Server-Timing header; see server-timing.ts.)
      patch((ex) => ({
        ...ex,
        phases: setPendingPhases(ex.phases, "retrieving"),
      }));
      const res = await responded;
      if (!res.ok) {
        // Errors keep the old JSON contract (auth, validation).
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (res.body && contentType.includes("ndjson")) {
        // The streaming path: one NDJSON event per line, deltas filling each
        // model's column as its provider produces tokens (see chat-stream.ts).
        // The SAME event batch drives the text and the status line, so a
        // column can never be writing text while its label says otherwise.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parser = new ChatStreamParser();
        const apply = (events: ChatStreamEvent[]) => {
          if (events.length === 0) return;
          patch((ex) => ({
            ...ex,
            replies: applyChatEvents(ex.replies, events),
            phases: applyStatusEvents(ex.phases, events),
          }));
        };
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          apply(parser.push(decoder.decode(value, { stream: true })));
        }
        apply(parser.flush());
        // A stream that ended without closing every column (proxy cut the
        // connection) must not leave columns spinning forever.
        fail("Response ended early");
      } else {
        // Buffered JSON fallback, the pre-streaming contract.
        const data = await res.json();
        patch((ex) => {
          const replies = (
            data.replies as Omit<
              StreamingReply,
              "done" | "revisedFor" | "revisionApplied"
            >[]
          ).map((r) => ({
            ...r,
            done: true,
            revisedFor: null,
            revisionApplied: true,
          }));
          return {
            ...ex,
            replies,
            phases: initColumnPhases(
              replies.map((r) => r.slug),
              "done",
            ),
          };
        });
      }
    } catch (e) {
      // Keep whatever already streamed in; only the unfinished columns carry
      // the failure.
      fail((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [draft, busy, selected, exchanges, candidates, usedDefault, scoresState]);

  // A question asked before the live scores landed starts the moment the
  // default selection resolves. Guarded on `queued` so it fires exactly once.
  useEffect(() => {
    if (!queued || selected.length === 0 || busy) return;
    setQueued(false);
    void send();
  }, [queued, selected, busy, send]);

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

  const selectedNames = useMemo(
    () =>
      selected.map(
        (slug) => candidates.find((c) => c.slug === slug)?.name ?? slug,
      ),
    [selected, candidates],
  );

  // The URL named nothing and the live scores that decide the default are
  // still in flight. The composer stays USABLE through this window: it is
  // sub-second, the reviewer can type, and a question asked early is queued
  // rather than refused. Disabling it made a ready page look like a broken one.
  const resolvingDefault = usedDefault && scoresState === "loading";
  const composerBlocked = selected.length === 0 && !resolvingDefault;

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
            {/* An empty page with a model already chosen is READY, not
                loading. Naming who will answer says so in one line, and it is
                the fact a reviewer actually needs before typing. */}
            {selectedNames.length > 0 && (
              <p className="mt-3 text-xs text-text-secondary">
                Ready. {selectedNames.join(", ")}{" "}
                {selectedNames.length === 1
                  ? "will answer"
                  : "will each answer"}
                .
              </p>
            )}
          </div>
        )}

        {exchanges.map((ex, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="flex justify-end">
              <p className="max-w-2xl rounded-lg bg-surface-sunken px-3 py-2 text-sm text-text-primary">
                {ex.question}
              </p>
            </div>

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
                  {/* The repair note, the answer and the failure, all three
                      independent of each other - see chat-column-body.tsx for
                      why that independence is the whole point. */}
                  <ChatColumnBody reply={r} />
                  {/* One status line per column, always present: what this
                      model is doing, and how long it has been doing it once
                      the wait is long enough to be worth counting. */}
                  <ColumnStatusLine
                    phase={ex.phases[r.slug] ?? (r.done ? "done" : "waiting")}
                    elapsedMs={nowMs - ex.startedAt}
                    detail={
                      r.done && !r.error
                        ? `${(r.latencyMs / 1000).toFixed(1)}s${
                            r.retrievedExemplars > 0
                              ? ` · ${r.retrievedExemplars} gold examples, ${r.retrievedChunks} reference chunks`
                              : ""
                          }`
                        : undefined
                    }
                  />
                </div>
              ))}
            </div>
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
              composerBlocked
                ? "Select at least one model above"
                : "Ask all selected models the same question…  (Enter to send, Shift+Enter for a new line)"
            }
            disabled={composerBlocked}
            aria-label="Message to send to every selected model"
            className="flex-1 resize-y rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || !draft.trim() || composerBlocked}
            className="rounded bg-accent px-4 py-2 text-sm text-accent-contrast hover:bg-accent-hover disabled:opacity-40"
          >
            {busy ? "Asking…" : "Ask"}
          </button>
        </div>
        {/* Pre-flight only: it never disables the button above, and the draft
            is never shortened. See long-input-notice.tsx. */}
        <LongInputNotice text={draft} />
        {queued && (
          <p className="mt-2 text-xs text-text-tertiary" aria-live="polite">
            Queued. It goes out as soon as the model list finishes loading.
          </p>
        )}
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
