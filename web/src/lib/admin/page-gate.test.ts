import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The server gate for the researcher pages, and the proof that every one of
 * them uses it.
 *
 * The hole this closes: the (app) shell and RoleGuard are client components.
 * They hide a researcher page from a visitor who may not see it, but a server
 * page under them still rendered for whoever asked, and what it read from the
 * database travelled in the response. A signed-out visitor, or an annotator,
 * could read the researcher dashboard's numbers and the speakers' written
 * reasons out of the page payload.
 *
 * So each page under /admin is called here signed out, as an annotator and as
 * a learner. It must stop before the database is touched: nothing is fetched,
 * nothing is rendered, so nothing can be in the response body.
 */

const { mockGetServerSession, touched } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  touched: { reads: [] as string[] },
}));
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next/navigation", () => ({
  forbidden: () => {
    throw new Error("NEXT_FORBIDDEN");
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
  usePathname: () => "/",
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));
// Any read of the database is recorded, then refused. A page that reaches
// this before its gate fails the test twice over.
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_t, model: string) =>
        new Proxy(
          {},
          {
            get: (_m, method: string) => () => {
              touched.reads.push(`${model}.${method}`);
              throw new Error(
                `database read before the gate: ${model}.${method}`,
              );
            },
          },
        ),
    },
  ),
}));

import { requireResearcherPage } from "./page-gate";

const as = (user: Record<string, unknown> | null) =>
  mockGetServerSession.mockResolvedValue(user ? { user } : null);

beforeEach(() => {
  vi.clearAllMocks();
  touched.reads = [];
  process.env.SPEECH_LAB_ENABLED = "1";
});

describe("requireResearcherPage", () => {
  it("sends a signed-out visitor to the login page", async () => {
    as(null);
    await expect(requireResearcherPage()).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    );
  });

  it("answers 403 to an annotator and to a learner", async () => {
    for (const role of ["ANNOTATOR", "LEARNER"]) {
      as({ id: "u1", role, email: "a@example.org" });
      await expect(requireResearcherPage()).rejects.toThrow("NEXT_FORBIDDEN");
    }
  });

  it("lets a researcher through and says who they are", async () => {
    as({ id: "u2", role: "RESEARCHER", email: "r@example.org", name: "R" });
    await expect(requireResearcherPage()).resolves.toEqual({
      id: "u2",
      name: "R",
      email: "r@example.org",
      role: "RESEARCHER",
      owner: false,
    });
  });

  it("lets the owner through whatever the stored role, as RoleGuard does", async () => {
    as({ id: "u3", role: "ANNOTATOR", email: "madihalim@gmail.com" });
    const who = await requireResearcherPage();
    expect(who.owner).toBe(true);
  });
});

// ─── every researcher page ──────────────────────────────────────────────────

const ADMIN = join(process.cwd(), "src", "app", "(app)", "admin");

/**
 * The one page under /admin that is public on purpose: it only redirects to
 * the public explainer on the marketing site, and reads nothing.
 */
const PUBLIC_REDIRECTS = ["/how-it-works/page.tsx"];

function adminPages(dir = ADMIN, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) adminPages(full, out);
    else if (name === "page.tsx") out.push(full);
  }
  return out.sort();
}

const PAGES = adminPages().filter(
  (f) => !PUBLIC_REDIRECTS.includes(f.slice(ADMIN.length)),
);

/** The first statement of the page's default export. */
function firstStatement(src: string): string {
  const m =
    /export default (?:async )?function \w+\([^)]*\)[^{]*\{\n([^\n]*)\n/.exec(
      src,
    );
  return m ? m[1].trim() : "";
}

type Page = (props: unknown) => unknown;
const PROPS = {
  params: Promise.resolve({ id: "x" }),
  searchParams: Promise.resolve({}),
};

async function outcomeOf(file: string): Promise<string> {
  const mod = (await import(/* @vite-ignore */ file)) as { default: Page };
  try {
    await mod.default(PROPS);
  } catch (e) {
    return (e as Error).message;
  }
  return "RENDERED";
}

describe("every page under /admin checks the visitor on the server", () => {
  it("finds the researcher pages", () => {
    expect(PAGES.length).toBeGreaterThanOrEqual(15);
  });

  it("the only ungated page is the public redirect, and it reads nothing", () => {
    for (const rel of PUBLIC_REDIRECTS) {
      const src = readFileSync(join(ADMIN, rel), "utf8");
      expect(src).not.toMatch(/prisma|compute[A-Z]|fetch\(/);
      expect(src).toMatch(/redirect\(/);
    }
  });

  for (const file of PAGES) {
    const rel = file.slice(ADMIN.length);
    const src = readFileSync(file, "utf8");
    const redirectOnly =
      /^\s*redirect\(/.test(firstStatement(src)) &&
      !/prisma|compute[A-Z]/.test(src);

    describe(`/admin${rel.replace(/\/page\.tsx$/, "") || ""}`, () => {
      if (redirectOnly) {
        it("only redirects, and reads nothing", async () => {
          as(null);
          expect(await outcomeOf(file)).toMatch(/^NEXT_REDIRECT:\/admin\//);
          expect(touched.reads).toEqual([]);
        });
        return;
      }

      it("is a server page whose first statement is the gate", () => {
        expect(src.trimStart().startsWith('"use client"')).toBe(false);
        expect(firstStatement(src)).toMatch(
          /^(const \w+ = )?await require(ResearcherPage|LabPage)\(/,
        );
      });

      it("signed out: stops before any data is read, nothing is rendered", async () => {
        as(null);
        const outcome = await outcomeOf(file);
        // The login redirect; a speech page behind the lab gate answers 403.
        expect(outcome).toMatch(/^(NEXT_REDIRECT:\/login|NEXT_FORBIDDEN)$/);
        expect(touched.reads).toEqual([]);
      });

      it("as an annotator: the forbidden page, no data read, nothing rendered", async () => {
        as({ id: "a1", role: "ANNOTATOR", email: "annotator@example.org" });
        expect(await outcomeOf(file)).toBe("NEXT_FORBIDDEN");
        expect(touched.reads).toEqual([]);
      });

      it("as a learner: the forbidden page, no data read, nothing rendered", async () => {
        as({ id: "l1", role: "LEARNER", email: "learner@example.org" });
        expect(await outcomeOf(file)).toBe("NEXT_FORBIDDEN");
        expect(touched.reads).toEqual([]);
      });
    });
  }
});
