import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * My Work reads its first filter from the address, so the Dashboard card
 * "Your answers to fix" (/annotator/history?filter=fix) lands on the
 * filtered list and the plain link lands on everything, as before.
 */
const search = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search.value),
  usePathname: () => "/annotator/history",
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));

import HistoryPage from "./page";

const pressed = (markup: string, label: string) =>
  new RegExp(`aria-pressed="true"[^>]*>${label}<`).test(markup);

describe("My Work, first render", () => {
  beforeEach(() => {
    search.value = "";
  });

  it("opens on All when the address names no filter", () => {
    const m = renderToStaticMarkup(<HistoryPage />);
    expect(m).toContain("My Work");
    expect(pressed(m, "All")).toBe(true);
    expect(pressed(m, "Needs a meaning or a reason")).toBe(false);
  });

  it("opens on the fix filter with ?filter=fix", () => {
    search.value = "filter=fix";
    const m = renderToStaticMarkup(<HistoryPage />);
    expect(pressed(m, "Needs a meaning or a reason")).toBe(true);
    expect(pressed(m, "All")).toBe(false);
  });

  it("keeps the heading and the line under it word for word", () => {
    const m = renderToStaticMarkup(<HistoryPage />);
    expect(m).toContain(">My Work</h1>");
    expect(m).toContain(
      "Everything you&#x27;ve submitted - comparisons, gold answers, and corrections.",
    );
  });
});
