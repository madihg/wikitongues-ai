"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnnotationInterface } from "@/components/annotation-interface";
import { CheckInterface } from "@/components/lab/check-interface";
import { ListenInterface } from "@/components/lab/listen-interface";
import { RecordInterface } from "@/components/lab/record-interface";
import { SpeechWalkthrough } from "@/components/lab/speech-walkthrough";
import { ToneInterface } from "@/components/tone/tone-interface";
import { openSurface } from "@/lib/activity-signal";
import {
  DEFAULT_WORK_ORDER,
  DEFAULT_WORK_RUN,
  isWorkKind,
  MAX_WORK_RUN,
  nextWork,
  pickWork,
  streamLine,
  streamNext,
  WORK_KINDS,
  WORK_LABEL,
  WORK_LINE,
  WORK_SURFACE,
  workAskedBy,
  workTabs,
  type WorkCounts,
  type WorkKind,
  type WorkPlan,
} from "@/lib/work-flow";

/**
 * THE ONE ANNOTATE FLOW (lib/work-flow.ts has the decisions). The Annotate
 * page holds every kind of work a person has, never as lines in the sidebar:
 *
 *   [ All ] [ Record 12 ] [ Check 4 ] [ Write & compare 30 ] [ Tone marks 45 ]
 *   Record. Read your own answer out loud...   This recording and 9 more, then Check.
 *   ...the work's own screen, in the shared episode frame...
 *
 * ALL (the default) is the mixed stream: one task at a time, a run of each
 * kind in the leads' order, so Check and Write come up even though Record
 * almost never runs out. The kind changes only between tasks, when a screen
 * says one is finished (onDone), never in the middle of one. A kind picked
 * above the work (or named by the address, ?work=, as the Dashboard cards
 * do) is a filter: the flow stays on it and, when it runs out, offers the
 * next kind in one tap.
 *
 * Every screen once shown stays mounted, hidden while another kind is on
 * screen, so moving away never loses a take, a verdict picked but not sent,
 * or a tone edit. A hidden screen is quiet: its audio is paused, its keys
 * are off and its timers stop. While the Record screen has the microphone on
 * or a clip uploading, the other kinds wait. The same holds for Write while
 * its "Say it" step is recording: a new prompt is written and then said in
 * one task (lib/work-flow.ts, ONE PROMPT, TEXT THEN SPEECH), and Record is
 * the catch-up for earlier answers with no clip.
 *
 * Each screen is the same component its old page used, so a fix to one is a
 * fix everywhere. While a kind is on screen the flow names it for honest
 * time (openSurface), so recording inside Annotate counts as recording.
 */

interface WorkAnswer extends WorkPlan {
  counts: WorkCounts;
}

/** Reads the server's answer; anything unexpected is "not known" (null). */
export function parseWorkAnswer(body: unknown): WorkAnswer | null {
  const b = body as { order?: unknown; counts?: unknown; runs?: unknown } | null;
  if (!b || !Array.isArray(b.order) || !b.counts || typeof b.counts !== "object") {
    return null;
  }
  const order = b.order.filter(isWorkKind);
  const counts: WorkCounts = {};
  for (const [k, v] of Object.entries(b.counts as Record<string, unknown>)) {
    if (isWorkKind(k) && typeof v === "number" && Number.isFinite(v) && v >= 0) {
      counts[k] = v;
    }
  }
  const runs: Record<WorkKind, number> = { ...DEFAULT_WORK_RUN };
  if (b.runs && typeof b.runs === "object") {
    for (const [k, v] of Object.entries(b.runs as Record<string, unknown>)) {
      if (isWorkKind(k) && Number.isInteger(v) && (v as number) >= 1 && (v as number) <= MAX_WORK_RUN) {
        runs[k] = v as number;
      }
    }
  }
  return { order: order.length ? order : [...DEFAULT_WORK_ORDER], runs, counts };
}

/** GET /api/annotator/work; any failure is "not known" (null). */
async function fetchWork(): Promise<WorkAnswer | null> {
  try {
    const res = await fetch("/api/annotator/work");
    return res.ok ? parseWorkAnswer(await res.json()) : null;
  } catch {
    return null;
  }
}

