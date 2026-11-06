import type { PrismaClient } from "@prisma/client";
import { speakerPseudonym } from "./manifest";

/**
 * Consent withdrawal (US-040), as code.
 *
 * A withdrawal is a new ConsentGrant row with `withdrawn` true and all four
 * answers false; the speaker's LATEST grant decides (withdrawnSpeakerIds), so
 * consenting again later undoes the exclusion for new clips.
 *
 * What a withdrawal does:
 *  - clips not yet published (publishedOpenAt null) get reviewStatus
 *    "withdrawn", which every export and training guard already treats as a
 *    rejection (limits.ts REJECTED_REVIEW_STATUSES, guard.ts). They are never
 *    deleted here: deletion from storage is a separate, human step;
 *  - published open clips are NOT touched: open data is permanent, and the
 *    consent text says so before the speaker chooses;
 *  - loadTrainableRows leaves out the speaker's clips, published or not, so no
 *    new training run sees them;
 *  - a model that already trained on them is marked retrainRequired by the
 *    nightly route (retrainRequired below; the call site lands with PR F).
 */

/** reviewStatus written on a withdrawn speaker's unpublished clips. */
export const WITHDRAWN_REVIEW_STATUS = "withdrawn";

export interface GrantStamp {
  userId: string;
  grantedAt: Date;
  withdrawn: boolean;
}

/** Ids of speakers whose latest grant is a withdrawal. Sorted, no repeats. */
export function withdrawnSpeakerIds(grants: GrantStamp[]): string[] {
  const latest = new Map<string, GrantStamp>();
  for (const g of grants) {
    const cur = latest.get(g.userId);
    if (!cur || g.grantedAt.getTime() > cur.grantedAt.getTime()) {
      latest.set(g.userId, g);
    }
  }
  return [...latest.values()]
    .filter((g) => g.withdrawn)
    .map((g) => g.userId)
    .sort();
}

type WithdrawDb = Pick<PrismaClient, "consentGrant" | "speechRecording"> &
  Pick<PrismaClient, "$transaction">;

/**
 * Record the withdrawal and take the speaker's unpublished clips out of every
 * future manifest, in one transaction. `consentId` is the current consent text
 * the route upserted, so the row can be audited like any other grant.
 */
export async function withdrawSpeaker(
  db: WithdrawDb,
  input: { userId: string; consentId: string },
): Promise<{ grantId: string; clipsRemoved: number }> {
  const [grant, marked] = await db.$transaction([
    db.consentGrant.create({
      data: {
        consentId: input.consentId,
        userId: input.userId,
        withdrawn: true,
        commercialLicensing: false,
        crossBorder: false,
        voiceCloning: false,
        speakerId: false,
      },
      select: { id: true },
    }),
    db.speechRecording.updateMany({
      where: {
        annotatorId: input.userId,
        publishedOpenAt: null,
        // A plain `not` would skip rows whose reviewStatus is null.
        OR: [
          { reviewStatus: null },
          { reviewStatus: { not: WITHDRAWN_REVIEW_STATUS } },
        ],
      },
      data: { reviewStatus: WITHDRAWN_REVIEW_STATUS },
    }),
  ]);
  return { grantId: grant.id, clipsRemoved: marked.count };
}

/**
 * Does the promoted model's training manifest contain clips of speakers who
 * have since withdrawn? Pure. The nightly route (PR F) passes the withdrawn
 * speaker ids and the manifest lines of the promoted candidate; when
 * `required` it lists `clipIds` in stepLog and sets
 * SpeechCandidate.retrainRequired. Manifest lines carry only the salted
 * pseudonym, so account ids are mapped through speakerPseudonym.
 */
export function retrainRequired(
  withdrawnIds: string[],
  lines: { id: string; speakerPseudonym: string }[],
): { required: boolean; clipIds: string[] } {
  const labels = new Set(withdrawnIds.map((id) => speakerPseudonym(id)));
  const clipIds = lines
    .filter((l) => labels.has(l.speakerPseudonym))
    .map((l) => l.id)
    .sort();
  return { required: clipIds.length > 0, clipIds };
}
