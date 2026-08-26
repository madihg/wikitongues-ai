"use client";

import { useMemo, useRef } from "react";
import { ToneKeyboard } from "@/components/tone-keyboard";
import { wordDiff } from "@/lib/diff";
import {
  diffToSegments,
  nfc,
  reasonKeyFor,
  segmentHasReason,
  type EditSegment,
  type ReasonMap,
} from "@/lib/edit-segments";
import { EDIT_REASON_TAGS, editReasonTagLabel } from "@/lib/failure-tags";

/**
 * "Suggesting mode" (Lydia's phrase): a plain textarea the annotator types
 * into, with a live Google-Docs-style preview underneath - removed text struck
 * through, inserted text highlighted - plus one reason card per changed
 * region.
 *
 * Deliberately textarea-first, not contenteditable and not tap-a-word: the
 * textarea is the shipped, proven pattern every real correction has come
 * through, it is the only editing primitive that is boring on mobile IMEs with
 * combining marks, and it is what ToneKeyboard drives. Free typing keeps
 * arbitrary granularity (single-token fixes through paragraph rewrites); the
 * diff recovers the spans afterwards (src/lib/edit-segments.ts).
 *
 * Reasons are the nudge, never a gate: nothing here blocks saving. Reason
 * state is CONTROLLED (reasons/onReasonsChange) so callers can persist it in
 * their drafts; keys are original-slice + occurrence (reasonKeyFor), so a
 * reason survives offset shifts from edits elsewhere in the text.
 */

export const REASON_NUDGE =
  "Reasons teach the AI the rule, not just the fix - even two words help, English or Igala.";

interface SuggestingEditorProps {
  /** The model output being corrected (any Unicode shape - NFC'd internally). */
  original: string;
  value: string;
  onValueChange: (next: string) => void;
  reasons: ReasonMap;
  onReasonsChange: (next: ReasonMap) => void;
  /** Render-only mode for the onboarding worked example: no textarea, the
   *  preview and filled reason cards only. */
  readOnly?: boolean;
  placeholder?: string;
}

/** The exact score-step diff rendering: same runs plain, removed struck
 *  through in danger colors, inserted in success colors. */
export function SuggestionPreview({
  original,
  corrected,
}: {
  original: string;
  corrected: string;
}) {
  return (
    <p className="whitespace-pre-wrap break-words rounded bg-surface-sunken p-3 font-mono text-sm leading-relaxed">
      {wordDiff(nfc(original), nfc(corrected)).map((seg, i) =>
        seg.type === "same" ? (
          <span key={i}>{seg.value}</span>
        ) : seg.type === "added" ? (
          <span key={i} className="rounded bg-success-subtle text-success">
            {seg.value}
          </span>
        ) : (
          <span
            key={i}
            className="rounded bg-danger-subtle text-danger line-through"
          >
            {seg.value}
          </span>
        ),
      )}
    </p>
  );
}

/** One changed region: what was replaced, and the two-field "why" (chips +
 *  free text). Chips reuse the pairwise failure-chip sizing - the touch-target
 *  precedent annotators already know. */
