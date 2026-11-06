import type { PrismaClient } from "@prisma/client";
import { speakerPseudonym } from "./manifest";
import { withdrawnSpeakerIds } from "./withdrawal";

/**
 * The hours ledger on /admin/speech: how many hours of kept clips we hold,
 * by tier, speaker pseudonym, dialect and consent state. Demo clips are out,
 * and so is everything a withdrawn speaker recorded (their clips carry
 * reviewStatus "withdrawn" unless already published, and the speaker check
 * below catches the published ones). Numbers only: no clip text, no ids, no
 * account ids (speakers appear under their salted pseudonym).
 */

export interface Ledger {
  clips: number;
  totalHours: number;
  byTier: Record<string, number>;
  bySpeaker: Record<string, number>;
  byDialect: Record<string, number>;
  byConsent: Record<string, number>;
}

export interface LedgerRow {
  durationMs: number;
  tier: string;
  annotatorId: string | null;
  dialect: string | null;
  consentId: string | null;
}

const add = (into: Record<string, number>, key: string, hours: number) => {
  into[key] = (into[key] ?? 0) + hours;
};
const round = (n: number) => Math.round(n * 1000) / 1000;
const rounded = (r: Record<string, number>) =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k, round(v)]));

/** Pure: rows of speakers who are not withdrawn in, hours per dimension out. */
export function summarise(rows: LedgerRow[], withdrawnIds: string[]): Ledger {
  const gone = new Set(withdrawnIds);
  const out: Ledger = {
    clips: 0,
    totalHours: 0,
    byTier: {},
    bySpeaker: {},
    byDialect: {},
    byConsent: {},
  };
  for (const r of rows) {
    if (r.annotatorId && gone.has(r.annotatorId)) continue;
    const h = r.durationMs / 3_600_000;
    out.clips += 1;
    out.totalHours += h;
    add(out.byTier, r.tier, h);
    add(out.bySpeaker, speakerPseudonym(r.annotatorId), h);
    add(out.byDialect, r.dialect ?? "unknown", h);
    add(out.byConsent, r.consentId ? "consented" : "no consent record", h);
  }
  out.totalHours = round(out.totalHours);
  out.byTier = rounded(out.byTier);
  out.bySpeaker = rounded(out.bySpeaker);
  out.byDialect = rounded(out.byDialect);
  out.byConsent = rounded(out.byConsent);
  return out;
}

export async function loadLedger(
  db: Pick<PrismaClient, "speechRecording" | "consentGrant">,
): Promise<Ledger> {
  const [rows, grants] = await Promise.all([
    db.speechRecording.findMany({
      where: { isDemo: false, uploadedAt: { not: null }, reviewStatus: "keep" },
      select: {
        durationMs: true,
        tier: true,
        annotatorId: true,
        dialect: true,
        consentId: true,
      },
    }),
    db.consentGrant.findMany({
      select: { userId: true, grantedAt: true, withdrawn: true },
    }),
  ]);
  return summarise(rows, withdrawnSpeakerIds(grants));
}
