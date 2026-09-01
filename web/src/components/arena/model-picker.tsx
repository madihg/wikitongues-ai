"use client";

import {
  MAX_COMPARE_MODELS,
  partitionPicker,
  type RankedCandidate,
} from "@/lib/arena/chat-picker";

/**
 * The chat model picker: a ranked list, not a wall of buttons.
 *
 * Rows are sorted by live Community Agreement Score (best first) with the
 * score visible on each row, so "which model is leading" is answered by
 * position, not memory. Tapping a row selects that model ALONE - comparison
 * is the explicit "+ compare" affordance, capped at MAX_COMPARE_MODELS. The
 * long tail of baselines and unscored legacy arms sits behind a disclosure.
 *
 * Purely presentational: ranking, capping and URL state live in
 * chat-picker.ts / chat-selection.ts, which keeps this renderable (and
 * testable) with static markup like benchmark-bars.
 */

export type ScoresState = "loading" | "ready" | "error";

interface ModelPickerProps {
  ranked: RankedCandidate[];
  /** Selected slugs, in column order. May exceed the compare cap when the
   * page was opened from a legacy share link - those still render fully. */
  selected: string[];
  scoresState: ScoresState;
  onSelectOnly: (slug: string) => void;
  onAddCompare: (slug: string) => void;
  onRemove: (slug: string) => void;
  onCopyLink: () => void;
  copied: boolean;
  droppedUnknown: string[];
}

function methodTitle(c: RankedCandidate): string {
  return c.ragEnabled
    ? "Retrieval: community gold exemplars plus reference chunks"
    : c.kind === "sft" || c.kind === "dpo"
      ? "Fine-tuned on community gold, no retrieval"
      : "Untuned baseline, no retrieval";
}

function ScoreChip({
  score,
  scoresState,
  selected,
}: {
  score: number | null;
  scoresState: ScoresState;
  selected: boolean;
}) {
  if (scoresState === "loading") {
    return (
      <span className="text-[11px] text-text-tertiary" aria-hidden="true">
        …
      </span>
    );
  }
  if (score === null) {
    return <span className="text-[11px] text-text-tertiary">not scored</span>;
  }
  return (
    <span
      title="Community Agreement Score on the leak-free benchmark (100 = native speaker agreement)"
      className={[
        "rounded-full border px-2 py-0.5 text-[11px] tabular-nums",
        selected
          ? "border-accent text-accent-text"
          : "border-border bg-surface-sunken text-text-secondary",
      ].join(" ")}
    >
      {score.toFixed(1)}
    </span>
  );
}

function Row({
  c,
  on,
  atCap,
  scoresState,
  onSelectOnly,
  onAddCompare,
}: {
  c: RankedCandidate;
  on: boolean;
  atCap: boolean;
  scoresState: ScoresState;
  onSelectOnly: (slug: string) => void;
  onAddCompare: (slug: string) => void;
}) {
  return (
    <div className="flex items-stretch gap-2">
      <button
        type="button"
        aria-pressed={on}
        onClick={() => onSelectOnly(c.slug)}
        title={methodTitle(c)}
        className={[
          "flex min-h-10 flex-1 items-center justify-between gap-3 rounded border px-3 py-2 text-left transition-colors",
          on
            ? "border-accent bg-accent-subtle"
            : "border-border hover:border-border-strong",
        ].join(" ")}
      >
        <span className="min-w-0">
          <span className="text-sm text-text-primary">{c.name}</span>
          <span className="ml-2 text-xs text-text-tertiary">{c.approach}</span>
        </span>
        <ScoreChip score={c.score} scoresState={scoresState} selected={on} />
      </button>
      {!on && (
        <button
          type="button"
          disabled={atCap}
          onClick={() => onAddCompare(c.slug)}
          aria-label={`Add ${c.name} to the comparison`}
          title={
            atCap
              ? `Remove one first - the grid compares at most ${MAX_COMPARE_MODELS} side by side`
              : `Compare ${c.name} alongside the current selection`
          }
          className="min-h-10 shrink-0 rounded border border-border px-3 text-xs text-text-secondary hover:border-border-strong hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          + compare
        </button>
      )}
    </div>
  );
}

