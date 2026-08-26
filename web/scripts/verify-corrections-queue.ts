/**
 * READ-ONLY adversarial verification of the corrections lane against the LIVE
 * DB (tasks/editing-ground-spec.md). Run:
 *
 *   npx tsx --env-file=.env.local scripts/verify-corrections-queue.ts
 *
 * For every real (non-demo-only) annotator it derives the full queue state the
 * exact way /api/edits/next and /api/annotator/summary do, then attacks it:
 *
 *   1. corrections ∩ remaining must be empty (disjointness by construction);
 *   2. no held-out prompt may ever appear in corrections;
 *   3. no edit-skipped prompt may appear;
 *   4. every servable target must survive an independent DB re-derivation:
 *      pool arm, own qualifying non-demo verdict (winner/tie/both_inadequate -
 *      never a pure loser), and NO existing non-demo edit from anyone;
 *   5. simulate the edit landing (target's output enters the edited set) and
 *      re-run the pure pipeline: the target must leave the lane - no re-serve;
 *   6. simulate an edit-skip on the first lane prompt: it must leave the lane
 *      AND the annotator's pairwise `remaining` must be byte-identical before
 *      and after (the flag can never eat a pairwise prompt);
 *   7. the pairwise lanes must stay balanced: `remaining` must equal
 *      orderQueueByLane of its own members (zero-gold first, 2:1 interleave).
 *
 * Nothing is written. The only queries are SELECTs.
 */