/** The address with ?work= set (one kind) or taken off (All), the rest kept. */
function setWorkOnAddress(kind: WorkKind | null) {
  const url = new URL(window.location.href);
  if (kind) url.searchParams.set("work", kind);
  else url.searchParams.delete("work");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

const TAB =
  "inline-flex min-h-[44px] shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-md border px-3 text-sm font-medium focus-visible:outline-none focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60";
const TAB_ON = "border-accent bg-accent-subtle text-accent-text";
const TAB_OFF = "border-border-strong bg-surface text-text-secondary hover:bg-surface-sunken";

/**
 * The filter above the work: All (the mixed stream), then one button per
 * kind the person has, with what waits in it. In the stream, the kind on
 * screen is marked with a dot.
 */
export function WorkTabs({
  tabs,
  counts,
  active,
  mixed,
  locked = false,
  onAll,
  onPick,
}: {
  tabs: WorkKind[];
  counts: WorkCounts;
  active: WorkKind;
  mixed: boolean;
  /** The microphone is on: every kind but the one on screen waits. */
  locked?: boolean;
  onAll: () => void;
  onPick: (kind: WorkKind) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Kinds of work"
      data-testid="work-tabs"
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
    >
      <button
        type="button"
        aria-pressed={mixed}
        data-work="all"
        onClick={onAll}
        className={`${TAB} ${mixed ? TAB_ON : TAB_OFF}`}
      >
        All
      </button>
      {tabs.map((k) => {
        const n = counts[k];
        const on = !mixed && k === active;
        const current = mixed && k === active;
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            data-work={k}
            data-current={current || undefined}
            disabled={locked && k !== active}
            onClick={() => onPick(k)}
            className={`${TAB} ${on ? TAB_ON : TAB_OFF}`}
          >
            {current && (
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent" />
            )}
            {WORK_LABEL[k]}
            {current && <span className="sr-only"> (on screen now)</span>}
            {typeof n === "number" && n > 0 && (
              <span
                data-testid="work-count"
                className="inline-flex min-w-6 items-center justify-center rounded-full bg-accent px-2 py-0.5 text-xs font-semibold tabular-nums text-accent-contrast"
              >
                {n}
                <span className="sr-only"> waiting</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Under the filter once a kind has run out: the next kind, one tap away. */
export function RanOutLine({
  kind,
  next,
  count,
  onGo,
}: {
  kind: WorkKind;
  next: WorkKind | null;
  count: number | undefined;
  onGo: (kind: WorkKind) => void;
}) {
  return (
    <div
      data-testid="work-ran-out"
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-sunken px-3 py-2 text-sm text-text-secondary"
    >
      <span>
        {next
          ? `Nothing left in ${WORK_LABEL[kind]} right now. Next: ${WORK_LABEL[next]}.`
          : `Nothing left in ${WORK_LABEL[kind]} right now, and nothing else is waiting.`}
      </span>
      {next && (
        <button
          type="button"
          onClick={() => onGo(next)}
          className="min-h-[44px] cursor-pointer rounded-md bg-accent px-4 text-sm font-medium text-accent-contrast hover:bg-accent-hover focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
        >
          Go on to {WORK_LABEL[next]}
          {typeof count === "number" && count > 0 ? ` (${count})` : ""}
        </button>
      )}
    </div>
  );
}

/** The server's number for each kind whose screen found nothing left. */
export type Emptied = Partial<Record<WorkKind, number>>;

/**
 * The numbers the flow goes by: a kind whose screen found nothing left
 * counts as zero (its queue may leave out items its count includes) until
 * the server's number for it grows past what it was then: new work came in.
 */
export function withEmptied(counts: WorkCounts, emptied: Emptied): WorkCounts {
  const out: WorkCounts = { ...counts };
  for (const k of WORK_KINDS) {
    const at = emptied[k];
    const n = out[k];
    if (typeof at === "number" && typeof n === "number" && n <= at) out[k] = 0;
  }
  return out;
}

export function WorkFlow() {
  const [plan, setPlan] = useState<WorkPlan>({
    order: [...DEFAULT_WORK_ORDER],
    runs: { ...DEFAULT_WORK_RUN },
  });
  const [serverCounts, setServerCounts] = useState<WorkCounts>({ write: 0 });
  const [kind, setKind] = useState<WorkKind | null>(null);
  // All (the mixed stream) or one kind (the filter).
  const [mixed, setMixed] = useState(true);
  // Tasks done in a row of the kind on screen, in the stream.
  const [run, setRun] = useState(0);
  // The screens shown so far: they stay mounted, hidden when not on screen.
  const [mounted, setMounted] = useState<WorkKind[]>([]);
  // Kinds whose screen found nothing left in this sitting (see withEmptied);
  // shown again, the screen starts afresh (a new key) and asks its queue.
  const [emptied, setEmptied] = useState<Emptied>({});
  const [fresh, setFresh] = useState<Partial<Record<WorkKind, number>>>({});
  const [ranOut, setRanOut] = useState<WorkKind | null>(null);
  // The kinds whose screen has the microphone on or a clip uploading: Record,
  // and Write while its "Say it" step is recording.
  const [liveKinds, setLiveKinds] = useState<WorkKind[]>([]);
  const setLive = (k: WorkKind, l: boolean) => {
    setLiveKinds((all) =>
      all.includes(k) === l ? all : l ? [...all, k] : all.filter((x) => x !== k),
    );
    if (!l) setHeld(false);
  };
  // The screen in view is recording: it must not be moved out of sight.
  const liveNow = kind !== null && liveKinds.includes(kind);
  const [held, setHeld] = useState(false);
  // Said to a screen reader when the stream moves to another kind.
  const [announce, setAnnounce] = useState("");
  const live = useRef(true);
  const boxes = useRef<Partial<Record<WorkKind, HTMLDivElement | null>>>({});

  const counts = withEmptied(serverCounts, emptied);

  const show = (k: WorkKind) => {
    setKind(k);
    setMounted((m) => (m.includes(k) ? m : [...m, k]));
    setRanOut(null);
    setHeld(false);
    setAnnounce("");
  };

  // The plan and the numbers; on the first answer, how to open: the kind the
  // address asks for, as a filter, else the stream from the first kind with
  // work waiting. If the server cannot say, Write opens: it always has a
  // screen.
  const opened = useRef(false);
  const apply = useCallback((a: WorkAnswer | null, asked?: WorkKind | null) => {
    if (!live.current) return;
    if (a) {
      setPlan({ order: a.order, runs: a.runs });
      setServerCounts(a.counts);
    }
    if (opened.current) return;
    opened.current = true;
    const tabs: WorkKind[] = a ? workTabs(a.order, a.counts) : ["write"];
    const one = asked && tabs.includes(asked) ? asked : null;
    const first = one ?? (a ? pickWork(a.order, a.counts) : "write");
    setMixed(!one);
    setMounted([first]);
    setKind(first);
  }, []);
  const reload = useCallback(() => fetchWork().then((a) => apply(a)), [apply]);

  useEffect(() => {
    live.current = true;
    const asked = workAskedBy(window.location.search);
    void fetchWork().then((a) => apply(a, asked));
    return () => {
      live.current = false;
    };
  }, [apply]);

  // A saved clip moves the numbers.
  useEffect(() => {
    const again = () => void reload();
    window.addEventListener("lab:clip-saved", again);
    return () => window.removeEventListener("lab:clip-saved", again);
  }, [reload]);

  // Honest time: while a kind is on screen its kind of work is named. Write
  // is the page's own kind (annotate), so it needs no name.
  useEffect(() => {
    if (!kind || kind === "write") return;
    return openSurface(WORK_SURFACE[kind]);
  }, [kind]);

  // A hidden screen is quiet: nothing keeps playing behind the one in view.
  useEffect(() => {
    for (const k of WORK_KINDS) {
      if (k === kind) continue;
      boxes.current[k]?.querySelectorAll("audio, video").forEach((el) => {
        (el as HTMLMediaElement).pause();
      });
    }
  }, [kind]);

  /** Show a kind again; a screen that found nothing starts afresh. */
  const reopen = (k: WorkKind) => {
    if (typeof emptied[k] === "number") {
      setEmptied((e) => {
        const rest = { ...e };
        delete rest[k];
        return rest;
      });
      setFresh((f) => ({ ...f, [k]: (f[k] ?? 0) + 1 }));
    }
    show(k);
  };

  // The filter: one kind, until All is pressed.
  const pick = (k: WorkKind) => {
    if (liveNow && k !== kind) {
      setHeld(true);
      return;
    }
    setMixed(false);
    setRun(0);
    reopen(k);
    setWorkOnAddress(k);
    void reload();
  };
  const all = () => {
    setMixed(true);
    setRun(0);
    setRanOut(null);
    setHeld(false);
    setWorkOnAddress(null);
    if (kind && (counts[kind] ?? 0) === 0 && !liveNow) {
      const next = nextWork(plan.order, counts, kind);
      if (next) reopen(next);
    }
    void reload();
  };
  // Moving on in the one-kind filter, from the "nothing left" line.
  const goOn = (k: WorkKind) => {
    setMixed(false);
    setRun(0);
    reopen(k);
    setWorkOnAddress(k);
    void reload();
  };

  // A screen finished one task. In the stream, the next task may be another
  // kind: decided now, on the numbers less the task just done, so the next
  // screen comes straight away; the numbers are then asked for again.
  const done = (k: WorkKind) => {
    void reload();
    if (!mixed || k !== kind) return;
    const left: WorkCounts = { ...counts, [k]: Math.max(0, (counts[k] ?? 1) - 1) };
    const n = run + 1;
    const next = streamNext(plan, left, k, n);
    if (next === k) {
      setRun(n);
      return;
    }
    setRun(0);
    reopen(next);
    setAnnounce(`Now: ${WORK_LABEL[next]}.`);
  };

  // A screen found nothing left. A hidden one only updates the numbers.
  const empty = (k: WorkKind) => {
    // Zero from now on, then the server's number once it has answered, so
    // only work that comes in later brings the kind back.
    setEmptied((e) => ({ ...e, [k]: serverCounts[k] ?? 0 }));
    void fetchWork().then((a) => {
      apply(a);
      if (a && live.current) setEmptied((e) => ({ ...e, [k]: a.counts[k] ?? 0 }));
    });
    if (k !== kind) return;
    if (mixed) {
      const next = nextWork(plan.order, { ...counts, [k]: 0 }, k);
      if (next) {
        setRun(0);
        reopen(next);
        setAnnounce(`Nothing left in ${WORK_LABEL[k]}. Now: ${WORK_LABEL[next]}.`);
        return;
      }
    }
    setRanOut(k);
  };

  if (!kind) {
    return <p className="text-sm text-text-tertiary">Loading your work...</p>;
  }

  const tabs = workTabs(plan.order, counts);
  const next = ranOut === kind ? nextWork(plan.order, counts, kind) : null;
  const line = mixed && ranOut !== kind ? streamLine(plan, counts, kind, run) : null;
  const shown = mounted.includes(kind) ? mounted : [...mounted, kind];

  const screen = (k: WorkKind) => {
    const on = k === kind;
    const onDone = () => done(k);
    const onEmpty = () => empty(k);
    switch (k) {
      case "record":
        return (
          <div className="space-y-6">
            <SpeechWalkthrough
              onCheck={typeof counts.check === "number" ? () => pick("check") : undefined}
            />
            <RecordInterface
              onEmpty={onEmpty}
              onDone={onDone}
              onLiveChange={(l) => setLive("record", l)}
            />
            <p className="text-sm text-text-tertiary">
              Your dialect and the details that help the voice model are on{" "}
              <Link
                href="/speak/profile"
                className="font-medium text-accent-text underline-offset-2 hover:underline"
              >
                your speaker profile
              </Link>
              .
            </p>
          </div>
        );
      case "check":
        return <CheckInterface onEmpty={onEmpty} onDone={onDone} />;
      case "tone":
        return <ToneInterface onEmpty={onEmpty} onDone={onDone} active={on} />;
      case "write":
        return (
          <AnnotationInterface
            onEmpty={onEmpty}
            onDone={onDone}
            active={on}
            onLiveChange={(l) => setLive("write", l)}
          />
        );
      case "listen":
        return <ListenInterface onEmpty={onEmpty} onDone={onDone} />;
    }
  };

  return (
    <div
      data-testid="work-flow"
      data-work-active={kind}
      data-work-mode={mixed ? "all" : "one"}
      className="space-y-4"
    >
      {tabs.length > 1 && (
        <WorkTabs
          tabs={tabs}
          counts={counts}
          active={kind}
          mixed={mixed}
          locked={liveNow}
          onAll={all}
          onPick={pick}
        />
      )}
      {held && (
        <p role="status" className="text-sm text-text-secondary">
          Finish this recording first: stop it, or let it finish saving. Then
          switch.
        </p>
      )}
      <div className="space-y-1 text-sm">
        <p className="text-text-tertiary">
          <span className="font-medium text-text-secondary">{WORK_LABEL[kind]}.</span>{" "}
          {WORK_LINE[kind]}
        </p>
        {line && (
          <p data-testid="work-stream-line" className="text-text-tertiary">
            {line}
          </p>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {ranOut === kind && (
        <RanOutLine
          kind={kind}
          next={next}
          count={next ? counts[next] : undefined}
          onGo={goOn}
        />
      )}

      {shown.map((k) => (
        <div
          key={`${k}-${fresh[k] ?? 0}`}
          data-work-screen={k}
          hidden={k !== kind}
          ref={(el) => {
            boxes.current[k] = el;
          }}
        >
          {screen(k)}
        </div>
      ))}
    </div>
  );
}
