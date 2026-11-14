import { describe, it, expect, vi } from "vitest";
import { loadLedger, summarise, type LedgerRow } from "./ledger";
import { speakerPseudonym } from "./manifest";

const HOUR = 3_600_000;
const row = (over: Partial<LedgerRow> = {}): LedgerRow => ({
  durationMs: HOUR,
  tier: "open",
  annotatorId: "u1",
  dialect: "d1",
  consentId: "c1",
  ...over,
});

describe("summarise", () => {
  it("adds hours by tier, speaker pseudonym, dialect and consent state", () => {
    const l = summarise(
      [
        row(),
        row({ durationMs: HOUR / 2, tier: "licensed", dialect: null }),
        row({ annotatorId: "u2", consentId: null }),
      ],
      [],
    );
    expect(l.clips).toBe(3);
    expect(l.totalHours).toBe(2.5);
    expect(l.byTier).toEqual({ open: 2, licensed: 0.5 });
    expect(l.byDialect).toEqual({ d1: 2, unknown: 0.5 });
    expect(l.byConsent).toEqual({ consented: 1.5, "no consent record": 1 });
    expect(l.bySpeaker[speakerPseudonym("u1")]).toBe(1.5);
  });

  it("leaves out every clip of a withdrawn speaker", () => {
    const l = summarise([row(), row({ annotatorId: "gone" })], ["gone"]);
    expect(l.clips).toBe(1);
    expect(l.totalHours).toBe(1);
  });

  it("never exposes an account id", () => {
    const l = summarise([row({ annotatorId: "user-account-id" })], []);
    expect(JSON.stringify(l)).not.toContain("user-account-id");
  });
});

describe("loadLedger", () => {
  it("asks only for kept, uploaded, non-demo rows, with an explicit select and no audio", async () => {
    const db = {
      speechRecording: { findMany: vi.fn().mockResolvedValue([]) },
      consentGrant: { findMany: vi.fn().mockResolvedValue([]) },
    };
    await loadLedger(db as never);
    const arg = db.speechRecording.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      isDemo: false,
      uploadedAt: { not: null },
      reviewStatus: "keep",
    });
    expect(Object.keys(arg.select).sort()).toEqual(
      ["annotatorId", "consentId", "dialect", "durationMs", "tier"],
    );
    expect(arg.select).not.toHaveProperty("bytes");
  });

  it("excludes the clips of a speaker whose latest grant is a withdrawal", async () => {
    const db = {
      speechRecording: {
        findMany: vi.fn().mockResolvedValue([row(), row({ annotatorId: "gone" })]),
      },
      consentGrant: {
        findMany: vi.fn().mockResolvedValue([
          { userId: "gone", grantedAt: new Date("2026-11-01"), withdrawn: false },
          { userId: "gone", grantedAt: new Date("2026-11-05"), withdrawn: true },
        ]),
      },
    };
    expect((await loadLedger(db as never)).clips).toBe(1);
  });
});
