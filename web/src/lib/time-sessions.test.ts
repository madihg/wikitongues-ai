import { describe, it, expect } from "vitest";
import { sessionize, minutesSince, formatMinutes } from "./time-sessions";

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
