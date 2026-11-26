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
 * THE MIXED STREAM (review of 2026-11-25). Annotate hands out one task at a
 * time and mixes the kinds: a run of each kind in the leads' order (10
 * recordings, then 5 checks, then 3 text episodes...), round and round,
 * skipping a kind with nothing waiting. A strict order starved everything
 * behind Record: each annotator has hundreds of past answers with no clip,
 * so Check (the gate to training) would not come up for weeks. A person can
 * still stick to one kind with the filter above the work (`?work=`).
 *
 * ONE PROMPT, TEXT THEN SPEECH (Halim, 2026-11-26: "they annotate text for
 * one prompt and then record speech for that prompt... that would be more
 * efficient"). A new prompt is one task with both halves: in Write, the
 * speaker writes the answer, says it straight away (the "Say it" step, the
 * speech layer on), then compares the AI answers. So Write comes first in
 * the stream, and Record is the catch-up: the answers written before
 * recording existed (134 to 565 per annotator) and any answer whose "Say
 * it" was skipped. Record still needs its place in the mix until that
 * backlog is gone.
 *
 * The order and the run lengths are the leads' choice, not the code's: they
 * are read from ANNOTATE_ORDER, a comma separated list of the kinds below,
 * each with an optional run length ("record:10,check:5,write"), and fall
 * back to DEFAULT_WORK_ORDER and DEFAULT_WORK_RUN. Speech stays the
 * priority (the 2026-11-24 call): the first two kinds both end in a clip.
 * The separate tone mark pass comes last until the tone call with Salem and
 * Agnes.
 * Client-safe and pure: no server imports.
 */

export const WORK_KINDS = ["record", "check", "tone", "write", "listen"] as const;
export type WorkKind = (typeof WORK_KINDS)[number];

/**
 * A new prompt first (written, then said), then the catch-up recordings,
 * then checking and listening, tone marks last.
 */
export const DEFAULT_WORK_ORDER: readonly WorkKind[] = [
  "write",
  "record",
  "check",
  "listen",
  "tone",
];

/**
 * How many tasks of each kind come in a row in the mixed stream before it
 * moves on. Starting values, for the leads to tune (ANNOTATE_ORDER): a
 * recording or a check takes a minute or two, a text episode several.
 */
export const DEFAULT_WORK_RUN: Readonly<Record<WorkKind, number>> = {
  record: 10,
  check: 5,
  write: 3,
  listen: 5,
  tone: 10,
};

/** The longest run the leads may set. */
export const MAX_WORK_RUN = 50;

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
    "Answers you wrote earlier that have no recording yet. Read each one out loud, then its English meaning. Nothing is shared until you choose.",
  check:
    "Listen to someone else's clip and read what they wrote. Does the recording match the text?",
  // Halim's wording, word for word (it was the Pass 2 page's instruction).
  tone: TONE_INSTRUCTION,
  write:
    "Write how you would say it and say it out loud, then compare two AI answers, say why the loser fails and fix the one you chose.",
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

/** The leads' plan: the order of the kinds and how long a run of each is. */
export interface WorkPlan {
  order: WorkKind[];
  runs: Record<WorkKind, number>;
}

/**
 * The plan the leads set in ANNOTATE_ORDER: the kinds named, in that order,
 * then any kind it leaves out, in the default order. "check:5" sets a run
 * length (whole numbers 1 to MAX_WORK_RUN; anything else keeps the default).
 * Unknown names and repeats are dropped, so a typo can never hide a kind.
 */
export function parseWorkPlan(raw: string | null | undefined): WorkPlan {
  const named: WorkKind[] = [];
  const runs: Record<WorkKind, number> = { ...DEFAULT_WORK_RUN };
  for (const part of (raw ?? "").split(",")) {
    const [name, size] = part.split(":");
    const k = name.trim().toLowerCase();
    if (!isWorkKind(k) || named.includes(k)) continue;
    named.push(k);
    const n = Number((size ?? "").trim());
    if (size !== undefined && Number.isInteger(n) && n >= 1 && n <= MAX_WORK_RUN) {
      runs[k] = n;
    }
  }
  return {
    order: [...named, ...DEFAULT_WORK_ORDER.filter((k) => !named.includes(k))],
    runs,
  };
}

/** The order alone (see parseWorkPlan). */
export function parseWorkOrder(raw: string | null | undefined): WorkKind[] {
  return parseWorkPlan(raw).order;
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

/**
 * In the mixed stream, after a task of `kind` is done (`doneInRun` of them
 * in a row now): the kind to show next. The same kind until its run is over
 * or it has nothing left, then the next kind in the leads' order with
 * something waiting. Nothing else waiting: the same kind (its screen says
 * when it is empty).
 */
export function streamNext(
  plan: WorkPlan,
  counts: WorkCounts,
  kind: WorkKind,
  doneInRun: number,
): WorkKind {
  if ((counts[kind] ?? 0) > 0 && doneInRun < plan.runs[kind]) return kind;
  return nextWork(plan.order, counts, kind) ?? kind;
}

/** One task of each kind, in words. */
export const WORK_UNIT: Record<WorkKind, string> = {
  record: "recording",
  check: "clip to check",
  write: "prompt",
  listen: "pair",
  tone: "answer to mark",
};

/**
 * The line over the work in the mixed stream: what comes after this run,
 * counting the task on screen. Null when nothing else waits.
 */
export function streamLine(
  plan: WorkPlan,
  counts: WorkCounts,
  kind: WorkKind,
  doneInRun: number,
): string | null {
  const next = nextWork(plan.order, counts, kind);
  if (!next) return null;
  const waiting = counts[kind] ?? 0;
  const left = Math.max(1, Math.min(plan.runs[kind] - doneInRun, waiting || 1));
  const one = WORK_UNIT[kind];
  return left === 1
    ? `After this ${one}: ${WORK_LABEL[next]}.`
    : `This ${one} and ${left - 1} more, then ${WORK_LABEL[next]}.`;
}

/** `?work=` on the Annotate address: the kind to open, or null. */
export function workFromSearch(search: string): WorkKind | null {
  const v = new URLSearchParams(search).get("work");
  return isWorkKind(v) ? v : null;
}

/**
 * How Annotate opens for an address: on one kind when the address names it
 * (`?work=`, from a Dashboard card), on Write when it carries a text episode
 * of its own (`?prompt=` from the review drawer, `?demo=` from the arena
 * demo launcher), otherwise mixed. Null: open the mixed stream.
 */
export function workAskedBy(search: string): WorkKind | null {
  const asked = workFromSearch(search);
  if (asked) return asked;
  const p = new URLSearchParams(search);
  return p.get("prompt")?.trim() || p.get("demo")?.trim() ? "write" : null;
}

/** The Annotate address that opens one kind of work. */
export function workHref(kind: WorkKind): string {
  return `/annotator/annotate?work=${kind}`;
}
