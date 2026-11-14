"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ToneKeyboard } from "@/components/tone-keyboard";
import { SuggestingEditor } from "@/components/suggesting-editor";
import { IGALA_DIALECTS } from "@/lib/dialects";
import type { EditItem } from "@/lib/answer-edit";
import { newSaveId } from "@/lib/answer-revisions";
import { openSurface } from "@/lib/activity-signal";
import { MAX_TRANSLATION_CHARS } from "@/lib/speech/limits";
import {
  EDITOR_COPY,
  buildRequests,
  choiceLine,
  clipsLine,
  emptiedRequired,
  firstVersionLine,
  initialValues,
  itemKey,
  type EditorValues,
} from "@/lib/answer-editor-values";

/**
 * THE EDIT DRAWER (annotator experience spec, section 6.3). One editor behind
 * three doors: the "Saved" strip and "Edit previous" in a queue, the Edit
 * button on a My Work row, and the researcher's Annotations view.
 *
 * It opens on any one row and shows the whole episode that row belongs to:
 * the own answer and its meaning, the written "why" beside the choice, the
 * correction and its reasons. You can change what you wrote. The choice and
 * the scores are shown and cannot be changed.
 */

export interface EditTarget {
  type: EditItem["type"];
  id: string;
}

interface Episode {
  promptText: string;
  items: EditItem[];
  recordHref?: string | null;
}

const LABEL =
  "mb-1 block text-xs font-medium uppercase tracking-wider text-text-tertiary";
const BOX =
  "w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary";

