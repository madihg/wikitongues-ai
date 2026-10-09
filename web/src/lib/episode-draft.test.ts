import { describe, it, expect } from "vitest";
import {
  coldDraftKey,
  coldPartOf,
  pairDraftKey,
  planDraftRestore,
  type ColdDraft,
  type DraftStep,
} from "./episode-draft";

/**
 * The draft rule across a pair change: the verdict and corrections belong to
 * the two outputs and come back only with them; the speaker's own answer
 * belongs to the question and comes back whatever the pair.
 */

type Full = ColdDraft & { step: DraftStep; winner: string | null };

const full = (over: Partial<Full> = {}): Full => ({
  step: "pairwise",
  coldAnswer: "Ùkọ́lọ̀",
  englishGloss: "work",
  instructionIg: "",
  coldLocked: true,
  winner: "a",
  ...over,
});

describe("draft keys", () => {
  it("the pair key is unchanged, so drafts saved before the split still restore", () => {
    expect(pairDraftKey("out-a", "out-b")).toBe("wt-episode-out-a:out-b");
  });

  it("the cold key depends on the prompt only", () => {
    expect(coldDraftKey("ig_v45_001")).toBe("wt-episode-cold-ig_v45_001");
    expect(coldDraftKey("ig_v45_001")).not.toBe(pairDraftKey("out-a", "out-b"));
  });
});

describe("coldPartOf", () => {
  it("keeps exactly the four cold fields", () => {
    expect(coldPartOf(full())).toEqual({
      coldAnswer: "Ùkọ́lọ̀",
      englishGloss: "work",
      instructionIg: "",
      coldLocked: true,
    });
  });

  it("is null for nothing to restore, and survives damaged storage", () => {
    expect(coldPartOf(null)).toBeNull();
    expect(coldPartOf("not an object")).toBeNull();
    expect(
      coldPartOf({ coldAnswer: "  ", englishGloss: "", instructionIg: "", coldLocked: false }),
    ).toBeNull();
    expect(coldPartOf({ coldAnswer: 42, coldLocked: "yes" })).toBeNull();
  });

  it("keeps a lock with no answer (the speaker chose to skip writing)", () => {
    expect(coldPartOf({ coldLocked: true })).toEqual({
      coldAnswer: "",
      englishGloss: "",
      instructionIg: "",
      coldLocked: true,
    });
  });
});

describe("planDraftRestore", () => {
  it("same pair: the full draft comes back, verdict included", () => {
    const d = full();
    expect(planDraftRestore(d, coldPartOf(d))).toEqual({ kind: "full", draft: d });
    expect(planDraftRestore(d, null)).toEqual({ kind: "full", draft: d });
  });

  it("pair changed, answer locked: resume at the pairwise step with the answer kept, no verdict", () => {
    const plan = planDraftRestore<Full>(null, coldPartOf(full({ step: "score" })));
    expect(plan).toEqual({
      kind: "cold",
      step: "pairwise",
      cold: {
        coldAnswer: "Ùkọ́lọ̀",
        englishGloss: "work",
        instructionIg: "",
        coldLocked: true,
      },
    });
  });

  it("pair changed, answer still being written: resume on the prompt step", () => {
    const plan = planDraftRestore<Full>(
      null,
      coldPartOf(full({ step: "prompt", coldLocked: false, winner: null })),
    );
    expect(plan).toMatchObject({ kind: "cold", step: "prompt" });
    expect(plan && plan.kind === "cold" && plan.cold.coldLocked).toBe(false);
  });

  it("nothing saved: nothing restored", () => {
    expect(planDraftRestore<Full>(null, null)).toBeNull();
  });

  it("the cold part is the fresher copy and is laid over the full draft", () => {
    const old = full({ step: "prompt", coldLocked: false, coldAnswer: "ukọlọ" });
    const plan = planDraftRestore(old, coldPartOf(full({ coldLocked: true })));
    expect(plan).toEqual({
      kind: "full",
      draft: {
        ...old,
        coldAnswer: "Ùkọ́lọ̀",
        englishGloss: "work",
        coldLocked: true,
        step: "pairwise",
      },
    });
  });

  it("a lock is never undone by an unlocked cold part", () => {
    const locked = full();
    const plan = planDraftRestore(
      locked,
      coldPartOf({ coldAnswer: "edited after seeing outputs", coldLocked: false }),
    );
    expect(plan).toEqual({ kind: "full", draft: locked });
  });
});
