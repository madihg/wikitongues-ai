import { describe, expect, it } from "vitest";
import { latestPerPrompt, type WaitingAnswer } from "./record-queue";

const at = (iso: string) => new Date(iso);
const answer = (over: Partial<WaitingAnswer>): WaitingAnswer => ({
  id: "a",
  promptId: "p1",
  answerText: "x",
  englishGloss: null,
  englishTranslation: null,
  dialect: null,
  createdAt: at("2026-08-03T19:18:23.856Z"),
  provenance: "speaker_authored_sourcefree",
  prompt: { id: "p1", promptId: "ig_test_001", text: "t", bucket: "grammar_tone" },
  ...over,
});

/**
 * Found Nov 17 2026: Record showed Agnes a sentence that answered another
 * question. Her own answer and a fix saved in the same instant were both on
 * the prompt, the fix carried the previous prompt's text, and the old rule
 * ("the row that comes later in the list") picked the fix.
 */
describe("the answer a speaker reads aloud", () => {
  it("saved in the same instant: the speaker's own answer, in either order", () => {
    const own = answer({ id: "own", answerText: "about this prompt" });
    const fix = answer({
      id: "fix",
      answerText: "about the previous prompt",
      provenance: "corrected_from_inadequate",
    });
    expect(latestPerPrompt([own, fix]).map((a) => a.id)).toEqual(["own"]);
    expect(latestPerPrompt([fix, own]).map((a) => a.id)).toEqual(["own"]);
  });

  it("a later answer still wins, whatever its kind", () => {
    const first = answer({ id: "first" });
    const later = answer({
      id: "later",
      provenance: "corrected_from_inadequate",
      createdAt: at("2026-08-04T10:00:00Z"),
    });
    expect(latestPerPrompt([first, later]).map((a) => a.id)).toEqual(["later"]);
    expect(latestPerPrompt([later, first]).map((a) => a.id)).toEqual(["later"]);
  });

  it("one row per prompt, oldest answer first", () => {
    const b = answer({ id: "b", promptId: "p2", createdAt: at("2026-08-01T00:00:00Z") });
    const a = answer({ id: "a" });
    expect(latestPerPrompt([a, b]).map((x) => x.id)).toEqual(["b", "a"]);
  });
});
