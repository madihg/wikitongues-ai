"use client";

import { useState } from "react";

export type RightsStatusValue = "pending" | "cleared" | "restricted";

export interface RightsSourceItem {
  id: string;
  name: string;
  licenseText: string;
  rightsStatus: RightsStatusValue;
  /** Display name of whoever confirmed, or null while pending. */
  confirmedBy: string | null;
  confirmedAt: string | null;
  /** The open questions: what must be answered before it can be cleared. */
  notes: string | null;
}

const STATUS_LABEL: Record<RightsStatusValue, string> = {
  pending: "Pending",
  cleared: "Cleared",
  restricted: "Restricted",
};

const STATUS_CLASS: Record<RightsStatusValue, string> = {
  pending: "border-warning bg-warning-subtle",
  cleared: "border-success",
  restricted: "border-danger",
};

/** One source in the register. Presentational: the parent owns saving. */
export function RightsCard({
  item,
  onSave,
  saving,
  error,
}: {
  item: RightsSourceItem;
  onSave: (
    id: string,
    patch: { rightsStatus: RightsStatusValue; notes: string },
  ) => void;
  saving: boolean;
  error: string | null;
}) {
  const [status, setStatus] = useState<RightsStatusValue>(item.rightsStatus);
  const [notes, setNotes] = useState(item.notes ?? "");
  const inputId = `rights-${item.id}`;
  return (
    <section
      aria-labelledby={`${inputId}-name`}
      className="rounded-lg border border-border bg-surface p-6 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <h2
          id={`${inputId}-name`}
          className="text-base font-semibold text-text-primary"
        >
          {item.name}
        </h2>
        <span
          className={`rounded-md border px-2 py-1 text-xs font-medium text-text-primary ${STATUS_CLASS[item.rightsStatus]}`}
        >
          {STATUS_LABEL[item.rightsStatus]}
        </span>
      </div>

      <h3 className="mt-4 text-xs font-medium uppercase tracking-wide text-text-tertiary">
        Licence text
      </h3>
      <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">
        {item.licenseText}
      </p>

      <p className="mt-4 text-sm text-text-tertiary">
        {item.confirmedBy && item.confirmedAt
          ? `Confirmed by ${item.confirmedBy} on ${item.confirmedAt.slice(0, 10)}`
          : "Not confirmed by anyone yet"}
      </p>

      <label
        htmlFor={`${inputId}-notes`}
        className="mt-4 block text-xs font-medium uppercase tracking-wide text-text-tertiary"
      >
        Open questions
      </label>
      <textarea
        id={`${inputId}-notes`}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label
          htmlFor={`${inputId}-status`}
          className="text-sm text-text-primary"
        >
          Status
        </label>
        <select
          id={`${inputId}-status`}
          value={status}
          onChange={(e) => setStatus(e.target.value as RightsStatusValue)}
          className="min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
        >
          {(Object.keys(STATUS_LABEL) as RightsStatusValue[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave(item.id, { rightsStatus: status, notes })}
          className="min-h-[44px] cursor-pointer rounded-md border border-border px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving" : "Save"}
        </button>
      </div>
      <p className="mt-2 text-xs text-text-tertiary">
        Only Cleared lets a source&apos;s clips into training. Pending and
        Restricted keep them out.
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/** The register page body: one card per source, PATCHing on save. */
export function RightsRegister({ initial }: { initial: RightsSourceItem[] }) {
  const [items, setItems] = useState(initial);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async (
    id: string,
    patch: { rightsStatus: RightsStatusValue; notes: string },
  ) => {
    setSavingId(id);
    setErrors((e) => ({ ...e, [id]: "" }));
    try {
      const res = await fetch(`/api/speech/rights/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        source?: {
          rightsStatus: RightsStatusValue;
          confirmedAt: string | null;
          notes: string | null;
        };
      };
      if (!res.ok || !json.source) {
        setErrors((e) => ({ ...e, [id]: json.error ?? "Could not save." }));
        return;
      }
      const s = json.source;
      setItems((cur) =>
        cur.map((i) =>
          i.id === id
            ? {
                ...i,
                rightsStatus: s.rightsStatus,
                confirmedAt: s.confirmedAt,
                // The server recorded the signed-in researcher; the name is
                // filled in on the next load.
                confirmedBy:
                  s.rightsStatus === "pending"
                    ? null
                    : (i.confirmedBy ?? "you"),
                notes: s.notes,
              }
            : i,
        ),
      );
    } catch {
      setErrors((e) => ({ ...e, [id]: "Could not save. Try again." }));
    } finally {
      setSavingId(null);
    }
  };

  if (items.length === 0) {
    return (
      <p className="text-sm text-text-tertiary">
        The register is empty. Run scripts/speech/seed-rights-register.ts.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <RightsCard
          key={item.id}
          item={item}
          onSave={save}
          saving={savingId === item.id}
          error={errors[item.id] || null}
        />
      ))}
    </div>
  );
}
