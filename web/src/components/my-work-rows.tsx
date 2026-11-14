"use client";

/**
 * My Work's list and its filter, apart from the page's fetch so a render
 * test can hold them. The rows and their labels are as they were; new are
 * the Edit button on every row (it opens the edit drawer on that row) and
 * the filter "Needs a meaning or a reason".
 */

export type HistoryRow =
  | {
      kind: "pairwise";
      id: string;
      createdAt: string;
      bucketLabel: string;
      promptText: string;
      winner: string;
      confidence: number | null;
      explanation: string;
      outputA: string;
      outputB: string;
    }
  | {
      kind: "cold";
      id: string;
      createdAt: string;
      bucketLabel: string;
      promptText: string;
      answerText: string;
      englishGloss?: string | null;
      provenance: string;
      needsFix?: boolean;
    }
  | {
      kind: "edit";
      id: string;
      createdAt: string;
      bucketLabel: string;
      promptText: string;
      originalText: string;
      correctedText: string;
      rationale?: string | null;
      needsFix?: boolean;
    };

const WINNER_LABEL: Record<string, string> = {
  a: "Picked A",
  b: "Picked B",
  tie: "Tie - both adequate",
  both_inadequate: "Both inadequate",
};

const TYPE_LABEL: Record<HistoryRow["kind"], string> = {
  pairwise: "Comparison",
  cold: "Gold answer",
  edit: "Correction",
};

const TYPE_CLASS: Record<HistoryRow["kind"], string> = {
  pairwise: "bg-surface-sunken text-text-secondary",
  cold: "bg-accent-subtle text-accent-text",
  edit: "bg-info-subtle text-info",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function rowSummary(row: HistoryRow): string {
  if (row.kind === "pairwise") return WINNER_LABEL[row.winner] ?? row.winner;
  if (row.kind === "cold") return "Your own answer";
  return "Winner corrected";
}

function HistoryRowDetail({ row }: { row: HistoryRow }) {
  if (row.kind === "pairwise") {
    return (
      <div className="space-y-3 border-t border-border bg-surface-sunken px-4 py-4">
        {row.explanation && (
          <p className="text-sm text-text-secondary">
            <span className="font-medium text-text-primary">Why: </span>
            {row.explanation}
          </p>
        )}
        {row.confidence !== null && (
          <p className="text-xs text-text-tertiary">
            Confidence {row.confidence}/4
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div
            className={`rounded-md border p-3 text-sm font-mono leading-relaxed ${
              row.winner === "a"
                ? "border-accent bg-surface"
                : "border-border bg-surface"
            }`}
          >
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Output A{row.winner === "a" && " - picked"}
            </div>
            <div className="whitespace-pre-wrap text-text-primary">
              {row.outputA}
            </div>
          </div>
          <div
            className={`rounded-md border p-3 text-sm font-mono leading-relaxed ${
              row.winner === "b"
                ? "border-accent bg-surface"
                : "border-border bg-surface"
            }`}
          >
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Output B{row.winner === "b" && " - picked"}
            </div>
            <div className="whitespace-pre-wrap text-text-primary">
              {row.outputB}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (row.kind === "cold") {
    return (
      <div className="border-t border-border bg-surface-sunken px-4 py-4">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          Your answer
        </div>
        <p className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-text-primary">
          {row.answerText}
        </p>
        <div className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          What it means
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
          {row.englishGloss?.trim() || "Not given yet. Press Edit to add it."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t border-border bg-surface-sunken px-4 py-4">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          Original
        </div>
        <p className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-text-secondary">
          {row.originalText}
        </p>
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          Your correction
        </div>
        <p className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-text-primary">
          {row.correctedText}
        </p>
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          Your reason
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
          {row.rationale?.trim() || "Not given yet. Press Edit to add it."}
        </p>
      </div>
    </div>
  );
}

export type MyWorkFilterValue = "all" | "fix";

const FILTERS: { value: MyWorkFilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "fix", label: "Needs a meaning or a reason" },
];

/**
 * The filter My Work opens with, read from the address. The Dashboard's
 * "Your answers to fix" card links to /annotator/history?filter=fix and must
 * land on the filtered list. Anything else opens the whole list, as before.
 */
export function myWorkFilterFromSearch(
  params: { get(name: string): string | null } | null | undefined,
): MyWorkFilterValue {
  return params?.get("filter") === "fix" ? "fix" : "all";
}

export function MyWorkFilter({
  value,
  onChange,
}: {
  value: MyWorkFilterValue;
  onChange: (next: MyWorkFilterValue) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Show">
      {FILTERS.map((f) => (
        <button
          key={f.value}
          type="button"
          aria-pressed={value === f.value}
          onClick={() => onChange(f.value)}
          className={
            "min-h-11 cursor-pointer rounded-md border px-4 text-sm font-medium transition-colors " +
            (value === f.value
              ? "border-accent bg-accent-subtle text-accent-text"
              : "border-border-strong bg-surface text-text-secondary hover:bg-surface-sunken")
          }
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

export function MyWorkRows({
  rows,
  expanded,
  onToggle,
  onEdit,
}: {
  rows: HistoryRow[];
  expanded: string | null;
  onToggle: (id: string) => void;
  onEdit: (row: HistoryRow) => void;
}) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => {
        const isOpen = expanded === row.id;
        const fix = row.kind !== "pairwise" && row.needsFix === true;
        return (
          <li key={row.id}>
            <div className="flex items-stretch">
              <button
                onClick={() => onToggle(row.id)}
                aria-expanded={isOpen}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-4 px-4 py-3 text-left hover:bg-surface-sunken"
              >
                <span
                  className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_CLASS[row.kind]}`}
                >
                  {TYPE_LABEL[row.kind]}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                  {row.promptText}
                </span>
                <span className="hidden shrink-0 text-xs text-text-tertiary sm:inline">
                  {row.bucketLabel}
                </span>
                <span className="shrink-0 text-xs text-text-tertiary">
                  {rowSummary(row)}
                </span>
                {fix && (
                  <span className="hidden shrink-0 rounded-full bg-warning-subtle px-2 py-0.5 text-xs text-text-primary sm:inline">
                    {row.kind === "cold" ? "No meaning yet" : "Reason is short"}
                  </span>
                )}
                <span className="shrink-0 text-xs text-text-muted">
                  {formatDate(row.createdAt)}
                </span>
                <span className="shrink-0 text-text-muted">
                  {isOpen ? "\u2212" : "+"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onEdit(row)}
                aria-label={`Edit: ${row.promptText}`}
                className="min-h-11 shrink-0 cursor-pointer border-l border-border px-4 text-sm font-medium text-accent-text hover:bg-surface-sunken"
              >
                Edit
              </button>
            </div>
            {isOpen && <HistoryRowDetail row={row} />}
          </li>
        );
      })}
    </ul>
  );
}
