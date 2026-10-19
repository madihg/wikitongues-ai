import { describe, it, expect } from "vitest";
import {
  FrozenPromptError,
  assertRecordable,
  canExportLicensed,
  canExportOpen,
  isFrozenPrompt,
  neverLeaves,
  type LicensedContext,
} from "./guard";
import { licensedRow, openRow } from "./fixtures";

describe("assertRecordable (the write guard)", () => {
  it("passes a train prompt and a dev prompt", () => {
    expect(() =>
      assertRecordable({ isHoldout: false, split: "train" }),
    ).not.toThrow();
    expect(() =>
      assertRecordable({ isHoldout: false, split: "dev" }),
    ).not.toThrow();
  });

  it("throws on isHoldout, whatever the split says", () => {
    expect(() => assertRecordable({ isHoldout: true, split: "train" })).toThrow(
      FrozenPromptError,
    );
  });

  it("throws on split test, whatever isHoldout says", () => {
    expect(() => assertRecordable({ isHoldout: false, split: "test" })).toThrow(
      FrozenPromptError,
    );
  });

  it("the error says nothing about the prompt", () => {
    try {
      assertRecordable({ isHoldout: true, split: "test" });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).toBe("This prompt cannot be recorded.");
      expect((e as Error).name).toBe("FrozenPromptError");
    }
  });

  it("isFrozenPrompt is the same predicate", () => {
    expect(isFrozenPrompt({ isHoldout: true, split: "train" })).toBe(true);
    expect(isFrozenPrompt({ isHoldout: false, split: "test" })).toBe(true);
    expect(isFrozenPrompt({ isHoldout: false, split: "train" })).toBe(false);
  });
});

describe("neverLeaves", () => {
  it("is false for an ordinary open clip", () => {
    expect(neverLeaves(openRow())).toBe(false);
  });

  it.each([
    ["community_only", { tier: "community_only" as const }],
    ["a test set", { isTestSet: true }],
    ["a demo clip", { isDemo: true }],
    ["a frozen prompt", { prompt: { isHoldout: true, split: "train" } }],
    ["a prompt in split test", { prompt: { isHoldout: false, split: "test" } }],
  ])("is true for %s", (_name, over) => {
    expect(neverLeaves(openRow(over))).toBe(true);
  });
});

describe("canExportOpen", () => {
  it("accepts a cleared, published, consented contributor clip", () => {
    expect(canExportOpen(openRow())).toBe(true);
  });

  it.each([
    ["tier licensed", { tier: "licensed" as const }],
    ["tier community_only", { tier: "community_only" as const }],
    ["not yet published", { publishedOpenAt: null }],
    ["test set", { isTestSet: true }],
    ["demo", { isDemo: true }],
    ["rights pending", { rightsStatus: "pending" as const }],
    ["rights restricted", { rightsStatus: "restricted" as const }],
    ["third-party source", { sourceType: "third_party" as const }],
    ["derived source", { sourceType: "derived" as const }],
    ["no consent record", { consentId: null }],
    ["upload never confirmed", { uploadedAt: null }],
    ["reviewed as bad audio", { reviewStatus: "bad_audio" }],
    ["reviewed as wrong text", { reviewStatus: "wrong_text" }],
    ["frozen prompt", { prompt: { isHoldout: true, split: "train" } }],
  ])("refuses: %s", (_name, over) => {
    expect(canExportOpen(openRow(over))).toBe(false);
  });

  it("accepts a clip not yet reviewed (null) as well as one marked keep", () => {
    expect(canExportOpen(openRow({ reviewStatus: null }))).toBe(true);
    expect(canExportOpen(openRow({ reviewStatus: "keep" }))).toBe(true);
  });
});

describe("canExportLicensed", () => {
  const consenting: LicensedContext = {
    consent: { commercialLicensing: true, crossBorder: true },
    gatedDelivery: true,
  };

  it("accepts a cleared licensed clip when the gated path and consent allow it", () => {
    expect(canExportLicensed(licensedRow(), consenting)).toBe(true);
  });

  it("refuses outside the gated delivery path", () => {
    expect(
      canExportLicensed(licensedRow(), { ...consenting, gatedDelivery: false }),
    ).toBe(false);
  });

  it("refuses without a consent grant, or with either flag off", () => {
    expect(
      canExportLicensed(licensedRow(), { ...consenting, consent: null }),
    ).toBe(false);
    expect(
      canExportLicensed(licensedRow(), {
        ...consenting,
        consent: { commercialLicensing: false, crossBorder: true },
      }),
    ).toBe(false);
    expect(
      canExportLicensed(licensedRow(), {
        ...consenting,
        consent: { commercialLicensing: true, crossBorder: false },
      }),
    ).toBe(false);
  });

  it.each([
    ["tier open", { tier: "open" as const }],
    ["tier community_only", { tier: "community_only" as const }],
    ["test set", { isTestSet: true }],
    ["demo", { isDemo: true }],
    ["rights pending", { rightsStatus: "pending" as const }],
    ["no consent record", { consentId: null }],
    ["bad audio", { reviewStatus: "bad_audio" }],
    ["frozen prompt", { prompt: { isHoldout: false, split: "test" } }],
  ])("refuses: %s", (_name, over) => {
    expect(canExportLicensed(licensedRow(over), consenting)).toBe(false);
  });

  it("keeps synthesised clips out unless includeSynthetic is passed (FR-8)", () => {
    const synth = licensedRow({ sourceType: "derived" });
    expect(canExportLicensed(synth, consenting)).toBe(false);
    expect(
      canExportLicensed(synth, { ...consenting, includeSynthetic: true }),
    ).toBe(true);
  });

  it("never clones a voice without the speaker's opt-in (FR-9)", () => {
    const ctx = { ...consenting, forVoiceCloning: true };
    expect(
      canExportLicensed(licensedRow({ voiceCloningOptIn: false }), ctx),
    ).toBe(false);
    expect(
      canExportLicensed(licensedRow({ voiceCloningOptIn: true }), ctx),
    ).toBe(true);
  });
});
