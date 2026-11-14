import { describe, it, expect, vi } from "vitest";
import {
  WITHDRAWN_REVIEW_STATUS,
  retrainRequired,
  withdrawSpeaker,
  withdrawnSpeakerIds,
} from "./withdrawal";
import { loadTrainableRows } from "./loop-rows";
import { buildOpenManifest } from "./manifest";
import { buildTrainingManifest } from "./training-manifest";
import { speakerPseudonym } from "./manifest";
import { openRow, licensedRow } from "./fixtures";

const t = (n: number) => new Date(Date.UTC(2026, 10, n));

describe("withdrawnSpeakerIds: the latest grant decides", () => {
  it("lists a speaker whose latest grant is a withdrawal", () => {
    expect(
      withdrawnSpeakerIds([
        { userId: "a", grantedAt: t(1), withdrawn: false },
        { userId: "a", grantedAt: t(2), withdrawn: true },
      ]),
    ).toEqual(["a"]);
  });

  it("does not list a speaker who consented again after withdrawing", () => {
    expect(
      withdrawnSpeakerIds([
        { userId: "a", grantedAt: t(2), withdrawn: true },
        { userId: "a", grantedAt: t(3), withdrawn: false },
      ]),
    ).toEqual([]);
  });

  it("is independent per speaker and ignores input order", () => {
    expect(
      withdrawnSpeakerIds([
        { userId: "b", grantedAt: t(5), withdrawn: true },
        { userId: "a", grantedAt: t(1), withdrawn: false },
        { userId: "c", grantedAt: t(4), withdrawn: false },
        { userId: "b", grantedAt: t(1), withdrawn: false },
      ]),
    ).toEqual(["b"]);
  });
});

describe("retrainRequired (called by the nightly route in PR F)", () => {
  const line = (id: string, annotatorId: string | null) => ({
    id,
    speakerPseudonym: speakerPseudonym(annotatorId),
  });

  it("is false and lists nothing when nobody withdrew", () => {
    expect(retrainRequired([], [line("c1", "a")])).toEqual({
      required: false,
      clipIds: [],
    });
  });

  it("is false when the withdrawn speaker has no clip in the manifest", () => {
    expect(retrainRequired(["z"], [line("c1", "a"), line("c2", "b")])).toEqual({
      required: false,
      clipIds: [],
    });
  });

  it("is true and names exactly the withdrawn speakers' clips, sorted", () => {
    const lines = [
      line("c3", "a"),
      line("c1", "b"),
      line("c2", "a"),
      line("c4", "c"),
    ];
    expect(retrainRequired(["a", "z"], lines)).toEqual({
      required: true,
      clipIds: ["c2", "c3"],
    });
  });

  it("never matches the unknown speaker label", () => {
    expect(retrainRequired(["a"], [line("c1", null)]).required).toBe(false);
  });
});

describe("withdrawSpeaker", () => {
  function db(updated = 3) {
    const grantCreate = vi.fn().mockReturnValue("grant-op");
    const updateMany = vi.fn().mockReturnValue("mark-op");
    const $transaction = vi
      .fn()
      .mockResolvedValue([{ id: "g9" }, { count: updated }]);
    return {
      db: {
        consentGrant: { create: grantCreate },
        speechRecording: { updateMany },
        $transaction,
      } as never,
      grantCreate,
      updateMany,
      $transaction,
    };
  }

  it("writes a withdrawal grant with all four answers false", async () => {
    const { db: d, grantCreate } = db();
    await withdrawSpeaker(d, { userId: "u1", consentId: "c1" });
    expect(grantCreate).toHaveBeenCalledTimes(1);
    expect(grantCreate.mock.calls[0][0].data).toEqual({
      consentId: "c1",
      userId: "u1",
      withdrawn: true,
      commercialLicensing: false,
      crossBorder: false,
      voiceCloning: false,
      speakerId: false,
    });
  });

  it("marks only the speaker's clips that are not yet published, in one transaction with the grant", async () => {
    const { db: d, updateMany, $transaction } = db(4);
    const out = await withdrawSpeaker(d, { userId: "u1", consentId: "c1" });
    expect(updateMany.mock.calls[0][0]).toEqual({
      where: {
        annotatorId: "u1",
        publishedOpenAt: null,
        OR: [
          { reviewStatus: null },
          { reviewStatus: { not: WITHDRAWN_REVIEW_STATUS } },
        ],
      },
      data: { reviewStatus: WITHDRAWN_REVIEW_STATUS },
    });
    expect($transaction).toHaveBeenCalledWith(["grant-op", "mark-op"]);
    expect(out).toEqual({ grantId: "g9", clipsRemoved: 4 });
  });
});

