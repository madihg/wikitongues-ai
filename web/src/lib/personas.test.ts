import { describe, it, expect } from "vitest";
import { activeNavHref, navForRole, PUBLIC_HOW_IT_WORKS_URL } from "./personas";
import { ARCHIVE } from "@/lib/admin/routes";

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

  it("opens with the annotator's own four lines, same labels, same order", () => {
    const annotator = navForRole("ANNOTATOR", "annotator@example.com");
    expect(links.slice(0, 4)).toEqual(annotator);
    expect(links.slice(0, 4).map((l) => l.label)).toEqual([
      "Dashboard",
      "Annotate",
      "My Work",
      "Rubric",
    ]);
  });

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

describe("navForRole - the Speech Lab group", () => {
  const labHrefs = (links: ReturnType<typeof navForRole>) =>
    links.filter((l) => l.group === "lab").map((l) => l.href);

  it("annotators never get a Lab-group link, even when the speech layer is on", () => {
    const links = navForRole("ANNOTATOR", "annotator@example.com", {
      lab: true,
    });
    expect(labHrefs(links)).toEqual([]);
    expect(links.map((l) => l.href)).not.toContain("/lab/speech");
  });

  it("learners and an absent role never get one either", () => {
    expect(
      labHrefs(navForRole("LEARNER", "l@example.com", { lab: true })),
    ).toEqual([]);
    expect(labHrefs(navForRole(null, null, { lab: true }))).toEqual([]);
  });

  it("researchers get no lab link when the flag is off (the default)", () => {
    expect(labHrefs(navForRole("RESEARCHER", RESEARCHER_EMAIL))).toEqual([]);
    expect(
      labHrefs(navForRole("RESEARCHER", RESEARCHER_EMAIL, { lab: false })),
    ).toEqual([]);
  });

  it("researchers get the Speech link and the shared Check screen when the flag is on; the loop is a tab of the Speech model view", () => {
    const links = navForRole("RESEARCHER", RESEARCHER_EMAIL, { lab: true });
    const lab = links.filter((l) => l.group === "lab");
    expect(lab).toEqual([
      {
        href: "/lab/speech",
        label: "Speech",
        tag: "researchers only",
        group: "lab",
      },
      { href: "/speak/check", label: "Check", group: "lab" },
    ]);
    expect(links.map((l) => l.label)).not.toContain("Speech loop");
    // The lab links sit between the annotator's lines and the research views.
    const groups = links.map((l) => l.group ?? "main");
    expect(groups.lastIndexOf("main")).toBeLessThan(groups.indexOf("lab"));
    expect(groups.lastIndexOf("lab")).toBeLessThan(groups.indexOf("research"));
  });

  it("the lab link does not disturb the existing researcher links", () => {
    const off = navForRole("RESEARCHER", RESEARCHER_EMAIL).map((l) => l.href);
    const on = navForRole("RESEARCHER", RESEARCHER_EMAIL, { lab: true })
      .filter((l) => l.group !== "lab" && l.href !== "/admin/speech")
      .map((l) => l.href);
    expect(on).toEqual(off);
  });

  describe("annotators and the speech layer", () => {
    const baseline = navForRole("ANNOTATOR", "a@example.com").map((l) => l.href);

    it("with the layer off (the default) the navigation is unchanged", () => {
      expect(baseline).toEqual([
        "/annotator",
        "/annotator/annotate",
        "/annotator/history",
        "/annotator/rubric",
      ]);
      expect(
        navForRole("ANNOTATOR", "a@example.com", { lab: false }).map((l) => l.href),
      ).toEqual(baseline);
    });

    it("with it on they gain Speak, Listen and Check right after Annotate, and lose nothing", () => {
      const on = navForRole("ANNOTATOR", "a@example.com", { lab: true });
      expect(on.map((l) => l.href)).toEqual([
        "/annotator",
        "/annotator/annotate",
        "/speak",
        "/speak/listen",
        "/speak/check",
        "/annotator/history",
        "/annotator/rubric",
      ]);
      expect(on.filter((l) => l.group === "lab")).toEqual([]);
      expect(on.map((l) => l.label)).toEqual(
        expect.arrayContaining(["Speak", "Listen", "Check"]),
      );
    });

    it("a learner gets no speech links whatever the server says", () => {
      const links = navForRole("LEARNER", "l@example.com", { lab: true });
      expect(links.map((l) => l.href).some((h) => h.startsWith("/speak"))).toBe(false);
    });

    it("researchers keep the Lab group and gain no /speak links in the main group", () => {
      const links = navForRole("RESEARCHER", RESEARCHER_EMAIL, { lab: true });
      expect(
        links
          .filter((l) => l.group !== "lab")
          .some((l) => l.href.startsWith("/speak")),
      ).toBe(false);
    });
  });

  it("activeNavHref keeps Speech active on its sub-pages", () => {
    const links = navForRole("RESEARCHER", RESEARCHER_EMAIL, { lab: true });
    for (const path of [
      "/lab/speech",
      "/lab/speech/listen",
      "/lab/speech/recordings",
    ]) {
      expect(activeNavHref(links, path), path).toBe("/lab/speech");
    }
    expect(activeNavHref(links, "/lab/speechx")).toBeNull();
  });
});
