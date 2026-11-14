import { describe, it, expect } from "vitest";
import { daysBetween, weekOf } from "./week";

describe("weekOf: Monday to Sunday, Lagos time", () => {
  it("starts on Monday 00:00 in Lagos, which is Sunday 23:00 UTC", () => {
    const w = weekOf(new Date("2026-11-13T15:00:00Z")); // a Friday
    expect(w.start.toISOString()).toBe("2026-11-08T23:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-11-15T23:00:00.000Z");
    expect(w.label).toBe("Week of Mon 9 Nov");
  });

  it("puts Sunday 23:30 UTC in the next week, because it is Monday in Lagos", () => {
    const w = weekOf(new Date("2026-11-15T23:30:00Z"));
    expect(w.start.toISOString()).toBe("2026-11-15T23:00:00.000Z");
    expect(w.label).toBe("Week of Mon 16 Nov");
  });

  it("keeps Sunday 22:59 UTC in the week that is ending", () => {
    const w = weekOf(new Date("2026-11-15T22:59:00Z"));
    expect(w.label).toBe("Week of Mon 9 Nov");
  });

  it("shifts by whole weeks, across a month and a year", () => {
    expect(weekOf(new Date("2026-11-13T15:00:00Z"), -1).label).toBe(
      "Week of Mon 2 Nov",
    );
    expect(weekOf(new Date("2026-11-03T12:00:00Z"), -1).label).toBe(
      "Week of Mon 26 Oct",
    );
    expect(weekOf(new Date("2027-01-01T12:00:00Z")).label).toBe(
      "Week of Mon 28 Dec",
    );
  });
});

describe("daysBetween", () => {
  it("counts whole days and never goes below zero", () => {
    const a = new Date("2026-11-01T00:00:00Z");
    expect(daysBetween(a, new Date("2026-11-08T23:00:00Z"))).toBe(7);
    expect(daysBetween(a, new Date("2026-10-30T00:00:00Z"))).toBe(0);
  });
});
