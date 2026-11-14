import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  forbidden: () => {
    throw new Error("NEXT_FORBIDDEN");
  },
}));
vi.mock("@/lib/speech/page-gate", () => ({
  requireLabPage: vi.fn(async () => "researcher"),
  requireSpeakPage: vi.fn(async () => undefined),
}));

import {
  ARCHIVE,
  DATA_TABS,
  MORE_LINK,
  NEW_ROUTES,
  OLD_ROUTES,
  RESEARCH_VIEWS,
  TOOLS,
  activeResearchHref,
  isViewTabActive,
  researchLinks,
} from "./routes";
import { ARENA_TABS } from "@/components/arena/arena-nav";
import { PUBLIC_HOW_IT_WORKS_URL } from "@/lib/personas";

/**
 * "Nothing breaks": every address a researcher could reach before still has a
 * page, and an address whose content moved redirects to a page that exists.
 * The walk reads the app directory itself, so deleting or renaming a page
 * fails here, not in production.
 */

const APP = join(process.cwd(), "src", "app");

/** Every page.tsx under src/app, keyed by the URL it serves. */
function pageFiles(dir = APP, out = new Map<string, string>()) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      pageFiles(full, out);
    } else if (name === "page.tsx") {
      const url =
        "/" +
        dir
          .slice(APP.length)
          .split("/")
          .filter((seg) => seg && !/^\(.*\)$/.test(seg))
          .join("/");
      out.set(url === "/" ? "/" : url.replace(/\/$/, ""), full);
    }
  }
  return out;
}

const PAGES = pageFiles();
const pageFor = (url: string) => PAGES.get(url.split("#")[0].split("?")[0]);

/** Where a redirect-only page sends its visitor. */
async function redirectTargetOf(url: string): Promise<string | null> {
  const file = pageFor(url);
  if (!file) return null;
  const mod = (await import(/* @vite-ignore */ file)) as {
    default: (props: unknown) => unknown;
  };
  try {
    await mod.default({
      searchParams: Promise.resolve({}),
      params: Promise.resolve({}),
    });
  } catch (e) {
    const m = /^NEXT_REDIRECT:(.*)$/.exec((e as Error).message);
    if (m) return m[1];
    throw e;
  }
  return null;
}

beforeEach(() => vi.clearAllMocks());

