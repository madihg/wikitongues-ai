import { describe, it, expect } from "vitest";
import {
  activeNavHref,
  navForRole,
  PUBLIC_HOW_IT_WORKS_URL,
  TONE_ADMIN_LINK,
} from "./personas";
import { ARCHIVE, activeResearchHref } from "@/lib/admin/routes";

/**
 * The no-tab flow (2026-08-28 rework, Halim's call): annotators do NOT get a
 * standalone Corrections tab - corrections happen inside the episode, right
 * after the A/B verdict. Researchers keep the lane as the backlog view.
 * These tests lock the navigation halves of that decision.
 */

const RESEARCHER_EMAIL = "someone@example.com";

describe("navForRole - the no-tab flow", () => {
  it("annotators have NO Corrections entry - corrections live inside Annotate", () => {
    const links = navForRole("ANNOTATOR", "annotator@example.com");
    expect(links.map((l) => l.href)).not.toContain("/annotator/corrections");
  });

  it("annotators keep the surfaces the episode flow needs", () => {
    const hrefs = navForRole("ANNOTATOR", "annotator@example.com").map(
      (l) => l.href,
    );
    for (const href of [
      "/annotator",
      "/annotator/annotate",
      "/annotator/history",
      "/annotator/rubric",
    ]) {
      expect(hrefs).toContain(href);
    }
  });

  it("researchers no longer carry Corrections in the sidebar: the backlog view is kept under More, Archive", () => {
    const links = navForRole("RESEARCHER", RESEARCHER_EMAIL);
    expect(links.map((l) => l.href)).not.toContain("/annotator/corrections");
    expect(links.map((l) => l.href)).toContain("/admin/more");
    expect(ARCHIVE.map((a) => a.href)).toContain("/annotator/corrections");
  });

  it("an unknown/absent role gets the annotator nav - and so no Corrections either", () => {
    expect(navForRole(null, null).map((l) => l.href)).not.toContain(
      "/annotator/corrections",
    );
  });
});

describe("navForRole - a researcher's sidebar", () => {
  const links = navForRole("RESEARCHER", RESEARCHER_EMAIL, { lab: true });

  it("then lists the five research views, then More, in that order", () => {
    expect(
      links.filter((l) => l.group === "research").map((l) => [l.label, l.href]),
    ).toEqual([
      ["Today", "/admin"],
      ["People", "/admin/people"],
      ["Data", "/admin/annotations"],
      ["Text model", "/admin/arena/verdict"],
      ["Speech model", "/admin/speech"],
    ]);
    expect(links[links.length - 1]).toMatchObject({
      href: "/admin/more",
      label: "More",
      group: "more",
    });
  });

  it("goes from twelve top-level research lines to five views and More", () => {
    const below = links.filter(
      (l) => l.group === "research" || l.group === "more",
    );
    expect(below).toHaveLength(6);
    // Every line that left the sidebar is still reachable (routes.test.ts
    // walks the addresses); none of them is a sidebar line any more.
    const hrefs = links.map((l) => l.href);
    for (const gone of [
      "/annotator/prompts",
      "/annotator/corrections",
      "/annotator/review",
      "/admin/arena",
    ]) {
      expect(hrefs).not.toContain(gone);
    }
  });

  it("hides the Speech model view while speech is off on the server", () => {
    const off = navForRole("RESEARCHER", RESEARCHER_EMAIL);
    expect(off.map((l) => l.label)).not.toContain("Speech model");
    expect(off.filter((l) => l.group === "research")).toHaveLength(4);
  });

  it("annotators get none of it", () => {
    const annotator = navForRole("ANNOTATOR", "annotator@example.com", {
      lab: true,
    });
    expect(annotator.some((l) => l.group)).toBe(false);
    expect(annotator.map((l) => l.href)).not.toContain("/admin/arena/verdict");
    expect(annotator.map((l) => l.href)).not.toContain("/admin");
  });
});

