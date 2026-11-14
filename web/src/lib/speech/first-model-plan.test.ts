import { describe, it, expect } from "vitest";
import { licensedRow, openRow } from "./fixtures";
import { buildFirstModelPlan, FIRST_MODEL_GUARD } from "./first-model-plan";
import type { LoopRow } from "./training-manifest";

const signedUrl = (k: string) => `https://signed.example/${k}`;

/** A clip cleared for voice training: licensed, kept, opted in to cloning. */
const cleared = (id: string, over: Partial<LoopRow> = {}): LoopRow =>
  licensedRow({
    id,
    voiceCloningOptIn: true,
    annotatorId: "speaker-a",
    coldAuthorAnswer: { answerText: `sentence ${id}` },
    ...over,
  });

const six = () => ["a", "b", "c", "d", "e", "f"].map((id) => cleared(id));

describe("buildFirstModelPlan", () => {
  it("carries the guard name the worker checks", () => {
    expect(buildFirstModelPlan(six(), { signedUrl }).guard).toBe(FIRST_MODEL_GUARD);
    expect(FIRST_MODEL_GUARD).toBe("canTrain:internal:cloning");
  });

  it("refuses a clip no reviewer has kept, and says why", () => {
    const rows = [cleared("a", { reviewStatus: null }), cleared("b", { reviewStatus: null })];
    const plan = buildFirstModelPlan(rows, { signedUrl });
    expect(plan.train).toEqual([]);
    expect(plan.heldOut).toEqual([]);
    expect(plan.voice).toBeNull();
    expect(plan.counts.refused).toEqual({ not_kept: 2 });
  });

  it("refuses a clip without the voice-cloning opt-in, a test clip, a demo clip, a frozen prompt", () => {
    const rows = [
      cleared("no-optin", { voiceCloningOptIn: false }),
      cleared("test", { isTestSet: true }),
      cleared("demo", { isDemo: true }),
      cleared("frozen", { prompt: { isHoldout: true, split: "test" } }),
      cleared("rejected", { reviewStatus: "bad_audio" }),
      cleared("withdrawn", { reviewStatus: "withdrawn" }),
    ];
    const plan = buildFirstModelPlan(rows, { signedUrl });
    expect(plan.train).toEqual([]);
    expect(plan.counts.refused).toEqual({
      no_cloning_opt_in: 1,
      test_set: 1,
      demo: 1,
      frozen_prompt: 1,
      rejected: 2,
    });
  });

  it("holds the Open tier back by default: marked during a test, not yet chosen", () => {
    const rows = [
      ...six(),
      openRow({ id: "open-1", voiceCloningOptIn: true, annotatorId: "speaker-a" }),
      openRow({ id: "open-2", voiceCloningOptIn: true, annotatorId: "speaker-a" }),
    ];
    const plan = buildFirstModelPlan(rows, { signedUrl });
    const ids = [...plan.train, ...plan.heldOut].map((l) => l.id);
    expect(ids).not.toContain("open-1");
    expect(ids).not.toContain("open-2");
    expect(plan.counts.heldTier).toBe(2);
    // Lifting the hold is an explicit argument, never the default.
    const lifted = buildFirstModelPlan(rows, { signedUrl, heldTiers: [] });
    expect([...lifted.train, ...lifted.heldOut].map((l) => l.id)).toContain("open-1");
  });

  it("trains one voice, the one with the most audio, in Igala only", () => {
    const rows = [
      ...six(),
      cleared("other-1", { annotatorId: "speaker-b" }),
      {
        ...cleared("english-1", {
          coldAuthorAnswer: { answerText: "x", englishGloss: "the meaning" },
        }),
        language: "english",
      },
    ];
    const plan = buildFirstModelPlan(rows, { signedUrl });
    const speakers = new Set([...plan.train, ...plan.heldOut].map((l) => l.speakerPseudonym));
    expect(speakers.size).toBe(1);
    expect(plan.voice).toBe([...speakers][0]);
    expect(plan.counts.otherVoice).toBe(1);
    expect(plan.counts.notIgala).toBe(1);
    expect(plan.train.length + plan.heldOut.length).toBe(6);
  });

  it("holds out a third of the sentences, and a sentence never sits on both sides", () => {
    const rows = [...six(), cleared("a-again", { coldAuthorAnswer: { answerText: "sentence a" } })];
    const plan = buildFirstModelPlan(rows, { signedUrl });
    expect(plan.heldOut.length).toBeGreaterThanOrEqual(2);
    const trainText = new Set(plan.train.map((l) => l.transcript));
    for (const l of plan.heldOut) expect(trainText.has(l.transcript)).toBe(false);
    expect(plan.train.length + plan.heldOut.length).toBe(7);
  });

  it("holds nothing out when there are fewer than three sentences", () => {
    const plan = buildFirstModelPlan([cleared("a"), cleared("b")], { signedUrl });
    expect(plan.heldOut).toEqual([]);
    expect(plan.train.length).toBe(2);
  });

  it("is deterministic and versions the training ids", () => {
    const a = buildFirstModelPlan(six(), { signedUrl });
    const b = buildFirstModelPlan(six().reverse(), { signedUrl });
    expect(a.manifestVersion).toBe(b.manifestVersion);
    expect(a.train.map((l) => l.id)).toEqual(b.train.map((l) => l.id));
    expect(a.manifestVersion).toMatch(/^[0-9a-f]{64}$/);
  });

  it("signs the audio of each line", () => {
    const plan = buildFirstModelPlan(six(), { signedUrl });
    for (const l of plan.train) expect(l.url).toMatch(/^https:\/\/signed\.example\//);
  });
});
