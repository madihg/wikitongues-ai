import { describe, it, expect } from "vitest";
import { activeNavHref, navForRole, PUBLIC_HOW_IT_WORKS_URL } from "./personas";

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

  it("researchers KEEP the standalone Corrections lane (the backlog view)", () => {
    const links = navForRole("RESEARCHER", RESEARCHER_EMAIL);
    expect(links.map((l) => l.href)).toContain("/annotator/corrections");
  });

  it("an unknown/absent role gets the annotator nav - and so no Corrections either", () => {
    expect(navForRole(null, null).map((l) => l.href)).not.toContain(
      "/annotator/corrections",
    );
  });
});

describe("navForRole - the Speakers' Verdict entry", () => {
  it("researchers get the verdict ahead of Model Arena", () => {
    const hrefs = navForRole("RESEARCHER", RESEARCHER_EMAIL).map((l) => l.href);
    const verdict = hrefs.indexOf("/admin/arena/verdict");
    const arena = hrefs.indexOf("/admin/arena");
    expect(verdict).toBeGreaterThan(-1);
    expect(arena).toBeGreaterThan(-1);
    expect(verdict).toBeLessThan(arena);
  });

  it("annotators do NOT get the verdict entry - it is a researcher surface", () => {
    expect(
      navForRole("ANNOTATOR", "annotator@example.com").map((l) => l.href),
    ).not.toContain("/admin/arena/verdict");
  });
});

describe("activeNavHref - one highlighted entry, always the most specific", () => {
  const links = navForRole("RESEARCHER", RESEARCHER_EMAIL);

  it("prefers the exact match", () => {
    expect(activeNavHref(links, "/admin/arena/verdict")).toBe(
      "/admin/arena/verdict",
    );
    expect(activeNavHref(links, "/admin/arena")).toBe("/admin/arena");
    expect(activeNavHref(links, "/admin")).toBe("/admin");
  });

  it("on nested routes picks the longest owning link, never its parent too", () => {
    // A verdict sub-route belongs to the verdict entry, not to Model Arena.
    expect(activeNavHref(links, "/admin/arena/verdict/anything")).toBe(
      "/admin/arena/verdict",
    );
    // Other arena sub-routes still belong to Model Arena.
    expect(activeNavHref(links, "/admin/arena/costs")).toBe("/admin/arena");
  });

  it("the role dashboards only match exactly", () => {
    expect(activeNavHref(links, "/admin/annotations")).toBe(
      "/admin/annotations",
    );
    expect(activeNavHref(links, "/annotator/annotate")).toBe(
      "/annotator/annotate",
    );
  });

  it("an out-link is never the active entry", () => {
    // "How it works" points at the public marketing page. Even standing on
    // the in-app route it supersedes, nothing in the nav lights up: the
    // reader's destination is off this app entirely.
    expect(activeNavHref(links, "/admin/how-it-works")).toBeNull();
    expect(activeNavHref(links, PUBLIC_HOW_IT_WORKS_URL)).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(activeNavHref(links, "/learner/chat")).toBeNull();
  });
});

describe("How it works points out to the public page", () => {
  const links = navForRole("RESEARCHER");

  it("is an external entry aimed at the marketing site", () => {
    const hiw = links.find((l) => l.label === "How it works");
    expect(hiw).toBeDefined();
    expect(hiw?.external).toBe(true);
    expect(hiw?.href).toBe(PUBLIC_HOW_IT_WORKS_URL);
    // Absolute https, so the browser leaves the app rather than 404ing on a
    // relative path.
    expect(() => new URL(PUBLIC_HOW_IT_WORKS_URL)).not.toThrow();
    expect(PUBLIC_HOW_IT_WORKS_URL.startsWith("https://")).toBe(true);
    // No in-app how-it-works entry survives alongside it: one front door.
    expect(links.some((l) => l.href === "/admin/how-it-works")).toBe(false);
  });

  it("is the only out-link, and every other entry stays in-app", () => {
    for (const l of links) {
      if (l.external) {
        expect(l.label).toBe("How it works");
      } else {
        expect(l.href.startsWith("/")).toBe(true);
      }
    }
    expect(links.filter((l) => l.external)).toHaveLength(1);
  });

  it("annotators do not get it at all", () => {
    const annotator = navForRole("ANNOTATOR");
    expect(annotator.some((l) => l.external)).toBe(false);
    expect(annotator.some((l) => l.label === "How it works")).toBe(false);
  });
});