describe("activeNavHref - one highlighted entry, always the most specific", () => {
  const links = navForRole("RESEARCHER", RESEARCHER_EMAIL);

  it("prefers the exact match", () => {
    expect(activeNavHref(links, "/admin/arena/verdict")).toBe(
      "/admin/arena/verdict",
    );
    expect(activeNavHref(links, "/admin")).toBe("/admin");
  });

  it("on nested routes picks the longest owning link", () => {
    expect(activeNavHref(links, "/admin/arena/verdict/anything")).toBe(
      "/admin/arena/verdict",
    );
    expect(activeNavHref(links, "/admin/more/legacy")).toBe("/admin/more");
  });

  it("the role dashboards only match exactly", () => {
    expect(activeNavHref(links, "/admin/annotations")).toBe(
      "/admin/annotations",
    );
    expect(activeNavHref(links, "/annotator/annotate")).toBe(
      "/annotator/annotate",
    );
    // A research page that is not a link of its own is resolved by
    // activeResearchHref (src/lib/admin/routes.ts), which the sidebar asks
    // first; this function alone does not claim it for "/admin".
    expect(activeNavHref(links, "/admin/data/export")).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(activeNavHref(links, "/learner/chat")).toBeNull();
    expect(activeNavHref(links, "/admin/how-it-works")).toBeNull();
  });
});

describe("How it works points out to the public page", () => {
  it("is an absolute https address on the marketing site", () => {
    expect(() => new URL(PUBLIC_HOW_IT_WORKS_URL)).not.toThrow();
    expect(PUBLIC_HOW_IT_WORKS_URL.startsWith("https://")).toBe(true);
  });

  it("left the sidebar for More, Tools: no role has an out-link in the nav", () => {
    for (const role of ["RESEARCHER", "ANNOTATOR", "LEARNER"]) {
      const links = navForRole(role, null, { lab: true });
      expect(links.some((l) => l.external)).toBe(false);
      expect(links.some((l) => l.label === "How it works")).toBe(false);
      for (const l of links) expect(l.href.startsWith("/")).toBe(true);
    }
  });
});

