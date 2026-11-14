import { describe, it, expect } from "vitest";
import {
  planWithdrawal,
  WITHDRAWN_STATUS,
} from "../../../scripts/speech/withdraw-listen-batch";
import { REJECTED_REVIEW_STATUSES } from "./limits";

const rounds = [
  { candidateRecordingId: "synth-1", comparisonId: null },
  { candidateRecordingId: "synth-1", comparisonId: null }, // its repeat
  { candidateRecordingId: "synth-2", comparisonId: "cmp-1" },
  { candidateRecordingId: "human-x", comparisonId: null }, // a corrupt row: must never matter
];
const clip = (id: string, reviewStatus: string | null = null, sourceType = "derived") => ({
  id,
  sourceType,
  reviewStatus,
});

describe("scripts/speech/withdraw-listen-batch.ts (planWithdrawal)", () => {
  it("withdraws with a status the Listen routes already treat as unplayable", () => {
    expect(REJECTED_REVIEW_STATUSES).toContain(WITHDRAWN_STATUS);
  });

  it("marks the batch's synthetic clips, and counts open and judged rounds", () => {
    const plan = planWithdrawal(rounds, [clip("synth-1"), clip("synth-2")], false);
    expect(plan.change).toEqual(["synth-1", "synth-2"]);
    expect(plan.openRounds).toBe(3);
    expect(plan.judgedRounds).toBe(1);
  });

  it("never touches a person's clip, even if a round names it", () => {
    const plan = planWithdrawal(rounds, [clip("human-x", null, "contributor"), clip("synth-1")], false);
    expect(plan.change).toEqual(["synth-1"]);
    expect(plan.refused).toEqual(["human-x"]);
  });

  it("ignores a clip no round of the batch names", () => {
    expect(planWithdrawal(rounds, [clip("other")], false).change).toEqual([]);
  });

  it("is idempotent: a clip already withdrawn is left alone", () => {
    const plan = planWithdrawal(rounds, [clip("synth-1", WITHDRAWN_STATUS), clip("synth-2")], false);
    expect(plan.change).toEqual(["synth-2"]);
    expect(plan.unchanged).toEqual(["synth-1"]);
  });

  it("restore undoes a withdrawal and nothing else", () => {
    const plan = planWithdrawal(
      rounds,
      [clip("synth-1", WITHDRAWN_STATUS), clip("synth-2", "wrong_text")],
      true,
    );
    expect(plan.change).toEqual(["synth-1"]);
    expect(plan.unchanged).toEqual(["synth-2"]);
  });
});
