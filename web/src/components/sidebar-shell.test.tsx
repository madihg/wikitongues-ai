import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { state } = vi.hoisted(() => ({
  state: { role: "ANNOTATOR", email: "a@example.com", pathname: "/annotator" },
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u1", role: state.role, email: state.email, name: "A" } },
    status: "authenticated",
  }),
  signOut: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/components/lab/use-speech-layer", () => ({
  useSpeechLayer: () => true,
  useSpeechWaiting: () => 4,
}));
vi.mock("@/components/tone/use-tone-count", () => ({ useToneCount: () => 3 }));
vi.mock("@/components/use-nav-waiting", () => ({
  useNavWaiting: () => ({ annotate: 0, speech: 4, record: 4, listen: 0, check: 0, fix: 0 }),
}));

import { Sidebar, drawerKeyStep } from "./sidebar";

/** Link labels inside one element of the markup, in order, numbers included. */
function linksIn(html: string, open: string, close: string): string[] {
  const from = html.indexOf(open);
  const part = html.slice(from, html.indexOf(close, from));
  return [...part.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map((m) =>
    m[1].replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  );
}
const drawerLinks = (html: string) => linksIn(html, 'role="dialog"', "</nav>");
const sidebarLinks = (html: string) => linksIn(html, "<aside", "</aside>");

beforeEach(() => {
  Object.assign(state, { role: "ANNOTATOR", email: "a@example.com", pathname: "/annotator" });
});

describe("the phone shell", () => {
  it("closed: a top bar with a menu button that says it is collapsed, and no dialog", () => {
    const html = renderToStaticMarkup(<Sidebar />);
    expect(html).toMatch(/<header[^>]*min-\[900px\]:hidden/);
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="app-nav-drawer"/);
    expect(html).toContain("Open menu");
    expect(html).not.toContain('role="dialog"');
  });

  it("open: a modal dialog named Menu, the button says expanded, and a labelled close button", () => {
    const html = renderToStaticMarkup(<Sidebar initialMenuOpen />);
    expect(html).toMatch(/<button[^>]*aria-expanded="true"/);
    expect(html).toMatch(/id="app-nav-drawer"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-label="Menu"/);
    expect(html).toContain("Close menu");
    expect(html).toContain('data-testid="nav-scrim"');
  });

  it("an annotator finds the same links in the drawer as in the desktop sidebar", () => {
    const html = renderToStaticMarkup(<Sidebar initialMenuOpen />);
    expect(drawerLinks(html)).toEqual(sidebarLinks(html));
    expect(drawerLinks(html)).toEqual([
      "Dashboard",
      "Annotate 7 waiting",
      "My Work",
      "Rubric",
    ]);
    expect(html.match(/Sign out/g)?.length).toBe(2);
  });

  it("a researcher finds the work links and the research views in the drawer, in the sidebar's order", () => {
    Object.assign(state, { role: "RESEARCHER", email: "r@example.com", pathname: "/admin" });
    const html = renderToStaticMarkup(<Sidebar initialMenuOpen />);
    const links = drawerLinks(html);
    expect(links).toEqual(sidebarLinks(html));
    for (const label of ["Dashboard", "Annotate 7 waiting", "My Work", "Today", "Data", "Text model", "Speech model", "More"]) {
      expect(links).toContain(label);
    }
    expect(links.indexOf("Today")).toBeGreaterThan(links.indexOf("My Work"));
    // The current page is marked in the drawer too.
    const drawer = html.slice(html.indexOf('role="dialog"'), html.indexOf("<aside"));
    expect(drawer).toMatch(/aria-current="page"[^>]*>Today|>Today<[^>]*aria-current/);
  });

  it("the desktop sidebar is the same element as before, shown from 900px", () => {
    const html = renderToStaticMarkup(<Sidebar />);
    expect(html).toMatch(/<aside class="hidden h-screen w-64 flex-col border-r border-border bg-surface min-\[900px\]:flex"/);
    expect(html.match(/<nav /g)?.length).toBe(1);
  });

  it("the page column takes the full width under 900px", () => {
    const layout = readFileSync(join(process.cwd(), "src/app/(app)/layout.tsx"), "utf8");
    expect(layout).toMatch(/flex h-screen flex-col min-\[900px\]:flex-row/);
    expect(layout).toMatch(/<main className="[^"]*min-w-0[^"]*flex-1[^"]*p-4 min-\[900px\]:p-8"/);
  });
});

describe("keys inside the open menu", () => {
  it("Escape closes it from anywhere", () => {
    expect(drawerKeyStep("Escape", false, 2, 9)).toBe("close");
    expect(drawerKeyStep("Escape", true, -1, 0)).toBe("close");
  });
  it("Tab on the last stop goes to the first; Shift+Tab on the first goes to the last", () => {
    expect(drawerKeyStep("Tab", false, 8, 9)).toBe(0);
    expect(drawerKeyStep("Tab", true, 0, 9)).toBe(8);
  });
  it("Tab in the middle is left to the browser", () => {
    expect(drawerKeyStep("Tab", false, 3, 9)).toBeNull();
    expect(drawerKeyStep("Tab", true, 3, 9)).toBeNull();
  });
  it("focus that slipped out comes back in", () => {
    expect(drawerKeyStep("Tab", false, -1, 9)).toBe(0);
    expect(drawerKeyStep("Tab", true, -1, 9)).toBe(8);
  });
  it("other keys do nothing", () => {
    expect(drawerKeyStep("Enter", false, 1, 9)).toBeNull();
    expect(drawerKeyStep("Tab", false, 0, 0)).toBeNull();
  });
});