export function ModelPicker({
  ranked,
  selected,
  scoresState,
  onSelectOnly,
  onAddCompare,
  onRemove,
  onCopyLink,
  copied,
  droppedUnknown,
}: ModelPickerProps) {
  const { primary, tail } = partitionPicker(ranked);
  const bySlug = new Map(ranked.map((c) => [c.slug, c]));
  const atCap = selected.length >= MAX_COMPARE_MODELS;

  return (
    <div className="rounded border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-text-primary">
          Models in this conversation
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-tertiary">
            {selected.length} selected
            {selected.length <= MAX_COMPARE_MODELS &&
              ` · compare up to ${MAX_COMPARE_MODELS}`}
          </span>
          <button
            type="button"
            onClick={onCopyLink}
            className="min-h-10 rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-border-strong hover:text-text-primary"
          >
            {copied ? "Link copied" : "Copy link to share"}
          </button>
        </div>
      </div>

      {/* Selected chips: the current column set, each removable. */}
      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {selected.map((slug) => {
            const c = bySlug.get(slug);
            return (
              <span
                key={slug}
                className="inline-flex min-h-10 items-center gap-1 rounded-full border border-accent bg-accent pl-3 pr-1 text-xs text-accent-contrast"
              >
                {c?.name ?? slug}
                <button
                  type="button"
                  onClick={() => onRemove(slug)}
                  aria-label={`Remove ${c?.name ?? slug} from the conversation`}
                  className="flex min-h-8 min-w-8 items-center justify-center rounded-full text-sm hover:bg-accent-hover"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      {scoresState === "loading" && (
        <p className="mb-2 text-xs text-text-tertiary" role="status">
          Loading live agreement scores…
        </p>
      )}
      {scoresState === "error" && (
        <p className="mb-2 text-xs text-warning" role="status">
          Live scores unavailable - models are ordered by serving version
          instead.
        </p>
      )}

      <div
        role="group"
        aria-label="Choose which models answer"
        className="flex flex-col gap-2"
      >
        {primary.map((c) => (
          <Row
            key={c.slug}
            c={c}
            on={selected.includes(c.slug)}
            atCap={atCap}
            scoresState={scoresState}
            onSelectOnly={onSelectOnly}
            onAddCompare={onAddCompare}
          />
        ))}

        {tail.length > 0 && (
          <details className="mt-1">
            <summary className="flex min-h-10 cursor-pointer items-center text-xs text-text-secondary hover:text-text-primary">
              Show all models ({tail.length} more: baselines and unscored arms)
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              {tail.map((c) => (
                <Row
                  key={c.slug}
                  c={c}
                  on={selected.includes(c.slug)}
                  atCap={atCap}
                  scoresState={scoresState}
                  onSelectOnly={onSelectOnly}
                  onAddCompare={onAddCompare}
                />
              ))}
            </div>
          </details>
        )}
      </div>

      {droppedUnknown.length > 0 && (
        <p className="mt-3 text-xs text-warning">
          {droppedUnknown.length} model
          {droppedUnknown.length === 1 ? "" : "s"} in this link no longer exist
          and {droppedUnknown.length === 1 ? "was" : "were"} skipped.
        </p>
      )}
      <p className="mt-3 text-xs text-text-tertiary">
        Models are ordered by their live Community Agreement Score on the
        leak-free benchmark - the chip on each row, where 100 means as close to
        the community&apos;s writing as one native speaker is to another. Tap a
        model to talk to it alone, or use{" "}
        <span className="text-text-secondary">+ compare</span> to read several
        answers side by side. The label beside each name is how that model gets
        its Igala: <span className="text-text-secondary">retrieval</span> looks
        up community answers at question time,{" "}
        <span className="text-text-secondary">fine-tuned</span> was trained on
        them, <span className="text-text-secondary">untouched</span> is the
        model as shipped. The selection is held in this page&apos;s address, so
        the link above opens on exactly these models.
      </p>
    </div>
  );
}
