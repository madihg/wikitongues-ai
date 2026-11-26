import { describe, it, expect } from "vitest";
import { SURFACES, surfaceForPath } from "@/lib/activity";
import {
  DEFAULT_WORK_ORDER,
  DEFAULT_WORK_RUN,
  isWorkKind,
  MAX_WORK_RUN,
  nextWork,
  parseWorkOrder,
  parseWorkPlan,
  pickWork,
  SPEECH_KINDS,
  WORK_KINDS,
  WORK_LABEL,
  WORK_LINE,
  WORK_SURFACE,
  streamLine,
  streamNext,
  WORK_UNIT,
  workAskedBy,
  workFromSearch,
  workHref,
  workTabs,
} from "./work-flow";

describe("the one Annotate flow: kinds of work", () => {
  it("a new prompt comes first by default (written, then said), then the catch-up recordings; tone marks last", () => {
    expect(DEFAULT_WORK_ORDER).toEqual(["write", "record", "check", "listen", "tone"]);
    // One prompt, text then speech: Write says so, and Record is the catch-up.
    expect(WORK_LINE.write).toContain("say it out loud");
    expect(WORK_LINE.record).toContain("earlier");
    expect([...DEFAULT_WORK_ORDER].sort()).toEqual([...WORK_KINDS].sort());
  });

  it("every kind has a label, a line, a unit, a run length, and a kind of work for honest time", () => {
    for (const k of WORK_KINDS) {
      expect(WORK_LABEL[k], k).toBeTruthy();
      expect(WORK_LINE[k], k).toBeTruthy();
      expect(WORK_UNIT[k], k).toBeTruthy();
      expect(DEFAULT_WORK_RUN[k], k).toBeGreaterThanOrEqual(1);
      expect(SURFACES, k).toContain(WORK_SURFACE[k]);
    }
    // Each tab counts as the same work its old page did.
    expect(WORK_SURFACE.record).toBe(surfaceForPath("/speak"));
    expect(WORK_SURFACE.check).toBe(surfaceForPath("/speak/check"));
    expect(WORK_SURFACE.listen).toBe(surfaceForPath("/speak/listen"));
    expect(WORK_SURFACE.tone).toBe(surfaceForPath("/annotator/tone"));
    expect(WORK_SURFACE.write).toBe(surfaceForPath("/annotator/annotate"));
  });

  it("speech kinds are the three that need the speech layer", () => {
    expect([...SPEECH_KINDS].sort()).toEqual(["check", "listen", "record"]);
  });

  it("isWorkKind knows only the five", () => {
    expect(isWorkKind("record")).toBe(true);
    expect(isWorkKind("speech")).toBe(false);
    expect(isWorkKind(undefined)).toBe(false);
  });
});

describe("parseWorkOrder (ANNOTATE_ORDER)", () => {
  it("unset or empty is the default order", () => {
    expect(parseWorkOrder(undefined)).toEqual(DEFAULT_WORK_ORDER);
    expect(parseWorkOrder("")).toEqual(DEFAULT_WORK_ORDER);
  });

  it("the named kinds come first in that order, then the rest in the default order", () => {
    expect(parseWorkOrder("tone,write")).toEqual(["tone", "write", "record", "check", "listen"]);
    expect(parseWorkOrder(" Write , record ")).toEqual(["write", "record", "check", "listen", "tone"]);
  });

  it("a typo or a repeat can never hide a kind of work", () => {
    const o = parseWorkOrder("recrod,tone,tone,speech");
    expect(o).toEqual(["tone", "write", "record", "check", "listen"]);
    expect(o).toHaveLength(WORK_KINDS.length);
  });

  it("a run length after a colon, 1 to the maximum; anything else keeps the default", () => {
    const p = parseWorkPlan("check:8, record : 4 ,write:0,listen:x,tone:999");
    expect(p.order).toEqual(["check", "record", "write", "listen", "tone"]);
    expect(p.runs).toEqual({ ...DEFAULT_WORK_RUN, check: 8, record: 4 });
    expect(parseWorkPlan(`tone:${MAX_WORK_RUN}`).runs.tone).toBe(MAX_WORK_RUN);
    expect(parseWorkPlan("record:2.5").runs.record).toBe(DEFAULT_WORK_RUN.record);
    expect(parseWorkPlan(undefined)).toEqual({
      order: [...DEFAULT_WORK_ORDER],
      runs: { ...DEFAULT_WORK_RUN },
    });
  });
});

describe("the default stream: new prompts, then the catch-up recordings, round and round", () => {
  const plan = parseWorkPlan(undefined);
  const counts = { write: 30, record: 400, check: 6, listen: 0 };

  it("a run of prompts, then a run of earlier answers to record, then checks, then prompts again", () => {
    expect(streamNext(plan, counts, "write", DEFAULT_WORK_RUN.write - 1)).toBe("write");
    expect(streamNext(plan, counts, "write", DEFAULT_WORK_RUN.write)).toBe("record");
    expect(streamNext(plan, counts, "record", DEFAULT_WORK_RUN.record)).toBe("check");
    expect(streamNext(plan, counts, "check", DEFAULT_WORK_RUN.check)).toBe("write");
    expect(streamLine(plan, counts, "write", 0)).toBe("This prompt and 2 more, then Record.");
  });

  it("no new prompt left: the backlog of recordings still has its place", () => {
    expect(streamNext(plan, { ...counts, write: 0 }, "check", DEFAULT_WORK_RUN.check)).toBe("record");
  });
});