function ReasonCard({
  segment,
  reason,
  onChange,
  readOnly,
}: {
  segment: EditSegment;
  reason: { tags: string[]; text: string };
  onChange: (next: { tags: string[]; text: string }) => void;
  readOnly?: boolean;
}) {
  const toggleTag = (key: string) => {
    if (readOnly) return;
    onChange({
      ...reason,
      tags: reason.tags.includes(key)
        ? reason.tags.filter((t) => t !== key)
        : [...reason.tags, key],
    });
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2 font-mono text-sm">
        {segment.original ? (
          <span className="rounded bg-danger-subtle px-1.5 py-0.5 text-danger line-through">
            {segment.original}
          </span>
        ) : (
          <span className="text-xs text-text-muted">(added)</span>
        )}
        <span className="text-text-muted" aria-hidden>
          &rarr;
        </span>
        {segment.replacement ? (
          <span className="rounded bg-success-subtle px-1.5 py-0.5 text-success">
            {segment.replacement}
          </span>
        ) : (
          <span className="text-xs text-text-muted">(removed)</span>
        )}
      </div>

      <p className="mt-2 text-xs font-medium text-text-secondary">
        Why?{" "}
        <span className="font-normal text-text-muted">(highly encouraged)</span>
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {(readOnly
          ? EDIT_REASON_TAGS.filter((t) => reason.tags.includes(t.key))
          : EDIT_REASON_TAGS
        ).map((t) => {
          const on = reason.tags.includes(t.key);
          return (
            <button
              key={t.key}
              type="button"
              title={t.hint}
              aria-pressed={on}
              disabled={readOnly}
              onClick={() => toggleTag(t.key)}
              // min-h-10 = 40px: annotators tap these with thumbs on phones
              // (house rule: large touch targets), matching the >= 40px floor.
              className={`inline-flex min-h-10 items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                on
                  ? "border-accent bg-accent text-accent-contrast"
                  : "border-border-strong bg-surface text-text-secondary hover:border-accent hover:text-accent-text"
              } ${readOnly ? "" : "cursor-pointer"}`}
            >
              {editReasonTagLabel(t.key)}
            </button>
          );
        })}
      </div>
      {readOnly ? (
        reason.text.trim() && (
          <p className="mt-2 rounded-md border border-border bg-surface-sunken px-3 py-2 text-xs text-text-secondary">
            {reason.text}
          </p>
        )
      ) : (
        <input
          value={reason.text}
          onChange={(e) => onChange({ ...reason, text: e.target.value })}
          placeholder="In your own words - English or Igala…"
          // min-h-[44px]: a text input is a primary touch target on phones.
          className="mt-2 min-h-[44px] w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-xs text-text-secondary placeholder:text-text-muted focus-visible:border-accent"
        />
      )}
    </div>
  );
}

export function SuggestingEditor({
  original,
  value,
  onValueChange,
  reasons,
  onReasonsChange,
  readOnly,
  placeholder,
}: SuggestingEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Segments recompute from (NFC original, current value) on every change -
  // pure derivation, no segment state to desync. An EMPTY draft is "no
  // correction yet", never "delete everything": an empty corrected text is
  // unsavable everywhere, so rendering it as a full strike-through would only
  // mislead.
  const segments = useMemo(
    () => (value.trim() ? diffToSegments(original, value) : []),
    [original, value],
  );
  const changed = segments.length > 0;
  const missingReasons = segments.filter((s, i) => {
    const r = reasons[reasonKeyFor(segments, i)];
    const withReason =
      (r && (r.text.trim() || r.tags.length > 0)) || segmentHasReason(s);
    return !withReason;
  }).length;

  // Autogrow with content so long outputs never need inner scrolling; the
  // preview wraps (overflow-container house rule: no horizontal scroll).
  const rows = Math.min(
    14,
    Math.max(3, value.split("\n").length, Math.ceil(value.length / 46)),
  );

  return (
    <div>
      {!readOnly && (
        <>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            rows={rows}
            placeholder={placeholder}
            className="mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-muted focus-visible:border-accent"
          />
          <ToneKeyboard
            targetRef={textareaRef}
            value={value}
            onValueChange={onValueChange}
          />
        </>
      )}

      {changed && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-medium text-text-tertiary">
            Your suggestions
          </div>
          <SuggestionPreview original={original} corrected={value} />

          <div className="mt-3 space-y-3">
            {segments.map((segment, i) => {
              const key = reasonKeyFor(segments, i);
              const reason = reasons[key] ?? {
                tags: segment.reasonTags ?? [],
                text: segment.reason ?? "",
              };
              return (
                <ReasonCard
                  key={key}
                  segment={segment}
                  reason={reason}
                  readOnly={readOnly}
                  onChange={(next) =>
                    onReasonsChange({ ...reasons, [key]: next })
                  }
                />
              );
            })}
          </div>

          {!readOnly && missingReasons > 0 && (
            <p className="mt-2 text-xs text-text-muted">{REASON_NUDGE}</p>
          )}
        </div>
      )}
    </div>
  );
}
