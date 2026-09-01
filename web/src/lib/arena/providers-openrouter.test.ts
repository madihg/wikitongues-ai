import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  resolveModel,
  generateForCandidate,
  assembleGenerationRequest,
  openRouterFetch,
  OPENROUTER_BASE_URL,
  type CandidateLike,
} from "./providers";

/**
 * The OpenRouter serving path for the Claude arms.
 *
 * Three invariants are pinned here, each one a bug that has already cost this
 * project time on a sibling path:
 *
 *  1. The key is OPENROUTER_API_KEY and nothing else. Silently borrowing
 *     another vendor's key turns "no key was ever set" into a 401 that reads
 *     as "the key is revoked" - exactly the misdirection the openai-compatible
 *     case documents.
 *  2. The request goes to OpenRouter's chat-completions endpoint, not OpenAI's
 *     Responses API and not Anthropic's /v1/messages.
 *  3. temperature is OMITTED, not defaulted. Claude Opus 5 REJECTS the
 *     parameter ("`temperature` is deprecated for this model"), so its rows
 *     carry decodingParams temperature null; if anything on this path
 *     substituted a default, every Claude generation would fail.
 */

const claudeViaOpenRouter: CandidateLike = {
  name: "Claude Opus 5 + Igala RAG v4",
  provider: "openrouter",
  baseModelId: "anthropic/claude-opus-5",
  ragEnabled: true,
  // The sanctioned opt-out: null means OMIT the parameter.
  decodingParams: { temperature: null, maxTokens: 4096 },
};

const ENV_KEYS = [
  "OPENROUTER_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "TOGETHER_API_KEY",
  "OPENAI_COMPATIBLE_API_KEY",
] as const;

let saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

describe("resolveModel - openrouter", () => {
  it("throws naming the host and the missing variable when no OpenRouter key is set", () => {
    expect(() => resolveModel(claudeViaOpenRouter)).toThrow(
      /openrouter\.ai\/api\/v1/i,
    );
    expect(() => resolveModel(claudeViaOpenRouter)).toThrow(
      /OPENROUTER_API_KEY/,
    );
  });

  it("does NOT fall back to another vendor's key", () => {
    // The failure this guards: the direct Anthropic key is dead, which is why
    // Claude is served through OpenRouter at all. Reaching for it here would
    // resurrect that exact failure behind a confusing error.
    process.env.ANTHROPIC_API_KEY = "sk-ant-dead";
    process.env.OPENAI_API_KEY = "sk-openai";
    process.env.TOGETHER_API_KEY = "together";
    process.env.OPENAI_COMPATIBLE_API_KEY = "compat";
    expect(() => resolveModel(claudeViaOpenRouter)).toThrow(
      /OPENROUTER_API_KEY/,
    );
  });

  it("resolves the vendor-qualified model id when the key is present", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    const model = resolveModel(claudeViaOpenRouter);
    expect(typeof model === "string" ? model : model.modelId).toBe(
      "anthropic/claude-opus-5",
    );
  });

  it("pins the OpenRouter base URL", () => {
    expect(OPENROUTER_BASE_URL).toBe("https://openrouter.ai/api/v1");
  });
});

describe("generation through the openrouter path", () => {
  /** A minimal, valid OpenAI-shaped chat completion. */
  function okResponse() {
    return new Response(
      JSON.stringify({
        id: "gen-1",
        object: "chat.completion",
        created: 0,
        model: "anthropic/claude-opus-5",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Ómi" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 11, completion_tokens: 3, total_tokens: 14 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  it("posts to OpenRouter's chat-completions endpoint with the OpenRouter key, and OMITS temperature", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return okResponse();
    });

    const result = await generateForCandidate(claudeViaOpenRouter, {
      userMessage: "How do you say the water is cold?",
    });

    expect(calls).toHaveLength(1);
    // (2) the right host and the OpenAI-compatible chat route, NOT /responses
    // and NOT Anthropic's /v1/messages.
    expect(calls[0].url).toBe(`${OPENROUTER_BASE_URL}/chat/completions`);
    const headers = new Headers(calls[0].init?.headers as HeadersInit);
    // (1) the OpenRouter key, verbatim.
    expect(headers.get("authorization")).toBe("Bearer sk-or-test");

    const body = JSON.parse(String(calls[0].init?.body)) as Record<
      string,
      unknown
    >;
    expect(body.model).toBe("anthropic/claude-opus-5");
    // (3) OMITTED - the key must not be present at all, not present-as-null.
    expect(Object.keys(body)).not.toContain("temperature");
    expect(body.max_tokens ?? body.max_completion_tokens).toBe(4096);
    // (4) extended thinking OFF. OpenRouter enables it by default for this
    // model; left on, a live call spent 4079 of its 4096 output tokens on a
    // reasoning trace (~$0.10, 61s, answer nearly truncated) where the direct
    // Anthropic path this replaces spent a couple of hundred.
    expect(body.reasoning).toEqual({ enabled: false });

    expect(result.text).toBe("Ómi");
    expect(result.tokensIn).toBe(11);
    expect(result.tokensOut).toBe(3);
    expect(result.modelId).toBe("anthropic/claude-opus-5");
  });

  it("still sends temperature when a candidate actually sets one", async () => {
    // The omission is a per-candidate opt-out, not a property of OpenRouter:
    // a future non-Claude OpenRouter arm must still get its decoding honoured.
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    const calls: { init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (_url: unknown, init?: RequestInit) => {
      calls.push({ init });
      return okResponse();
    });

    await generateForCandidate(
      {
        ...claudeViaOpenRouter,
        baseModelId: "openai/gpt-4.1",
        decodingParams: { temperature: 0, maxTokens: 128 },
      },
      { userMessage: "q" },
    );

    const body = JSON.parse(String(calls[0].init?.body)) as Record<
      string,
      unknown
    >;
    expect(body.temperature).toBe(0);
  });

  it("does not clobber a reasoning setting that is already on the request", async () => {
    // The switch is a default, not a lock: the injection only fills an absent
    // key, so a future arm that wants thinking can still get it.
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    const bodies: string[] = [];
    vi.stubGlobal("fetch", async (_url: unknown, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return okResponse();
    });

    await openRouterFetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      body: JSON.stringify({ model: "m", reasoning: { effort: "high" } }),
    });

    const body = JSON.parse(bodies[0]) as Record<string, unknown>;
    expect(body.reasoning).toEqual({ effort: "high" });
  });

  it("parses temperature null as omit, before any provider is involved", () => {
    // parseDecoding is the single place the opt-out is honoured; assert it
    // directly so a regression is attributed here rather than to the network.
    const { decoding } = assembleGenerationRequest(claudeViaOpenRouter, {
      userMessage: "q",
    });
    expect(decoding.temperature).toBeUndefined();
    expect(decoding.maxTokens).toBe(4096);
  });
});
