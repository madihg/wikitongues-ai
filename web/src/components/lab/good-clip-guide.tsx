"use client";

import {
  GOOD_CLIP_CLOSING,
  GOOD_CLIP_STEPS,
  GOOD_CLIP_TITLE,
} from "@/lib/speech/record-levels";

/**
 * "How to get a good clip": the level and room guidance in plain words,
 * folded under a link so it is one tap away and never in the way. The words
 * live in lib/speech/record-levels.ts beside the numbers they describe.
 */
export function GoodClipGuide() {
  return (
    <details
      data-testid="good-clip-guide"
      className="rounded-md border border-border bg-surface"
    >
      <summary className="flex min-h-[44px] cursor-pointer items-center px-3 text-sm font-medium text-accent-text underline underline-offset-2">
        {GOOD_CLIP_TITLE}
      </summary>
      <div className="border-t border-border p-3">
        <ol className="list-decimal space-y-2 pl-5 text-base text-text-secondary">
          {GOOD_CLIP_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="mt-3 text-base text-text-primary">{GOOD_CLIP_CLOSING}</p>
      </div>
    </details>
  );
}
