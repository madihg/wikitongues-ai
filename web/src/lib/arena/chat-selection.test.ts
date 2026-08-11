import { describe, it, expect } from "vitest";
import {
  parseChatSelection,
  serializeChatSelection,
  toggleChatModel,
  buildShareUrl,
  DEFAULT_CHAT_SLUGS,
  MAX_CHAT_MODELS,
  MODELS_PARAM,
} from "./chat-selection";

const AVAILABLE = [
  "gpt-4-1-rag",
  "gemma-4-31b-rag",
  "gpt-4-1-mini-sft-igala-cold-gold-cmsjnjcp",
  "llama-3-3-70b-rag",
  "gpt-4o-baseline",
  "gemini-2-5-pro-rag",
  "claude-sonnet-4-5-rag",
];

describe("parseChatSelection", () => {
  it("reproduces exactly the set named in the URL, in order", () => {
    // This is the whole point: a link handed to a reviewer must open on the
    // models that were chosen for her, in the order they were chosen.
    const r = parseChatSelection(
      "models=llama-3-3-70b-rag,gpt-4-1-rag",
      AVAILABLE,
    );
    expect(r.slugs).toEqual(["llama-3-3-70b-rag", "gpt-4-1-rag"]);
    expect(r.usedDefault).toBe(false);
  });

  it("falls back to the curated set when the URL names nothing", () => {
    expect(parseChatSelection("", AVAILABLE).slugs).toEqual([
      ...DEFAULT_CHAT_SLUGS,
    ]);
    expect(parseChatSelection("", AVAILABLE).usedDefault).toBe(true);
    expect(parseChatSelection("models=", AVAILABLE).usedDefault).toBe(true);
  });

  it("drops slugs that no longer exist instead of erroring", () => {
    // A shared link can outlive a candidate being archived. Degrading to the
    // models that still exist beats showing the reviewer a broken page.
    const r = parseChatSelection(
      "models=gpt-4-1-rag,was-archived,llama-3-3-70b-rag",
      AVAILABLE,
    );
    expect(r.slugs).toEqual(["gpt-4-1-rag", "llama-3-3-70b-rag"]);
    expect(r.droppedUnknown).toEqual(["was-archived"]);
  });

  it("dedupes without reordering", () => {
    const r = parseChatSelection(
      "models=gpt-4-1-rag,llama-3-3-70b-rag,gpt-4-1-rag",
      AVAILABLE,
    );
    expect(r.slugs).toEqual(["gpt-4-1-rag", "llama-3-3-70b-rag"]);
  });

  it("enforces the cap, because each model is a separate billed call", () => {
    const r = parseChatSelection(`models=${AVAILABLE.join(",")}`, AVAILABLE);
    expect(r.slugs).toHaveLength(MAX_CHAT_MODELS);
  });

  it("filters the default set to what actually exists", () => {
    const r = parseChatSelection("", ["gpt-4-1-rag"]);
    expect(r.slugs).toEqual(["gpt-4-1-rag"]);
  });

  it("accepts URLSearchParams as well as a raw string", () => {
    const p = new URLSearchParams();
    p.set(MODELS_PARAM, "gpt-4-1-rag");
    expect(parseChatSelection(p, AVAILABLE).slugs).toEqual(["gpt-4-1-rag"]);
  });
});

describe("serializeChatSelection", () => {
  it("round-trips through parse unchanged", () => {
    const picked = ["gemma-4-31b-rag", "gpt-4-1-rag"];
    const qs = serializeChatSelection(picked);
    expect(parseChatSelection(qs, AVAILABLE).slugs).toEqual(picked);
  });

  it("returns empty for an empty selection so the default takes over", () => {
    expect(serializeChatSelection([])).toBe("");
  });

  it("dedupes and caps", () => {
    const qs = serializeChatSelection(["a", "a", "b"]);
    expect(qs).toBe("models=a,b");
    expect(
      serializeChatSelection(
        Array.from({ length: 20 }, (_, i) => `m${i}`),
      ).split(",").length,
    ).toBe(MAX_CHAT_MODELS);
  });
});

describe("toggleChatModel", () => {
  it("adds at the end and removes in place", () => {
    expect(toggleChatModel(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleChatModel(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("refuses to exceed the cap but still allows removal", () => {
    const full = Array.from({ length: MAX_CHAT_MODELS }, (_, i) => `m${i}`);
    expect(toggleChatModel(full, "extra")).toEqual(full);
    expect(toggleChatModel(full, "m0")).toHaveLength(MAX_CHAT_MODELS - 1);
  });
});

describe("buildShareUrl", () => {
  it("always pins the models explicitly, even when they match the default", () => {
    // If a shared link relied on the default, changing the default later would
    // silently change what the recipient opens.
    const url = buildShareUrl(
      "https://example.com",
      "/admin/arena/chat",
      DEFAULT_CHAT_SLUGS,
    );
    expect(url).toContain(`?${MODELS_PARAM}=`);
    for (const slug of DEFAULT_CHAT_SLUGS) expect(url).toContain(slug);
  });

  it("does not double the slash on an origin with a trailing slash", () => {
    expect(
      buildShareUrl("https://example.com/", "/admin/arena/chat", ["a"]),
    ).toBe("https://example.com/admin/arena/chat?models=a");
  });

  it("survives a full round trip from shared link back to selection", () => {
    const picked = ["gpt-4-1-rag", "gemma-4-31b-rag"];
    const url = buildShareUrl("https://x.dev", "/admin/arena/chat", picked);
    const qs = new URL(url).search.replace(/^\?/, "");
    expect(parseChatSelection(qs, AVAILABLE).slugs).toEqual(picked);
  });
});
