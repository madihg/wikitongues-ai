import { describe, it, expect } from "vitest";
import { coverageScore, rankByCoverage, type CoverageClip } from "./coverage";

const me = { id: "u1", dialect: "ekpe" };
const clip = (over: Partial<CoverageClip> & { promptId: string }): CoverageClip => ({
  speakerId: "other",
  dialect: null,
  ...over,
});

describe("coverageScore", () => {
  it("a prompt with no clips scores below one with any clip", () => {
    const clips = [clip({ promptId: "p2" })];
    expect(coverageScore({ id: "p1" }, clips, me)).toBeLessThan(
      coverageScore({ id: "p2" }, clips, me),
    );
  });

  it("prompt cell: more clips on the prompt scores higher", () => {
    const clips = [
      clip({ promptId: "p1" }),
      clip({ promptId: "p1", speakerId: "b" }),
      clip({ promptId: "p2" }),
    ];
    expect(coverageScore({ id: "p2" }, clips, me)).toBeLessThan(
      coverageScore({ id: "p1" }, clips, me),
    );
  });

  it("speaker cell: a prompt the speaker already covers ranks after one they do not", () => {
    const clips = [
      clip({ promptId: "p1", speakerId: "u1" }),
      clip({ promptId: "p2" }),
      clip({ promptId: "p2", speakerId: "b" }),
    ];
    expect(coverageScore({ id: "p2" }, clips, me)).toBeLessThan(
      coverageScore({ id: "p1" }, clips, me),
    );
  });

  it("dialect cell: with equal clips, the prompt thin in the speaker's dialect comes first", () => {
    const clips = [
      clip({ promptId: "p1", dialect: "ekpe" }),
      clip({ promptId: "p2", dialect: "other" }),
    ];
    expect(coverageScore({ id: "p2" }, clips, me)).toBeLessThan(
      coverageScore({ id: "p1" }, clips, me),
    );
  });

  it("tone pair cell: with equal clips, the prompt whose minimal pair is thin comes first", () => {
    const clips = [
      clip({ promptId: "p3", tonePairKey: "kA" }),
      clip({ promptId: "p4", tonePairKey: "kB" }),
      clip({ promptId: "p5", tonePairKey: "kB" }),
    ];
    // p1 and p2 are unrecorded; their pairs hold 1 and 2 clips.
    const p1 = { id: "p1", tonePairKey: "kA" };
    const p2 = { id: "p2", tonePairKey: "kB" };
    expect(coverageScore(p1, clips, me)).toBeLessThan(
      coverageScore(p2, clips, me),
    );
    // No field, no cell: the score ignores pair clips.
    expect(coverageScore({ id: "p1" }, clips, me)).toBe(
      coverageScore({ id: "p9" }, clips, me),
    );
  });
});

describe("rankByCoverage", () => {
  it("puts zero-clip prompts first", () => {
    const prompts = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];
    const clips = [clip({ promptId: "p1" }), clip({ promptId: "p2" })];
    expect(rankByCoverage(prompts, clips, me).map((p) => p.id)).toEqual([
      "p3",
      "p1",
      "p2",
    ]);
  });

  it("falls back to the given order on a tie", () => {
    const prompts = [{ id: "pb" }, { id: "pa" }, { id: "pc" }];
    expect(rankByCoverage(prompts, [], me).map((p) => p.id)).toEqual([
      "pb",
      "pa",
      "pc",
    ]);
  });
});
