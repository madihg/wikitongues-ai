import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every researcher data route, for a signed-out caller, an annotator and a
 * learner. Anyone can register an account, so "signed in" proves nothing: the
 * role is what a route must check, on the server, before it reads or writes.
 *
 * The walk reads the api directory itself. A new route under one of the
 * researcher folders is tested the day it is added, with no list to update.
 * The database refuses every call and records it, so a route that reads
 * before it checks fails here.
 */

const { mockSession, touched } = vi.hoisted(() => ({
  mockSession: vi.fn(),
  touched: { reads: [] as string[] },
}));
vi.mock("next-auth", () => ({ getServerSession: mockSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
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
              throw new Error(`database read before the role check: ${model}.${method}`);
            },
          },
        ),
    },
  ),
}));

const API = join(process.cwd(), "src", "app", "api");

/** Folders whose every route is for researchers only. */
const RESEARCHER_FOLDERS = ["admin", "arena", "prompts", "handoffs"];
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) routeFiles(full, out);
    else if (name === "route.ts") out.push(full);
  }
  return out.sort();
}

const ROUTES = RESEARCHER_FOLDERS.flatMap((f) => routeFiles(join(API, f)));

type Handler = (req: Request, ctx: unknown) => Promise<Response>;

const request = (method: string, path: string) =>
  new Request(`http://test/api${path}`, {
    method,
    ...(method === "GET" || method === "DELETE"
      ? {}
      : { body: "{}", headers: { "content-type": "application/json" } }),
  });
const CTX = { params: Promise.resolve({ id: "x", type: "cold" }) };

const as = (user: Record<string, unknown> | null) =>
  mockSession.mockResolvedValue(user ? { user } : null);

beforeEach(() => {
  vi.clearAllMocks();
  touched.reads = [];
});

describe("every researcher data route checks the role on the server", () => {
  it("finds the researcher routes", () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(30);
  });

  for (const file of ROUTES) {
    const path = file.slice(API.length).replace(/\/route\.ts$/, "");

    describe(path, () => {
      it("refuses a signed-out caller, an annotator and a learner before reading anything", async () => {
        const mod = (await import(/* @vite-ignore */ file)) as Record<
          string,
          Handler | undefined
        >;
        const handlers = METHODS.filter((m) => typeof mod[m] === "function");
        expect(handlers.length, "no handler exported").toBeGreaterThan(0);

        for (const method of handlers) {
          const who: Array<[string, Record<string, unknown> | null, number[]]> = [
            ["signed out", null, [401, 403]],
            [
              "annotator",
              { id: "a1", role: "ANNOTATOR", email: "annotator@example.org" },
              [403],
            ],
            [
              "learner",
              { id: "l1", role: "LEARNER", email: "learner@example.org" },
              [403],
            ],
          ];
          for (const [label, user, allowed] of who) {
            as(user);
            touched.reads = [];
            const res = await mod[method]!(request(method, path), CTX);
            expect(allowed, `${method} ${path} as ${label}`).toContain(res.status);
            const body = await res.text();
            // The refusal carries an error and nothing else.
            expect(Object.keys(JSON.parse(body || "{}")), `${method} ${path} as ${label}`).toEqual(
              ["error"],
            );
            expect(touched.reads, `${method} ${path} as ${label}`).toEqual([]);
          }
        }
      });
    });
  }
});
