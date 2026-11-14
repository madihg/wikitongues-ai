import type { ReactNode } from "react";
import { savedStripText } from "@/lib/episode-draft";

/**
 * THE SHARED EPISODE FRAME (annotator experience spec, section 5): the parts
 * every kind of work has in the same place. Annotate, Listen, Check and
 * Pass 2 use it; Record joins when its lane builds on it.
 *
 *   [ name ]                                   12 left
 *   Saved: "How do you greet an elder in the..."   Edit
 *   ...the screen's own content, unchanged...
 *   [ Back or Edit previous ]  [ Skip ]  [ Main button ]
 *
 * Nothing here knows what the work is. Each screen passes its own buttons,
 * with the words it already had, into three fixed places.
 */

/** Every footer target is at least 44 px high. */
export const FRAME_TARGET = "min-h-[44px]";

/** Class for a quiet footer button (Back, Edit previous, Skip). */
export const FRAME_QUIET =
  "inline-flex min-h-[44px] cursor-pointer items-center rounded-md px-3 text-sm text-text-tertiary underline-offset-2 hover:text-text-secondary hover:underline disabled:cursor-not-allowed disabled:opacity-40";

/** Class for the main footer button. */
export const FRAME_MAIN =
  "min-h-[44px] w-full cursor-pointer rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-accent-contrast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto";

/** The header line: the name of the work on the left, "N left" on the right. */
export function EpisodeHeader({
  name,
  left,
}: {
  /** Omitted where the page heading already names the work. */
  name?: string;
  /** How many items are still waiting. Null hides the count. */
  left: number | null;
}) {
  return (
    <div
      data-episode-header
      className="mb-3 flex min-h-6 items-center justify-between gap-3"
    >
      <span className="text-sm font-semibold text-text-primary">
        {name ?? ""}
      </span>
      {left !== null && (
        <span className="text-sm tabular-nums text-text-secondary">
          {left} left
        </span>
      )}
    </div>
  );
}

/**
 * The "Saved" strip: the item you last submitted, and the way back into it.
 * It appears after a submit and stays until the next one.
 */
export function SavedStrip({
  promptText,
  onEdit,
  editLabel = "Edit",
}: {
  promptText: string;
  onEdit: () => void;
  editLabel?: string;
}) {
  return (
    <div
      data-saved-strip
      className="mb-4 flex items-center justify-between gap-3 rounded-md border border-border bg-surface-sunken px-3 text-sm text-text-secondary"
    >
      <span className="min-w-0 truncate py-2">
        Saved: &quot;{savedStripText(promptText)}&quot;
      </span>
      <button
        type="button"
        onClick={onEdit}
        className={`${FRAME_TARGET} shrink-0 cursor-pointer px-2 text-sm font-medium text-accent-text underline-offset-2 hover:underline`}
      >
        {editLabel}
      </button>
    </div>
  );
}

/**
 * The footer bar: three places that never move.
 *   left    Back (one stage back), or "Edit previous" on the first stage
 *   middle  Skip, where skipping is allowed
 *   right   the main button
 * An empty place keeps its room, so the other two stay where they are.
 * On a narrow screen the main button takes the full first row and the other
 * two sit under it, left and right; from 640 px they are one row.
 */
export function EpisodeFooter({
  left,
  middle,
  right,
  className = "",
}: {
  left?: ReactNode;
  middle?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-episode-footer
      className={`mt-6 grid grid-cols-2 items-center gap-x-3 gap-y-2 border-t border-border pt-4 sm:grid-cols-[1fr_auto_1fr] ${className}`}
    >
      <div
        data-footer-place="left"
        className="order-2 flex min-h-[44px] items-center justify-self-start sm:order-1"
      >
        {left}
      </div>
      <div
        data-footer-place="middle"
        className="order-3 flex min-h-[44px] items-center justify-self-end sm:order-2 sm:justify-self-center"
      >
        {middle}
      </div>
      <div
        data-footer-place="right"
        className="order-1 col-span-2 flex min-h-[44px] flex-wrap items-center justify-end gap-3 sm:order-3 sm:col-span-1 sm:justify-self-end"
      >
        {right}
      </div>
    </div>
  );
}
