import { describe, it, expect } from "vitest";
import {
  resolveServingRoute,
  familyFromModelId,
  slugify,
} from "./register-fine-tune";

/**
 * The routing bug this guards against: an auto-registered checkpoint used to
 * default to provider "openai-compatible" whenever the job had no base
 * candidate. For a model tuned ON OpenAI that sends generation through the
 * OpenAI-compatible client, which reads OPENAI_COMPATIBLE_API_KEY - a Together
 * key in this deployment - i.e. the wrong host with the wrong credentials.
 */
describe("resolveServingRoute", () => {
  it("serves an OpenAI-tuned model on OpenAI itself, with no endpoint override", () => {
    expect(resolveServingRoute("openai")).toEqual({
      provider: "openai",
      apiEndpoint: null,
    });
  });

  it("ignores the base candidate's provider when the trainer hosts inference", () => {
    // Even if the base recipe was routed oddly, an OpenAI job's output is an
    // OpenAI model id and must go to OpenAI.
    expect(resolveServingRoute("openai", "openai-compatible").provider).toBe(
      "openai",
    );
  });

  it("serves a Together checkpoint through its OpenAI-compatible endpoint", () => {
    expect(resolveServingRoute("together")).toEqual({
      provider: "openai-compatible",
      apiEndpoint: "https://api.together.xyz/v1",
    });
  });

  it("falls back to the base candidate for providers with no inference story", () => {
    expect(resolveServingRoute("mock", "anthropic")).toEqual({
      provider: "anthropic",
      apiEndpoint: null,
    });
    expect(resolveServingRoute("mock").provider).toBe("openai-compatible");
  });
});

describe("familyFromModelId", () => {
  it("recognises an OpenAI fine-tuned model id as the gpt family", () => {
    expect(
      familyFromModelId("ft:gpt-4.1-mini-2025-04-14:personal:igala-sft:abc"),
    ).toBe("gpt");
  });

  it("recognises open-weights bases", () => {
    expect(familyFromModelId("madihalim_2eb2/Qwen3-14B-92ef7bd3")).toBe("qwen");
    expect(familyFromModelId("meta-llama/Llama-3.3-70B-Instruct")).toBe(
      "llama",
    );
  });

  it("falls back rather than guessing", () => {
    expect(familyFromModelId("some/unknown-model")).toBe("open-weights");
  });
});

describe("slugify", () => {
  it("produces a url-safe slug with no leading/trailing dashes", () => {
    expect(slugify("GPT-4.1 mini SFT (Igala cold-gold)")).toBe(
      "gpt-4-1-mini-sft-igala-cold-gold",
    );
  });
});
