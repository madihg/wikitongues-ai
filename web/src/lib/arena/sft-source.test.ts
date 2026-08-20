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
});
