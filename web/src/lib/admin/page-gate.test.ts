import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const { mockGetServerSession } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next/navigation", () => ({
  forbidden: () => {
    throw new Error("NEXT_FORBIDDEN");
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
}));

import { requireResearcherPage } from "./page-gate";

beforeEach(() => vi.clearAllMocks());

describe("requireResearcherPage", () => {
  it("sends a signed-out visitor to the login page", async () => {
    mockGetServerSession.mockResolvedValue(null);
    await expect(requireResearcherPage()).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    );
  });

  it("answers 403 to an annotator and to a learner", async () => {
    for (const role of ["ANNOTATOR", "LEARNER"]) {
      mockGetServerSession.mockResolvedValue({
        user: { id: "u1", role, email: "a@example.org" },
      });
      await expect(requireResearcherPage()).rejects.toThrow("NEXT_FORBIDDEN");
    }
  });

  it("lets a researcher through and says who they are", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "u2", role: "RESEARCHER", email: "r@example.org", name: "R" },
    });
    await expect(requireResearcherPage()).resolves.toEqual({
      id: "u2",
      name: "R",
      email: "r@example.org",
      role: "RESEARCHER",
      owner: false,
    });
  });

  it("lets the owner through whatever the stored role, as RoleGuard does", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "u3", role: "ANNOTATOR", email: "madihalim@gmail.com" },
    });
    const who = await requireResearcherPage();
    expect(who.owner).toBe(true);
  });
});

/**
 * The (app) shell and RoleGuard run in the browser. A server page under them
 * renders for whoever asks, and its data travels in the response. So a
 * researcher page that reads the database must check the visitor on the
 * server. This walk fails the day someone adds one that does not.
 */
describe("every researcher page that loads data checks the visitor on the server", () => {
  const ADMIN = join(process.cwd(), "src", "app", "(app)", "admin");
  const pages: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "page.tsx") pages.push(full);
    }
  };
  walk(ADMIN);

  const LOADS_DATA =
    /@\/lib\/prisma"|computeAnnotationInsights|computeMethodMetrics|benchmark-sections"|-data"/;
  const GATED = /await requireResearcherPage\(\)|await requireLabPage\(/;

  it("finds the researcher pages", () => {
    expect(pages.length).toBeGreaterThan(15);
  });

  for (const file of pages) {
    const src = readFileSync(file, "utf8");
    if (!LOADS_DATA.test(src)) continue;
    it(`${file.slice(ADMIN.length)} is gated`, () => {
      expect(GATED.test(src)).toBe(true);
    });
  }
});
