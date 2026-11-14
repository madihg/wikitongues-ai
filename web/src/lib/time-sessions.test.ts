import { describe, it, expect } from "vitest";
import {
  sessionize,
  sessionizeEvents,
  longestPossibleMinutes,
  minutesSince,
  formatMinutes,
} from "./time-sessions";

const MIN = 60_000;
const BASE = new Date("2026-07-01T10:00:00Z").getTime();

/** A timestamp `minutesOffset` minutes after the fixed BASE instant. */
function at(minutesOffset: number): Date {
  return new Date(BASE + minutesOffset * MIN);
}

describe("sessionize", () => {
  it("returns a zeroed summary for empty input", () => {
    expect(sessionize([])).toEqual({
      totalMinutes: 0,
      sessionCount: 0,
      lastActive: null,
    });
  });

  it("a single event counts as one lead-in-length session, not zero", () => {
    const t = at(0);
    const result = sessionize([t]);
    expect(result.sessionCount).toBe(1);
    expect(result.totalMinutes).toBe(5); // default leadInMinutes
    expect(result.lastActive).toEqual(t);
  });

  it("two events within the gap join into one session", () => {
    const result = sessionize([at(0), at(10)]);
    expect(result.sessionCount).toBe(1);
    expect(result.totalMinutes).toBe(10 + 5); // span + lead-in
  });

  it("gap boundary: exactly gapMinutes apart still joins", () => {
    const result = sessionize([at(0), at(30)], {
      gapMinutes: 30,
      leadInMinutes: 5,
    });
    expect(result.sessionCount).toBe(1);
    expect(result.totalMinutes).toBe(30 + 5);
  });

  it("gap boundary: one minute over gapMinutes splits into two sessions", () => {
    const result = sessionize([at(0), at(31)], {
      gapMinutes: 30,
      leadInMinutes: 5,
    });
    expect(result.sessionCount).toBe(2);
    expect(result.totalMinutes).toBe(5 + 5); // two singleton sessions
  });

  it("clusters multiple sessions separately and sums their durations", () => {
    const timestamps = [
      at(0),
      at(5),
      at(12), // session 1: span 0->12 = 12, + lead-in 5 = 17
      at(100),
      at(115), // session 2: span 100->115 = 15, + lead-in 5 = 20
    ];
    const result = sessionize(timestamps);
    expect(result.sessionCount).toBe(2);
    expect(result.totalMinutes).toBe(17 + 20);
  });

  it("sorts unordered input and still finds the true lastActive", () => {
    const earliest = at(0);
    const latest = at(500);
    const result = sessionize([latest, earliest, at(5)]);
    expect(result.lastActive).toEqual(latest);
  });

  it("respects custom gapMinutes and leadInMinutes", () => {
    const result = sessionize([at(0), at(20)], {
      gapMinutes: 10,
      leadInMinutes: 2,
    });
    // gap of 20 > gapMinutes(10) -> splits into two singleton sessions
    expect(result.sessionCount).toBe(2);
    expect(result.totalMinutes).toBe(2 + 2);
  });
});

describe("minutesSince", () => {
  it("only counts timestamps at or after the cutoff", () => {
    const cutoff = at(50);
    const timestamps = [at(0), at(10), at(60), at(65)];
    // only 60 and 65 survive filtering -> one session, span 5 + lead-in 5
    expect(minutesSince(timestamps, cutoff)).toBe(10);
  });

  it("returns 0 when nothing falls in the window", () => {
    expect(minutesSince([at(0)], at(1000))).toBe(0);
  });
});

describe("formatMinutes", () => {
  it("formats zero minutes", () => {
    expect(formatMinutes(0)).toBe("0m");
  });

  it("formats minutes under an hour", () => {
    expect(formatMinutes(45)).toBe("45m");
  });

  it("formats hours with a remainder", () => {
    expect(formatMinutes(135)).toBe("2h 15m");
  });

  it("formats an exact hour with no remainder", () => {
    expect(formatMinutes(120)).toBe("2h");
  });
});

describe("sessionizeEvents (the recount: events can have a length)", () => {
  it("with no lengths it gives exactly what sessionize gives", () => {
    const stamps = [at(0), at(10), at(25), at(120), at(125), at(400)];
    expect(sessionizeEvents(stamps.map((t) => ({ at: t })))).toEqual(
      sessionize(stamps),
    );
    expect(sessionizeEvents([])).toEqual(sessionize([]));
  });

  it("a clip counts for its own length, ending when it was saved", () => {
    // One 30 second clip saved at minute 10: half a minute of span + lead-in.
    const one = sessionizeEvents([{ at: at(10), lengthMs: 30_000 }]);
    expect(one.sessionCount).toBe(1);
    expect(one.totalMinutes).toBe(6); // 0.5 + 5, rounded
  });

  it("a long take that starts inside the gap joins the sitting", () => {
    // Saved 40 minutes after the last event, but it ran for 15 minutes, so
    // it started 25 minutes after: one sitting, not two.
    const r = sessionizeEvents([
      { at: at(0) },
      { at: at(40), lengthMs: 15 * MIN },
    ]);
    expect(r.sessionCount).toBe(1);
    expect(r.totalMinutes).toBe(45);
    expect(sessionize([at(0), at(40)]).sessionCount).toBe(2);
  });

  it("clips between two text sittings bridge them: the day Agnes recorded", () => {
    const text = [at(0), at(5), at(150), at(155)];
    const clips = Array.from({ length: 14 }, (_, i) => ({
      at: at(15 + i * 10),
      lengthMs: 6_000,
    }));
    expect(sessionize(text).totalMinutes).toBe(20); // two sittings of 5 + 5
    const recount = sessionizeEvents([...text.map((t) => ({ at: t })), ...clips]);
    expect(recount.sessionCount).toBe(1);
    expect(recount.totalMinutes).toBe(160);
  });
});

describe("longestPossibleMinutes", () => {
  it("is first to last per day, summed over days, in the zone given", () => {
    const HOUR = 60;
    const events = [
      { at: at(0) }, // 10:00 UTC
      { at: at(8 * HOUR) }, // 18:00 UTC the same day
      { at: at(24 * HOUR) }, // next day, one event: 0
    ];
    expect(longestPossibleMinutes(events)).toBe(8 * HOUR);
    expect(longestPossibleMinutes([])).toBe(0);
  });

  it("uses the local day: 23:30 UTC is already the next day in Lagos", () => {
    const lateUtc = new Date("2026-11-09T23:30:00Z");
    const nextMorning = new Date("2026-11-10T08:30:00Z");
    // In UTC these are two days (0 + 0). In Lagos (UTC+1) both are Nov 10.
    expect(longestPossibleMinutes([{ at: lateUtc }, { at: nextMorning }])).toBe(0);
    expect(
      longestPossibleMinutes([{ at: lateUtc }, { at: nextMorning }], 60 * MIN),
    ).toBe(9 * 60);
  });
});
