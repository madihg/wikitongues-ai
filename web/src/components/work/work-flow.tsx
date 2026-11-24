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
  isWorkKind,
  nextWork,
  pickWork,
  WORK_LABEL,
  WORK_LINE,
  WORK_SURFACE,
  workFromSearch,
  workTabs,
  type WorkCounts,
  type WorkKind,
} from "@/lib/work-flow";

/**
 * THE ONE ANNOTATE FLOW (lib/work-flow.ts has the decision). The Annotate
 * page holds every kind of work a person has, as tabs inside the page, never
 * as lines in the sidebar:
 *
 *   [ Record 12 ] [ Check 4 ] [ Tone marks 45 ] [ Write & compare 30 ]
 *   One line: what this work is.
 *   ...the work's own screen, in the shared episode frame...
 *
 * It opens on the kind the address asks for (?work=, from a Dashboard card),
 * otherwise on the first kind in the leads' order with something waiting.
 * When a kind runs out, a line under the tabs offers the next one; the
 * person moves on with one tap. Each screen is the same component its old
 * page used, so a fix to one is a fix everywhere.
 *
 * While a tab is open the flow names its kind of work for honest time
 * (openSurface), so an hour of recording inside Annotate is counted as
 * recording, exactly as it was on the Record page.
 */

interface WorkAnswer {
  order: WorkKind[];
  counts: WorkCounts;
}

/** Reads the server's answer; anything unexpected is "not known" (null). */
export function parseWorkAnswer(body: unknown): WorkAnswer | null {
  const b = body as { order?: unknown; counts?: unknown } | null;
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
  return { order: order.length ? order : [...DEFAULT_WORK_ORDER], counts };
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

/** The address with ?work= set, everything else on it kept (demo, prompt). */
function setWorkOnAddress(kind: WorkKind) {
  const url = new URL(window.location.href);
  url.searchParams.set("work", kind);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function WorkTabs({
  tabs,
  counts,
  active,
  onPick,
}: {
  tabs: WorkKind[];
  counts: WorkCounts;
  active: WorkKind;
  onPick: (kind: WorkKind) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Kinds of work"
      data-testid="work-tabs"
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
    >
      {tabs.map((k) => {
        const n = counts[k];
        const on = k === active;
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            data-work={k}
            onClick={() => onPick(k)}
            className={`inline-flex min-h-[44px] shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-md border px-3 text-sm font-medium focus-visible:outline-none focus-visible:shadow-[var(--ring)] ${
              on
                ? "border-accent bg-accent-subtle text-accent-text"
                : "border-border-strong bg-surface text-text-secondary hover:bg-surface-sunken"
            }`}
          >
            {WORK_LABEL[k]}
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

/** Under the tabs once a kind has run out: the next kind, one tap away. */
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

export function WorkFlow() {
  const [order, setOrder] = useState<WorkKind[]>([...DEFAULT_WORK_ORDER]);
  const [counts, setCounts] = useState<WorkCounts>({ write: 0 });
  const [kind, setKind] = useState<WorkKind | null>(null);
  const [ranOut, setRanOut] = useState<WorkKind | null>(null);
  const live = useRef(true);
  // The kind the address asked for (?work=), read once on mount.
  const asked = useRef<WorkKind | null>(null);

  // The numbers, and on the first answer the kind to open: the one the
  // address asks for, else the first with work waiting. If the server cannot
  // say, Write opens: it always has a screen.
  const apply = useCallback((a: WorkAnswer | null) => {
    if (!live.current) return;
    if (a) {
      setOrder(a.order);
      setCounts(a.counts);
      setKind((k) => k ?? pickWork(a.order, a.counts, asked.current));
    } else {
      setKind((k) => k ?? "write");
    }
  }, []);
  const load = useCallback(async () => {
    const a = await fetchWork();
    apply(a);
    return a;
  }, [apply]);

  useEffect(() => {
    live.current = true;
    asked.current = workFromSearch(window.location.search);
    void fetchWork().then((a) => apply(a));
    return () => {
      live.current = false;
    };
  }, [apply]);

  // A saved clip moves the numbers on the tabs.
  useEffect(() => {
    const again = () => void load();
    window.addEventListener("lab:clip-saved", again);
    return () => window.removeEventListener("lab:clip-saved", again);
  }, [load]);

  // Honest time: while a tab is open its kind of work is named. Write is the
  // page's own kind (annotate), so it needs no name.
  useEffect(() => {
    if (!kind || kind === "write") return;
    return openSurface(WORK_SURFACE[kind]);
  }, [kind]);

  const choose = (k: WorkKind) => {
    setKind(k);
    setRanOut(null);
    setWorkOnAddress(k);
    void load();
  };

  // Stable per kind, so a screen's effect does not fire again on a re-render.
  const onEmpty = useCallback(
    (k: WorkKind) => {
      void load().then(() => {
        if (live.current) setRanOut(k);
      });
    },
    [load],
  );
  const emptyRecord = useCallback(() => onEmpty("record"), [onEmpty]);
  const emptyCheck = useCallback(() => onEmpty("check"), [onEmpty]);
  const emptyTone = useCallback(() => onEmpty("tone"), [onEmpty]);
  const emptyWrite = useCallback(() => onEmpty("write"), [onEmpty]);
  const emptyListen = useCallback(() => onEmpty("listen"), [onEmpty]);

  if (!kind) {
    return <p className="text-sm text-text-tertiary">Loading your work...</p>;
  }

  const tabs = workTabs(order, counts);
  const next = ranOut === kind ? nextWork(order, counts, kind) : null;

  return (
    <div data-testid="work-flow" data-work-active={kind} className="space-y-4">
      {tabs.length > 1 && (
        <WorkTabs tabs={tabs} counts={counts} active={kind} onPick={choose} />
      )}
      <p className="text-sm text-text-tertiary">{WORK_LINE[kind]}</p>
      {ranOut === kind && (
        <RanOutLine
          kind={kind}
          next={next}
          count={next ? counts[next] : undefined}
          onGo={choose}
        />
      )}

      <div key={kind}>
        {kind === "record" && (
          <div className="space-y-6">
            <SpeechWalkthrough
              onCheck={
                typeof counts.check === "number" ? () => choose("check") : undefined
              }
            />
            <RecordInterface onEmpty={emptyRecord} />
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
        )}
        {kind === "check" && <CheckInterface onEmpty={emptyCheck} />}
        {kind === "tone" && <ToneInterface onEmpty={emptyTone} />}
        {kind === "write" && <AnnotationInterface onEmpty={emptyWrite} />}
        {kind === "listen" && <ListenInterface onEmpty={emptyListen} />}
      </div>
    </div>
  );
}
