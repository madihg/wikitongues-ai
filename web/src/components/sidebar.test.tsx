import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { state } = vi.hoisted(() => ({
  state: {
    role: "ANNOTATOR",
    email: "a@example.com",
    pathname: "/annotator",
    lab: false,
    waiting: undefined as number | undefined,
    tone: null as number | null,
  },
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: { id: "u1", role: state.role, email: state.email, name: "A" },
    },
    status: "authenticated",
  }),
  signOut: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
// The two hooks ask the server in an effect; here they answer directly.
vi.mock("@/components/lab/use-speech-layer", () => ({
  useSpeechLayer: () => state.lab,
  useSpeechWaiting: (on: boolean) => (on ? state.waiting : undefined),
}));

// Tone-mark pass 2: null until the server says this person was given items.
vi.mock("@/components/tone/use-tone-count", () => ({
  useToneCount: () => state.tone,
}));

import { Sidebar } from "./sidebar";

/** The sidebar's link labels, in order (the "View as" block is not nav). */
function labels(html: string): string[] {
  const nav = html.slice(html.indexOf("<nav"), html.indexOf("</nav>"));
  return [...nav.matchAll(/<a\b[^>]*>([^<]+)/g)].map((m) => m[1]);
}

beforeEach(() => {
  Object.assign(state, {
    role: "ANNOTATOR",
    email: "a@example.com",
    pathname: "/annotator",
    lab: false,
    waiting: undefined,
    tone: null,
  });
});

