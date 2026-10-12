/**
 * The annotate page's two URL parameters, and what a pinned prompt's answer
 * means. Pure, so the node test environment can hold every rule here.
 *
 *   - `demo=<sessionId>`: the episode is a walkthrough; what is submitted is
 *     saved as demo and never counted.
 *   - `prompt=<public code>`: a researcher opened one specific question from
 *     the review drawer instead of taking the head of the queue.
 *
 * The page URL is the single place both live: the fetch for the next task is
 * built from it, and the demo switch and "Back to my queue" change it in
 * place. Keeping the building here (rather than inline in the 2,000-line
 * episode component) is what lets a test say "turning demo off keeps the
 * pinned question" without a browser.
 */

export const ANNOTATE_PATH = "/annotator/annotate";
export const NEXT_TASK_PATH = "/api/annotations/next";

export interface AnnotateParams {
  demo: string | null;
  prompt: string | null;
}

/** The two parameters of a page query string. An empty value is no value. */
export function readAnnotateParams(search: string): AnnotateParams {
  const params = new URLSearchParams(search);
  return {
    demo: params.get("demo") || null,
    prompt: params.get("prompt")?.trim() || null,
  };
}

/**
 * The request for the next task. With no parameter, and with `demo` alone,
 * this is character for character the URL the page built before the pin
 * existed, so nothing changes for anyone who is not pinning a prompt.
 */
export function nextTaskUrl({ demo, prompt }: AnnotateParams): string {
  const query: string[] = [];
  if (demo) query.push(`demo=${encodeURIComponent(demo)}`);
  if (prompt) query.push(`prompt=${encodeURIComponent(prompt)}`);
  return query.length > 0
    ? `${NEXT_TASK_PATH}?${query.join("&")}`
    : NEXT_TASK_PATH;
}

/** Where the review drawer's "Annotate this prompt" points. */
export function annotatePromptHref(promptId: string): string {
  return `${ANNOTATE_PATH}?prompt=${encodeURIComponent(promptId)}`;
}

/**
 * A page query string with `demo` and/or `prompt` set (a value) or removed
 * (null). A key left out of `changes` is left alone, and so is every other
 * parameter: turning demo on must not drop the pinned question, and going
 * back to the queue must not drop demo. Returns "" or a string starting "?".
 */
export function annotateSearchWith(
  search: string,
  changes: Partial<AnnotateParams>,
): string {
  const params = new URLSearchParams(search);
  for (const key of ["demo", "prompt"] as const) {
    if (!(key in changes)) continue;
    const value = changes[key];
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

// ─── What became of a pinned prompt ──────────────────────────────────────────

/** The `pinned.status` values /api/annotations/next answers with. */
export type PinnedStatus =
  | "served"
  | "already_judged"
  | "skipped"
  | "not_in_queue";

const PINNED_STATUSES: readonly PinnedStatus[] = [
  "served",
  "already_judged",
  "skipped",
  "not_in_queue",
];

export interface PinnedOutcome {
  promptId: string;
  status: PinnedStatus;
}

/**
 * The `pinned` field of a /next response, checked. Anything that is not a
 * prompt code with a known status is "no pin", which leaves the page on its
 * ordinary path instead of guessing.
 */
export function parsePinned(raw: unknown): PinnedOutcome | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.promptId !== "string") return null;
  const status = PINNED_STATUSES.find((s) => s === o.status);
  return status ? { promptId: o.promptId, status } : null;
}

/** Why a pinned prompt is not on screen. "forbidden" is the 403: this
 *  account may not pin at all. */
export type PinnedNoticeKind = Exclude<PinnedStatus, "served"> | "forbidden";

export interface PinnedNotice {
  /** The reason, in plain words. */
  message: string;
  /** Whether "Try it in demo" makes sense: only where demo would serve it. */
  offerDemo: boolean;
}

/**
 * The one calm notice shown in place of a pinned prompt that was not served.
 * Demo is offered only for a judged prompt, where it is the real way
 * forward: demo ignores history, so the question opens, and nothing is
 * counted twice.
 */
export function pinnedNoticeFor(kind: PinnedNoticeKind): PinnedNotice {
  switch (kind) {
    case "already_judged":
      return {
        message:
          "You have already judged this question, and each person's judgment on a question is counted once. You can go through it again in demo, where nothing is counted.",
        offerDemo: true,
      };
    case "skipped":
      return {
        message:
          "You skipped or flagged this question, so it is no longer in your queue.",
        offerDemo: false,
      };
    case "forbidden":
      return {
        message:
          "Opening a specific question is for researchers. Your own queue is unchanged.",
        offerDemo: false,
      };
    case "not_in_queue":
      return {
        message:
          "This question is not in the comparison queue, so there is nothing to compare for it here.",
        offerDemo: false,
      };
  }
}
