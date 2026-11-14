import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { passesRoundTripGate } from "./quality-gates";
import { REJECTED_REVIEW_STATUSES } from "./limits";

/**
 * Assigned Listen rounds: a synthetic clip against the person's clip of the
 * same sentence, served blind to a named rater and to nobody else.
 *
 * The ordinary Listen queue pairs whatever voices a prompt has, for every
 * listener, once per prompt. A first model needs three things that queue
 * cannot give: the pair is always model against person, only the raters on a
 * list are served it, and one round in ten comes back with the sides swapped
 * (with one rater that repeat is the only reliability check there is).
 *
 * planRounds is pure: the same inputs give the same rounds, so the publish
 * script is idempotent and its dry run is exact. The functions below it are
 * the small hooks the Listen routes call. The model ref lives in the row and
 * is never sent to the browser.
 */

export const REPEAT_SHARE = 0.1;

export interface RoundPair {
  /** Prompt.id of the sentence. */
  promptId: string;
  language: string;
  humanRecordingId: string;
  /** The account that spoke the human clip: a rater never judges their own voice. */
  humanSpeakerId: string | null;
  /** A stable name for the synthetic clip before it has a row: "<systemRef>:<promptId>". */
  candidateKey: string;
  systemRef: string;
}

export interface PlannedRound {
  raterId: string;
  promptId: string;
  language: string;
  humanRecordingId: string;
  candidateKey: string;
  systemRef: string;
  /** The randomised side: true puts the synthetic clip on A. */
  candidateIsA: boolean;
  isRepeat: boolean;
  /** Order in the rater's queue, from 0. Repeats come last. */
  position: number;
}

export interface RoundPlan {
  rounds: PlannedRound[];
  /** Pairs left out for a rater because the human clip is their own voice. */
  skippedOwnVoice: number;
}

const hash = (...parts: string[]) =>
  createHash("sha256").update(parts.join("\n")).digest("hex");

/**
 * The rounds for a list of raters. Per rater: every pair whose human clip is
 * not their own, in an order fixed by the seed; sides alternate down that
 * order, starting on a side the seed picks, so A and B are balanced and still
 * unpredictable; then ceil(REPEAT_SHARE x rounds) repeats, drawn from the
 * first half of the queue and placed after everything else, sides swapped.
 */
export function planRounds(input: {
  seed: string;
  raterIds: string[];
  pairs: RoundPair[];
  repeatShare?: number;
}): RoundPlan {
  const share = input.repeatShare ?? REPEAT_SHARE;
  const rounds: PlannedRound[] = [];
  let skippedOwnVoice = 0;
  for (const raterId of [...new Set(input.raterIds)].sort()) {
    const mine = input.pairs.filter((p) => {
      const own = p.humanSpeakerId !== null && p.humanSpeakerId === raterId;
      if (own) skippedOwnVoice++;
      return !own;
    });
    const ordered = mine
      .map((p) => ({ p, k: hash(input.seed, raterId, p.candidateKey) }))
      .sort((a, b) => a.k.localeCompare(b.k) || a.p.candidateKey.localeCompare(b.p.candidateKey))
      .map((x) => x.p);
    const firstIsA = parseInt(hash(input.seed, raterId, "side").slice(0, 2), 16) % 2 === 0;
    const first: PlannedRound[] = ordered.map((p, i) => ({
      raterId,
      promptId: p.promptId,
      language: p.language,
      humanRecordingId: p.humanRecordingId,
      candidateKey: p.candidateKey,
      systemRef: p.systemRef,
      candidateIsA: i % 2 === 0 ? firstIsA : !firstIsA,
      isRepeat: false,
      position: i,
    }));
    const nRepeats = first.length === 0 ? 0 : Math.ceil(first.length * share);
    const pool = first.slice(0, Math.max(nRepeats, Math.ceil(first.length / 2)));
    const repeats = pool
      .map((r) => ({ r, k: hash(input.seed, raterId, r.candidateKey, "repeat") }))
      .sort((a, b) => a.k.localeCompare(b.k))
      .slice(0, nRepeats)
      .map((x, i) => ({
        ...x.r,
        candidateIsA: !x.r.candidateIsA,
        isRepeat: true,
        position: first.length + i,
      }));
    rounds.push(...first, ...repeats);
  }
  return { rounds, skippedOwnVoice };
}

/** One system's round trip, as the first-model batch reports it. */
export interface SystemRoundTrip {
  systemRef: string;
  /** Mean CER of the system's clips through the frozen recogniser. */
  systemCer: number;
  /** Mean CER of people's clips of the same sentences, same recogniser. */
  humanCer: number;
  nSentences: number;
}