describe("navForRole - one Annotate line for every kind of work (2026-11-24)", () => {
  // Halim, on the 2026-11-24 call: "the task itself can change, but I don't
  // want them to go to different tabs on the left-hand side". Speech and
  // Pass 2 are tabs inside Annotate now (components/work/work-flow.tsx).
  const hrefs = (links: ReturnType<typeof navForRole>) =>
    links.map((l) => l.href);
  const work = (links: ReturnType<typeof navForRole>) =>
    links.filter((l) => !l.group);
  const research = (links: ReturnType<typeof navForRole>) =>
    links.filter((l) => l.group === "research");
  const FOUR = [
    "/annotator",
    "/annotator/annotate",
    "/annotator/history",
    "/annotator/rubric",
  ];

  describe("annotators", () => {
    it("see the same four lines whatever is on: speech, tone items, or neither", () => {
      for (const options of [
        {},
        { lab: false },
        { lab: true },
        { tone: 30 },
        { lab: true, tone: 0 },
      ]) {
        const links = navForRole("ANNOTATOR", "a@example.com", options);
        expect(hrefs(links), JSON.stringify(options)).toEqual(FOUR);
        expect(links.map((l) => l.label)).toEqual([
          "Dashboard",
          "Annotate",
          "My Work",
          "Rubric",
        ]);
      }
    });

    it("never get a Speech, Pass 2, research or lab line", () => {
      const on = navForRole("ANNOTATOR", "a@example.com", { lab: true, tone: 5 });
      expect(hrefs(on)).not.toContain("/speak");
      expect(hrefs(on)).not.toContain("/annotator/tone");
      expect(research(on)).toEqual([]);
      expect(hrefs(on).some((h) => h.startsWith("/lab"))).toBe(false);
      expect(hrefs(on).some((h) => h.startsWith("/admin"))).toBe(false);
    });

    it("a learner and an absent role get no speech link whatever the server says", () => {
      for (const links of [
        navForRole("LEARNER", "l@example.com", { lab: true }),
        navForRole(null, null, { lab: true }),
      ]) {
        expect(hrefs(links).some((h) => h.startsWith("/speak"))).toBe(false);
        expect(research(links)).toEqual([]);
      }
    });
  });

  describe("researchers", () => {
    it("start with the same work lines as an annotator, in the same order", () => {
      for (const lab of [false, true]) {
        const r = navForRole("RESEARCHER", RESEARCHER_EMAIL, { lab });
        const a = navForRole("ANNOTATOR", "a@example.com", { lab });
        expect(work(r)).toEqual(a);
        expect(r.slice(0, a.length)).toEqual(a);
        expect(hrefs(work(r))).toEqual(FOUR);
      }
    });

    it("have no Speech line and no Lab group, speech on or off", () => {
      for (const lab of [false, true]) {
        const links = navForRole("RESEARCHER", RESEARCHER_EMAIL, { lab });
        expect(hrefs(links)).not.toContain("/speak");
        expect(hrefs(links)).not.toContain("/lab/speech");
        expect(JSON.stringify(links)).not.toContain("researchers only");
        expect(JSON.stringify(links)).not.toContain('"lab"');
      }
      // The Speech model view still needs speech on.
      expect(hrefs(navForRole("RESEARCHER", RESEARCHER_EMAIL))).not.toContain(
        "/admin/speech",
      );
    });

    it("below the divider: four views with speech off, five with it on, then More", () => {
      const off = navForRole("RESEARCHER", RESEARCHER_EMAIL);
      expect(research(off).map((l) => l.label)).toEqual([
        "Today",
        "People",
        "Data",
        "Text model",
      ]);
      const on = navForRole("RESEARCHER", RESEARCHER_EMAIL, { lab: true });
      expect(research(on).map((l) => l.label)).toEqual([
        "Today",
        "People",
        "Data",
        "Text model",
        "Speech model",
      ]);
      for (const links of [off, on]) {
        expect(links[links.length - 1]).toMatchObject({
          href: "/admin/more",
          label: "More",
          group: "more",
        });
      }
    });

    it("the nightly loop is a tab of the Speech model view, not a sidebar line", () => {
      const on = navForRole("RESEARCHER", RESEARCHER_EMAIL, { lab: true });
      expect(on.map((l) => l.label)).not.toContain("Speech loop");
      expect(on.find((l) => l.href === "/admin/speech")?.label).toBe(
        "Speech model",
      );
    });

    it("the tone pass: Tone agreement is in the Data view; Pass 2 itself is a tab of Annotate, never a line", () => {
      for (const options of [{}, { lab: true }, { tone: null }, { tone: 30 }]) {
        const links = navForRole("RESEARCHER", RESEARCHER_EMAIL, options);
        expect(hrefs(links)).not.toContain("/admin/tone");
        expect(links.map((l) => l.label)).not.toContain("Tone agreement");
        expect(hrefs(links)).not.toContain("/annotator/tone");
        expect(links.map((l) => l.label)).not.toContain("Pass 2: tone marks");
      }
      expect(TONE_ADMIN_LINK).toEqual({
        href: "/admin/tone",
        label: "Tone agreement",
      });
      expect(activeResearchHref("/admin/tone")).toBe("/admin/annotations");
    });
  });

  describe("the waiting numbers", () => {
    const count = (links: ReturnType<typeof navForRole>, href: string) =>
      links.find((l) => l.href === href)?.count;

    it("Annotate carries everything waiting in it: prompts, speech and tone items", () => {
      const links = navForRole("ANNOTATOR", "a@example.com", {
        lab: true,
        waiting: { speech: 310, annotate: 12, fix: 3 },
        tone: 45,
      });
      expect(count(links, "/annotator/annotate")).toBe(310 + 12 + 45);
      expect(count(links, "/annotator/history")).toBe(3);
    });

    it("speech counts only when speech is on for the person", () => {
      const links = navForRole("ANNOTATOR", "a@example.com", {
        waiting: { speech: 5, annotate: 2 },
      });
      expect(count(links, "/annotator/annotate")).toBe(2);
    });

    it("no number when it is zero or not known", () => {
      for (const waiting of [{ speech: 0, annotate: 0 }, {}, undefined]) {
        const links = navForRole("RESEARCHER", RESEARCHER_EMAIL, {
          lab: true,
          waiting,
        });
        for (const l of links) expect(l.count, l.label).toBeUndefined();
      }
    });
  });

  it("activeNavHref keeps Annotate lit on the old addresses of the work that moved into it", () => {
    const links = navForRole("ANNOTATOR", "a@example.com", { lab: true });
    for (const path of [
      "/annotator/annotate",
      "/annotator/tone",
      "/speak",
      "/speak/listen",
      "/speak/check",
      "/speak/profile",
      "/lab/speech",
    ]) {
      expect(activeNavHref(links, path), path).toBe("/annotator/annotate");
    }
    expect(activeNavHref(links, "/lab/speechx")).toBeNull();
    expect(activeNavHref(links, "/speaker")).toBeNull();
    // A researcher's Speech model view is its own link.
    const r = navForRole("RESEARCHER", RESEARCHER_EMAIL, { lab: true });
    expect(activeNavHref(r, "/admin/speech")).toBe("/admin/speech");
  });
});
