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
