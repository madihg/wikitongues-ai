import { describe, it, expect } from "vitest";
import type { EditItem } from "./answer-edit";
import {
  buildRequests,
  choiceLine,
  clipsLine,
  emptiedRequired,
  firstVersionLine,
  initialValues,
  itemKey,
} from "./answer-editor-values";

const cold: EditItem = {
  type: "cold",
  id: "c1",
  createdAt: "2026-10-12T08:00:00.000Z",
  answerText: "alpha beta",
  englishGloss: null,
  englishTranslation: null,
  dialect: null,
  instructionIg: null,
  provenance: "speaker_authored_sourcefree",
  needsFix: true,
  firstVersion: null,
  clips: [],
};
const pairwise: EditItem = {
  type: "pairwise",
  id: "p1",
  createdAt: "2026-10-12T08:01:00.000Z",
  winner: "b",
  explanation: "B reads better.",
};
const edit: EditItem = {
  type: "edit",
  id: "e1",
  createdAt: "2026-10-12T08:02:00.000Z",
  onOutput: "B",
  originalText: "one two three",
  correctedText: "one TWO three",
  rationale: "Short.",
  segments: [
    {
      start: 4,
      end: 7,
      original: "two",
      replacement: "TWO",
      reason: "wrong word",
    },
  ],
  needsFix: true,
};
const items = [cold, pairwise, edit];

function changed(mutate: (v: ReturnType<typeof initialValues>) => void) {
  const start = initialValues(items);
  const now = structuredClone(start);
  mutate(now);
  return buildRequests(items, start, now);
}

describe("what one press of Save changes sends", () => {
  it("nothing when nothing changed", () => {
    expect(changed(() => {})).toEqual([]);
  });

  it("only the rows and the fields that changed", () => {
    const reqs = changed((v) => {
      v[itemKey(cold)].fields.englishGloss = "It says alpha, then beta.";
      v[itemKey(pairwise)].fields.explanation = "B keeps the respect form.";
    });
    expect(reqs).toEqual([
      {
        type: "cold",
        id: "c1",
        body: { englishGloss: "It says alpha, then beta." },
      },
      {
        type: "pairwise",
        id: "p1",
        body: { explanation: "B keeps the respect form." },
      },
    ]);
  });

  it("the short English translation is sent when it changes, and only then", () => {
    expect(initialValues([cold])[itemKey(cold)].fields.englishTranslation).toBe(
      "",
    );
    const reqs = changed((v) => {
      v[itemKey(cold)].fields.englishTranslation = "Good morning, elder.";
    });
    expect(reqs).toEqual([
      {
        type: "cold",
        id: "c1",
        body: { englishTranslation: "Good morning, elder." },
      },
    ]);
  });

  it("outer spaces and Unicode form alone are not a change", () => {
    const reqs = changed((v) => {
      v[itemKey(cold)].fields.answerText = "  alpha beta ";
      v[itemKey(pairwise)].fields.explanation = "B reads better.".normalize(
        "NFD",
      );
    });
    expect(reqs).toEqual([]);
  });

  it("never names the choice", () => {
    const reqs = changed((v) => {
      v[itemKey(pairwise)].fields.explanation = "A new why.";
    });
    expect(Object.keys(reqs[0].body)).toEqual(["explanation"]);
  });

  it("a reworded correction sends the text and its spans, reasons kept", () => {
    const reqs = changed((v) => {
      v[itemKey(edit)].fields.correctedText = "one TWO three four";
    });
    expect(reqs).toHaveLength(1);
    expect(reqs[0].body.correctedText).toBe("one TWO three four");
    const segs = reqs[0].body.segments as {
      original: string;
      reason?: string;
    }[];
    expect(segs.map((s) => s.original)).toEqual(["two", ""]);
    expect(segs[0].reason).toBe("wrong word");
  });

  it("a fuller reason on one change sends the spans alone", () => {
    const reqs = changed((v) => {
      const key = Object.keys(v[itemKey(edit)].reasons ?? {})[0];
      (v[itemKey(edit)].reasons ?? {})[key] = {
        tags: [],
        text: "The second word is a name here.",
      };
    });
    expect(Object.keys(reqs[0].body)).toEqual(["segments"]);
  });

  it("says which required boxes were emptied, and lets an old empty reason be", () => {
    const start = initialValues(items);
    const now = structuredClone(start);
    now[itemKey(cold)].fields.answerText = "  ";
    now[itemKey(edit)].fields.rationale = "";
    expect(emptiedRequired(items, start, now)).toEqual([
      "cold:c1.answerText",
      "edit:e1.rationale",
    ]);
    // an old correction with no reason does not block the rest of the episode
    const old = [{ ...edit, rationale: null } as EditItem, cold];
    const s0 = initialValues(old);
    expect(emptiedRequired(old, s0, structuredClone(s0))).toEqual([]);
  });
});

describe("the drawer's fixed lines", () => {
  it("the choice line, for text and for Listen", () => {
    expect(choiceLine("pairwise", "b")).toBe(
      "You picked Output B. This cannot be changed.",
    );
    expect(choiceLine("pairwise", "tie")).toBe(
      "You picked Tie - both adequate. This cannot be changed.",
    );
    expect(choiceLine("pairwise", "both_inadequate")).toBe(
      "You picked Both inadequate. This cannot be changed.",
    );
    expect(choiceLine("listen", "both_unusable")).toBe(
      "You picked Both unusable. This cannot be changed.",
    );
  });

  it("the first version line", () => {
    expect(firstVersionLine("2026-10-12T08:00:00.000Z")).toBe(
      "First version, saved 12 Oct",
    );
  });

  it("the clips line shows the newest clip of each language", () => {
    expect(clipsLine([])).toBeNull();
    expect(
      clipsLine([
        { language: "igala", durationMs: 3000 },
        { language: "igala", durationMs: 6100 },
        { language: "english", durationMs: 4000 },
      ]),
    ).toBe("Clips: Igala 6.1 s, English 4.0 s");
    expect(clipsLine([{ language: "igala", durationMs: 2500 }])).toBe(
      "Clips: Igala 2.5 s",
    );
  });
});