describe("every old address still answers", () => {
  it("lists each address once", () => {
    const urls = OLD_ROUTES.map((r) => r.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("covers the old sidebar, the old Lab group and the eleven old arena tabs", () => {
    const urls = OLD_ROUTES.map((r) => r.url);
    for (const url of [
      // the 12 sidebar links
      "/annotator",
      "/annotator/prompts",
      "/annotator/annotate",
      "/annotator/corrections",
      "/annotator/history",
      "/annotator/rubric",
      "/annotator/review",
      "/admin/annotations",
      "/admin",
      "/admin/arena/verdict",
      "/admin/arena",
      "/admin/how-it-works",
      // the Lab group
      "/lab/speech",
      "/speak/check",
      "/admin/speech",
      // the arena tabs
      "/admin/arena/candidates",
      "/admin/arena/jobs",
      "/admin/arena/chat",
      "/admin/arena/compare",
      "/admin/arena/eval",
      "/admin/arena/trajectory",
      "/admin/arena/contested",
      "/admin/arena/costs",
      "/admin/arena/demo",
    ]) {
      expect(urls, url).toContain(url);
    }
  });

  for (const route of OLD_ROUTES) {
    it(`${route.url} (${route.was}) answers: ${route.now}`, async () => {
      expect(pageFor(route.url), `no page file for ${route.url}`).toBeDefined();
      if (route.now === "same") {
        // A page that stays must not have quietly become a redirect.
        const src = readFileSync(pageFor(route.url)!, "utf8");
        expect(/^\s*redirect\(/m.test(src) && src.length < 900).toBe(false);
        return;
      }
      const to = await redirectTargetOf(route.url);
      if (route.now === "external") {
        expect(to).toBe(PUBLIC_HOW_IT_WORKS_URL);
        return;
      }
      expect(to).toBe(route.to);
      // The target is a real page, not another hop.
      expect(pageFor(route.to), `no page for target ${route.to}`).toBeDefined();
      const target = OLD_ROUTES.find((r) => r.url === route.to);
      expect(target?.now ?? "same").toBe("same");
    });
  }

  it("every new address has a page", () => {
    for (const url of NEW_ROUTES) {
      expect(pageFor(url), url).toBeDefined();
    }
  });
});

describe("the five views and More", () => {
  it("are Today, People, Data, Text model, Speech model, in that order", () => {
    expect(RESEARCH_VIEWS.map((v) => v.label)).toEqual([
      "Today",
      "People",
      "Data",
      "Text model",
      "Speech model",
    ]);
    expect(researchLinks({ speech: true }).map((l) => l.label)).toEqual([
      "Today",
      "People",
      "Data",
      "Text model",
      "Speech model",
      "More",
    ]);
  });

  it("leaves the Speech model view out while speech is off on the server", () => {
    expect(researchLinks({ speech: false }).map((l) => l.label)).toEqual([
      "Today",
      "People",
      "Data",
      "Text model",
      "More",
    ]);
  });

  it("every view, tab, tool and archived page points at a page that exists", () => {
    const hrefs = [
      ...RESEARCH_VIEWS.map((v) => v.href),
      MORE_LINK.href,
      ...DATA_TABS.map((t) => t.href),
      ...ARENA_TABS.map((t) => t.href),
      ...TOOLS.map((t) => t.href),
      ...ARCHIVE.map((a) => a.href),
    ];
    for (const href of hrefs) {
      expect(pageFor(href), href).toBeDefined();
    }
  });

  it("no view has more than five tabs, and the text model has four", () => {
    expect(DATA_TABS.length).toBeLessThanOrEqual(5);
    expect(ARENA_TABS).toHaveLength(4);
  });

  it("each view states its one question, and nothing uses an em dash", () => {
    const strings = [
      ...RESEARCH_VIEWS.map((v) => v.question),
      ...DATA_TABS.map((t) => t.hint),
      ...TOOLS.map((t) => t.sentence),
      ...ARCHIVE.map((a) => a.sentence),
      ...OLD_ROUTES.map((r) => r.home),
    ];
    for (const s of strings) {
      expect(s.length).toBeGreaterThan(3);
      expect(s).not.toContain(String.fromCharCode(0x2014));
      expect(s).not.toContain(String.fromCharCode(0x2013));
    }
    for (const v of RESEARCH_VIEWS) expect(v.question.endsWith("?")).toBe(true);
  });
});

describe("the archive", () => {
  it("holds the eight archived pages, each with one sentence saying why", () => {
    expect(ARCHIVE.map((a) => a.label)).toEqual([
      "Review queue",
      "Corrections",
      "Fine-tune jobs",
      "Trajectory",
      "Leaderboard (old)",
      "Rubric scores by category",
      "Gap closure",
      "Learner tutor",
    ]);
    for (const a of ARCHIVE) {
      expect(a.sentence.trim().endsWith(".")).toBe(true);
    }
  });

  it("the old cards page still renders the three components as they were", () => {
    const src = readFileSync(pageFor("/admin/more/legacy")!, "utf8");
    for (const c of [
      "<Leaderboard />",
      "<CategoryBreakdown />",
      "<GapDashboard />",
    ]) {
      expect(src).toContain(c);
    }
    for (const id of ["leaderboard", "categories", "gaps"]) {
      expect(src).toContain(`id="${id}"`);
    }
  });

  it("no component of the old dashboard was deleted", () => {
    for (const f of [
      "leaderboard.tsx",
      "category-breakdown.tsx",
      "gap-dashboard.tsx",
      "agreement-stats.tsx",
      "annotator-activity.tsx",
      "time-spent.tsx",
      "export-panel.tsx",
    ]) {
      expect(
        existsSync(join(process.cwd(), "src/components/admin", f)),
        f,
      ).toBe(true);
    }
  });
});

describe("activeResearchHref: one view per page", () => {
  const cases: Array<[string, string | null]> = [
    ["/admin", "/admin"],
    ["/admin/people", "/admin/people"],
    ["/admin/people/abc", "/admin/people"],
    ["/admin/annotations", "/admin/annotations"],
    ["/admin/data/clips", "/admin/annotations"],
    ["/admin/data/export", "/admin/annotations"],
    ["/annotator/prompts", "/admin/annotations"],
    ["/admin/arena/verdict", "/admin/arena/verdict"],
    ["/admin/arena/eval", "/admin/arena/verdict"],
    ["/admin/arena/chat", "/admin/arena/verdict"],
    ["/admin/arena/compare", "/admin/arena/verdict"],
    ["/admin/arena/candidates/abc", "/admin/arena/verdict"],
    ["/admin/speech", "/admin/speech"],
    ["/admin/speech/loop", "/admin/speech"],
    ["/admin/more", "/admin/more"],
    ["/admin/more/legacy", "/admin/more"],
    ["/admin/arena/costs", "/admin/more"],
    ["/admin/arena/demo", "/admin/more"],
    ["/admin/arena/jobs/new", "/admin/more"],
    ["/admin/arena/trajectory", "/admin/more"],
    ["/annotator/review", "/admin/more"],
    ["/annotator/corrections", "/admin/more"],
    // The annotator's own lines and the speech work pages belong to no view.
    ["/annotator", null],
    ["/annotator/annotate", null],
    ["/lab/speech", null],
    ["/speak/check", null],
    ["/administrator", null],
  ];
  for (const [path, want] of cases) {
    it(`${path} -> ${want}`, () => {
      expect(activeResearchHref(path)).toBe(want);
    });
  }
});

describe("isViewTabActive", () => {
  const measure = {
    href: "/admin/speech",
    label: "Measure",
    hint: "",
    exact: true,
  };
  const loop = { href: "/admin/speech/loop", label: "Loop", hint: "" };
  it("an exact tab does not light up on its siblings", () => {
    expect(isViewTabActive("/admin/speech", measure)).toBe(true);
    expect(isViewTabActive("/admin/speech/loop", measure)).toBe(false);
    expect(isViewTabActive("/admin/speech/loop", loop)).toBe(true);
  });
  it("a tab owns its sub-pages and never a look-alike prefix", () => {
    const text = DATA_TABS[0];
    expect(isViewTabActive("/admin/annotations", text)).toBe(true);
    expect(isViewTabActive("/admin/annotationsx", text)).toBe(false);
  });
});
