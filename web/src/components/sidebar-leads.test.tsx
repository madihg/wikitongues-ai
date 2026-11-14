import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { state } = vi.hoisted(() => ({
  state: { role: "RESEARCHER", email: "agnes@example.org", lead: false },
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
vi.mock("next/navigation", () => ({ usePathname: () => "/annotator" }));
// The server's answer to "is this researcher a lead?", given directly.
vi.mock("@/components/admin/use-research-lead", () => ({
  useResearchLead: (eligible: boolean) => eligible && state.lead,
}));

import { Sidebar } from "./sidebar";

const links = (html: string) =>
  [...html.matchAll(/<a\b[^>]*>([^<]+)/g)].map((m) => m[1]);

beforeEach(() => {
  Object.assign(state, {
    role: "RESEARCHER",
    email: "agnes@example.org",
    lead: false,
  });
});

describe("the People link is for research leads", () => {
  it("a researcher who is not a lead sees the other views and More, and no People", () => {
    const labels = links(renderToStaticMarkup(<Sidebar />));
    expect(labels).not.toContain("People");
    for (const label of ["Today", "Data", "Text model", "More"]) {
      expect(labels).toContain(label);
    }
  });

  it("a researcher the server names as a lead sees People", () => {
    state.lead = true;
    expect(links(renderToStaticMarkup(<Sidebar />))).toContain("People");
  });

  it("the owner sees People without asking", () => {
    state.email = "madihalim@gmail.com";
    expect(links(renderToStaticMarkup(<Sidebar />))).toContain("People");
  });

  it("an annotator has no research links at all", () => {
    Object.assign(state, {
      role: "ANNOTATOR",
      email: "a@example.org",
      lead: true,
    });
    const labels = links(renderToStaticMarkup(<Sidebar />));
    expect(labels).not.toContain("People");
    expect(labels).not.toContain("Today");
  });
});
