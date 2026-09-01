import { describe, it, expect } from "vitest";
import {
  parseChatSelection,
  serializeChatSelection,
  buildShareUrl,
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

  it("signals the default case with no slugs when the URL names nothing", () => {
    // The default is the live leading model, which only the picker can know
    // once scores load - so this module hands back an empty selection plus
    // the usedDefault flag instead of a hardcoded slug list.
    for (const qs of ["", "models="]) {
      const r = parseChatSelection(qs, AVAILABLE);
      expect(r.slugs).toEqual([]);
      expect(r.usedDefault).toBe(true);
    }
  });

  it("resolves a legacy 4-model share link in full (old URLs must not break)", () => {
    // The first feedback session's curated links carried four models; the
    // picker's newer compare cap of 3 must not truncate them.
    const legacy =
      "models=gpt-4-1-rag,gemma-4-31b-rag,gpt-4-1-mini-sft-igala-cold-gold-cmsjnjcp,llama-3-3-70b-rag";
    const r = parseChatSelection(legacy, AVAILABLE);
    expect(r.slugs).toEqual([
      "gpt-4-1-rag",
      "gemma-4-31b-rag",
      "gpt-4-1-mini-sft-igala-cold-gold-cmsjnjcp",
      "llama-3-3-70b-rag",
    ]);
    expect(r.usedDefault).toBe(false);
    expect(r.droppedUnknown).toEqual([]);
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

  it("enforces the legacy cap, because each model is a separate billed call", () => {
    const r = parseChatSelection(`models=${AVAILABLE.join(",")}`, AVAILABLE);
    expect(r.slugs).toHaveLength(MAX_CHAT_MODELS);
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

  it("emits the same param format legacy links use", () => {
    // The wire format is pinned: `models=` plus comma-joined slugs. Changing
    // it would orphan every saved link.
    expect(serializeChatSelection(["a", "b", "c"])).toBe(
      `${MODELS_PARAM}=a,b,c`,
    );
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

describe("buildShareUrl", () => {
  it("always pins the models explicitly", () => {
    // If a shared link relied on the default, the leader changing later would
    // silently change what the recipient opens.
    const picked = ["gpt-4-1-rag", "gemma-4-31b-rag"];
    const url = buildShareUrl(
      "https://example.com",
      "/admin/arena/chat",
      picked,
    );
    expect(url).toContain(`?${MODELS_PARAM}=`);
    for (const slug of picked) expect(url).toContain(slug);
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
