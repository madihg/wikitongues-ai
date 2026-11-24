import { describe, it, expect } from "vitest";
import { SURFACES, surfaceForPath } from "@/lib/activity";
import {
  DEFAULT_WORK_ORDER,
  isWorkKind,
  nextWork,
  parseWorkOrder,
  pickWork,
  SPEECH_KINDS,
  WORK_KINDS,
  WORK_LABEL,
  WORK_LINE,
  WORK_SURFACE,
  workFromSearch,
  workHref,
  workTabs,
} from "./work-flow";

describe("the one Annotate flow: kinds of work", () => {
  it("speech comes first by default: record, check, then tone marks, then text, then listen", () => {
    expect(DEFAULT_WORK_ORDER).toEqual(["record", "check", "tone", "write", "listen"]);
    expect([...DEFAULT_WORK_ORDER].sort()).toEqual([...WORK_KINDS].sort());
  });

  it("every kind has a label, a line, and a kind of work for honest time", () => {
    for (const k of WORK_KINDS) {
      expect(WORK_LABEL[k], k).toBeTruthy();
      expect(WORK_LINE[k], k).toBeTruthy();
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
    expect(parseWorkOrder(" Write , record ")).toEqual(["write", "record", "check", "tone", "listen"]);
  });

  it("a typo or a repeat can never hide a kind of work", () => {
    const o = parseWorkOrder("recrod,tone,tone,speech");
    expect(o).toEqual(["tone", "record", "check", "write", "listen"]);
    expect(o).toHaveLength(WORK_KINDS.length);
  });
});

describe("which tabs and which one opens", () => {
  const order = [...DEFAULT_WORK_ORDER];

  it("write is always a tab; another kind only when the person has it", () => {
    expect(workTabs(order, {})).toEqual(["write"]);
    expect(workTabs(order, { write: 3, tone: 0 })).toEqual(["tone", "write"]);
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
    expect(pickWork(order, { record: 0, check: 0, tone: 4, write: 9 })).toBe("tone");
    expect(pickWork(parseWorkOrder("write"), { record: 5, write: 9 })).toBe("write");
  });

  it("nothing waiting anywhere: Write, which always has a screen", () => {
    expect(pickWork(order, { record: 0, write: 0 })).toBe("write");
    expect(pickWork(order, {})).toBe("write");
  });

  it("a kind asked for (a Dashboard card) opens when the person has it, even at zero", () => {
    expect(pickWork(order, { record: 5, tone: 0, write: 1 }, "tone")).toBe("tone");
    // Not theirs (speech off): the usual pick instead.
    expect(pickWork(order, { tone: 3, write: 1 }, "record")).toBe("tone");
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

  it("every kind has its own Annotate address", () => {
    for (const k of WORK_KINDS) {
      expect(workHref(k)).toBe(`/annotator/annotate?work=${k}`);
      expect(workFromSearch(workHref(k).slice(workHref(k).indexOf("?")))).toBe(k);
    }
  });
});
