import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The route test matrix: EVERY lab route, for a researcher, an annotator, a
 * learner and a signed-out caller, with the annotator layer flag on and off.
 * Speaker routes admit an annotator only with SPEECH_LAYER_ANNOTATORS on;
 * researcher routes never do. The database answers "nothing" to everything,
 * so a route that passes its gate stops at its own validation (400, 404) and
 * a route that does not stops at 401, 403 or the gate's 404 first.
 *
 * A new route under /api/lab is added to ROUTES in the commit that creates it;
 * the last test fails if a route.ts exists that is not listed.
 */

const { mockSession } = vi.hoisted(() => ({ mockSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mockSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => {
  const model = new Proxy(
    {},
    {
      get: (_t, method: string) =>
        vi.fn().mockResolvedValue(
          method === "findMany" || method === "groupBy"
            ? []
            : method === "aggregate"
              ? { _sum: { durationMs: null } }
              : null,
        ),
    },
  );
  return { prisma: new Proxy({}, { get: () => model }) };
});

import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

type Call = () => Promise<Response>;
const url = (p: string) => `http://test/api/lab/${p}`;
const json = (method: string, p: string, body: unknown = {}) =>
  new Request(url(p), { method, body: JSON.stringify(body) });
const id = { params: Promise.resolve({ id: "c1" }) };

interface Route {
  name: string;
  file: string;
  audience: "speaker" | "researcher";
  call: () => Promise<Call>;
}
const load = async <T>(p: string): Promise<T> => (await import(p)) as T;

const ROUTES: Route[] = [
  {
    name: "GET consent",
    file: "consent/route.ts",
    audience: "speaker",
    call: async () => (await load<{ GET: () => Promise<Response> }>("./consent/route")).GET,
  },
  {
    name: "POST consent",
    file: "consent/route.ts",
    audience: "speaker",
    call: async () => () =>
      load<{ POST: (r: Request) => Promise<Response> }>("./consent/route").then((m) =>
        m.POST(json("POST", "consent")),
      ),
  },
  {
    name: "POST speech/recording",
    file: "speech/recording/route.ts",
    audience: "speaker",
    call: async () => () =>
      load<{ POST: (r: Request) => Promise<Response> }>("./speech/recording/route").then((m) =>
        m.POST(json("POST", "speech/recording")),
      ),
  },
  {
    name: "PUT speech/recording/[id]/audio",
    file: "speech/recording/[id]/audio/route.ts",
    audience: "speaker",
    call: async () => () =>
      load<{ PUT: (r: Request, c: typeof id) => Promise<Response> }>(
        "./speech/recording/[id]/audio/route",
      ).then((m) => m.PUT(json("PUT", "speech/recording/c1/audio"), id)),
  },
  {
    name: "GET speech/recording/[id]/audio",
    file: "speech/recording/[id]/audio/route.ts",
    audience: "speaker",
    call: async () => () =>
      load<{ GET: (r: Request, c: typeof id) => Promise<Response> }>(
        "./speech/recording/[id]/audio/route",
      ).then((m) => m.GET(new Request(url("speech/recording/c1/audio")), id)),
  },
  {
    name: "POST speech/attach",
    file: "speech/attach/route.ts",
    audience: "speaker",
    call: async () => () =>
      load<{ POST: (r: Request) => Promise<Response> }>("./speech/attach/route").then((m) =>
        m.POST(json("POST", "speech/attach")),
      ),
  },
  {
    name: "GET speech/today",
    file: "speech/today/route.ts",
    audience: "speaker",
    call: async () => () =>
      load<{ GET: (r: Request) => Promise<Response> }>("./speech/today/route").then((m) =>
        m.GET(new Request(url("speech/today"))),
      ),
  },
  {
    name: "GET speech/next",
    file: "speech/next/route.ts",
    audience: "speaker",
    call: async () => () =>
      load<{ GET: (r: Request) => Promise<Response> }>("./speech/next/route").then((m) =>
        m.GET(new Request(url("speech/next"))),
      ),
  },
  {
    name: "GET speech/listen/next",
    file: "speech/listen/next/route.ts",
    audience: "speaker",
    call: async () => () =>
      load<{ GET: (r: Request) => Promise<Response> }>("./speech/listen/next/route").then((m) =>
        m.GET(new Request(url("speech/listen/next"))),
      ),
  },
  {
    name: "POST speech/listen/submit",
    file: "speech/listen/submit/route.ts",
    audience: "speaker",
    call: async () => () =>
      load<{ POST: (r: Request) => Promise<Response> }>("./speech/listen/submit/route").then((m) =>
        m.POST(json("POST", "speech/listen/submit")),
      ),
  },
  {
    name: "GET speech/check/next",
    file: "speech/check/next/route.ts",
    audience: "speaker",
    call: async () => () =>
      load<{ GET: (r: Request) => Promise<Response> }>("./speech/check/next/route").then((m) =>
        m.GET(new Request(url("speech/check/next"))),
      ),
  },
  {
    name: "POST speech/check/submit",
    file: "speech/check/submit/route.ts",
    audience: "speaker",
    call: async () => () =>
      load<{ POST: (r: Request) => Promise<Response> }>("./speech/check/submit/route").then((m) =>
        m.POST(json("POST", "speech/check/submit")),
      ),
  },
  {
    name: "GET speech/check/transcript",
    file: "speech/check/transcript/route.ts",
    audience: "speaker",
    call: async () => () =>
      load<{ GET: (r: Request) => Promise<Response> }>("./speech/check/transcript/route").then(
        (m) => m.GET(new Request(url("speech/check/transcript?recordingId=c1"))),
      ),
  },
  {
    name: "GET speech/profile",
    file: "speech/profile/route.ts",
    audience: "speaker",
    call: async () => (await load<{ GET: () => Promise<Response> }>("./speech/profile/route")).GET,
  },
  {
    name: "PUT speech/profile",
    file: "speech/profile/route.ts",
    audience: "speaker",
    call: async () => () =>
      load<{ PUT: (r: Request) => Promise<Response> }>("./speech/profile/route").then((m) =>
        m.PUT(json("PUT", "speech/profile")),
      ),
  },
  {
    name: "GET speech/recordings",
    file: "speech/recordings/route.ts",
    audience: "researcher",
    call: async () => () =>
      load<{ GET: (r: Request) => Promise<Response> }>("./speech/recordings/route").then((m) =>
        m.GET(new Request(url("speech/recordings"))),
      ),
  },
  {
    name: "PATCH speech/recordings",
    file: "speech/recordings/route.ts",
    audience: "researcher",
    call: async () => () =>
      load<{ PATCH: (r: Request) => Promise<Response> }>("./speech/recordings/route").then((m) =>
        m.PATCH(json("PATCH", "speech/recordings")),
      ),
  },
  {
    name: "GET speech/export",
    file: "speech/export/route.ts",
    audience: "researcher",
    call: async () => (await load<{ GET: () => Promise<Response> }>("./speech/export/route")).GET,
  },
  {
    name: "POST speech/freeze",
    file: "speech/freeze/route.ts",
    audience: "researcher",
    call: async () => () =>
      load<{ POST: (r: Request) => Promise<Response> }>("./speech/freeze/route").then((m) =>
        m.POST(json("POST", "speech/freeze")),
      ),
  },
];

type Who = "researcher" | "annotator" | "learner" | "signed-out";
const asWho = (who: Who) => {
  if (who === "signed-out") return mockSession.mockResolvedValue(null);
  const role = { researcher: "RESEARCHER", annotator: "ANNOTATOR", learner: "LEARNER" }[who];
  mockSession.mockResolvedValue({ user: { id: `${who}-1`, role } });
};

const saved = {
  lab: process.env.SPEECH_LAB_ENABLED,
  layer: process.env.SPEECH_LAYER_ANNOTATORS,
};
const setEnv = (lab: boolean, layer: boolean) => {
  if (lab) process.env.SPEECH_LAB_ENABLED = "1";
  else delete process.env.SPEECH_LAB_ENABLED;
  if (layer) process.env.SPEECH_LAYER_ANNOTATORS = "1";
  else delete process.env.SPEECH_LAYER_ANNOTATORS;
};
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  for (const [k, v] of [
    ["SPEECH_LAB_ENABLED", saved.lab],
    ["SPEECH_LAYER_ANNOTATORS", saved.layer],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/**
 * Did the request get past the gate? The gate refuses with exactly
 * {error: "Unauthorized"} 401, {error: "Forbidden"} 403 or {error: "Not
 * found"} 404; a route's own refusals use other words.
 */
async function passedGate(res: Response): Promise<boolean> {
  const b = (await res.clone().json().catch(() => null)) as { error?: string } | null;
  const gateWords = ["Unauthorized", "Forbidden", "Not found"];
  return !(b?.error && gateWords.includes(b.error) && [401, 403, 404].includes(res.status));
}

// The expected answer for each caller. `layer` is SPEECH_LAYER_ANNOTATORS.
const allowed = (r: Route, who: Who, layer: boolean) =>
  who === "researcher" || (who === "annotator" && layer && r.audience === "speaker");

describe.each([true, false])("route matrix, annotator layer flag %s", (layer) => {
  describe.each(ROUTES)("$name", (route) => {
    it.each(["researcher", "annotator", "learner", "signed-out"] as Who[])(
      "%s",
      async (who) => {
        setEnv(true, layer);
        asWho(who);
        const res = await (await route.call())();
        const ok = await passedGate(res);
        expect(ok, `${route.name} for ${who}, layer ${layer}: ${res.status}`).toBe(
          allowed(route, who, layer),
        );
        if (!ok) {
          expect(res.status).toBe(who === "signed-out" ? 401 : 403);
        }
      },
    );

    it("is a 404 for everyone while the lab flag is off", async () => {
      setEnv(false, layer);
      for (const who of ["researcher", "annotator", "learner", "signed-out"] as Who[]) {
        asWho(who);
        expect((await (await route.call())()).status, who).toBe(404);
      }
    });
  });
});

describe("the matrix covers every lab route", () => {
  it("lists every route.ts under /api/lab (flags is its own, gate-free route)", () => {
    const root = join(__dirname);
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name === "route.ts") found.push(relative(root, p));
      }
    };
    walk(root);
    const listed = new Set(ROUTES.map((r) => r.file));
    const missing = found.filter((f) => f !== "flags/route.ts" && !listed.has(f));
    expect(missing).toEqual([]);
  });
});