describe("withdrawal before and after a manifest build", () => {
  const ctx = {
    scope: "internal" as const,
    purpose: "asr" as const,
    signedUrl: (k: string) => `https://signed.example/${k}`,
  };
  const opts = (r: ReturnType<typeof openRow>) => r;

  it("BEFORE the build: a marked, unpublished clip is in no manifest", () => {
    const marked = licensedRow({
      id: "gone",
      reviewStatus: WITHDRAWN_REVIEW_STATUS,
    });
    const openMarked = openRow({
      id: "gone-open",
      publishedOpenAt: null,
      reviewStatus: WITHDRAWN_REVIEW_STATUS,
    });
    expect(buildTrainingManifest([marked, openMarked], ctx).lines).toEqual([]);
    expect(buildOpenManifest([opts(openMarked)])).toEqual([]);
  });

  it("AFTER the build: a published clip stays in the open manifest, untouched", () => {
    const published = openRow({ id: "published" }); // publishedOpenAt set, keep
    expect(buildOpenManifest([published]).map((l) => l.clip)).toEqual([
      published.storagePath,
    ]);
  });

  it("the mark never reaches a published clip (the update names publishedOpenAt: null)", async () => {
    const updateMany = vi.fn().mockReturnValue("m");
    const d = {
      consentGrant: { create: vi.fn().mockReturnValue("g") },
      speechRecording: { updateMany },
      $transaction: vi.fn().mockResolvedValue([{ id: "g" }, { count: 0 }]),
    } as never;
    await withdrawSpeaker(d, { userId: "u1", consentId: "c1" });
    expect(updateMany.mock.calls[0][0].where.publishedOpenAt).toBeNull();
  });
});

describe("loadTrainableRows leaves out speakers whose latest grant is a withdrawal", () => {
  function db(grants: unknown[], rows: unknown[]) {
    return {
      consentGrant: { findMany: vi.fn().mockResolvedValue(grants) },
      speechRecording: { findMany: vi.fn().mockResolvedValue(rows) },
    } as never;
  }
  const rows = [
    openRow({ id: "a1", annotatorId: "a" }), // published, still excluded from training
    openRow({ id: "b1", annotatorId: "b" }),
    openRow({ id: "n1", annotatorId: null }),
  ];

  it("drops the withdrawn speaker's clips, published or not, and keeps the rest", async () => {
    const out = await loadTrainableRows(
      db(
        [
          { userId: "a", grantedAt: t(1), withdrawn: false },
          { userId: "a", grantedAt: t(2), withdrawn: true },
          { userId: "b", grantedAt: t(1), withdrawn: false },
        ],
        rows,
      ),
    );
    expect(out.map((r) => r.id)).toEqual(["b1", "n1"]);
  });

  it("keeps a speaker who consented again after withdrawing", async () => {
    const out = await loadTrainableRows(
      db(
        [
          { userId: "a", grantedAt: t(2), withdrawn: true },
          { userId: "a", grantedAt: t(3), withdrawn: false },
        ],
        rows,
      ),
    );
    expect(out.map((r) => r.id)).toEqual(["a1", "b1", "n1"]);
  });

  it("reads grants with an explicit select (no consent text, no flags beyond what it needs)", async () => {
    const d = db([], []);
    await loadTrainableRows(d);
    const arg = (
      d as never as { consentGrant: { findMany: ReturnType<typeof vi.fn> } }
    ).consentGrant.findMany.mock.calls[0][0];
    expect(arg.select).toEqual({
      userId: true,
      grantedAt: true,
      withdrawn: true,
    });
  });
});
