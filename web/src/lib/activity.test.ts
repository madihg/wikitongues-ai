import { describe, it, expect } from "vitest";
import {
  IDLE_LIMIT_MS,
  LATE_LIMIT_MS,
  MINUTE_MS,
  activeSpan,
  addSpan,
  countSittings,
  formatWorked,
  ledgerBeats,
  mergeLedgers,
  normalizeBeats,
  planWrites,
  pruneLedger,
  sumActiveSeconds,
  surfaceForPath,
  type ActivityFacts,
  type Ledger,
} from "./activity";

// 2026-11-16T09:00:00Z, a whole minute.
const T0 = Date.UTC(2026, 10, 16, 9, 0, 0);
const SEC = 1000;

/**
 * Walk a stretch of time the way the browser does: a tick every `step`,
 * with the facts given for each moment.
 */
function walk(
  ms: number,
  facts: (t: number) => ActivityFacts,
  step = 10 * SEC,
): Ledger {
  const ledger: Ledger = {};
  for (let t = T0; t < T0 + ms; t += step) {
    const to = Math.min(T0 + ms, t + step);
    const span = activeSpan(t, to, facts(t));
    if (span) addSpan(ledger, span[0], span[1], "annotate");
  }
  return ledger;
}
const seconds = (ledger: Ledger) =>
  ledgerBeats(ledger).reduce((n, b) => n + b.activeSeconds, 0);

describe("the rules of section 10.6", () => {
  it("thirty minutes of typing in one answer, no submission: 30 minutes, not 5", () => {
    const ledger = walk(30 * MINUTE_MS, (t) => ({
      visible: true,
      busy: false,
      lastInputAt: t, // a key press in every tick
    }));
    expect(seconds(ledger)).toBe(30 * 60);
  });

  it("ten minutes with the tab in the background: 0", () => {
    const ledger = walk(10 * MINUTE_MS, (t) => ({
      visible: false,
      busy: true,
      lastInputAt: t,
    }));
    expect(seconds(ledger)).toBe(0);
  });

  it("six minutes with the tab in front and no input: 5", () => {
    const ledger = walk(6 * MINUTE_MS, () => ({
      visible: true,
      busy: false,
      lastInputAt: T0, // the click that opened the page, then nothing
    }));
    expect(seconds(ledger)).toBe(5 * 60);
  });

  it("a 20 second recording counts as 20 active seconds with no key press", () => {
    const ledger: Ledger = {};
    const span = activeSpan(T0 + 5 * SEC, T0 + 25 * SEC, {
      visible: true,
      busy: true,
      lastInputAt: null,
    });
    expect(span).toEqual([T0 + 5 * SEC, T0 + 25 * SEC]);
    addSpan(ledger, span![0], span![1], "record");
    expect(ledgerBeats(ledger)).toEqual([
      { minute: T0, surface: "record", activeSeconds: 20, demo: false },
    ]);
  });

  it("recording is not believed across a hole in the timer (a sleeping laptop)", () => {
    const span = activeSpan(T0, T0 + 2 * 60 * MINUTE_MS, {
      visible: true,
      busy: true,
      lastInputAt: T0,
    });
    expect(span).toEqual([T0, T0 + IDLE_LIMIT_MS]);
  });
});

describe("the ledger", () => {
  it("splits a span at minute boundaries and never holds more than 60 s a minute", () => {
    const ledger: Ledger = {};
    addSpan(ledger, T0 + 50 * SEC, T0 + 130 * SEC, "listen");
    addSpan(ledger, T0 + 60 * SEC, T0 + 120 * SEC, "listen"); // counted twice by mistake
    expect(ledgerBeats(ledger)).toEqual([
      { minute: T0, surface: "listen", activeSeconds: 10, demo: false },
      { minute: T0 + MINUTE_MS, surface: "listen", activeSeconds: 60, demo: false },
      { minute: T0 + 2 * MINUTE_MS, surface: "listen", activeSeconds: 10, demo: false },
    ]);
  });

  it("merges by the greater value and prunes what is too old or confirmed", () => {
    const a: Ledger = { [`${T0}|annotate|0`]: 20_000 };
    const b: Ledger = { [`${T0}|annotate|0`]: 35_000, [`${T0}|check|0`]: 5_000 };
    expect(mergeLedgers(a, b)).toEqual({
      [`${T0}|annotate|0`]: 35_000,
      [`${T0}|check|0`]: 5_000,
    });
    const old: Ledger = {
      [`${T0 - LATE_LIMIT_MS - MINUTE_MS}|annotate|0`]: 9_000,
      [`${T0}|annotate|0`]: 9_000,
      [`${T0 + MINUTE_MS}|annotate|0`]: 9_000,
    };
    expect(Object.keys(pruneLedger(old, T0 + 90 * SEC))).toHaveLength(2);
    // Confirmed at T0 + 90 s: the finished minute goes, the running one stays.
    expect(pruneLedger(old, T0 + 90 * SEC, T0 + 90 * SEC)).toEqual({
      [`${T0 + MINUTE_MS}|annotate|0`]: 9_000,
    });
  });
});

