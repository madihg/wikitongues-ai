import { describe, it, expect, vi } from "vitest";
import {
  RIGHTS_SEED,
  seedRightsRegister,
} from "../../../scripts/speech/seed-rights-register";
import { canTrain } from "./can-train";
import { canExportOpen, canExportLicensed } from "./guard";
import { buildTrainingManifest } from "./training-manifest";
import { openRow, licensedRow } from "./fixtures";
import { WITHDRAWN_REVIEW_STATUS } from "./withdrawal";

const ctx = { scope: "internal", purpose: "asr" } as const;
const tp = (over: Parameters<typeof openRow>[0] = {}) =>
  licensedRow({ sourceType: "third_party", sourceRef: "src-1", ...over });

describe("the seed", () => {
  it("names the three sources, all with open questions", () => {
    expect(RIGHTS_SEED.map((s) => s.name)).toEqual([
      "GRN Words of Life (45 min)",
      "Hypa-Speech-10k",
      "Lanfrica / NaijaVoices",
    ]);
    for (const s of RIGHTS_SEED) {
      expect(s.notes.length).toBeGreaterThan(20);
      expect(s.licenseText.length).toBeGreaterThan(0);
    }
  });

  it("creates missing sources as pending and leaves existing ones alone", async () => {
    const create = vi.fn().mockResolvedValue({});
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: "already" })
      .mockResolvedValue(null);
    const created = await seedRightsRegister({
      thirdPartyAudioSource: { findFirst, create },
    } as never);
    expect(created).toBe(2);
    expect(create).toHaveBeenCalledTimes(2);
    for (const [arg] of create.mock.calls) {
      expect(arg.data.rightsStatus).toBe("pending");
    }
  });
});

describe("canTrain on outside audio", () => {
  it("refuses a pending or restricted source", () => {
    for (const rightsStatus of ["pending", "restricted"] as const) {
      expect(canTrain(tp({ rightsStatus }), ctx)).toEqual({
        ok: false,
        reason: "third_party_uncleared",
      });
    }
  });

  it("refuses a cleared clip that names no source", () => {
    expect(
      canTrain(tp({ rightsStatus: "cleared", sourceRef: null }), ctx),
    ).toEqual({
      ok: false,
      reason: "third_party_uncleared",
    });
  });

  it("trains a cleared clip that names its source", () => {
    expect(canTrain(tp({ rightsStatus: "cleared" }), ctx).ok).toBe(true);
  });

  it("reaches no training manifest while the source is pending", () => {
    const lines = buildTrainingManifest(
      [
        tp({ id: "x", rightsStatus: "pending" }),
        tp({ id: "y", rightsStatus: "cleared" }),
      ],
      { ...ctx, signedUrl: (k) => `https://signed.example/${k}` },
    ).lines;
    expect(lines.map((l) => l.id)).toEqual(["y"]);
  });
});

describe("the export guards on outside audio and withdrawn clips", () => {
  const gated = {
    consent: { commercialLicensing: true, crossBorder: true },
    gatedDelivery: true,
  };

  it("canExportOpen refuses third_party clips, pending, restricted or cleared", () => {
    for (const rightsStatus of ["pending", "restricted", "cleared"] as const) {
      expect(
        canExportOpen(
          openRow({ sourceType: "third_party", sourceRef: "s", rightsStatus }),
        ),
      ).toBe(false);
    }
  });

  it("canExportLicensed refuses a third_party clip whose source is not cleared", () => {
    for (const rightsStatus of ["pending", "restricted"] as const) {
      expect(canExportLicensed(tp({ rightsStatus }), gated)).toBe(false);
    }
  });

  it("a withdrawn clip leaves by no path", () => {
    const w = { reviewStatus: WITHDRAWN_REVIEW_STATUS };
    expect(canExportOpen(openRow(w))).toBe(false);
    expect(canExportLicensed(licensedRow(w), gated)).toBe(false);
    expect(canTrain(openRow(w), ctx)).toEqual({
      ok: false,
      reason: "rejected",
    });
  });
});