import { prisma } from "../src/lib/prisma";
import {
  computeQueueState,
  laneFor,
  orderQueueByLane,
  qualifyCorrectionTargets,
  EDIT_SKIP_REASON,
} from "../src/lib/pairing";
import { loadCorrectionInputs, loadQueueInputs } from "../src/lib/queue-input";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` - ${detail}` : ""}`);
  } else {
    console.log(`  ok   ${label}${detail ? ` (${detail})` : ""}`);
  }
}

async function main() {
  // The segments column must exist on the live DB (migration applied).
  const col = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'wikitongues' AND table_name = 'OutputEdit'
      AND column_name = 'segments'`;
  check("live DB has OutputEdit.segments (jsonb)", col.length === 1);

  const annotators = await prisma.user.findMany({
    where: {
      role: "ANNOTATOR",
      pairwiseComparisons: { some: { isDemo: false } },
    },
    select: { id: true, name: true, email: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\n${annotators.length} real annotators with non-demo verdicts`);

  const { queuePrompts } = await loadQueueInputs();
  const promptById = new Map(queuePrompts.map((p) => [p.promptId, p]));

  let totalWaiting = 0;
  for (const u of annotators) {
    console.log(`\n=== ${u.name ?? u.email} ===`);
    const [{ correctionInputs, servableByPromptId }, doneRows, flagRows] =
      await Promise.all([
        loadCorrectionInputs(u.id),
        prisma.pairwiseComparison.findMany({
          where: { annotatorId: u.id, isDemo: false },
          select: { promptId: true },
        }),
        prisma.promptFlag.findMany({
          where: { annotatorId: u.id },
          select: { reason: true, prompt: { select: { promptId: true } } },
        }),
      ]);
    const donePromptIds = new Set(doneRows.map((r) => r.promptId));
    const skippedPromptIds = new Set(flagRows.map((f) => f.prompt.promptId));

    const state = computeQueueState(
      queuePrompts,
      donePromptIds,
      skippedPromptIds,
      correctionInputs,
    );
    totalWaiting += state.corrections.length;
    console.log(
      `  queue: total=${state.total} completed=${state.completed} remaining=${state.remaining.length} corrections=${state.corrections.length}`,
    );

    // 1. disjointness
    const remainingIds = new Set(state.remaining.map((p) => p.promptId));
    check(
      "corrections ∩ remaining = ∅",
      state.corrections.every((p) => !remainingIds.has(p.promptId)),
    );

    // 2. no holdout
    check(
      "no held-out prompt in corrections",
      state.corrections.every((p) => !p.isHoldout),
    );

    // 3. no edit-skipped prompt
    const editSkipped = new Set(
      flagRows
        .filter((f) => f.reason === EDIT_SKIP_REASON)
        .map((f) => f.prompt.promptId),
    );
    check(
      "no edit-skipped prompt in corrections",
      state.corrections.every((p) => !editSkipped.has(p.promptId)),
      `${editSkipped.size} edit-skips on file`,
    );

    // 4. independent re-derivation of every servable target
    let rederived = 0;
    let bad = 0;
    for (const [promptId, targets] of servableByPromptId) {
      for (const t of targets) {
        rederived++;
        const [output, verdicts, edits] = await Promise.all([
          prisma.modelOutput.findUnique({
            where: { id: t.modelOutputId },
            select: {
              prompt: { select: { promptId: true, isHoldout: true } },
              candidateModel: {
                select: { inPairingPool: true, archived: true },
              },
            },
          }),
          prisma.pairwiseComparison.findMany({
            where: {
              annotatorId: u.id,
              isDemo: false,
              OR: [
                { modelOutputAId: t.modelOutputId },
                { modelOutputBId: t.modelOutputId },
              ],
            },
            select: { winner: true, modelOutputAId: true },
          }),
          prisma.outputEdit.count({
            where: { isDemo: false, modelOutputId: t.modelOutputId },
          }),
        ]);
        const inPool =
          output?.candidateModel?.inPairingPool === true &&
          output.candidateModel.archived === false;
        const qualifies = verdicts.some(
          (v) =>
            v.winner === "tie" ||
            v.winner === "both_inadequate" ||
            v.winner === (v.modelOutputAId === t.modelOutputId ? "a" : "b"),
        );
        if (
          !output ||
          output.prompt.promptId !== promptId ||
          !inPool ||
          !qualifies ||
          edits > 0
        ) {
          bad++;
          console.log(
            `    BAD target ${t.modelOutputId}: inPool=${inPool} qualifies=${qualifies} edits=${edits}`,
          );
        }
      }
    }
    check(
      "every servable target survives independent DB re-derivation",
      bad === 0,
      `${rederived} targets checked`,
    );

    // 5. no re-serve after the edit lands (pure simulation)
    const first = state.corrections[0];
    if (first) {
      const target = servableByPromptId.get(first.promptId)![0];
      const comparisons = await prisma.pairwiseComparison.findMany({
        where: { annotatorId: u.id, isDemo: false },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          promptId: true,
          winner: true,
          explanation: true,
          failureTagsA: true,
          failureTagsB: true,
          modelOutputA: {
            select: {
              id: true,
              outputText: true,
              candidateModel: {
                select: { inPairingPool: true, archived: true },
              },
            },
          },
          modelOutputB: {
            select: {
              id: true,
              outputText: true,
              candidateModel: {
                select: { inPairingPool: true, archived: true },
              },
            },
          },
        },
      });
      const editedNow = new Set(
        (
          await prisma.outputEdit.findMany({
            where: { isDemo: false },
            select: { modelOutputId: true },
          })
        ).map((e) => e.modelOutputId),
      );
      editedNow.add(target.modelOutputId); // simulate the save landing
      const inPool = (side: {
        candidateModel: { inPairingPool: boolean; archived: boolean } | null;
      }) =>
        side.candidateModel?.inPairingPool === true &&
        side.candidateModel.archived === false;
      const after = qualifyCorrectionTargets(
        comparisons.map((c) => ({
          comparisonId: c.id,
          promptId: c.promptId,
          winner: c.winner,
          explanation: c.explanation,
          a: {
            modelOutputId: c.modelOutputA.id,
            outputText: c.modelOutputA.outputText,
            inPool: inPool(c.modelOutputA),
            failureTags: c.failureTagsA,
          },
          b: {
            modelOutputId: c.modelOutputB.id,
            outputText: c.modelOutputB.outputText,
            inPool: inPool(c.modelOutputB),
            failureTags: c.failureTagsB,
          },
        })),
        editedNow,
      );
      check(
        "simulated saved edit retires its output (no re-serve)",
        after.every((t) => t.modelOutputId !== target.modelOutputId),
      );

      // 6. simulated edit-skip: prompt leaves corrections, pairwise unchanged
      const skipInputs = {
        editableByPromptId: correctionInputs.editableByPromptId,
        editSkippedPromptIds: new Set([
          ...correctionInputs.editSkippedPromptIds,
          first.promptId,
        ]),
      };
      const afterSkip = computeQueueState(
        queuePrompts,
        donePromptIds,
        skippedPromptIds,
        skipInputs,
      );
      check(
        "simulated edit-skip removes the prompt from corrections",
        afterSkip.corrections.every((p) => p.promptId !== first.promptId),
      );
      check(
        "simulated edit-skip leaves pairwise remaining identical",
        JSON.stringify(afterSkip.remaining) === JSON.stringify(state.remaining),
      );
    } else {
      console.log("  (no corrections waiting - simulations skipped)");
    }

    // 7. lane balance: remaining must be its own lane-ordering fixed point
    const laneOrdered = orderQueueByLane(state.remaining);
    check(
      "remaining is lane-ordered (zero-gold first, 2:1 strong/cold interleave)",
      JSON.stringify(laneOrdered) === JSON.stringify(state.remaining),
      `lanes: both=${state.remaining.filter((p) => laneFor(p) === "both").length} strong=${state.remaining.filter((p) => laneFor(p) === "strong_pair").length} cold=${state.remaining.filter((p) => laneFor(p) === "cold_mandatory").length}`,
    );

    // Corrections order must follow the loader's verdict-age map order.
    const expectedOrder = [
      ...correctionInputs.editableByPromptId.keys(),
    ].filter(
      (id) =>
        (correctionInputs.editableByPromptId.get(id) ?? 0) > 0 &&
        !correctionInputs.editSkippedPromptIds.has(id) &&
        promptById.get(id) &&
        !promptById.get(id)!.isHoldout,
    );
    check(
      "corrections preserve verdict-age order (refresh never shuffles)",
      JSON.stringify(state.corrections.map((p) => p.promptId)) ===
        JSON.stringify(expectedOrder),
    );
  }

  console.log(`\ntotal corrections waiting across annotators: ${totalWaiting}`);
  console.log(
    failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} FAILURES`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().finally(() => prisma.$disconnect());
