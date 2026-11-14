import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

/**
 * Every route that can reach a paid model, found by following its imports,
 * called with no session. Each must refuse (401 or 403) before the database
 * is touched and before any model client is called.
 *
 * The list is not typed in: the walk reads the api directory and traces each
 * route's imports to the files that talk to a provider (PAID below). A new
 * route that calls a model is tested the day it is added. A new file that
 * talks to a provider must be added to PAID, and the last test fails if a
 * file under src/lib imports a provider SDK without being listed.
 */

const { mockSession, touched, modelCalls } = vi.hoisted(() => ({
  mockSession: vi.fn(),
  touched: { reads: [] as string[] },
  modelCalls: { n: 0 },
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
              throw new Error(
                `database touched before the gate: ${model}.${method}`,
              );
            },
          },
        ),
    },
  ),
}));
// The provider SDKs. Any call is counted, then refused.
const called = () => {
  modelCalls.n++;
  throw new Error("a model was called without a session");
};
vi.mock("ai", () => ({
  generateText: called,
  streamText: called,
  generateObject: called,
  embed: called,
  embedMany: called,
}));
vi.mock("openai", () => ({
  default: class {
    constructor() {
      return new Proxy(
        {},
        { get: () => new Proxy(called, { get: () => called }) },
      );
    }
  },
}));

const SRC = join(process.cwd(), "src");
const API = join(SRC, "app", "api");

/** Files under src/lib that talk to a paid provider (a model, a tuning job, a GPU worker). */
const PAID = [
  "lib/rag.ts",
  "lib/agents/reviewer.ts",
  "lib/agents/translator.ts",
  "lib/arena/judge.ts",
  "lib/arena/openai-finetune.ts",
  "lib/arena/providers.ts",
  "lib/arena/register-fine-tune.ts",
  "lib/arena/together.ts",
  "lib/llm/openrouter.ts",
  "lib/speech/asr-correct.ts",
  "lib/speech/tone-restore.ts",
  "lib/speech/loop-launch.ts",
  "lib/speech/train-providers.ts",
  "lib/speech/tts-deps.ts",
].map((p) => join(SRC, p));

function walk(
  dir: string,
  keep: (name: string) => boolean,
  out: string[] = [],
) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, keep, out);
    else if (keep(name)) out.push(full);
  }
  return out.sort();
}

function resolveImport(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = normalize(join(dirname(from), spec));
  else return null;
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}

const importCache = new Map<string, string[]>();
function importsOf(file: string): string[] {
  let found = importCache.get(file);
  if (!found) {
    const src = readFileSync(file, "utf8");
    found = [...src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)]
      .map((m) => resolveImport(m[1], file))
      .filter((f): f is string => f !== null);
    importCache.set(file, found);
  }
  return found;
}

/** The paid files a route can reach through its imports. */
function paidReach(route: string): string[] {
  const seen = new Set([route]);
  const stack = [route];
  const hits: string[] = [];
  while (stack.length) {
    for (const next of importsOf(stack.pop()!)) {
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
      if (PAID.includes(next)) hits.push(next);
    }
  }
  return hits;
}

const ROUTES = walk(API, (n) => n === "route.ts")
  .map((file) => ({ file, paid: paidReach(file) }))
  .filter((r) => r.paid.length > 0);

type Handler = (req: Request, ctx: unknown) => Promise<Response>;
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const CTX = { params: Promise.resolve({ id: "x" }) };

const ENV = [
  "SPEECH_LAB_ENABLED",
  "SPEECH_LOOP_ENABLED",
  "SPEECH_WORKER_SECRET",
] as const;
const was = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of ENV) {
    if (was[k] === undefined) delete process.env[k];
    else process.env[k] = was[k];
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  touched.reads = [];
  modelCalls.n = 0;
  mockSession.mockResolvedValue(null);
  // Flags on and a secret set, so each route answers with its own gate and
  // not with "this feature is off" or "the secret is not configured".
  process.env.SPEECH_LAB_ENABLED = "1";
  process.env.SPEECH_LOOP_ENABLED = "1";
  process.env.SPEECH_WORKER_SECRET = "test-secret-not-the-real-one";
});

describe("every route that can reach a paid model refuses a signed-out caller", () => {
  it("finds them, the learner tutor among them", () => {
    const paths = ROUTES.map((r) => r.file.slice(API.length));
    expect(paths).toContain("/chat/route.ts");
    expect(paths).toContain("/arena/chat/route.ts");
    expect(paths.length).toBeGreaterThanOrEqual(10);
  });

  for (const { file } of ROUTES) {
    const path = file.slice(API.length).replace(/\/route\.ts$/, "");
    it(`${path}: 401 or 403, no model call, nothing read`, async () => {
      const mod = (await import(/* @vite-ignore */ file)) as Record<
        string,
        Handler | undefined
      >;
      const handlers = METHODS.filter((m) => typeof mod[m] === "function");
      expect(handlers.length).toBeGreaterThan(0);
      for (const method of handlers) {
        touched.reads = [];
        const res = await mod[method]!(
          new Request(`http://test/api${path}`, {
            method,
            ...(method === "GET" || method === "DELETE"
              ? {}
              : {
                  body: "{}",
                  headers: { "content-type": "application/json" },
                }),
          }),
          CTX,
        );
        expect([401, 403], `${method} ${path}`).toContain(res.status);
        expect(modelCalls.n, `${method} ${path}`).toBe(0);
        expect(touched.reads, `${method} ${path}`).toEqual([]);
      }
    });
  }
});

describe("the list of files that talk to a provider is complete", () => {
  it("every file under src/lib that imports a provider SDK or calls a provider address is listed", () => {
    const PROVIDER =
      /from "(ai|openai|@ai-sdk\/[a-z-]+)"|api\.openai\.com|api\.together\.(xyz|ai)|openrouter\.ai|generativelanguage\.googleapis|SPEECH_WORKER_URL/;
    const talkers = walk(
      join(SRC, "lib"),
      (n) => /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n),
    ).filter((f) => PROVIDER.test(readFileSync(f, "utf8")));
    const unlisted = talkers
      .filter((f) => !PAID.includes(f))
      .map((f) => f.slice(SRC.length));
    expect(unlisted).toEqual([]);
  });
});
