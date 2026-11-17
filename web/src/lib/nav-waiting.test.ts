import { describe, expect, it } from "vitest";
import { navWaiting } from "./waiting";
import { parseNavWaiting } from "@/components/use-nav-waiting";
import { navForRole } from "./personas";

const counts = { annotate: 12, record: 5, listen: 2, check: 3, fixTotal: 4 };

describe("what the navigation shows as waiting", () => {
  it("an annotator, and a researcher who is not a lead, get every count", () => {
    expect(navWaiting(counts, { lead: false, speech: true })).toEqual({
      annotate: 12,
      speech: 10,
      record: 5,
      listen: 2,
      check: 3,
      fix: 4,
    });
  });

  it("a research lead gets none", () => {
    expect(navWaiting(counts, { lead: true, speech: true })).toBeNull();
  });

  it("with speech off the speech numbers are zero, not hidden work", () => {
    expect(navWaiting(counts, { lead: false, speech: false })).toMatchObject({
      annotate: 12,
      speech: 0,
      fix: 4,
    });
  });

  it("an answer that is not six numbers is not known, never zero", () => {
    expect(parseNavWaiting({ waiting: null })).toBeNull();
    expect(parseNavWaiting({ waiting: { annotate: 1 } })).toBeNull();
    expect(parseNavWaiting(null)).toBeNull();
    const ok = { annotate: 1, speech: 2, record: 1, listen: 1, check: 0, fix: 0 };
    expect(parseNavWaiting({ waiting: ok })).toEqual(ok);
  });

  it("the sidebar puts a count on Annotate, Speech and My Work, above zero only", () => {
    const links = navForRole("ANNOTATOR", "a@example.com", {
      lab: true,
      waiting: { annotate: 12, speech: 10, fix: 0 },
    });
    const count = (label: string) => links.find((l) => l.label === label)?.count;
    expect(count("Annotate")).toBe(12);
    expect(count("Speech")).toBe(10);
    expect(count("My Work")).toBeUndefined();
  });
});
