import { describe, it, expect } from "vitest";
import {
  priceForModel,
  estimateGenerationCostUsd,
  estimateFineTuneCostUsd,
} from "./pricing";

describe("priceForModel", () => {
  it("matches known models by substring", () => {
    expect(priceForModel("claude-sonnet-4-5-20250929").output).toBe(15);
    expect(priceForModel("gpt-4o-mini").input).toBe(0.15);
    expect(priceForModel("gemini-2.0-flash").input).toBe(0.1);
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
