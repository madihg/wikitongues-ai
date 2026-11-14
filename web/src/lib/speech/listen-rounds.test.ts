import { describe, it, expect } from "vitest";
import {
  eligibleSystems,
  planRounds,
  roundSides,
  type RoundPair,
} from "./listen-rounds";
import {
  describePlan,
  planPublish,
  PROTOTYPE_LICENCE,
  syntheticClipRow,
  type HumanClip,
  type PublishManifest,
} from "../../../scripts/speech/publish-listen-candidates";

const pairs = (n: number, system = "model-x", speaker: string | null = "speaker-1"): RoundPair[] =>
  Array.from({ length: n }, (_, i) => ({
    promptId: `p-${i}`,
    language: "igala",
    humanRecordingId: `human-${i}`,
    humanSpeakerId: speaker,
    candidateKey: `${system}:p-${i}`,
    systemRef: system,
  }));

describe("planRounds", () => {
  it("gives every rater every pair once, then one repeat in ten", () => {
    const { rounds } = planRounds({ seed: "b1", raterIds: ["r1", "r2"], pairs: pairs(40) });
    for (const rater of ["r1", "r2"]) {
      const mine = rounds.filter((r) => r.raterId === rater);
      const first = mine.filter((r) => !r.isRepeat);
      const repeats = mine.filter((r) => r.isRepeat);
      expect(first.length).toBe(40);
      expect(repeats.length).toBe(4);
      expect(new Set(first.map((r) => r.candidateKey)).size).toBe(40);
      expect(mine.map((r) => r.position)).toEqual([...Array(44).keys()]);
    }
  });

  it("balances the sides and swaps them on a repeat", () => {
    const { rounds } = planRounds({ seed: "b1", raterIds: ["r1"], pairs: pairs(41) });
    const first = rounds.filter((r) => !r.isRepeat);
    const modelFirst = first.filter((r) => r.candidateIsA).length;
    expect(Math.abs(modelFirst - (first.length - modelFirst))).toBeLessThanOrEqual(1);
    for (const rep of rounds.filter((r) => r.isRepeat)) {
      const original = first.find((r) => r.candidateKey === rep.candidateKey)!;
      expect(rep.candidateIsA).toBe(!original.candidateIsA);
      expect(rep.position).toBeGreaterThan(original.position);
      // Drawn from the first half, so a repeat is far from its original.
      expect(original.position).toBeLessThan(Math.ceil(first.length / 2));
    }
  });

  it("orders differently per rater and per batch, and the same way every time", () => {
    const a = planRounds({ seed: "b1", raterIds: ["r1", "r2"], pairs: pairs(30) });
    const b = planRounds({ seed: "b1", raterIds: ["r2", "r1"], pairs: [...pairs(30)].reverse() });
    expect(a).toEqual(b);
    const order = (seed: string, rater: string) =>
      planRounds({ seed, raterIds: [rater], pairs: pairs(30) })
        .rounds.filter((r) => !r.isRepeat)
        .map((r) => r.candidateKey)
        .join(",");
    expect(order("b1", "r1")).not.toBe(order("b1", "r2"));
    expect(order("b1", "r1")).not.toBe(order("b2", "r1"));
  });

  it("never gives a rater a round on their own voice", () => {
    const mixed = [...pairs(5, "model-x", "r1"), ...pairs(5, "model-y", "someone")];
    const plan = planRounds({ seed: "b1", raterIds: ["r1", "r2"], pairs: mixed });
    expect(plan.rounds.filter((r) => r.raterId === "r1" && r.systemRef === "model-x")).toEqual([]);
    expect(plan.rounds.filter((r) => r.raterId === "r2" && !r.isRepeat).length).toBe(10);
    expect(plan.skippedOwnVoice).toBe(5);
  });

  it("two systems on one sentence are two rounds against the same human clip", () => {
    const both = [...pairs(10, "model-x"), ...pairs(10, "model-y")];
    const first = planRounds({ seed: "b1", raterIds: ["r1"], pairs: both }).rounds.filter((r) => !r.isRepeat);
    expect(first.length).toBe(20);
    expect(first.filter((r) => r.promptId === "p-0").map((r) => r.systemRef).sort()).toEqual(["model-x", "model-y"]);
  });

  it("no pairs, no rounds; a few pairs still get one repeat", () => {
    expect(planRounds({ seed: "b", raterIds: ["r1"], pairs: [] }).rounds).toEqual([]);
    expect(planRounds({ seed: "b", raterIds: ["r1"], pairs: pairs(3) }).rounds.filter((r) => r.isRepeat).length).toBe(1);
  });

  it("roundSides puts the model where the round says", () => {
    const r = { id: "x", promptId: "p", language: "igala", humanRecordingId: "h", candidateRecordingId: "c", candidateIsA: true };
    expect(roundSides(r)).toEqual({ aId: "c", bId: "h" });
    expect(roundSides({ ...r, candidateIsA: false })).toEqual({ aId: "h", bId: "c" });
  });
});

