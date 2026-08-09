import { describe, it, expect } from "vitest";
import {
  buildFineTuneRequest,
  parseSupportedModels,
  selectDeployableFineTuneBases,
  TOGETHER_BASE_MODELS,
  TOGETHER_DEDICATED_INFERENCE_API,
  TOGETHER_UNSERVABLE_BASE_MODELS,
} from "./together";
import { hpBoolean } from "./fine-tune-providers";

/**
 * These assertions guard the one decision that decided whether a whole training
 * run could ever be used: LoRA vs full fine-tuning.
 *
 * Together defaults `training_type` to LoRA when the field is omitted, and a
 * LoRA output can only be served by attaching it to a dedicated endpoint as an
 * adapter. This project already burned a run that way (Qwen3-14B, trained and
 * un-servable). A full fine-tune emits standalone weights that deploy as an
 * ordinary model, and it is requested with a tagged object - {"type":"Full"} -
 * not a boolean, which is easy to get subtly wrong against an API that accepts
 * the request either way and only diverges at deploy time.
 */

const BASE = {
  fileId: "file-abc",
  model: "meta-llama/Meta-Llama-3.1-8B-Instruct-Reference",
  method: "sft" as const,
};

describe("buildFineTuneRequest training_type", () => {
  it("requests a FULL fine-tune as a tagged object when lora is explicitly false", () => {
    const body = buildFineTuneRequest({ ...BASE, lora: false });
    expect(body.training_type).toEqual({ type: "Full" });
  });

  it("requests LoRA explicitly when asked", () => {
    const body = buildFineTuneRequest({ ...BASE, lora: true });
    expect(body.training_type).toEqual({ type: "Lora" });
  });

  it("omits training_type entirely when the caller did not choose", () => {
    // Unchanged behaviour for every pre-existing caller: the backend picks, and
    // the backend picks LoRA. Sending a null/false here instead of omitting
    // would change what those callers train.
    const body = buildFineTuneRequest(BASE);
    expect("training_type" in body).toBe(false);
  });
});

describe("buildFineTuneRequest shared shape", () => {
  it("sends training_method as an object, not a bare string", () => {
    expect(buildFineTuneRequest(BASE).training_method).toEqual({
      method: "sft",
    });
  });

  it("carries dpo_beta only on dpo jobs", () => {
    expect(
      buildFineTuneRequest({ ...BASE, method: "dpo", dpoBeta: 0.1 })
        .training_method,
    ).toEqual({ method: "dpo", dpo_beta: 0.1 });
    expect(buildFineTuneRequest(BASE).training_method).not.toHaveProperty(
      "dpo_beta",
    );
  });

  it("always sends a concrete integer batch size", () => {
    // "max" is resolved client-side by the SDK; the raw REST API fails with
    // "batch size is zero" when it is sent or omitted.
    expect(buildFineTuneRequest(BASE).batch_size).toBe(8);
    expect(buildFineTuneRequest({ ...BASE, batchSize: 4 }).batch_size).toBe(4);
  });

  it("passes the base model and training file through untouched", () => {
    const body = buildFineTuneRequest({ ...BASE, lora: false });
    expect(body.model).toBe("meta-llama/Meta-Llama-3.1-8B-Instruct-Reference");
    expect(body.training_file).toBe("file-abc");
  });
});

describe("hpBoolean", () => {
  it("distinguishes an absent flag from an explicit false", () => {
    expect(hpBoolean({ hyperparameters: { lora: false } }, "lora")).toBe(false);
    expect(hpBoolean({ hyperparameters: { nEpochs: 3 } }, "lora")).toBe(
      undefined,
    );
    expect(hpBoolean({ hyperparameters: null }, "lora")).toBe(undefined);
    // A non-boolean must not be coerced: "false" the string would otherwise
    // read as truthy and quietly train LoRA.
    expect(hpBoolean({ hyperparameters: { lora: "false" } }, "lora")).toBe(
      undefined,
    );
  });
});

/**
 * These rows are copied from Together's live v2 registry on 2026-08-09, and the
 * expectations below are the empirical result of actually running the 8B job:
 * $4.00 trained a perfectly good full fine-tune that Together then refused to
 * deploy ("No configs found for model ml_CdseZkgPUsdGz6kYpv85P").
 */
