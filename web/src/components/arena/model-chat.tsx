"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  MAX_CHAT_MODELS,
  buildShareUrl,
  parseChatSelection,
  serializeChatSelection,
  toggleChatModel,
} from "@/lib/arena/chat-selection";

export interface ChatCandidate {
  slug: string;
  name: string;
  kind: string;
  ragEnabled: boolean;
  /** Leak-free chrF, when the candidate has been scored. Null otherwise. */
  score: number | null;
}

interface Reply {
  slug: string;
  name: string;
  text: string;
  latencyMs: number;
  retrievedChunks: number;
  retrievedExemplars: number;
  error: string | null;
}

interface Exchange {
  question: string;
  /** Null while in flight. */
  replies: Reply[] | null;
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

  const { slugs: selected, droppedUnknown } = useMemo(
    () => parseChatSelection(searchParams.toString(), availableSlugs),
    [searchParams, availableSlugs],
  );

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
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setExchanges((prev) =>
        prev.map((ex, i) =>
          i === index ? { ...ex, replies: data.replies as Reply[] } : ex,
        ),
      );
    } catch (e) {
      setExchanges((prev) =>
        prev.map((ex, i) =>
          i === index
            ? {
                ...ex,
                replies: selected.map((slug) => ({
                  slug,
                  name: candidates.find((c) => c.slug === slug)?.name ?? slug,
                  text: "",
                  latencyMs: 0,
                  retrievedChunks: 0,
                  retrievedExemplars: 0,
                  error: (e as Error).message,
                })),
              }
            : ex,
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
      <div className="rounded border border-border bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-text-primary">
            Models in this conversation
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-tertiary">
              {selected.length} of {MAX_CHAT_MODELS} max
            </span>
            <button
              type="button"
              onClick={copyLink}
              className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-border-strong hover:text-text-primary"
            >
              {copied ? "Link copied" : "Copy link to share"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {candidates.map((c) => {
            const on = selected.includes(c.slug);
            const atCap = !on && selected.length >= MAX_CHAT_MODELS;
            return (
              <button
                key={c.slug}
                type="button"
                aria-pressed={on}
                disabled={atCap}
                onClick={() => setSelection(toggleChatModel(selected, c.slug))}
                title={
                  atCap
                    ? `Deselect one first - at most ${MAX_CHAT_MODELS} models per message`
                    : c.ragEnabled
                      ? "Retrieval: community gold exemplars plus reference chunks"
                      : c.kind === "sft"
                        ? "Fine-tuned on community gold, no retrieval"
                        : "Untuned baseline, no retrieval"
                }
                className={[
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  on
                    ? "border-accent bg-accent text-accent-contrast"
                    : "border-border text-text-secondary hover:border-border-strong hover:text-text-primary",
                  atCap ? "cursor-not-allowed opacity-40" : "",
                ].join(" ")}
              >
                {c.name}
                <span
                  className={on ? "ml-2 opacity-70" : "ml-2 text-text-tertiary"}
                >
                  {c.ragEnabled
                    ? "retrieval"
                    : c.kind === "sft"
                      ? "fine-tuned"
                      : "baseline"}
                </span>
              </button>
            );
          })}
        </div>

        {droppedUnknown.length > 0 && (
          <p className="mt-3 text-xs text-warning">
            {droppedUnknown.length} model
            {droppedUnknown.length === 1 ? "" : "s"} in this link no longer
            exist and {droppedUnknown.length === 1 ? "was" : "were"} skipped.
          </p>
        )}
        <p className="mt-3 text-xs text-text-tertiary">
          The label beside each name is how that model gets its Igala:{" "}
          <span className="text-text-secondary">retrieval</span> looks up
          community answers and reference material at question time,{" "}
          <span className="text-text-secondary">fine-tuned</span> was trained on
          community answers,{" "}
          <span className="text-text-secondary">baseline</span> is the model
          untouched. Automatic scores live on the Automatic eval tab and are not
          shown here on purpose - a number beside a chat window invites reading
          it as a quality verdict, which it is not. The selection is held in
          this page&apos;s address, so the link above opens on exactly these
          models.
        </p>
      </div>

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
                        {r.text || (
                          <span className="text-text-tertiary">
                            (empty response)
                          </span>
                        )}
                      </p>
                    )}
                    <p className="mt-3 text-[11px] text-text-tertiary">
                      {(r.latencyMs / 1000).toFixed(1)}s
                      {r.retrievedExemplars > 0 &&
                        ` · ${r.retrievedExemplars} gold examples, ${r.retrievedChunks} reference chunks`}
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
                ? "Select at least one model above"
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
