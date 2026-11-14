import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { costEntry: { create: mockCreate } },
}));

import { chat, OpenRouterError } from "./openrouter";

const MODEL = "google/gemini-3.1-pro-preview";
const fastOpts = {
  model: MODEL,
  maxTokens: 64,
  temperature: 0,
  refType: "speech_test",
  refId: "ref-1",
  label: "unit test call",
  backoffMs: 1,
};
const messages = [{ role: "user" as const, content: "hello" }];

function ok(body: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: "hi there" } }],
      usage: { prompt_tokens: 1000, completion_tokens: 500 },
      ...body,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

const fetchMock = vi.fn();
const envKeys = ["OPENROUTER_API_KEY", "OPENROUTER_BASE_URL"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  for (const k of envKeys) saved[k] = process.env[k];
  process.env.OPENROUTER_API_KEY = "test-key";
  delete process.env.OPENROUTER_BASE_URL;
  mockCreate.mockResolvedValue({});
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of envKeys) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("chat: request", () => {
  it("posts to the default base url with the bearer key and the call's settings", async () => {
    fetchMock.mockResolvedValueOnce(ok());
    const r = await chat(messages, fastOpts);
    expect(r.text).toBe("hi there");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      model: MODEL,
      max_tokens: 64,
      temperature: 0,
      messages,
      usage: { include: true },
    });
  });

  it("honours OPENROUTER_BASE_URL", async () => {
    process.env.OPENROUTER_BASE_URL = "https://example.test/v1";
    fetchMock.mockResolvedValueOnce(ok());
    await chat(messages, fastOpts);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://example.test/v1/chat/completions",
    );
  });

  it("fails clearly, before any fetch, when the key is unset", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(chat(messages, fastOpts)).rejects.toThrow(
      /OPENROUTER_API_KEY/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("chat: retries", () => {
  it("retries a 429 and then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(ok());
    const r = await chat(messages, fastOpts);
    expect(r.text).toBe("hi there");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a 5xx and a network error", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("bad gateway", { status: 502 }))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(ok());
    await chat(messages, fastOpts);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("gives up after 3 retries (4 calls) and throws the last status", async () => {
    fetchMock.mockImplementation(
      async () => new Response("down", { status: 503 }),
    );
    await expect(chat(messages, fastOpts)).rejects.toMatchObject({
      name: "OpenRouterError",
      status: 503,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("does not retry a 400", async () => {
    fetchMock.mockResolvedValueOnce(new Response("bad", { status: 400 }));
    const err = await chat(messages, fastOpts).catch((e) => e);
    expect(err).toBeInstanceOf(OpenRouterError);
    expect(err.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("does not retry a 401 or 404 either", async () => {
    fetchMock.mockResolvedValueOnce(new Response("no", { status: 401 }));
    await expect(chat(messages, fastOpts)).rejects.toThrow();
    fetchMock.mockResolvedValueOnce(new Response("no", { status: 404 }));
    await expect(chat(messages, fastOpts)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("chat: timeout", () => {
  it("aborts a call that never answers", async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      return new Promise((_res, rej) => {
        signal!.addEventListener("abort", () =>
          rej(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      });
    });
    const err = await chat(messages, {
      ...fastOpts,
      timeoutMs: 20,
      maxRetries: 0,
    }).catch((e) => e);
    expect(signal?.aborted).toBe(true);
    expect(err).toBeInstanceOf(OpenRouterError);
    expect(err.message).toMatch(/timed out/);
  });

  it("defaults to a 60 s timeout", async () => {
    const spy = vi.spyOn(globalThis, "setTimeout");
    fetchMock.mockResolvedValueOnce(ok());
    await chat(messages, fastOpts);
    expect(spy.mock.calls.some(([, ms]) => ms === 60_000)).toBe(true);
    spy.mockRestore();
  });
});

describe("chat: cost row", () => {
  it("writes the response's own cost as an actual (estimated false)", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0123 } }),
    );
    const r = await chat(messages, fastOpts);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].data).toMatchObject({
      category: "inference",
      provider: "openrouter",
      label: "unit test call",
      amountUsd: 0.0123,
      estimated: false,
      refType: "speech_test",
      refId: "ref-1",
    });
    expect(r).toMatchObject({ costUsd: 0.0123, estimated: false });
  });

  it("estimates from the price table when no cost comes back (estimated true)", async () => {
    fetchMock.mockResolvedValueOnce(ok());
    const r = await chat(messages, fastOpts);
    // 1000 in * $2/M + 500 out * $12/M
    const expected = (1000 * 2 + 500 * 12) / 1_000_000;
    expect(mockCreate.mock.calls[0][0].data).toMatchObject({
      estimated: true,
      provider: "openrouter",
      category: "inference",
    });
    expect(mockCreate.mock.calls[0][0].data.amountUsd).toBeCloseTo(expected, 8);
    expect(r).toMatchObject({ tokensIn: 1000, tokensOut: 500, estimated: true });
  });

  it("still returns the answer when the ledger write fails", async () => {
    fetchMock.mockResolvedValueOnce(ok());
    mockCreate.mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await chat(messages, fastOpts);
    expect(r.text).toBe("hi there");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
