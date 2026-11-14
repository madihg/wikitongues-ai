/**
 * Take a published Listen batch out of Listen again, or put it back.
 *
 *   npx tsx --env-file=.env.local scripts/speech/withdraw-listen-batch.ts
 *       --batch NAME [--restore] [--dry-run | --apply]
 *
 * The default is a dry run. Nothing is deleted, ever: withdrawing sets the
 * review status of the batch's synthetic clips to bad_audio, the verdict a
 * reviewer gives a clip that cannot be used. From that moment the Listen
 * routes pass over every open round of the batch (a round is served only
 * while both its clips are playable), refuse a judgment on one, and the
 * clips stay out of the open queue as before. Rounds already judged keep
 * their judgments. --restore clears the status again, and the open rounds
 * come back where the rater left them.
 *
 * It touches only rows that are synthetic (sourceType derived) AND named by
 * a round of this batch. A person's clip is never changed, whatever the
 * rounds table says.
 */

export const WITHDRAWN_STATUS = "bad_audio";

export interface BatchRound {
  candidateRecordingId: string;
  comparisonId: string | null;
}

export interface BatchClip {
  id: string;
  sourceType: string;
  reviewStatus: string | null;
}

export interface WithdrawPlan {
  /** Synthetic clips whose status will change. */
  change: string[];
  /** Already in the wanted state. */
  unchanged: string[];
  /** Named by a round but not synthetic: never touched. */
  refused: string[];
  openRounds: number;
  judgedRounds: number;
}

/** The pure core: which clips change. */
export function planWithdrawal(
  rounds: BatchRound[],
  clips: BatchClip[],
  restore: boolean,
): WithdrawPlan {
  const named = new Set(rounds.map((r) => r.candidateRecordingId));
  const plan: WithdrawPlan = {
    change: [],
    unchanged: [],
    refused: [],
    openRounds: rounds.filter((r) => r.comparisonId === null).length,
    judgedRounds: rounds.filter((r) => r.comparisonId !== null).length,
  };
  for (const c of clips) {
    if (!named.has(c.id)) continue;
    if (c.sourceType !== "derived") plan.refused.push(c.id);
    else if (restore) {
      // Only undo what a withdrawal did: another verdict is someone's decision.
      (c.reviewStatus === WITHDRAWN_STATUS ? plan.change : plan.unchanged).push(c.id);
    } else {
      (c.reviewStatus === null ? plan.change : plan.unchanged).push(c.id);
    }
  }
  return plan;
}

async function main() {
  const args = process.argv.slice(2);
  const batch = args.includes("--batch") ? args[args.indexOf("--batch") + 1] : undefined;
  const restore = args.includes("--restore");
  const apply = args.includes("--apply");
  if (!batch) {
    throw new Error("usage: withdraw-listen-batch.ts --batch NAME [--restore] [--dry-run | --apply]");
  }
  if (apply && args.includes("--dry-run")) throw new Error("Choose --dry-run or --apply, not both.");

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const rounds = await prisma.speechListenRound.findMany({
      where: { batch },
      select: { candidateRecordingId: true, comparisonId: true },
    });
    if (rounds.length === 0) {
      console.log(`No round belongs to batch ${batch}. Nothing to do.`);
      return;
    }
    const clips = await prisma.speechRecording.findMany({
      where: { id: { in: [...new Set(rounds.map((r) => r.candidateRecordingId))] } },
      select: { id: true, sourceType: true, reviewStatus: true },
    });
    const plan = planWithdrawal(rounds, clips, restore);
    console.log(
      `${apply ? "APPLY" : "DRY RUN: nothing is written"}\n` +
        `batch ${batch}: ${plan.openRounds} open round(s), ${plan.judgedRounds} judged (kept as they are)\n` +
        `${restore ? "restore" : "withdraw"} ${plan.change.length} synthetic clip(s); ` +
        `${plan.unchanged.length} left as they are; ${plan.refused.length} refused (not synthetic)`,
    );
    if (!apply || plan.change.length === 0) return;
    const done = await prisma.speechRecording.updateMany({
      where: {
        id: { in: plan.change },
        sourceType: "derived",
        reviewStatus: restore ? WITHDRAWN_STATUS : null,
      },
      data: { reviewStatus: restore ? null : WITHDRAWN_STATUS },
    });
    console.log(`changed ${done.count} clip(s). No row was deleted.`);
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when invoked as a script, never when imported by a test.
if (process.argv[1]?.endsWith("withdraw-listen-batch.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
