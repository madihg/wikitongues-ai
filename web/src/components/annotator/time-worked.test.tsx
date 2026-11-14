import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TIME_COPY, TimeWorked, workedLine } from "./time-worked";

const time = {
  thisWeek: { seconds: 6 * 3600 + 40 * 60, basis: "measured" as const },
  lastWeek: { seconds: 9 * 3600 + 5 * 60, basis: "measured" as const },
  measuredSince: "2026-11-16T08:00:00.000Z",
};

describe("TimeWorked (the annotator's own time, spec 10.3)", () => {
  it("shows the heading, the figure and the link, with the panel closed", () => {
    const html = renderToStaticMarkup(<TimeWorked time={time} />);
    expect(html).toContain("This week");
    expect(html).toContain("6 h 40 m worked");
    expect(html).toContain("How time is counted");
    expect(html).not.toContain("We do not record what you type");
  });

  it("the panel says how time is counted, in the words of the spec, and gives both weeks", () => {
    const html = renderToStaticMarkup(<TimeWorked time={time} defaultOpen />);
    for (const line of TIME_COPY.panel) expect(html).toContain(line);
    expect(TIME_COPY.panel).toEqual([
      "The clock runs while this site is open in front of you and you are working: typing, tapping, recording or listening.",
      "It pauses after 5 minutes with no activity. It starts again when you come back.",
      "It counts every kind of work: answers, edits, clips, listening, checking, tone marks.",
      "We do not record what you type and we do not look at your screen.",
    ]);
    expect(html).toContain("Last week");
    expect(html).toContain("9 h 05 m");
    expect(html).toContain("Does this look wrong?");
    expect(html).toContain("Tell us");
    // Measured weeks carry no "estimate" caveat.
    expect(html).not.toContain(TIME_COPY.estimate);
  });

  it("a week the clock did not measure is marked as an estimate, never shown as measured", () => {
    const estimated = {
      ...time,
      thisWeek: { seconds: 3 * 3600 + 10 * 60, basis: "estimate" as const },
    };
    expect(workedLine(estimated.thisWeek)).toBe("About 3 h 10 m worked");
    const html = renderToStaticMarkup(<TimeWorked time={estimated} defaultOpen />);
    expect(html).toContain("About 3 h 10 m worked");
    expect(html).toContain(TIME_COPY.estimate);
  });

  it("zero is plain zero, loading shows a placeholder, a failed load says so", () => {
    expect(workedLine({ seconds: 0, basis: "estimate" })).toBe("0 m worked");
    expect(renderToStaticMarkup(<TimeWorked time={undefined} />)).toContain("…");
    expect(renderToStaticMarkup(<TimeWorked time={null} />)).toContain("Not available");
  });

  it("uses no em dash and no jargon an annotator would not know", () => {
    const all = JSON.stringify(TIME_COPY);
    expect(all).not.toContain(String.fromCharCode(0x2014));
    expect(all).not.toMatch(/\b(heartbeat|ping|session|telemetry|tracking)\b/i);
  });
});