describe("eligibleSystems", () => {
  it("admits a system whose round-trip CER is at most twice people's", () => {
    const got = eligibleSystems([
      { systemRef: "ok", systemCer: 0.6, humanCer: 0.3, nSentences: 40 },
      { systemRef: "bad", systemCer: 0.61, humanCer: 0.3, nSentences: 40 },
      { systemRef: "unscored", systemCer: 0, humanCer: 0.3, nSentences: 0 },
    ]);
    expect(got.eligible.map((s) => s.systemRef)).toEqual(["ok"]);
    expect(got.refused.map((s) => s.systemRef)).toEqual(["bad", "unscored"]);
  });
});

const human = (i: number, over: Partial<HumanClip> = {}): HumanClip => ({
  id: `human-${i}`,
  durationMs: 6000,
  promptId: `p-${i}`,
  language: "igala",
  annotatorId: "speaker-1",
  uploadedAt: new Date(),
  reviewStatus: null,
  isDemo: false,
  sourceType: "contributor",
  prompt: { isHoldout: false, split: "train" },
  ...over,
});
const manifest = (over: Partial<PublishManifest> = {}): PublishManifest => ({
  batch: "proto-test",
  notice: "internal prototype, not for release",
  systems: [
    {
      systemRef: "model-ok",
      systemCer: 0.5,
      humanCer: 0.4,
      nSentences: 10,
      clips: Array.from({ length: 10 }, (_, i) => ({
        promptId: `p-${i}`,
        humanRecordingId: `human-${i}`,
        file: `p-${i}.webm`,
        mimeType: "audio/webm;codecs=opus",
        durationMs: 3000,
        sampleRate: 48000,
      })),
    },
    {
      systemRef: "model-bad",
      systemCer: 0.9,
      humanCer: 0.4,
      nSentences: 10,
      clips: [
        { promptId: "p-0", humanRecordingId: "human-0", file: "x.webm", mimeType: "audio/webm", durationMs: 1, sampleRate: 48000 },
      ],
    },
  ],
  ...over,
});
const humans = () => Array.from({ length: 10 }, (_, i) => human(i));

