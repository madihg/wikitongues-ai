import { describe, it, expect } from "vitest";
import { ARENA_TABS, ARENA_EXIT, isTabActive } from "./arena-nav";

describe("ARENA_TABS", () => {
  it("keeps every destination the old pill nav had", () => {
    const hrefs = ARENA_TABS.map((t) => t.href).concat(ARENA_EXIT.href);
    for (const href of [
      "/admin/arena",
      "/admin/arena/candidates",
      "/admin/arena/jobs",
      "/admin/arena/compare",
      "/admin/arena/trajectory",
      "/admin/arena/contested",
      "/admin/arena/costs",
      "/admin/arena/demo",
      "/admin",
    ]) {
      expect(hrefs).toContain(href);
    }
  });

  it("puts the Speakers' verdict right after Overview - the first stop after the front page", () => {
    expect(ARENA_TABS[1].href).toBe("/admin/arena/verdict");
  });

  it("has no duplicate hrefs or labels", () => {
    expect(new Set(ARENA_TABS.map((t) => t.href)).size).toBe(ARENA_TABS.length);
    expect(new Set(ARENA_TABS.map((t) => t.label)).size).toBe(
      ARENA_TABS.length,
    );
  });

  it("gives every tab a plain-English hint with no em dashes", () => {
    for (const tab of ARENA_TABS) {
      expect(tab.hint.length).toBeGreaterThan(20);
      expect(tab.hint).not.toContain("—");
    }
    expect(ARENA_EXIT.hint).not.toContain("—");
  });
});

describe("isTabActive", () => {
  it("selects Overview only at the arena root", () => {
    expect(isTabActive("/admin/arena", "/admin/arena")).toBe(true);
    expect(isTabActive("/admin/arena/costs", "/admin/arena")).toBe(false);
    expect(isTabActive("/admin/arena/candidates", "/admin/arena")).toBe(false);
  });

  it("selects a section tab on its own route", () => {
    expect(isTabActive("/admin/arena/costs", "/admin/arena/costs")).toBe(true);
  });

  it("keeps the section tab selected on sub-routes", () => {
    expect(isTabActive("/admin/arena/jobs/new", "/admin/arena/jobs")).toBe(
      true,
    );
    expect(
      isTabActive("/admin/arena/candidates/abc123", "/admin/arena/candidates"),
    ).toBe(true);
  });

  it("does not select on a mere string prefix", () => {
    expect(
      isTabActive("/admin/arena/costsomething", "/admin/arena/costs"),
    ).toBe(false);
  });

  it("selects exactly one tab for every tab route and known sub-route", () => {
    // Derived from ARENA_TABS so the guarantee survives tabs being added or
    // removed, plus the sub-routes that have no tab of their own.
    const routes = [
      ...ARENA_TABS.map((t) => t.href),
      "/admin/arena/candidates/abc123",
      "/admin/arena/jobs/new",
    ];
    for (const route of routes) {
      const active = ARENA_TABS.filter((t) => isTabActive(route, t.href));
      expect(active, `route ${route}`).toHaveLength(1);
    }
  });
});