describe("the mixed stream", () => {
  const plan = parseWorkPlan("record:3,check:2");
  const counts = { record: 200, check: 6, write: 30, listen: 0, tone: 4 };

  it("stays on a kind for its run, then moves to the next kind with work", () => {
    expect(streamNext(plan, counts, "record", 1)).toBe("record");
    expect(streamNext(plan, counts, "record", 2)).toBe("record");
    expect(streamNext(plan, counts, "record", 3)).toBe("check");
    expect(streamNext(plan, counts, "check", 2)).toBe("write");
    // Listen has nothing: write's run is followed by tone marks.
    expect(streamNext(plan, counts, "write", DEFAULT_WORK_RUN.write)).toBe("tone");
    // Round and round: after tone marks, recording again.
    expect(streamNext(plan, counts, "tone", DEFAULT_WORK_RUN.tone)).toBe("record");
  });

  it("Record never running out no longer starves Check (the review's finding)", () => {
    const seen = new Set<string>();
    let kind = streamNext(plan, counts, "record", 0);
    let run = 0;
    for (let i = 0; i < 12; i++) {
      seen.add(kind);
      run += 1;
      const next = streamNext(plan, counts, kind, run);
      if (next !== kind) run = 0;
      kind = next;
    }
    expect([...seen]).toEqual(expect.arrayContaining(["record", "check", "write"]));
  });

  it("a kind that runs out mid-run hands over at once; nothing else waiting, it stays", () => {
    expect(streamNext(plan, { ...counts, record: 0 }, "record", 1)).toBe("check");
    expect(streamNext(plan, { record: 5, write: 0 }, "record", 3)).toBe("record");
  });

  it("the line says what comes after this run, counting the task on screen", () => {
    expect(streamLine(plan, counts, "record", 0)).toBe(
      "This recording and 2 more, then Check.",
    );
    expect(streamLine(plan, counts, "record", 2)).toBe("After this recording: Check.");
    // Fewer waiting than the run: the run is that short.
    expect(streamLine(plan, { ...counts, check: 1 }, "check", 0)).toBe(
      "After this clip to check: Write & compare.",
    );
    expect(streamLine(plan, { write: 4 }, "write", 0)).toBeNull();
  });
});

describe("which tabs and which one opens", () => {
  // A leads' order with the catch-up recordings first.
  const order = parseWorkOrder("record,check,write,listen,tone");

  it("write is always a tab; another kind only when the person has it", () => {
    expect(workTabs(order, {})).toEqual(["write"]);
    expect(workTabs(order, { write: 3, tone: 0 })).toEqual(["write", "tone"]);
    expect(workTabs(order, { record: 2, check: 0, listen: 0, write: 1 })).toEqual([
      "record",
      "check",
      "write",
      "listen",
    ]);
  });

  it("opens the first kind with something waiting, in the leads' order", () => {
    expect(pickWork(order, { record: 5, check: 2, write: 9 })).toBe("record");
    expect(pickWork(order, { record: 0, check: 2, write: 9 })).toBe("check");
    expect(pickWork(order, { record: 0, check: 0, tone: 4, write: 9 })).toBe("write");
    expect(pickWork(order, { record: 0, check: 0, tone: 4, write: 0 })).toBe("tone");
    expect(pickWork(parseWorkOrder("write"), { record: 5, write: 9 })).toBe("write");
    // The default: a new prompt first, the catch-up recordings when none waits.
    expect(pickWork(DEFAULT_WORK_ORDER, { record: 5, check: 2, write: 9 })).toBe("write");
    expect(pickWork(DEFAULT_WORK_ORDER, { record: 5, check: 2, write: 0 })).toBe("record");
  });

  it("nothing waiting anywhere: Write, which always has a screen", () => {
    expect(pickWork(order, { record: 0, write: 0 })).toBe("write");
    expect(pickWork(order, {})).toBe("write");
  });

  it("a kind asked for (a Dashboard card) opens when the person has it, even at zero", () => {
    expect(pickWork(order, { record: 5, tone: 0, write: 1 }, "tone")).toBe("tone");
    // Not theirs (speech off): the usual pick instead.
    expect(pickWork(order, { tone: 3, write: 0 }, "record")).toBe("tone");
  });

  it("after a kind runs out, the next one with work, wrapping round, never itself", () => {
    const counts = { record: 0, check: 3, tone: 0, write: 7, listen: 0 };
    expect(nextWork(order, counts, "record")).toBe("check");
    expect(nextWork(order, counts, "check")).toBe("write");
    expect(nextWork(order, { ...counts, write: 0 }, "check")).toBeNull();
    expect(nextWork(order, { record: 2, write: 0 }, "write")).toBe("record");
  });
});

describe("the address", () => {
  it("?work= opens a kind; anything else is ignored", () => {
    expect(workFromSearch("?work=check")).toBe("check");
    expect(workFromSearch("?demo=x&work=tone")).toBe("tone");
    expect(workFromSearch("?work=speech")).toBeNull();
    expect(workFromSearch("")).toBeNull();
  });

  it("a text episode on the address (?prompt=, ?demo=) opens Write, not the stream (review of #121)", () => {
    expect(workAskedBy("?prompt=ig_test_001")).toBe("write");
    expect(workAskedBy("?demo=abc")).toBe("write");
    expect(workAskedBy("?demo=abc&work=record")).toBe("record");
    expect(workAskedBy("?prompt=")).toBeNull();
    expect(workAskedBy("")).toBeNull();
  });

  it("every kind has its own Annotate address", () => {
    for (const k of WORK_KINDS) {
      expect(workHref(k)).toBe(`/annotator/annotate?work=${k}`);
      expect(workFromSearch(workHref(k).slice(workHref(k).indexOf("?")))).toBe(k);
    }
  });
});
