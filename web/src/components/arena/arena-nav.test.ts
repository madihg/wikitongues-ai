import { describe, it, expect } from "vitest";
import {
  ARENA_TABS,
  COMPARE_MODES,
  arenaMorePage,
  isTabActive,
} from "./arena-nav";
import { ARCHIVE, OLD_ROUTES, TOOLS } from "@/lib/admin/routes";

const tab = (label: string) => ARENA_TABS.find((t) => t.label === label)!;

describe("ARENA_TABS", () => {
  it("is four tabs: Verdict, Benchmark, Compare, Setup", () => {
    expect(ARENA_TABS.map((t) => t.label)).toEqual([
      "Verdict",
      "Benchmark",
      "Compare",
      "Setup",
    ]);
  });

  it("opens on the Speakers' verdict, the human evidence", () => {
    expect(ARENA_TABS[0].href).toBe("/admin/arena/verdict");
  });

  it("keeps every destination the eleven-tab bar had, as a tab, a mode, a tool, an archived page or a redirect", () => {
    const reachable = new Set([
      ...ARENA_TABS.map((t) => t.href),
      ...COMPARE_MODES.map((m) => m.href),
      ...TOOLS.map((t) => t.href),
      ...ARCHIVE.map((a) => a.href),
      ...OLD_ROUTES.filter((r) => r.now === "redirect").map((r) => r.url),
    ]);
    for (const href of [
      "/admin/arena",
      "/admin/arena/verdict",
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
      expect(reachable.has(href), href).toBe(true);
    }
  });

  it("has no duplicate hrefs or labels", () => {
    expect(new Set(ARENA_TABS.map((t) => t.href)).size).toBe(ARENA_TABS.length);
    expect(new Set(ARENA_TABS.map((t) => t.label)).size).toBe(
      ARENA_TABS.length,
    );
  });

  it("gives every tab a plain-English hint with no em dashes", () => {
    for (const t of ARENA_TABS) {
      expect(t.hint.length).toBeGreaterThan(20);
      expect(t.hint).not.toContain(String.fromCharCode(0x2014));
    }
  });
});

describe("isTabActive", () => {
  it("selects a tab on its own route", () => {
    expect(isTabActive("/admin/arena/verdict", tab("Verdict"))).toBe(true);
    expect(isTabActive("/admin/arena/eval", tab("Benchmark"))).toBe(true);
    expect(isTabActive("/admin/arena/eval", tab("Verdict"))).toBe(false);
  });

  it("keeps Setup selected on a candidate's own page", () => {
    expect(isTabActive("/admin/arena/candidates/abc123", tab("Setup"))).toBe(
      true,
    );
  });

  it("Compare owns both of its modes, each at its old address", () => {
    expect(COMPARE_MODES.map((m) => m.href)).toEqual([
      "/admin/arena/chat",
      "/admin/arena/compare",
    ]);
    expect(isTabActive("/admin/arena/chat", tab("Compare"))).toBe(true);
    expect(isTabActive("/admin/arena/compare", tab("Compare"))).toBe(true);
  });

  it("does not match a different route that merely shares a prefix", () => {
    expect(isTabActive("/admin/arena/candidates-archive", tab("Setup"))).toBe(
      false,
    );
  });

  it("lights exactly one tab on every text model page", () => {
    for (const path of [
      "/admin/arena/verdict",
      "/admin/arena/eval",
      "/admin/arena/chat",
      "/admin/arena/compare",
      "/admin/arena/candidates",
      "/admin/arena/candidates/x",
    ]) {
      expect(
        ARENA_TABS.filter((t) => isTabActive(path, t)),
        path,
      ).toHaveLength(1);
    }
  });
});

describe("arena pages that moved under More", () => {
  it("light no tab, and say where they live now", () => {
    for (const [path, label, section] of [
      ["/admin/arena/costs", "Costs", "Tools"],
      ["/admin/arena/demo", "Demo session", "Tools"],
      ["/admin/arena/jobs", "Fine-tune jobs", "Archive"],
      ["/admin/arena/jobs/new", "Fine-tune jobs", "Archive"],
      ["/admin/arena/trajectory", "Trajectory", "Archive"],
    ] as const) {
      expect(
        ARENA_TABS.some((t) => isTabActive(path, t)),
        path,
      ).toBe(false);
      expect(arenaMorePage(path)).toEqual({ label, section });
    }
  });

  it("a text model page is not a More page", () => {
    for (const t of ARENA_TABS) expect(arenaMorePage(t.href)).toBeNull();
    expect(arenaMorePage("/admin/arena/compare")).toBeNull();
  });
});