/** The systems allowed into Listen: round-trip CER at most twice the human CER. */
export function eligibleSystems(systems: SystemRoundTrip[]): {
  eligible: SystemRoundTrip[];
  refused: SystemRoundTrip[];
} {
  const eligible = systems.filter(
    (s) => s.nSentences > 0 && passesRoundTripGate(s.systemCer, s.humanCer),
  );
  return { eligible, refused: systems.filter((s) => !eligible.includes(s)) };
}

// ------------------------------------------------------------ route hooks

type Db = Pick<PrismaClient, "speechListenRound" | "speechRecording">;

/**
 * True for "the table does not exist" (P2021). The routes ship in the same PR
 * as the migration, which a human applies by hand: until then there are no
 * rounds, and Listen must behave exactly as before.
 */
function tableMissing(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: unknown }).code === "P2021"
  );
}

export interface OpenRound {
  id: string;
  promptId: string;
  language: string;
  humanRecordingId: string;
  candidateRecordingId: string;
  candidateIsA: boolean;
}

const ROUND_SELECT = {
  id: true,
  promptId: true,
  language: true,
  humanRecordingId: true,
  candidateRecordingId: true,
  candidateIsA: true,
} as const;

/** A and B of a round, as the rater sees them. */
export function roundSides(r: OpenRound): { aId: string; bId: string } {
  return r.candidateIsA
    ? { aId: r.candidateRecordingId, bId: r.humanRecordingId }
    : { aId: r.humanRecordingId, bId: r.candidateRecordingId };
}

/**
 * The rater's next open round whose two clips can still be played (a clip
 * withdrawn or rejected since the round was made is passed over), with how
 * many rounds they have judged and how many are left.
 */
export async function nextListenRound(
  db: Db,
  raterId: string,
): Promise<{ round: OpenRound; completed: number; remaining: number } | null> {
  try {
    const open = await db.speechListenRound.findMany({
      where: { raterId, comparisonId: null },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: ROUND_SELECT,
    });
    if (open.length === 0) return null;
    const ids = [...new Set(open.flatMap((r) => [r.humanRecordingId, r.candidateRecordingId]))];
    const clips = await db.speechRecording.findMany({
      where: { id: { in: ids } },
      select: { id: true, uploadedAt: true, reviewStatus: true },
    });
    const playable = new Set(
      clips
        .filter(
          (c) =>
            c.uploadedAt !== null &&
            !(c.reviewStatus && REJECTED_REVIEW_STATUSES.includes(c.reviewStatus)),
        )
        .map((c) => c.id),
    );
    const usable = open.filter(
      (r) => playable.has(r.humanRecordingId) && playable.has(r.candidateRecordingId),
    );
    if (usable.length === 0) return null;
    const completed = await db.speechListenRound.count({
      where: { raterId, comparisonId: { not: null } },
    });
    return { round: usable[0], completed, remaining: usable.length };
  } catch (e) {
    if (tableMissing(e)) return null;
    throw e;
  }
}

/** Ids of every synthetic clip that belongs to a round: never in the open queue. */
export async function restrictedClipIds(db: Db): Promise<string[]> {
  try {
    const rows = await db.speechListenRound.findMany({
      distinct: ["candidateRecordingId"],
      select: { candidateRecordingId: true },
    });
    return rows.map((r) => r.candidateRecordingId);
  } catch (e) {
    if (tableMissing(e)) return [];
    throw e;
  }
}

/**
 * What a submitted pair means for rounds. "round": it is this rater's open
 * round, on the sides it was served. "restricted": one of the clips belongs
 * to a round, but not to an open round of this rater on these sides, so the
 * judgment must be refused. "none": an ordinary pair.
 */
export async function roundForSubmission(
  db: Db,
  raterId: string,
  recordingAId: string,
  recordingBId: string,
): Promise<{ kind: "round"; round: OpenRound } | { kind: "restricted" } | { kind: "none" }> {
  try {
    const rows = await db.speechListenRound.findMany({
      where: { candidateRecordingId: { in: [recordingAId, recordingBId] } },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: { ...ROUND_SELECT, raterId: true, comparisonId: true },
    });
    if (rows.length === 0) return { kind: "none" };
    const round = rows.find((r) => {
      const { aId, bId } = roundSides(r);
      return (
        r.raterId === raterId &&
        r.comparisonId === null &&
        aId === recordingAId &&
        bId === recordingBId
      );
    });
    return round ? { kind: "round", round } : { kind: "restricted" };
  } catch (e) {
    if (tableMissing(e)) return { kind: "none" };
    throw e;
  }
}

/** Close a round with its judgment. A round already closed is left alone. */
export async function markRoundJudged(
  db: Db,
  roundId: string,
  comparisonId: string,
): Promise<void> {
  await db.speechListenRound.updateMany({
    where: { id: roundId, comparisonId: null },
    data: { comparisonId, judgedAt: new Date() },
  });
}
