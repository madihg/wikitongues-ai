import { describe, it, expect } from "vitest";
import {
  buildDpoExamples,
  buildSftExamples,
  toJsonl,
  type DpoSourceRow,
  type SftSourceRow,
} from "./training-export";

describe("buildDpoExamples", () => {
  const base: DpoSourceRow = {
    promptId: "p1",
    promptText: "Greet an elder respectfully in Igala.",
    chosenText: "ÒÓ chosen",
    rejectedText: "bad rejected",
    bucket: "register_honorifics",
    isHoldout: false,
  };

  it("emits a chosen/rejected pair for a normal row", () => {
    const out = buildDpoExamples([base]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      prompt: base.promptText,
      chosen: base.chosenText,
      rejected: base.rejectedText,
      bucket: "register_honorifics",
    });
  });

  it("NEVER exports held-out prompts (contamination guard)", () => {
    const out = buildDpoExamples([{ ...base, isHoldout: true }]);
    expect(out).toHaveLength(0);
  });

  it("drops degenerate pairs where chosen == rejected", () => {
    const out = buildDpoExamples([{ ...base, rejectedText: base.chosenText }]);
    expect(out).toHaveLength(0);
  });

  it("respects a bucket filter", () => {
    const rows = [
      base,
      { ...base, promptId: "p2", bucket: "orthography" as const },
    ];
    const out = buildDpoExamples(rows, { buckets: ["orthography"] });
    expect(out).toHaveLength(1);
    expect(out[0].bucket).toBe("orthography");
  });
});

describe("buildSftExamples", () => {
  const base: SftSourceRow = {
    promptId: "p1",
    promptText: "How do you say 'welcome' in Igala?",
    correctedText: "corrected Igala welcome",
    bucket: "lexicon_disambig",
    isHoldout: false,
    verificationStatus: "multi_annotator_verified",
  };

  it("emits a chat-format SFT example", () => {
    const out = buildSftExamples([base]);
    expect(out).toHaveLength(1);
    expect(out[0].messages[0]).toEqual({
      role: "user",
      content: base.promptText,
    });
    expect(out[0].messages[1]).toEqual({
      role: "assistant",
      content: base.correctedText,
    });
  });

  it("NEVER exports held-out prompts (contamination guard)", () => {
    const out = buildSftExamples([{ ...base, isHoldout: true }]);
    expect(out).toHaveLength(0);
  });

  it("filters out edits below the minimum verification status", () => {
    const rows: SftSourceRow[] = [
      base,
      { ...base, promptId: "p2", verificationStatus: "single_annotator" },
    ];
    const out = buildSftExamples(rows, {
      minVerification: "multi_annotator_verified",
    });
    expect(out).toHaveLength(1);
  });
});

describe("toJsonl", () => {
  it("serializes one JSON object per line", () => {
    const jsonl = toJsonl([{ a: 1 }, { b: 2 }]);
    expect(jsonl.split("\n")).toHaveLength(2);
    expect(JSON.parse(jsonl.split("\n")[0])).toEqual({ a: 1 });
  });
});