describe("navForRole - one Speech link for every role (2026-11-13)", () => {
  const hrefs = (links: ReturnType<typeof navForRole>) =>
    links.map((l) => l.href);
  const work = (links: ReturnType<typeof navForRole>) =>
    links.filter((l) => !l.group);
  const research = (links: ReturnType<typeof navForRole>) =>
    links.filter((l) => l.group === "research");

  describe("annotators", () => {
    const baseline = hrefs(navForRole("ANNOTATOR", "a@example.com"));

    it("with speech off (the default) they see exactly today's four lines", () => {
      expect(baseline).toEqual([
        "/annotator",
        "/annotator/annotate",
        "/annotator/history",
        "/annotator/rubric",
      ]);
      expect(
        hrefs(navForRole("ANNOTATOR", "a@example.com", { lab: false })),
      ).toEqual(baseline);
      expect(
        navForRole("ANNOTATOR", "a@example.com").map((l) => l.label),
      ).toEqual(["Dashboard", "Annotate", "My Work", "Rubric"]);
    });

    it("with it on they gain ONE link, Speech, right after Annotate, and lose nothing", () => {
      const on = navForRole("ANNOTATOR", "a@example.com", { lab: true });
      expect(hrefs(on)).toEqual([
        "/annotator",
        "/annotator/annotate",
        "/speak",
        "/annotator/history",
        "/annotator/rubric",
      ]);
      expect(on.map((l) => l.label)).toEqual([
        "Dashboard",
        "Annotate",
        "Speech",
        "My Work",
        "Rubric",
      ]);
      // Listen and Check are tabs inside Speech, not sidebar links.
      expect(hrefs(on)).not.toContain("/speak/listen");
      expect(hrefs(on)).not.toContain("/speak/check");
      expect(on.map((l) => l.label)).not.toContain("Speak");
    });

    it("never get a research link or a lab path, speech on or off", () => {
      const on = navForRole("ANNOTATOR", "a@example.com", { lab: true });
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
        // The work lines come first; the research links follow them.
        expect(r.slice(0, a.length)).toEqual(a);
      }
    });

    it("with speech on, Speech is the third line and there is no Lab group", () => {
      const links = navForRole("RESEARCHER", RESEARCHER_EMAIL, { lab: true });
      expect(links[2]).toMatchObject({ href: "/speak", label: "Speech" });
      expect(links[2].group).toBeUndefined();
      expect(JSON.stringify(links)).not.toContain("researchers only");
      expect(JSON.stringify(links)).not.toContain('"lab"');
      expect(hrefs(links)).not.toContain("/lab/speech");
      // Check is a tab inside Speech now, not a second sidebar link.
      expect(hrefs(links)).not.toContain("/speak/check");
    });

    it("get no Speech link when the flag is off (the default)", () => {
      for (const links of [
        navForRole("RESEARCHER", RESEARCHER_EMAIL),
        navForRole("RESEARCHER", RESEARCHER_EMAIL, { lab: false }),
      ]) {
        expect(hrefs(links)).not.toContain("/speak");
        expect(hrefs(links)).not.toContain("/admin/speech");
      }
    });

    it("keep every research link, with the label it has always had", () => {
      const links = navForRole("RESEARCHER", RESEARCHER_EMAIL);
      expect(research(links).map((l) => l.label)).toEqual([
        "Prompts",
        "Corrections",
        "Review queue",
        "Annotations",
        "Researcher Dashboard",
        "Speakers' Verdict",
        "Model Arena",
        "How it works",
      ]);
      expect(links[links.length - 1].group).toBe("research");
    });

    it("the Speech loop link joins the research links only when speech is on", () => {
      const off = research(navForRole("RESEARCHER", RESEARCHER_EMAIL));
      const on = research(
        navForRole("RESEARCHER", RESEARCHER_EMAIL, { lab: true }),
      );
      expect(on.slice(0, off.length)).toEqual(off);
      expect(on.slice(off.length)).toEqual([
        { href: "/admin/speech", label: "Speech loop", group: "research" },
      ]);
    });
  });

  describe("the waiting numbers", () => {
    const count = (links: ReturnType<typeof navForRole>, href: string) =>
      links.find((l) => l.href === href)?.count;

    it("Speech carries what is waiting", () => {
      const links = navForRole("ANNOTATOR", "a@example.com", {
        lab: true,
        waiting: { speech: 310, annotate: 12 },
      });
      expect(count(links, "/speak")).toBe(310);
      expect(count(links, "/annotator/annotate")).toBe(12);
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

    it("no Speech number without the Speech link", () => {
      const links = navForRole("ANNOTATOR", "a@example.com", {
        waiting: { speech: 5 },
      });
      expect(links.some((l) => l.count !== undefined)).toBe(false);
    });
  });

  it("activeNavHref keeps Speech active on every Speech page, old paths included", () => {
    const links = navForRole("RESEARCHER", RESEARCHER_EMAIL, { lab: true });
    for (const path of [
      "/speak",
      "/speak/listen",
      "/speak/check",
      "/speak/profile",
      "/lab/speech",
      "/lab/speech/recordings",
      "/lab/speech/studio",
    ]) {
      expect(activeNavHref(links, path), path).toBe("/speak");
    }
    expect(activeNavHref(links, "/lab/speechx")).toBeNull();
    expect(activeNavHref(links, "/speaker")).toBeNull();
    // The loop dashboard is its own link, not Speech.
    expect(activeNavHref(links, "/admin/speech")).toBe("/admin/speech");
  });
});