const REGISTRY = [
  {
    // Both products on ONE entry. This account's 70B fine-tune landed on
    // ml_CbRhw8mpNRf5F5N7qCqhj and IS deployable. The shape that works.
    id: "arch_CcqavqNJtov9XTbZfYRyi",
    name: "meta-llama/Llama-3.3-70B-Instruct",
    baseModelId: "ml_CbRhw8mpNRf5F5N7qCqhj",
    products: ["PRODUCT_DEDICATED", "PRODUCT_FINE_TUNING"],
    deploymentProfiles: [
      { certifiedConfigRevisionId: "cr_Cd35GQHYTSBWFGoKb4m4t" },
    ],
  },
  {
    id: "arch_CcqTKyTw8XamS4VedT5US",
    name: "Qwen/Qwen3.5-9B",
    baseModelId: "ml_CbuqU8KKAtoGrowco4nqK",
    products: ["PRODUCT_DEDICATED", "PRODUCT_FINE_TUNING"],
    deploymentProfiles: [
      { certifiedConfigRevisionId: "cr_Cd35Fpam3FrMdwHdmroZD" },
    ],
  },
  {
    // DEDICATED only. It has a real certified 1x H100 config, which is exactly
    // what makes it a trap: the config exists, but a fine-tune never lands here.
    id: "arch_CcqavoedEn2SPa7mpb6pK",
    name: "meta-llama/Llama-3.1-8B-Instruct",
    baseModelId: "ml_CcoJJ5xjwdLjhbg5aCcCB",
    products: ["PRODUCT_DEDICATED"],
    deploymentProfiles: [
      { certifiedConfigRevisionId: "cr_Cd35GMEk4PNy5Ly6yMGEK" },
    ],
  },
];

describe("selectDeployableFineTuneBases", () => {
  it("keeps only bases that are fine-tunable AND dedicated-servable on one entry", () => {
    const names = selectDeployableFineTuneBases(
      parseSupportedModels(REGISTRY),
    ).map((m) => m.name);
    expect(names).toEqual([
      "meta-llama/Llama-3.3-70B-Instruct",
      "Qwen/Qwen3.5-9B",
    ]);
  });

  it("rejects a dedicated-only base even though it owns a certified config", () => {
    // The whole $4 lesson in one assertion. Llama-3.1-8B-Instruct has a
    // certified config, so "does a certified config exist for this
    // architecture" answers YES and is still the wrong question - the
    // fine-tune output inherits the TRAINING object, which has none.
    const names = selectDeployableFineTuneBases(
      parseSupportedModels(REGISTRY),
    ).map((m) => m.name);
    expect(names).not.toContain("meta-llama/Llama-3.1-8B-Instruct");
  });

  it("rejects a base whose entry has both products but no certified config", () => {
    const rows = parseSupportedModels([
      {
        id: "arch_x",
        name: "some/model",
        baseModelId: "ml_x",
        products: ["PRODUCT_DEDICATED", "PRODUCT_FINE_TUNING"],
        deploymentProfiles: [],
      },
    ]);
    expect(selectDeployableFineTuneBases(rows)).toEqual([]);
  });
});

describe("parseSupportedModels", () => {
  it("survives a registry row with every optional field missing", () => {
    expect(parseSupportedModels([{}])).toEqual([
      {
        name: "",
        archId: "",
        baseModelId: "",
        products: [],
        certifiedConfigIds: [],
      },
    ]);
  });
});

describe("serving hosts", () => {
  it("keeps the dedicated inference host separate from the training API", () => {
    expect(TOGETHER_DEDICATED_INFERENCE_API).toBe(
      "https://api-inference.together.ai/v1",
    );
    expect(TOGETHER_DEDICATED_INFERENCE_API).not.toContain("api.together.xyz");
  });

  it("offers only bases that can be served after training", () => {
    expect(TOGETHER_BASE_MODELS).toEqual([
      "Qwen/Qwen3.5-9B",
      "meta-llama/Llama-3.3-70B-Instruct",
    ]);
    // Each of these trained successfully and was then refused deployment.
    for (const dead of TOGETHER_UNSERVABLE_BASE_MODELS) {
      expect(TOGETHER_BASE_MODELS).not.toContain(dead);
    }
    expect(TOGETHER_UNSERVABLE_BASE_MODELS).toContain(
      "meta-llama/Meta-Llama-3.1-8B-Instruct-Reference",
    );
  });
});
