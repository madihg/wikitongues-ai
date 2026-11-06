import { describe, it, expect } from "vitest";
import {
  canTrain,
  canEvaluate,
  type TrainContext,
  type TrainRefusal,
} from "./can-train";
import { openRow, licensedRow } from "./fixtures";
import type { ManifestRow } from "./manifest";

const internalAsr: TrainContext = { scope: "internal", purpose: "asr" };

/** A community_only clip that is otherwise trainable. */
const community = (over: Partial<ManifestRow> = {}) =>
  openRow({ tier: "community_only", publishedOpenAt: null, ...over });

type Case = {
  reason: TrainRefusal;
  row: ManifestRow;
  ctx: TrainContext;
};

const REFUSALS: Case[] = [
  {
    reason: "test_set",
    row: openRow({ isTestSet: true }),
    ctx: internalAsr,
  },
  { reason: "demo", row: openRow({ isDemo: true }), ctx: internalAsr },
  {
    reason: "rejected",
    row: openRow({ reviewStatus: "bad_audio" }),
    ctx: internalAsr,
  },
  {
    reason: "rejected",
    row: openRow({ reviewStatus: "wrong_text" }),
    ctx: internalAsr,
  },
  { reason: "no_consent", row: openRow({ consentId: null }), ctx: internalAsr },
  {
    reason: "not_uploaded",
    row: openRow({ uploadedAt: null }),
    ctx: internalAsr,
  },
  {
    reason: "frozen_prompt",
    row: openRow({ prompt: { isHoldout: true, split: "train" } }),
    ctx: internalAsr,
  },
  {
    reason: "frozen_prompt",
    row: openRow({ prompt: { isHoldout: false, split: "test" } }),
    ctx: internalAsr,
  },
  {
    reason: "no_cloning_opt_in",
    row: openRow({ voiceCloningOptIn: false }),
    ctx: { scope: "internal", purpose: "cloning" },
  },
  {
    reason: "community_only_provider",
    row: community(),
    ctx: { scope: "provider", purpose: "asr" },
  },
  {
    reason: "third_party_uncleared",
    row: openRow({ sourceType: "third_party", rightsStatus: "pending" }),
    ctx: internalAsr,
  },
  {
    reason: "third_party_uncleared",
    row: openRow({ sourceType: "third_party", rightsStatus: "restricted" }),
    ctx: internalAsr,
  },
  { reason: "not_kept", row: openRow({ reviewStatus: null }), ctx: internalAsr },
];

describe("canTrain refuses, with a reason", () => {
  it.each(REFUSALS)("$reason: $row.reviewStatus", ({ row, ctx, reason }) => {
    expect(canTrain(row, ctx)).toEqual({ ok: false, reason });
  });

  it("covers every reason it can give", () => {
    const reasons = new Set(REFUSALS.map((c) => c.reason));
    expect([...reasons].sort()).toEqual(
      [
        "community_only_provider",
        "demo",
        "frozen_prompt",
        "no_cloning_opt_in",
        "no_consent",
        "not_kept",
        "not_uploaded",
        "rejected",
        "test_set",
        "third_party_uncleared",
      ].sort(),
    );
  });
});

describe("canTrain accepts", () => {
  it("a kept, consented, uploaded contributor clip for either scope", () => {
    expect(canTrain(openRow(), internalAsr)).toEqual({ ok: true });
    expect(canTrain(licensedRow(), { scope: "provider", purpose: "tts" })).toEqual(
      { ok: true },
    );
  });

  it("community_only on the internal scope only", () => {
    expect(canTrain(community(), internalAsr)).toEqual({ ok: true });
    expect(canTrain(community(), { scope: "provider", purpose: "asr" }).ok).toBe(
      false,
    );
  });

  it("a cleared third-party clip", () => {
    const row = openRow({ sourceType: "third_party", rightsStatus: "cleared" });
    expect(canTrain(row, internalAsr).ok).toBe(true);
  });

  it("cloning only with the opt-in", () => {
    const row = openRow({ voiceCloningOptIn: true });
    expect(canTrain(row, { scope: "internal", purpose: "cloning" }).ok).toBe(
      true,
    );
  });

  it("the first failing rule names the reason (test set before the rest)", () => {
    const row = openRow({ isTestSet: true, isDemo: true, consentId: null });
    expect(canTrain(row, internalAsr)).toEqual({
      ok: false,
      reason: "test_set",
    });
  });
});

describe("canEvaluate is the mirror for test-set clips", () => {
  it("accepts a kept test-set clip, even on a frozen prompt", () => {
    const row = openRow({
      isTestSet: true,
      prompt: { isHoldout: true, split: "test" },
    });
    expect(canEvaluate(row, internalAsr)).toEqual({ ok: true });
  });

  it("refuses a clip that is not in the test set", () => {
    expect(canEvaluate(openRow(), internalAsr)).toEqual({
      ok: false,
      reason: "not_test_set",
    });
  });

  it("still refuses demo, rejected, unconsented and unkept clips", () => {
    for (const over of [
      { isDemo: true },
      { reviewStatus: "bad_audio" },
      { consentId: null },
      { reviewStatus: null },
    ]) {
      expect(canEvaluate(openRow({ isTestSet: true, ...over }), internalAsr).ok).toBe(
        false,
      );
    }
  });
});