describe("normalizeBeats (what the server accepts)", () => {
  const now = T0 + 3 * MINUTE_MS;
  const beat = (over: Record<string, unknown> = {}) => ({
    minute: T0,
    surface: "annotate",
    activeSeconds: 30,
    demo: false,
    ...over,
  });

  it("keeps a good beat, floors the minute, clamps the seconds", () => {
    const { beats, dropped } = normalizeBeats(
      [beat({ minute: T0 + 17 * SEC, activeSeconds: 400 })],
      now,
      now,
    );
    expect(dropped).toBe(0);
    expect(beats).toEqual([
      { minute: T0, surface: "annotate", activeSeconds: 60, demo: false },
    ]);
  });

  it("the same minute twice in one request keeps the greater total", () => {
    const { beats } = normalizeBeats(
      [beat({ activeSeconds: 10 }), beat({ activeSeconds: 25 })],
      now,
      now,
    );
    expect(beats.map((b) => b.activeSeconds)).toEqual([25]);
  });

  it("accepts a beat 2 hours late and refuses one older than 24 hours or in the future", () => {
    const late = now - 2 * 60 * MINUTE_MS;
    const { beats, dropped } = normalizeBeats(
      [
        beat({ minute: late }),
        beat({ minute: now - LATE_LIMIT_MS - 5 * MINUTE_MS }),
        beat({ minute: now + 10 * MINUTE_MS }),
      ],
      now,
      now,
    );
    expect(beats.map((b) => b.minute)).toEqual([late]);
    expect(dropped).toBe(2);
  });

  it("an unknown kind of work becomes 'other'; junk is dropped and counted", () => {
    const { beats, dropped } = normalizeBeats(
      [beat({ surface: "<script>" }), { minute: "x" }, null, beat({ activeSeconds: 0 })],
      now,
      now,
    );
    expect(beats.map((b) => b.surface)).toEqual(["other"]);
    expect(dropped).toBe(3);
  });

  it("a browser clock 3 hours wrong is corrected, so the minute is the real one", () => {
    const wrong = 3 * 60 * MINUTE_MS; // the browser thinks it is 3 hours later
    const { beats, dropped } = normalizeBeats(
      [beat({ minute: T0 + wrong })],
      now,
      now + wrong,
    );
    expect(dropped).toBe(0);
    expect(beats[0].minute).toBe(T0);
  });
});

describe("planWrites (what the server stores)", () => {
  const b = (surface: "annotate" | "listen", activeSeconds: number, minute = T0) => ({
    minute,
    surface,
    activeSeconds,
    demo: false,
  });

  it("the same beat twice changes nothing", () => {
    const first = planWrites([], [b("annotate", 30)]);
    expect(first.create).toHaveLength(1);
    const again = planWrites(
      [{ minute: T0, surface: "annotate", demo: false, activeSeconds: 30 }],
      [b("annotate", 30)],
    );
    expect(again).toEqual({ create: [], raise: [] });
  });

  it("a row only grows: a greater total raises it, a smaller one is ignored", () => {
    const stored = [{ minute: T0, surface: "annotate", demo: false, activeSeconds: 30 }];
    expect(planWrites(stored, [b("annotate", 45)]).raise).toEqual([b("annotate", 45)]);
    expect(planWrites(stored, [b("annotate", 10)])).toEqual({ create: [], raise: [] });
  });

  it("one person never gets more than 60 seconds in a minute, across kinds of work", () => {
    const stored = [{ minute: T0, surface: "annotate", demo: false, activeSeconds: 45 }];
    expect(planWrites(stored, [b("listen", 40)]).create).toEqual([b("listen", 15)]);
    const full = [{ minute: T0, surface: "annotate", demo: false, activeSeconds: 60 }];
    expect(planWrites(full, [b("listen", 40)])).toEqual({ create: [], raise: [] });
  });
});

describe("reading rows back", () => {
  const ping = (minuteOffset: number, activeSeconds: number) => ({
    minute: new Date(T0 + minuteOffset * MINUTE_MS),
    activeSeconds,
  });

  it("adds up active seconds with the 60 second cap applied per minute again", () => {
    expect(sumActiveSeconds([ping(0, 40), ping(0, 40), ping(1, 30)])).toBe(90);
  });

  it("counts sittings: a hole longer than 30 minutes starts a new one", () => {
    expect(countSittings([])).toBe(0);
    expect(countSittings([ping(0, 30), ping(20, 30), ping(50, 30)])).toBe(1);
    expect(countSittings([ping(0, 30), ping(31, 30), ping(200, 30)])).toBe(3);
  });

  it("formats the figure an annotator reads", () => {
    expect(formatWorked(0)).toBe("0 m");
    expect(formatWorked(40 * 60)).toBe("40 m");
    expect(formatWorked(6 * 3600 + 40 * 60)).toBe("6 h 40 m");
    expect(formatWorked(9 * 3600 + 5 * 60)).toBe("9 h 05 m");
  });
});

describe("surfaceForPath", () => {
  it("names the kind of work for every page an annotator can reach", () => {
    expect(surfaceForPath("/annotator")).toBe("dashboard");
    expect(surfaceForPath("/annotator/annotate")).toBe("annotate");
    expect(surfaceForPath("/annotator/history")).toBe("my_work");
    expect(surfaceForPath("/annotator/rubric")).toBe("rubric");
    expect(surfaceForPath("/annotator/corrections")).toBe("corrections");
    expect(surfaceForPath("/speak")).toBe("record");
    expect(surfaceForPath("/lab/speech")).toBe("record");
    expect(surfaceForPath("/speak/listen")).toBe("listen");
    expect(surfaceForPath("/lab/speech/listen")).toBe("listen");
    expect(surfaceForPath("/speak/check")).toBe("check");
    expect(surfaceForPath("/annotator/tone-pass")).toBe("tone");
    expect(surfaceForPath("/admin/annotations")).toBe("research");
    expect(surfaceForPath("/somewhere/new")).toBe("other");
  });
});
