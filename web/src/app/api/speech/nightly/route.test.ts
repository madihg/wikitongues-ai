import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockRun } = vi.hoisted(() => ({ mockRun: vi.fn() }));
vi.mock("@/lib/speech/nightly", () => ({ runNightly: mockRun }));

import { POST } from "./route";

const SECRET = "test-secret-not-real";
const saved = {
  loop: process.env.SPEECH_LOOP_ENABLED,
  secret: process.env.SPEECH_WORKER_SECRET,
};
const call = (secret: string | null = SECRET) =>
  POST(
    new Request("http://test/api/speech/nightly", {
      method: "POST",
      headers: secret === null ? {} : { "x-shared-secret": secret },
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LOOP_ENABLED = "1";
  process.env.SPEECH_WORKER_SECRET = SECRET;
  mockRun.mockResolvedValue({
    created: true,
    run: { id: "r1", runDate: new Date("2026-11-07"), outcome: "trained", costUsd: 5.62 },
  });
});
afterEach(() => {
  for (const [k, v] of [
    ["SPEECH_LOOP_ENABLED", saved.loop],
    ["SPEECH_WORKER_SECRET", saved.secret],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("POST /api/speech/nightly", () => {
  it("is 404 with the loop flag off, even with the right secret, and runs nothing", async () => {
    delete process.env.SPEECH_LOOP_ENABLED;
    expect((await call()).status).toBe(404);
    expect((await call(null)).status).toBe(404);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("is a clear 503 when the worker secret is not configured", async () => {
    delete process.env.SPEECH_WORKER_SECRET;
    const res = await call();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("SPEECH_WORKER_SECRET");
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("is a bare 401 for a missing or wrong secret", async () => {
    expect((await call(null)).status).toBe(401);
    expect((await call("wrong")).status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("runs the night and returns the row summary", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      created: true,
      run: { id: "r1", runDate: "2026-11-07", outcome: "trained", costUsd: 5.62 },
    });
  });

  it("a second call for the same date reports created false", async () => {
    mockRun.mockResolvedValue({
      created: false,
      run: { id: "r1", runDate: new Date("2026-11-07"), outcome: "trained", costUsd: 5.62 },
    });
    expect((await (await call()).json()).created).toBe(false);
  });
});
