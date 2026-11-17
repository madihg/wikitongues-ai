import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MINUTE_MS, type Ledger } from "./activity";
import { ActivityTracker, type BeatBody, type TrackerEnv } from "./activity-tracker";

/**
 * The browser side of the beat with a fake clock, a fake tab and a fake
 * network: what the hook (components/use-activity.ts) does on a real page.
 */
const T0 = Date.UTC(2026, 10, 16, 9, 0, 0);
const SEC = 1000;

function setup(over: Partial<TrackerEnv> = {}) {
  const state = { visible: true, online: true, stored: {} as Ledger };
  const sent: BeatBody[] = [];
  const env: TrackerEnv = {
    now: () => Date.now(),
    visible: () => state.visible,
    send: async (body) => {
      if (!state.online) return false;
      sent.push(body);
      return true;
    },
    load: () => state.stored,
    save: (l) => {
      state.stored = { ...l };
    },
    ...over,
  };
  const tracker = new ActivityTracker(env, "annotate");
  /** Latest total the server would hold per minute, as planWrites keeps it. */
  const serverSeconds = () => {
    const best = new Map<string, number>();
    for (const body of sent) {
      for (const b of body.beats) {
        const k = `${b.minute}|${b.surface}`;
        best.set(k, Math.max(best.get(k) ?? 0, b.activeSeconds));
      }
    }
    return [...best.values()].reduce((n, s) => n + s, 0);
  };
  return { tracker, state, sent, serverSeconds };
}

/** Let `ms` pass with a timer tick every 10 s and a beat every 30 s, as the hook does. */
async function run(
  tracker: ActivityTracker,
  ms: number,
  each?: (elapsed: number) => void,
) {
  for (let elapsed = 10 * SEC; elapsed <= ms; elapsed += 10 * SEC) {
    vi.advanceTimersByTime(10 * SEC);
    each?.(elapsed);
    if (elapsed % (30 * SEC) === 0) await tracker.beat();
    else tracker.tick();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

describe("ActivityTracker", () => {
  it("typing for 30 minutes with no submission reaches the server as 30 minutes", async () => {
    const { tracker, serverSeconds } = setup();
    await run(tracker, 30 * MINUTE_MS, () => tracker.input());
    expect(serverSeconds()).toBe(30 * 60);
  });

  it("a hidden tab counts nothing, and the clock starts again when it comes back", async () => {
    const { tracker, state, serverSeconds } = setup();
    await run(tracker, 2 * MINUTE_MS, () => tracker.input());
    state.visible = false;
    tracker.visibilityChanged();
    await run(tracker, 10 * MINUTE_MS, () => tracker.input());
    expect(serverSeconds()).toBe(2 * 60);
    state.visible = true;
    tracker.visibilityChanged();
    await run(tracker, 1 * MINUTE_MS, () => tracker.input());
    expect(serverSeconds()).toBe(3 * 60);
  });

  it("six minutes in front with no input counts 1; input after the pause restarts the clock", async () => {
    const { tracker, serverSeconds } = setup();
    await run(tracker, 6 * MINUTE_MS);
    expect(serverSeconds()).toBe(60);
    await run(tracker, 20 * MINUTE_MS);
    expect(serverSeconds()).toBe(60);
    tracker.input();
    await run(tracker, 1 * MINUTE_MS, () => tracker.input());
    expect(serverSeconds()).toBe(2 * 60);
  });

  it("a 20 second recording after a long pause counts 20 seconds, with no key press", async () => {
    const { tracker, serverSeconds } = setup();
    await run(tracker, 10 * MINUTE_MS); // 1 counted, then paused
    const before = serverSeconds();
    tracker.setBusy("recording", true);
    vi.advanceTimersByTime(20 * SEC);
    tracker.setBusy("recording", false);
    await tracker.beat(true);
    // The take itself, then the pause clock starts again from its end.
    expect(serverSeconds() - before).toBe(20);
  });

  it("time on a page goes to that page's kind of work", async () => {
    const { tracker, sent } = setup();
    await run(tracker, 1 * MINUTE_MS, () => tracker.input());
    tracker.setContext("record", false);
    await run(tracker, 1 * MINUTE_MS, () => tracker.input());
    const surfaces = new Set(sent.flatMap((b) => b.beats.map((x) => x.surface)));
    expect(surfaces).toEqual(new Set(["annotate", "record"]));
  });

  it("time in the edit drawer goes to 'edit', and back to the page when the drawer closes", async () => {
    const { tracker, sent, serverSeconds } = setup();
    await run(tracker, 2 * MINUTE_MS, () => tracker.input());
    tracker.setContext("edit", false); // the drawer opens over Annotate
    await run(tracker, 3 * MINUTE_MS, () => tracker.input());
    tracker.setContext("annotate", false); // and closes
    await run(tracker, 1 * MINUTE_MS, () => tracker.input());
    await tracker.beat(true);
    const perSurface = new Map<string, Map<number, number>>();
    for (const body of sent) {
      for (const b of body.beats) {
        const minutes = perSurface.get(b.surface) ?? new Map<number, number>();
        minutes.set(b.minute, Math.max(minutes.get(b.minute) ?? 0, b.activeSeconds));
        perSurface.set(b.surface, minutes);
      }
    }
    const total = (surface: string) =>
      [...(perSurface.get(surface)?.values() ?? [])].reduce((n, x) => n + x, 0);
    expect(total("edit")).toBe(3 * 60);
    expect(total("annotate")).toBe(3 * 60);
    // Nothing is counted twice: six minutes of work, six minutes stored.
    expect(serverSeconds()).toBe(6 * 60);
  });

  it("beats queued offline for 2 hours arrive later in their own minutes", async () => {
    const { tracker, state, sent, serverSeconds } = setup();
    state.online = false;
    await run(tracker, 2 * 60 * MINUTE_MS, () => tracker.input());
    expect(sent).toHaveLength(0);
    // The queue is in storage too, so a reload would not lose it.
    expect(Object.keys(state.stored).length).toBe(120);
    state.online = true;
    await tracker.beat(true);
    expect(serverSeconds()).toBe(2 * 60 * 60);
    const minutes = sent.flatMap((b) => b.beats.map((x) => x.minute));
    expect(Math.min(...minutes)).toBe(T0);
    expect(Math.max(...minutes)).toBe(T0 + 119 * MINUTE_MS);
    // Confirmed minutes leave the queue.
    expect(tracker.pending()).toHaveLength(0);
  });

  it("a failed send backs off instead of retrying every beat, and nothing is lost", async () => {
    const send = vi.fn().mockResolvedValue(false);
    const { tracker } = setup({ send });
    await run(tracker, 5 * MINUTE_MS, () => tracker.input());
    // 10 beats in 5 minutes; with back-off (30 s, 1 m, 2 m, ...) only a few go out.
    expect(send.mock.calls.length).toBeLessThanOrEqual(4);
    expect(tracker.pending().reduce((n, b) => n + b.activeSeconds, 0)).toBe(300);
  });

  it("starts from what an earlier visit left in storage", async () => {
    const stored: Ledger = { [`${T0 - 5 * MINUTE_MS}|listen|0`]: 42_000 };
    const { tracker, sent } = setup({ load: () => stored, save: () => {} });
    await tracker.beat(true);
    expect(sent[0].beats).toEqual([
      { minute: T0 - 5 * MINUTE_MS, surface: "listen", activeSeconds: 42, demo: false },
    ]);
  });
});
