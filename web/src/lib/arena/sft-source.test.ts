import { describe, it, expect } from "vitest";
import {
  coldAnswersToSftRows,
  editsToSftRows,
  type ColdAnswerInput,
  type EditInput,
} from "./sft-source";
import { buildSftExamples } from "./training-export";

describe("coldAnswersToSftRows", () => {
  const base: ColdAnswerInput = {
    promptId: "p1",
    promptText: "Write the Igala word for 'water'.",
    answerText: "ọ̀mì",
    bucket: "orthography",
    promptBucket: "orthography",
    isHoldout: false,
    verificationStatus: "single_annotator",
    consentTraining: true,
    isDemo: false,
    provenance: "speaker_authored_sourcefree",
  };

  it("maps answerText to the completion (pure Igala target)", () => {
    const out = coldAnswersToSftRows([base]);
    expect(out).toHaveLength(1);
    expect(out[0].correctedText).toBe("ọ̀mì");
    expect(out[0].promptText).toBe(base.promptText);
    expect(out[0].isHoldout).toBe(false);
  });

  it("maps source-free rows to provenance 'cold_sourcefree'", () => {
    expect(coldAnswersToSftRows([base])[0].provenance).toBe("cold_sourcefree");
    // Unknown/legacy provenance strings default to sourcefree too - only the
    // salvage marker downgrades a row.
    expect(
      coldAnswersToSftRows([{ ...base, provenance: null }])[0].provenance,
    ).toBe("cold_sourcefree");
  });

  it("maps salvage rows (authored post-exposure) to provenance 'cold_salvage'", () => {
    const out = coldAnswersToSftRows([
      { ...base, provenance: "corrected_from_inadequate" },
    ]);
    expect(out[0].provenance).toBe("cold_salvage");
  });

  it("NEVER carries English-gloss/metadata into the target", () => {
    // The input type has no gloss field; the completion must be exactly answerText.
    const withGlossLike = { ...base, answerText: "ọ̀mì" };
    const out = coldAnswersToSftRows([withGlossLike]);
    expect(out[0].correctedText).toBe("ọ̀mì");
    expect(out[0].correctedText).not.toMatch(/water|means|english/i);
  });

  it("drops demo rows", () => {
    expect(coldAnswersToSftRows([{ ...base, isDemo: true }])).toHaveLength(0);
  });

  it("drops rows without training consent", () => {
    expect(
      coldAnswersToSftRows([{ ...base, consentTraining: false }]),
    ).toHaveLength(0);
  });

  it("drops empty answers", () => {
    expect(coldAnswersToSftRows([{ ...base, answerText: "   " }])).toHaveLength(
      0,
    );
  });

  it("falls back to the prompt bucket when the row bucket is null", () => {
    const out = coldAnswersToSftRows([{ ...base, bucket: null }]);
    expect(out[0].bucket).toBe("orthography");
  });

  it("held-out cold gold is dropped once passed through buildSftExamples", () => {
    const rows = coldAnswersToSftRows([{ ...base, isHoldout: true }]);
    expect(rows).toHaveLength(1); // mapper carries the flag
    expect(buildSftExamples(rows)).toHaveLength(0); // builder enforces the guard
  });
});

describe("editsToSftRows", () => {
  const base: EditInput = {
    promptId: "p1",
    promptText: "How do you say 'welcome'?",
    correctedText: "corrected Igala",
    bucket: "lexicon_disambig",
    promptBucket: "lexicon_disambig",
    isHoldout: false,
    verificationStatus: "single_annotator",
    consentTraining: true,
    isDemo: false,
  };

  it("maps correctedText to the completion (rationale dropped)", () => {
    const out = editsToSftRows([base]);
    expect(out).toHaveLength(1);
    expect(out[0].correctedText).toBe("corrected Igala");
  });

  it("drops demo and non-consented edits", () => {
    expect(editsToSftRows([{ ...base, isDemo: true }])).toHaveLength(0);
    expect(editsToSftRows([{ ...base, consentTraining: false }])).toHaveLength(
      0,
    );
  });

  it("stamps every edit row with provenance 'edit'", () => {
    expect(editsToSftRows([base])[0].provenance).toBe("edit");
  });

  it("edit rows are EXCLUDED from a default (cold-only) export", () => {
    const rows = editsToSftRows([base]);
    expect(rows).toHaveLength(1); // the loader carries them
    expect(buildSftExamples(rows)).toHaveLength(0); // the builder gates them
  });

  // ─── the editing ground: segments and new provenance never change the SFT
  //     contract (guard inventory 2 and 4, tasks/editing-ground-spec.md) ────

  it("a segment-bearing salvage_both_inadequate edit still emits provenance 'edit' with ONLY correctedText as the target", () => {
    // The DB row now carries `segments` (spans + reasons) and the finer
    // provenance value; the mapper's input type deliberately has neither
    // field, so they CANNOT leak into a completion - the same structural
    // guarantee that keeps rationale/gloss out. The cast mimics a caller
    // passing the raw enriched row.
    const enriched = {
      ...base,
      correctedText: "Agba ọjọ",
      provenance: "salvage_both_inadequate",
      segments: {
        v: 1,
        segments: [
          {
            start: 0,
            end: 10,
            original: "Àgbá Ọ́jọ́",
            replacement: "Agba ọjọ",
            reason: "the team writes it without the marks",
            reasonTags: ["tone_marks", "unsure"],
          },
        ],
      },
    } as EditInput;
    const out = editsToSftRows([enriched]);
    expect(out).toHaveLength(1);
    expect(out[0].provenance).toBe("edit"); // never the finer DB value
    expect(out[0].correctedText).toBe("Agba ọjọ");
    // Nothing segment- or reason-shaped survives into the source row.
    expect(JSON.stringify(out[0])).not.toMatch(
      /reasonTags|replacement|without the marks/,
    );
  });

  it("buildSftExamples default (includeEdits unset) emits zero 'edit' rows even from segment-bearing edits", () => {
    const enriched = {
      ...base,
      provenance: "salvage_both_inadequate",
      segments: { v: 1, segments: [] },
    } as EditInput;
    const rows = editsToSftRows([enriched, base]);
    expect(rows).toHaveLength(2);
    expect(buildSftExamples(rows)).toHaveLength(0); // FALSE default locked
  });
});