describe("scripts/speech/publish-listen-candidates.ts (planPublish)", () => {
  it("publishes only the systems that pass the gate", () => {
    const plan = planPublish(manifest(), humans(), ["r1"]);
    expect(plan.eligible.map((s) => s.systemRef)).toEqual(["model-ok"]);
    expect(plan.refused.map((s) => s.systemRef)).toEqual(["model-bad"]);
    expect(plan.clips.length).toBe(10);
    expect(plan.rounds.every((r) => r.systemRef === "model-ok")).toBe(true);
    expect(plan.rounds.length).toBe(11);
  });

  it("publishes nothing, and says so, when no system passes", () => {
    const m = manifest();
    m.systems[0].systemCer = 0.95;
    const plan = planPublish(m, humans(), ["r1"]);
    expect(plan.clips).toEqual([]);
    expect(plan.rounds).toEqual([]);
    const text = describePlan(plan, [{ id: "r1", email: "r1@example.org" }]).join("\n");
    expect(text).toContain("No system passed the gate. Nothing to publish.");
    expect(text).toContain("REFUSED by the gate: model-ok");
  });

  it("pairs each clip with the person's clip of the same prompt, or leaves it out", () => {
    const hs = humans();
    hs[0] = human(0, { promptId: "another-prompt" });
    hs[1] = human(1, { reviewStatus: "withdrawn" });
    hs[2] = human(2, { prompt: { isHoldout: true, split: "test" } });
    hs[3] = human(3, { sourceType: "derived" });
    hs[4] = human(4, { uploadedAt: null });
    hs[5] = human(5, { isDemo: true });
    hs.pop(); // human-9 is gone
    const plan = planPublish(manifest(), hs, ["r1"]);
    expect(plan.clips.map((c) => c.promptId).sort()).toEqual(["p-6", "p-7", "p-8"]);
    expect(plan.skipped).toEqual({
      human_clip_on_another_prompt: 1,
      human_clip_rejected_or_withdrawn: 1,
      frozen_prompt: 1,
      human_clip_is_synthetic: 1,
      human_clip_not_uploaded: 1,
      human_clip_is_demo: 1,
      human_clip_not_found: 1,
    });
    for (const r of plan.rounds) expect(r.humanRecordingId).toBe(`human-${r.promptId.slice(2)}`);
  });

  it("is idempotent: the same manifest plans the same rounds", () => {
    expect(planPublish(manifest(), humans(), ["r1", "r2"])).toEqual(
      planPublish(manifest(), humans(), ["r2", "r1"]),
    );
  });

  it("refuses a manifest that does not say the clips are an internal prototype", () => {
    expect(() => planPublish(manifest({ notice: "" }), humans(), ["r1"])).toThrow(/internal prototype/);
  });

  it("the printed plan has counts and ids, never a clip's text", () => {
    const plan = planPublish(manifest(), humans(), ["r1"]);
    const lines = describePlan(plan, [{ id: "r1", email: "r1@example.org" }]);
    expect(lines.join("\n")).toContain("rater r1@example.org: 11 rounds (10 first, 1 repeats), model on A in 5 of 10");
    expect(lines.join("\n")).toContain("PASSES the gate: model-ok");
  });

  it("a rater who spoke the human clips gets no rounds on them", () => {
    const plan = planPublish(manifest(), humans(), ["speaker-1", "r2"]);
    expect(plan.rounds.filter((r) => r.raterId === "speaker-1")).toEqual([]);
    expect(plan.skippedOwnVoice).toBe(10);
  });

  it("registers only the clips a planned round plays", () => {
    // The only rater spoke eight of the ten human clips: two clips are needed, not ten.
    const hs = humans().map((h, i) => (i < 8 ? { ...h, annotatorId: "rater-a" } : h));
    const plan = planPublish(manifest(), hs, ["rater-a"]);
    expect(plan.clips.map((c) => c.promptId).sort()).toEqual(["p-8", "p-9"]);
    expect(plan.rounds.filter((r) => !r.isRepeat).length).toBe(2);
    expect(plan.rounds.filter((r) => r.isRepeat).length).toBe(1);
    // With no rater who can judge anything, nothing is registered at all.
    const none = planPublish(manifest(), humans(), ["speaker-1"]);
    expect(none.clips).toEqual([]);
  });

  it("leaves out a human clip that ran into the 30 second cap", () => {
    const hs = humans();
    hs[0] = human(0, { durationMs: 30000 });
    const plan = planPublish(manifest(), hs, ["r1"]);
    expect(plan.skipped).toEqual({ human_clip_cut_at_the_cap: 1 });
    expect(plan.clips.map((c) => c.promptId)).not.toContain("p-0");
  });
});

describe("syntheticClipRow", () => {
  const row = syntheticClipRow({
    id: "3f0c2a54-0000-4000-8000-000000000001",
    promptId: "p-1",
    systemRef: "model-ok",
    mimeType: "audio/webm;codecs=opus",
    durationMs: 3000,
    sampleRate: 48000,
    sizeBytes: 1234,
    checksumSha256: "abc",
  });

  it("is marked in every way as not a person's recording", () => {
    expect(row.sourceType).toBe("derived");
    expect(row.sourceRef).toBe("model-ok");
    expect(row.tier).toBe("community_only");
    expect(row.rightsStatus).toBe("restricted");
    expect(row.sourceLicense).toBe(PROTOTYPE_LICENCE);
    expect(PROTOTYPE_LICENCE).toMatch(/internal prototype, not for release/i);
    expect(row.annotatorId).toBeNull();
    expect(row.coldAuthorAnswerId).toBeNull();
    expect(row.consentId).toBeNull();
    expect(row.reviewStatus).toBeNull();
    expect(row.voiceCloningOptIn).toBe(false);
    expect(row.isTestSet).toBe(false);
  });

  it("is named like any recorded clip, so the address tells nothing", () => {
    expect(row.storageKey).toBe("clips/3f0c2a54-0000-4000-8000-000000000001.webm");
    expect(row.storagePath).toBe(row.storageKey);
    expect(row.storageKey).not.toMatch(/tts|model|synth|proto/i);
  });

  it("is not playable until its audio is in place", () => {
    expect(row.uploadedAt).toBeNull();
  });

  it("refuses a file type the recorder could not have made", () => {
    expect(() =>
      syntheticClipRow({ ...row, id: "x", systemRef: "m", mimeType: "audio/flac" }),
    ).toThrow(/Unsupported/);
  });
});
