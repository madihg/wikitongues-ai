"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { BEAT_INTERVAL_MS, surfaceForPath, type Ledger } from "@/lib/activity";
import { onBusy } from "@/lib/activity-signal";
import {
  ActivityTracker,
  type BeatBody,
  type TrackerEnv,
} from "@/lib/activity-tracker";

/**
 * Counts the time a signed-in person is really working (annotator experience
 * spec, section 10): the tab in front, and a key press, tap, scroll,
 * recording or clip playing in the last 5 minutes. Mounted once, in the
 * (app) layout.
 *
 * It listens for THAT something happened, never WHAT: no key, no text, no
 * position, no screen. The rules live in lib/activity.ts and
 * lib/activity-tracker.ts; this file only connects them to the page.
 */

const PING_URL = "/api/activity/ping";
const TICK_MS = 10_000;
/** Listened for in the capture phase, passively: they only stamp a time. */
const INPUT_EVENTS = [
  "keydown",
  "pointerdown",
  "touchstart",
  "wheel",
  "scroll",
] as const;

export function storageKey(userId: string): string {
  // Per person: a ledger left behind by someone else on a shared computer
  // must never be sent under another account.
  return `wt.activity.v1.${userId}`;
}

function readLedger(key: string): Ledger {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Ledger) : {};
  } catch {
    return {};
  }
}

function writeLedger(key: string, ledger: Ledger): void {
  try {
    if (Object.keys(ledger).length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(ledger));
  } catch {
    // Storage full or blocked: the beat still works while the page is open.
  }
}

async function sendBeats(body: BeatBody): Promise<boolean> {
  const res = await fetch(PING_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  });
  if (!res.ok) return false;
  const json = (await res.json().catch(() => null)) as {
    ok?: boolean;
    pending?: boolean;
  } | null;
  // `pending`: the table is not there yet. Keep the beats and try later.
  return json?.ok === true && json.pending !== true;
}

function isDemoUrl(): boolean {
  return new URLSearchParams(window.location.search).has("demo");
}

export function useActivity(userId: string | null | undefined): void {
  const pathname = usePathname();
  const tracker = useRef<ActivityTracker | null>(null);

  useEffect(() => {
    if (!userId) return;
    const key = storageKey(userId);
    const env: TrackerEnv = {
      now: () => Date.now(),
      visible: () => document.visibilityState === "visible",
      send: sendBeats,
      load: () => readLedger(key),
      save: (ledger) => writeLedger(key, ledger),
    };
    const t = new ActivityTracker(
      env,
      surfaceForPath(window.location.pathname),
      isDemoUrl(),
    );
    tracker.current = t;

    const onInput = () => t.input();
    for (const name of INPUT_EVENTS) {
      document.addEventListener(name, onInput, { capture: true, passive: true });
    }

    // Clips play in <audio> elements. Their events do not bubble, so they
    // are caught on the way down. An element that left the page while
    // playing sends no "pause": the check below drops it.
    const playing = new Set<HTMLMediaElement>();
    const syncPlaying = () => {
      for (const el of playing) {
        if (!el.isConnected || el.paused || el.ended) playing.delete(el);
      }
      t.setBusy("playing", playing.size > 0);
    };
    const onPlaying = (e: Event) => {
      if (e.target instanceof HTMLMediaElement) playing.add(e.target);
      syncPlaying();
    };
    const onStopped = (e: Event) => {
      if (e.target instanceof HTMLMediaElement) playing.delete(e.target);
      syncPlaying();
    };
    document.addEventListener("playing", onPlaying, true);
    for (const name of ["pause", "ended", "emptied"]) {
      document.addEventListener(name, onStopped, true);
    }
    const offBusy = onBusy((kind, on) => t.setBusy(kind, on));

    const onVisibility = () => {
      t.visibilityChanged();
      // Going behind: send now, the timer may not run again for a while.
      if (document.visibilityState !== "visible") void t.beat(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    const onLeave = () => {
      t.tick();
      t.persist();
      void t.beat(true);
    };
    window.addEventListener("pagehide", onLeave);
    const onOnline = () => void t.beat(true);
    window.addEventListener("online", onOnline);

    let sinceBeat = 0;
    const timer = window.setInterval(() => {
      syncPlaying();
      t.setContext(surfaceForPath(window.location.pathname), isDemoUrl());
      sinceBeat += TICK_MS;
      if (sinceBeat >= BEAT_INTERVAL_MS) {
        sinceBeat = 0;
        void t.beat();
      } else {
        t.tick();
      }
    }, TICK_MS);
    // Anything left over from an earlier visit goes out at once.
    void t.beat(true);

    return () => {
      window.clearInterval(timer);
      for (const name of INPUT_EVENTS) {
        document.removeEventListener(name, onInput, { capture: true });
      }
      document.removeEventListener("playing", onPlaying, true);
      for (const name of ["pause", "ended", "emptied"]) {
        document.removeEventListener(name, onStopped, true);
      }
      offBusy();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("online", onOnline);
      onLeave();
      tracker.current = null;
    };
  }, [userId]);

  // Moving to another page: the time so far belongs to the page just left.
  useEffect(() => {
    tracker.current?.setContext(surfaceForPath(pathname), isDemoUrl());
  }, [pathname]);
}
