import type { Surface } from "@/lib/activity";
import { TONE_INSTRUCTION } from "@/lib/tone/tone-copy";

/**
 * ONE ANNOTATE FLOW (decided on the 2026-11-24 call, Halim: "the task itself
 * can change, but I don't want them to go to different tabs on the left-hand
 * side"). Every kind of work a person does lives in the one Annotate tab:
 * recording their answers, checking other speakers' clips, tone marks,
 * writing and comparing answers, and listening to voices. The kinds are
 * modules: a new one (conversational recordings, for example) is one more
 * entry here and one more screen in the flow, never a new sidebar line.
 *
 * Which kind comes first is the leads' choice, not the code's: the order is
 * read from ANNOTATE_ORDER (a comma separated list of the kinds below) and
 * falls back to DEFAULT_WORK_ORDER. Speech comes first while the speech data
 * is the priority (the same call). Client-safe and pure: no server imports.
 */

export const WORK_KINDS = ["record", "check", "tone", "write", "listen"] as const;
export type WorkKind = (typeof WORK_KINDS)[number];

/** Speech first (record, then check), then tone marks, then text. */
export const DEFAULT_WORK_ORDER: readonly WorkKind[] = [
  "record",
  "check",
  "tone",
  "write",
  "listen",
];

/** The name of each kind of work, on its tab in the flow. */
export const WORK_LABEL: Record<WorkKind, string> = {
  record: "Record",
  check: "Check",
  tone: "Tone marks",
  write: "Write & compare",
  listen: "Listen",
};

/** One line under the tabs: what this kind of work is. */
export const WORK_LINE: Record<WorkKind, string> = {
  record:
    "Read your own answer out loud, then its English meaning. Nothing is shared until you choose.",
  check:
    "Listen to someone else's clip and read what they wrote. Does the recording match the text?",
  // Halim's wording, word for word (it was the Pass 2 page's instruction).
  tone: TONE_INSTRUCTION,
  write:
    "Write how you would say it, then compare two AI answers, say why the loser fails and fix the one you chose.",
  listen:
    "Two voices say the same prompt. Pick the one that sounds better, and say why.",
};

/**
 * The kind of work each tab counts as for honest time (lib/activity.ts).
 * The flow names it while the tab is open, so an hour of recording inside
 * Annotate is still an hour of recording on the time sheet.
 */
export const WORK_SURFACE: Record<WorkKind, Surface> = {
  record: "record",
  check: "check",
  tone: "tone",
  write: "annotate",
  listen: "listen",
};

/** Kinds that need the speech layer to be on for the person. */
export const SPEECH_KINDS: readonly WorkKind[] = ["record", "check", "listen"];

export function isWorkKind(v: unknown): v is WorkKind {
  return typeof v === "string" && (WORK_KINDS as readonly string[]).includes(v);
}

/**
 * The order the leads set: the kinds named in `raw`, in that order, then any
 * kind it leaves out, in the default order. Unknown names and repeats are
 * dropped, so a typo can never hide a kind of work.
 */
export function parseWorkOrder(raw: string | null | undefined): WorkKind[] {
  const named: WorkKind[] = [];
  for (const part of (raw ?? "").split(",")) {
    const k = part.trim().toLowerCase();
    if (isWorkKind(k) && !named.includes(k)) named.push(k);
  }
  return [...named, ...DEFAULT_WORK_ORDER.filter((k) => !named.includes(k))];
}

/**
 * How much of each kind waits for this person. A kind the person does not
 * have at all (speech off, no tone items given) is absent, not zero: it gets
 * no tab.
 */
export type WorkCounts = Partial<Record<WorkKind, number>>;

/** The tabs this person gets, in the leads' order. Write is always there. */
export function workTabs(order: readonly WorkKind[], counts: WorkCounts): WorkKind[] {
  return order.filter((k) => k === "write" || typeof counts[k] === "number");
}

/**
 * The kind to open: the one asked for (a Dashboard card, the address) when
 * the person has it, otherwise the first in the leads' order with something
 * waiting, otherwise Write, which always has a screen.
 */
export function pickWork(
  order: readonly WorkKind[],
  counts: WorkCounts,
  asked?: WorkKind | null,
): WorkKind {
  const tabs = workTabs(order, counts);
  if (asked && tabs.includes(asked)) return asked;
  return tabs.find((k) => (counts[k] ?? 0) > 0) ?? "write";
}

/** The next kind with something waiting after `from`, in the leads' order. */
export function nextWork(
  order: readonly WorkKind[],
  counts: WorkCounts,
  from: WorkKind,
): WorkKind | null {
  const tabs = workTabs(order, counts);
  const i = tabs.indexOf(from);
  const after = [...tabs.slice(i + 1), ...tabs.slice(0, Math.max(i, 0))];
  return after.find((k) => k !== from && (counts[k] ?? 0) > 0) ?? null;
}

/** `?work=` on the Annotate address: the kind to open, or null. */
export function workFromSearch(search: string): WorkKind | null {
  const v = new URLSearchParams(search).get("work");
  return isWorkKind(v) ? v : null;
}

/** The Annotate address that opens one kind of work. */
export function workHref(kind: WorkKind): string {
  return `/annotator/annotate?work=${kind}`;
}