describe("Sidebar", () => {
  it("an annotator with speech off sees exactly today's four lines, no divider, no number", () => {
    const html = renderToStaticMarkup(<Sidebar />);
    expect(labels(html)).toEqual([
      "Dashboard",
      "Annotate",
      "My Work",
      "Rubric",
    ]);
    expect(html).not.toContain('data-testid="research-links"');
    expect(html).not.toContain('data-testid="nav-count"');
  });

  it("with speech on, Speech is the third line with what is waiting beside it", () => {
    Object.assign(state, { lab: true, waiting: 310 });
    const html = renderToStaticMarkup(<Sidebar />);
    expect(labels(html)).toEqual([
      "Dashboard",
      "Annotate",
      "Speech",
      "My Work",
      "Rubric",
    ]);
    expect(html).toMatch(
      /href="\/speak"[^>]*>Speech<span data-testid="nav-count"[^>]*>310</,
    );
    expect(html.match(/data-testid="nav-count"/g)).toHaveLength(1);
  });

  it("shows no number when nothing waits or the count is not known", () => {
    for (const waiting of [0, undefined]) {
      Object.assign(state, { lab: true, waiting });
      expect(renderToStaticMarkup(<Sidebar />)).not.toContain(
        'data-testid="nav-count"',
      );
    }
  });

  it("a researcher gets the same lines first, then a divider, the research views and More, and no Lab heading", () => {
    Object.assign(state, {
      role: "RESEARCHER",
      email: "r@example.com",
      lab: true,
      waiting: 4,
    });
    const html = renderToStaticMarkup(<Sidebar />);
    expect(labels(html).slice(0, 5)).toEqual([
      "Dashboard",
      "Annotate",
      "Speech",
      "My Work",
      "Rubric",
    ]);
    const divider = html.indexOf('data-testid="research-links"');
    expect(divider).toBeGreaterThan(html.indexOf(">Rubric<"));
    // Below the divider: the views, then More. Nothing else. People is for
    // research leads, and this researcher is not one.
    expect(labels(html).slice(5)).toEqual([
      "Today",
      "Data",
      "Text model",
      "Speech model",
      "More",
    ]);
    for (const label of ["Today", "Speech model", "More"]) {
      expect(html.indexOf(`>${label}<`), label).toBeGreaterThan(divider);
    }
    expect(html).toContain(">Research<");
    // The lines that left the sidebar are under a view or More, not here.
    for (const gone of [
      "Prompts",
      "Corrections",
      "Review queue",
      "Researcher Dashboard",
      "Model Arena",
      "How it works",
      "Speech loop",
      "Tone agreement",
      "View as",
      "Learner tutor",
    ]) {
      expect(html, gone).not.toContain(`>${gone}<`);
    }
    expect(html).not.toContain(">Lab<");
    expect(html).not.toContain("researchers only");
  });

  it("Speech stays highlighted on its tabs and on the researcher pages", () => {
    Object.assign(state, {
      role: "RESEARCHER",
      email: "r@example.com",
      lab: true,
    });
    for (const pathname of [
      "/speak",
      "/speak/check",
      "/lab/speech/recordings",
    ]) {
      state.pathname = pathname;
      const html = renderToStaticMarkup(<Sidebar />);
      const active = [...html.matchAll(/<a\b[^>]*bg-accent-subtle[^>]*>/g)];
      expect(active, pathname).toHaveLength(1);
      expect(active[0][0], pathname).toContain('href="/speak"');
    }
  });

  it("nobody sees the Pass 2 line before tone items are given to them", () => {
    for (const [role, lab] of [
      ["ANNOTATOR", false],
      ["ANNOTATOR", true],
      ["RESEARCHER", false],
      ["RESEARCHER", true],
    ] as const) {
      Object.assign(state, { role, lab, tone: null });
      const html = renderToStaticMarkup(<Sidebar />);
      expect(html, `${role} ${lab}`).not.toContain("Pass 2");
      expect(html, `${role} ${lab}`).not.toContain('href="/annotator/tone"');
    }
  });

  it("a person who was given tone items gets the line after Speech, with what is waiting", () => {
    Object.assign(state, {
      role: "ANNOTATOR",
      lab: true,
      waiting: 7,
      tone: 30,
    });
    const html = renderToStaticMarkup(<Sidebar />);
    expect(labels(html)).toEqual([
      "Dashboard",
      "Annotate",
      "Speech",
      "Pass 2: tone marks",
      "My Work",
      "Rubric",
    ]);
    expect(html).toMatch(
      /href="\/annotator\/tone"[^>]*>Pass 2: tone marks<span data-testid="nav-count"[^>]*>30</,
    );
    // Every item marked: the line stays, without a number.
    Object.assign(state, { tone: 0, waiting: undefined });
    const done = renderToStaticMarkup(<Sidebar />);
    expect(labels(done)).toContain("Pass 2: tone marks");
    expect(done).not.toContain('data-testid="nav-count"');
  });

  it("Tone agreement is not a sidebar line for anyone: the Data view links to it and lights up on it", () => {
    Object.assign(state, {
      role: "RESEARCHER",
      email: "r@example.com",
      lab: true,
      pathname: "/admin/tone",
    });
    const html = renderToStaticMarkup(<Sidebar />);
    expect(html).not.toContain('href="/admin/tone"');
    const active = [...html.matchAll(/<a\b[^>]*bg-accent-subtle[^>]*>/g)];
    expect(active).toHaveLength(1);
    expect(active[0][0]).toContain('href="/admin/annotations"');
    Object.assign(state, { role: "ANNOTATOR", email: "a@example.com" });
    expect(renderToStaticMarkup(<Sidebar />)).not.toContain("/admin/tone");
  });

  it("a research page lights exactly one view, whichever tab or archived page it is", () => {
    Object.assign(state, {
      role: "RESEARCHER",
      email: "r@example.com",
      lab: true,
    });
    for (const [pathname, href] of [
      ["/admin", "/admin"],
      ["/admin/data/export", "/admin/annotations"],
      ["/admin/arena/chat", "/admin/arena/verdict"],
      ["/admin/speech/loop", "/admin/speech"],
      ["/admin/arena/costs", "/admin/more"],
    ]) {
      state.pathname = pathname;
      const html = renderToStaticMarkup(<Sidebar />);
      const active = [...html.matchAll(/<a\b[^>]*bg-accent-subtle[^>]*>/g)];
      expect(active, pathname).toHaveLength(1);
      expect(active[0][0], pathname).toContain(`href="${href}"`);
    }
  });
});
