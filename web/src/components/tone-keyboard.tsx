"use client";

import { type RefObject } from "react";

/**
 * One-tap Igala diacritic input. Tone integrity is an input-ergonomics problem
 * before it is a metric one: if entering tone marks has friction, fluent speakers
 * drop them too, and the gold data becomes as tone-impoverished as the text we're
 * trying to fix. These keys insert the dotted vowels (ẹ ọ) and the high/low tone
 * forms at the caret of the bound field.
 */

// Grouped so the palette reads like rows of a vowel chart.
const TONE_KEYS: string[] = [
  "à",
  "á",
  "è",
  "é",
  "ẹ",
  "ẹ̀",
  "ẹ́",
  "ì",
  "í",
  "ò",
  "ó",
  "ọ",
  "ọ̀",
  "ọ́",
  "ù",
  "ú",
  "ñ",
  "ṅ",
];

export function ToneKeyboard({
  targetRef,
  value,
  onValueChange,
  disabled,
}: {
  targetRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onValueChange: (next: string) => void;
  disabled?: boolean;
}) {
  function insert(ch: string) {
    const el = targetRef.current;
    if (!el) {
      onValueChange(value + ch);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + ch + value.slice(end);
    onValueChange(next);
    // Restore the caret just after the inserted character, on the next frame.
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + ch.length;
      el.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1" aria-label="Igala tone keyboard">
      {TONE_KEYS.map((ch) => (
        <button
          key={ch}
          type="button"
          disabled={disabled}
          // Keep focus (and the selection) in the textarea so we splice at the caret.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert(ch)}
          className="h-7 min-w-7 rounded border border-border-strong bg-surface px-1.5 font-mono text-sm text-text-secondary transition-colors hover:bg-accent-subtle hover:text-accent-text disabled:opacity-40"
        >
          {ch}
        </button>
      ))}
    </div>
  );
}