export function AnswerEditorDrawer({
  target,
  onClose,
  onSaved,
}: {
  target: EditTarget;
  onClose: () => void;
  /** Called after a save that changed something, so a list can reload. */
  onSaved?: () => void;
}) {
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(
        `/api/annotator/answers/${target.type}/${target.id}`,
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Could not open this answer.");
      setEpisode(j as Episode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this answer.");
    }
  }, [target.type, target.id]);

  useEffect(() => {
    load();
  }, [load]);

  // While the drawer is open the work is editing an earlier answer,
  // whichever page it was opened on: the activity beat files the time under
  // "edit". Closing the drawer hands the clock back to the page.
  useEffect(() => openSurface("edit"), []);

  // Escape closes the drawer, like the Annotations drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={EDITOR_COPY.title}
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-border bg-surface-raised shadow-lg">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface-raised px-6 py-4">
          <h2 className="text-lg font-semibold text-text-primary">
            {EDITOR_COPY.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-md border border-border-strong text-text-secondary transition-colors hover:bg-surface-sunken"
          >
            <span aria-hidden>x</span>
          </button>
        </div>
        <div className="flex-1 px-6 py-6">
          {error ? (
            <div className="rounded-md border border-danger/30 bg-danger-subtle p-4 text-sm text-danger">
              {error}
            </div>
          ) : !episode ? (
            <p className="text-sm text-text-muted">Loading your answer…</p>
          ) : (
            <AnswerEditorForm
              key={`${target.type}:${target.id}`}
              episode={episode}
              onCancel={onClose}
              onSaved={() => {
                onSaved?.();
                load();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The form itself, apart from the fetch, so a render test can hold every
 * field in place. `save` is injectable for the same reason.
 */
export function AnswerEditorForm({
  episode,
  onCancel,
  onSaved,
  save = saveRequests,
}: {
  episode: Episode;
  onCancel: () => void;
  onSaved?: () => void;
  save?: typeof saveRequests;
}) {
  const [start, setStart] = useState<EditorValues>(() =>
    initialValues(episode.items),
  );
  const [values, setValues] = useState<EditorValues>(start);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clipWarning, setClipWarning] = useState(false);

  const setField = (key: string, field: string, value: string) => {
    setMessage(null);
    setValues((v) => ({
      ...v,
      [key]: { ...v[key], fields: { ...v[key].fields, [field]: value } },
    }));
  };

  const missing = emptiedRequired(episode.items, start, values);

  async function onSave() {
    setError(null);
    setMessage(null);
    const requests = buildRequests(episode.items, start, values);
    if (requests.length === 0) {
      setMessage(EDITOR_COPY.nothing);
      return;
    }
    setSaving(true);
    try {
      const result = await save(requests);
      setStart(values);
      setClipWarning(result.clipsStale);
      setMessage(result.changed > 0 ? EDITOR_COPY.saved : EDITOR_COPY.nothing);
      if (result.changed > 0) onSaved?.();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <p className={LABEL}>Prompt</p>
        <p className="text-sm text-text-primary">{episode.promptText}</p>
      </section>

      {episode.items.map((item) => {
        const key = itemKey(item);
        const v = values[key];
        if (!v) return null;
        if (item.type === "cold") {
          return (
            <ColdFields
              key={key}
              item={item}
              fields={v.fields}
              recordHref={episode.recordHref ?? null}
              onField={(f, value) => setField(key, f, value)}
            />
          );
        }
        if (item.type === "pairwise" || item.type === "listen") {
          const field = item.type === "pairwise" ? "explanation" : "note";
          return (
            <section key={key}>
              <label className={LABEL} htmlFor={`${key}-why`}>
                {item.type === "pairwise"
                  ? EDITOR_COPY.why
                  : EDITOR_COPY.listenReason}
              </label>
              <p
                className="mb-2 text-sm text-text-secondary"
                data-locked="choice"
              >
                {choiceLine(item.type, item.winner)}
              </p>
              <textarea
                id={`${key}-why`}
                rows={3}
                className={BOX}
                value={v.fields[field]}
                onChange={(e) => setField(key, field, e.target.value)}
              />
            </section>
          );
        }
        return (
          <section key={key}>
            <p className={LABEL}>
              {EDITOR_COPY.correction}
              {item.onOutput ? ` (Output ${item.onOutput})` : ""}
            </p>
            <SuggestingEditor
              original={item.originalText}
              value={v.fields.correctedText}
              onValueChange={(next) => setField(key, "correctedText", next)}
              reasons={v.reasons ?? {}}
              onReasonsChange={(next) => {
                setMessage(null);
                setValues((all) => ({
                  ...all,
                  [key]: { ...all[key], reasons: next },
                }));
              }}
            />
            <label className={`${LABEL} mt-4`} htmlFor={`${key}-rationale`}>
              {EDITOR_COPY.correctionWhy}
            </label>
            <textarea
              id={`${key}-rationale`}
              rows={3}
              className={BOX}
              value={v.fields.rationale}
              onChange={(e) => setField(key, "rationale", e.target.value)}
            />
          </section>
        );
      })}

      {clipWarning && <ClipWarning recordHref={episode.recordHref ?? null} />}

      <div className="sticky bottom-0 -mx-6 flex items-center justify-between gap-3 border-t border-border bg-surface-raised px-6 py-4">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-sunken"
        >
          {EDITOR_COPY.cancel}
        </button>
        <div className="flex items-center gap-3">
          {message && (
            <span role="status" className="text-sm text-success">
              {message}
            </span>
          )}
          {error && (
            <span role="alert" className="text-sm text-danger">
              {error}
            </span>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={saving || missing.length > 0}
            className="min-h-11 rounded-md bg-accent px-5 py-2 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : EDITOR_COPY.save}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Shown after a save that changed words a clip reads. The clip is kept. */
export function ClipWarning({ recordHref }: { recordHref: string | null }) {
  return (
    <div
      role="status"
      className="rounded-md border border-warning/30 bg-warning-subtle p-3 text-sm text-text-primary"
    >
      {EDITOR_COPY.clipWarning}{" "}
      {recordHref && (
        <a href={recordHref} className="font-medium text-accent-text underline">
          Re-record
        </a>
      )}
    </div>
  );
}

function ColdFields({
  item,
  fields,
  recordHref,
  onField,
}: {
  item: Extract<EditItem, { type: "cold" }>;
  fields: Record<string, string>;
  recordHref: string | null;
  onField: (field: string, value: string) => void;
}) {
  const answerRef = useRef<HTMLTextAreaElement | null>(null);
  const [showFirst, setShowFirst] = useState(false);
  const key = itemKey(item);
  const clips = clipsLine(item.clips);
  const anyStale = item.clips.some((c) => c.stale);

  return (
    <>
      <section>
        <label className={LABEL} htmlFor={`${key}-answer`}>
          {EDITOR_COPY.answer}
        </label>
        <textarea
          id={`${key}-answer`}
          ref={answerRef}
          rows={4}
          className={`${BOX} font-mono`}
          value={fields.answerText}
          onChange={(e) => onField("answerText", e.target.value)}
        />
        <ToneKeyboard
          targetRef={answerRef}
          value={fields.answerText}
          onValueChange={(next) => onField("answerText", next)}
        />
      </section>

      <section>
        <label className={LABEL} htmlFor={`${key}-meaning`}>
          {EDITOR_COPY.meaning}
        </label>
        <textarea
          id={`${key}-meaning`}
          rows={3}
          className={BOX}
          value={fields.englishGloss}
          onChange={(e) => onField("englishGloss", e.target.value)}
        />
      </section>

      {/* The short translation is what the English clip reads. It shows
          where speech is on for this person (recordHref), or when the answer
          already has one; an account that cannot record is not asked for a
          text "for recording". */}
      {(recordHref !== null || fields.englishTranslation !== "") && (
        <section>
          <label className={LABEL} htmlFor={`${key}-translation`}>
            {EDITOR_COPY.translation}
          </label>
          <input
            id={`${key}-translation`}
            type="text"
            maxLength={MAX_TRANSLATION_CHARS}
            aria-describedby={`${key}-translation-help`}
            className={`${BOX} min-h-11`}
            value={fields.englishTranslation}
            onChange={(e) => onField("englishTranslation", e.target.value)}
          />
          <p
            id={`${key}-translation-help`}
            className="mt-1 text-xs text-text-tertiary"
          >
            {EDITOR_COPY.translationHelp}
          </p>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor={`${key}-dialect`}>
            {EDITOR_COPY.dialect}
          </label>
          <select
            id={`${key}-dialect`}
            className={`${BOX} min-h-11`}
            value={fields.dialect}
            onChange={(e) => onField("dialect", e.target.value)}
          >
            <option value="">Not given</option>
            {IGALA_DIALECTS.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor={`${key}-instruction`}>
            {EDITOR_COPY.instruction}
          </label>
          <textarea
            id={`${key}-instruction`}
            rows={2}
            className={`${BOX} font-mono`}
            value={fields.instructionIg}
            onChange={(e) => onField("instructionIg", e.target.value)}
          />
        </div>
      </section>

      {item.firstVersion && (
        <section className="rounded-md border border-border bg-surface-sunken p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-text-secondary">
              {firstVersionLine(item.firstVersion.savedAt)}
            </p>
            <button
              type="button"
              onClick={() => setShowFirst((s) => !s)}
              aria-expanded={showFirst}
              className="min-h-11 rounded-md px-3 text-sm font-medium text-accent-text hover:underline"
            >
              {showFirst ? "Hide" : "Show"}
            </button>
          </div>
          <p className="text-xs text-text-tertiary">
            {EDITOR_COPY.firstVersionHelp}
          </p>
          {showFirst && (
            <p className="mt-2 whitespace-pre-wrap font-mono text-sm text-text-primary">
              {item.firstVersion.text}
            </p>
          )}
        </section>
      )}

      {clips && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-sunken p-3">
          <p className="text-sm text-text-secondary">
            {clips}
            {anyStale && (
              <span className="mt-1 block text-xs text-text-tertiary">
                The words changed after a clip was recorded.
              </span>
            )}
          </p>
          {recordHref && (
            <a
              href={recordHref}
              className="inline-flex min-h-11 items-center rounded-md border border-border-strong px-3 text-sm font-medium text-text-secondary hover:bg-surface"
            >
              Re-record
            </a>
          )}
        </section>
      )}
    </>
  );
}

/** One press of "Save changes": every changed row, under one save id. */
export async function saveRequests(
  requests: { type: string; id: string; body: Record<string, unknown> }[],
  endpoint: (type: string, id: string) => string = (type, id) =>
    `/api/annotator/answers/${type}/${id}`,
): Promise<{ changed: number; clipsStale: boolean }> {
  const saveId = newSaveId();
  let changed = 0;
  let clipsStale = false;
  for (const r of requests) {
    const res = await fetch(endpoint(r.type, r.id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...r.body, saveId }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(j.error ?? "Could not save. Please try again.");
    }
    changed += Array.isArray(j.changed) ? j.changed.length : 0;
    clipsStale = clipsStale || j.clipsStale === true;
  }
  return { changed, clipsStale };
}
