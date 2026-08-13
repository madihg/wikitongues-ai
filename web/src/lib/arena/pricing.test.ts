import { describe, it, expect } from "vitest";
import {
  priceForModel,
  estimateGenerationCostUsd,
  estimateFineTuneCostUsd,
  fineTuneCostFromTokensUsd,
  fineTuneRatePerMTokens,
} from "./pricing";

describe("priceForModel", () => {
  it("matches known models by substring", () => {
    expect(priceForModel("claude-sonnet-4-5-20250929").output).toBe(15);
    expect(priceForModel("gpt-4o-mini").input).toBe(0.15);
    expect(priceForModel("gemini-2.0-flash").input).toBe(0.1);
  });

  it("prices claude-opus-5 at the Opus 5 rate, not the legacy claude-opus row", () => {
    // Ordering matters: "claude-opus-5" contains "claude-opus", so the more
    // specific row must win or Opus 5 spend is over-estimated 3x.
    expect(priceForModel("claude-opus-5")).toEqual({ input: 5, output: 25 });
    expect(priceForModel("claude-opus-4-1")).toEqual({ input: 15, output: 75 });
  });

  it("falls back to a default for unknown models", () => {
    const p = priceForModel("some-unknown-model");
    expect(p.input).toBeGreaterThan(0);
    expect(p.output).toBeGreaterThan(0);
  });
});

describe("estimateGenerationCostUsd", () => {
  it("computes input+output token cost", () => {
    // 1M in @ $3, 1M out @ $15 = $18
    const cost = estimateGenerationCostUsd({
      modelId: "claude-sonnet-4-5",
      tokensIn: 1_000_000,
      tokensOut: 1_000_000,
    });
    expect(cost).toBeCloseTo(18, 5);
  });

  it("treats missing token counts as zero", () => {
    expect(
      estimateGenerationCostUsd({ modelId: "gpt-4o", tokensIn: null }),
    ).toBe(0);
  });
});

describe("estimateFineTuneCostUsd", () => {
  it("uses the Together base-model rate and scales with rows + epochs", () => {
    // 1000 rows * 350 tok * 3 epochs = 1.05M tok @ $5/M = $5.25
    const cost = estimateFineTuneCostUsd({
      baseModelId: "meta-llama/Llama-3.3-70B-Instruct",
      nRows: 1000,
    });
    expect(cost).toBeCloseTo(5.25, 5);
  });

  it("is cheaper for a smaller base model", () => {
    const big = estimateFineTuneCostUsd({
      baseModelId: "meta-llama/Llama-3.3-70B-Instruct",
      nRows: 500,
    });
    const small = estimateFineTuneCostUsd({
      baseModelId: "Qwen/Qwen3-14B",
      nRows: 500,
    });
    expect(small).toBeLessThan(big);
  });
});

describe("fineTuneRatePerMTokens", () => {
  it("matches the most specific OpenAI snapshot first", () => {
    // gpt-4.1-mini must not fall through to the (much dearer) gpt-4.1 rate.
    expect(fineTuneRatePerMTokens("gpt-4.1-mini-2025-04-14")).toBe(5);
    expect(fineTuneRatePerMTokens("gpt-4.1-nano-2025-04-14")).toBe(1.5);
    expect(fineTuneRatePerMTokens("gpt-4.1-2025-04-14")).toBe(25);
    expect(fineTuneRatePerMTokens("gpt-4o-mini-2024-07-18")).toBe(3);
  });

  it("still resolves a tuned model id back to its base rate", () => {
    expect(
      fineTuneRatePerMTokens("ft:gpt-4.1-mini-2025-04-14:personal:igala:abc"),
    ).toBe(5);
  });
});

describe("fineTuneCostFromTokensUsd", () => {
  it("prices the provider's reported trained tokens", () => {
    // 200k trained tokens @ $5/M = $1.00
    expect(
      fineTuneCostFromTokensUsd({
        baseModelId: "gpt-4.1-mini-2025-04-14",
        trainedTokens: 200_000,
      }),
    ).toBeCloseTo(1, 5);
  });

  it("is zero for a zero-token job", () => {
    expect(
      fineTuneCostFromTokensUsd({
        baseModelId: "gpt-4.1-mini-2025-04-14",
        trainedTokens: 0,
      }),
    ).toBe(0);
  });
});
