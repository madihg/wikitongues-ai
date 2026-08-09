"use client";

import { useEffect, useMemo, useState } from "react";
import { bucketLabel } from "@/lib/buckets";
import { dialectLabel } from "@/lib/dialects";
import { InfoTip } from "@/components/info-tip";
import type {
  AnswerVariant,
  AnswerVariantKind,
  SpellingDifference,
  VariantCluster,
  VariantCounts,
} from "@/lib/answer-variants";
import type { EvalBucket } from "@prisma/client";

interface VariantGroupView {
  id: string;
  promptSlug: string | null;
  promptText: string;
  bucket: EvalBucket | null;
  kind: AnswerVariantKind;
  variants: AnswerVariant[];
  clusters: VariantCluster[];
  annotatorCount: number;
  answerCount: number;
}

interface Payload {
  counts: VariantCounts;
  groups: VariantGroupView[];
  returned: number;
  truncated: boolean;
}

type Filter = "all" | "spelling" | "mixed" | "different";

const KIND_LABEL: Record<AnswerVariantKind, string> = {
  spelling: "Same word, written differently",
  mixed: "Some of each",
  different: "Different words",
  identical: "Identical",
};

const KIND_CHIP: Record<AnswerVariantKind, string> = {
  spelling: "bg-accent-subtle text-accent-text",
  mixed: "bg-warning-subtle text-warning",
  different: "bg-info-subtle text-info",
  identical: "bg-surface-sunken text-text-tertiary",
};

const DIFFERENCE_LABEL: Record<SpellingDifference, string> = {
  marks: "tone marks, dotted vowels or capitals",
  spacing: "word spacing or elision marks",
  marks_and_spacing: "tone marks and spacing",
};

/**
 * SECTION 2 of Collective Review: where our own gold answers differ from each
 * other. See src/lib/answer-variants.ts for the classification, and
 * /api/arena/contested/answers for the bounded queries behind it.
 */
export function AnswerVariants() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Set<string>>(new Set());

  // The route caps its page at 200 groups; "Show the rest" asks for all of
  // them rather than paginating, because the whole point is to scan the list.
  const [limit, setLimit] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await fetch(
          limit == null
            ? "/api/arena/contested/answers"
            : `/api/arena/contested/answers?limit=${limit}`,
        );
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
        const d: Payload = await r.json();
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  const visible = useMemo(
    () =>
      (data?.groups ?? []).filter((g) => filter === "all" || g.kind === filter),
    [data, filter],
  );

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section>
      <h2 className="mb-1 flex flex-wrap items-center gap-2 text-lg text-text-primary">
        Differences between our own answers
        <InfoTip width="w-96">
          Every prompt here was answered by two or more annotators, and the
          answers came back different. Two answers count as the same word when
          they match after tone marks, dotted vowels, capitals, spacing and
          elision apostrophes are set aside - so &quot;Ọdudu&quot;,
          &quot;Òdúdú&quot; and &quot;ódùdù&quot; are one word written three
          ways, while &quot;Mama ọlañẹ&quot; is a different answer.
        </InfoTip>
      </h2>
      <div className="mb-4 max-w-3xl space-y-2 text-sm text-text-secondary">
        <p>
          This is the disagreement we actually have. It comes in two kinds, and
          they need opposite responses.
        </p>
        <p>
          <span className="font-medium text-text-primary">
            The same word, written differently.
          </span>{" "}
          Everyone agrees the word is odudu, but it is written Ọdudu, Òdúdú,
          ódùdù. Or the same sentence is spaced and elided differently:
          &quot;Ọma lẹ a jẹ ñwu&quot; against &quot;Ọma lẹ aj&apos;ẹñwu&quot;.
          That is a writing-convention decision, and a session can settle it in
          one sitting. It is worth settling: a spelling choice repeats in every
          sentence containing that word, so an unsettled convention compounds
          through the whole training set and teaches the model that both forms
          are equally correct.
        </p>
        <p>
          <span className="font-medium text-text-primary">
            Genuinely different words.
          </span>{" "}
          Two people gave different answers - a different greeting, a different
          verb. This may be real dialect variation, in which case the right move
          is to record both with the dialect attached, not to pick a winner. Or
          one of them is wrong, which is worth knowing too.
        </p>
      </div>

      {loading && (
        <div className="py-8 text-sm text-text-tertiary">Loading…</div>
      )}

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-subtle p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {data && !loading && !error && (
        <>
          <div className="mb-4 grid gap-2 sm:grid-cols-3">
            <CountCard
              active={filter === "spelling"}
              onClick={() =>
                setFilter(filter === "spelling" ? "all" : "spelling")
              }
              count={data.counts.spelling}
              label="prompts where we spell the same word differently"
              tone="bg-accent-subtle text-accent-text"
            />
            <CountCard
              active={filter === "mixed"}
              onClick={() => setFilter(filter === "mixed" ? "all" : "mixed")}
              count={data.counts.mixed}
              label="prompts with some of each: one word written several ways, plus a different answer"
              tone="bg-warning-subtle text-warning"
            />
            <CountCard
              active={filter === "different"}
              onClick={() =>
                setFilter(filter === "different" ? "all" : "different")
              }
              count={data.counts.different}
              label="prompts where we gave different words"
              tone="bg-info-subtle text-info"
            />
          </div>

          <p className="mb-4 text-xs text-text-tertiary">
            {data.counts.total} prompts have two or more annotators who wrote
            different answers.{" "}
            {data.counts.spelling + data.counts.mixed > 0 && (
              <>
                {data.counts.spelling + data.counts.mixed} of them contain at
                least one word written more than one way.{" "}
              </>
            )}
            Showing {visible.length}
            {filter !== "all" ? ` of kind "${KIND_LABEL[filter]}"` : ""},
            ordered so the settleable spelling groups come first. Tap a count
            above to filter.{" "}
            {data.truncated && (
              <button
                type="button"
                onClick={() => setLimit(200)}
                className="cursor-pointer underline underline-offset-2 hover:text-accent-text"
              >
                Show the rest
              </button>
            )}
          </p>

          {visible.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-tertiary">
              Nothing in this category yet.
            </div>
          ) : (
            <div className="space-y-3">
              {visible.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  expanded={open.has(group.id)}
                  onToggle={() => toggle(group.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function CountCard({
  count,
  label,
  tone,
  active,
  onClick,
}: {
  count: number;
  label: string;
  tone: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`cursor-pointer rounded-lg border p-3 text-left transition-colors ${
        active
          ? "border-accent bg-surface-sunken"
          : "border-border bg-surface hover:border-border-strong"
      }`}
    >
      <span
        className={`inline-block rounded-full px-2 py-0.5 font-mono text-sm font-medium ${tone}`}
      >
        {count}
      </span>
      <span className="mt-1.5 block text-xs leading-snug text-text-secondary">
        {label}
      </span>
    </button>
  );
}

function GroupCard({
  group,
  expanded,
  onToggle,
}: {
  group: VariantGroupView;
  expanded: boolean;
  onToggle: () => void;
}) {
  const sameWordClusters = group.clusters.filter(
    (c) => c.variantIndexes.length > 1,
  );
  const singles = group.clusters.filter((c) => c.variantIndexes.length === 1);

  return (
    <div className="rounded-lg border border-border bg-surface shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-start gap-3 p-4 text-left"
      >
        <span
          aria-hidden
          className="mt-0.5 font-mono text-xs text-text-tertiary"
        >
          {expanded ? "−" : "+"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="mb-1.5 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${KIND_CHIP[group.kind]}`}
            >
              {KIND_LABEL[group.kind]}
            </span>
            {group.bucket && (
              <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-text-tertiary">
                {bucketLabel(group.bucket)}
              </span>
            )}
            {group.promptSlug && (
              <span className="font-mono text-xs text-text-muted">
                {group.promptSlug}
              </span>
            )}
          </span>
          <span className="block break-words text-sm text-text-primary">
            {group.promptText}
          </span>
          <span className="mt-1 block text-xs text-text-tertiary">
            {summarise(group, sameWordClusters.length, singles.length)}
          </span>
        </span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          {sameWordClusters.map((cluster, i) => (
            <div key={`same-${i}`}>
              <p className="mb-2 text-xs text-text-secondary">
                <span className="font-medium text-text-primary">
                  One word, {cluster.variantIndexes.length} spellings.
                </span>{" "}
                They differ by{" "}
                {cluster.difference
                  ? DIFFERENCE_LABEL[cluster.difference]
                  : "writing convention"}
                . Pick one and the rest become corrections.
              </p>
              <div className="space-y-2">
                {cluster.variantIndexes.map((index) => (
                  <VariantRow
                    key={index}
                    variant={group.variants[index]!}
                    highlight
                  />
                ))}
              </div>
            </div>
          ))}

          {singles.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-text-secondary">
                <span className="font-medium text-text-primary">
                  {singles.length === 1
                    ? "A different answer."
                    : `${singles.length} different answers.`}
                </span>{" "}
                Not a spelling question. Worth asking whether this is dialect
                variation to record, or an error to correct.
              </p>
              <div className="space-y-2">
                {singles.map((cluster) => (
                  <VariantRow
                    key={cluster.variantIndexes[0]}
                    variant={group.variants[cluster.variantIndexes[0]!]!}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VariantRow({
  variant,
  highlight = false,
}: {
  variant: AnswerVariant;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-3 ${
        highlight
          ? "border-accent-subtle bg-accent-subtle/40"
          : "border-border bg-surface-sunken"
      }`}
    >
      <p className="igala break-words text-sm text-text-primary">
        {variant.text}
      </p>
      {variant.glosses.length > 0 && (
        <p className="mt-1 break-words text-xs text-text-secondary">
          {variant.glosses.join(" / ")}
        </p>
      )}
      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-tertiary">
        {variant.writers.map((w) => (
          <span key={w.annotatorId}>
            {w.name}
            {w.dialect && (
              <span className="text-text-muted">
                {" "}
                · {dialectLabel(w.dialect)}
              </span>
            )}
          </span>
        ))}
      </p>
    </div>
  );
}

function summarise(
  group: VariantGroupView,
  sameWordClusters: number,
  singles: number,
): string {
  const parts: string[] = [
    `${group.variants.length} different wordings from ${group.annotatorCount} annotators`,
  ];
  if (sameWordClusters > 0) {
    parts.push(
      sameWordClusters === 1
        ? "one word written several ways"
        : `${sameWordClusters} words each written several ways`,
    );
  }
  if (singles > 0) {
    parts.push(
      singles === 1 ? "one standalone answer" : `${singles} standalone answers`,
    );
  }
  return parts.join(" · ");
}
