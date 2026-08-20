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
    provenance: "cold_sourcefree",
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

  // ─── provenance (pivot precondition 1) ────────────────────────────────────

  it("every emitted example carries its provenance flag", () => {
    const out = buildSftExamples([
      base,
      { ...base, promptId: "p2", provenance: "cold_salvage" },
    ]);
    expect(out.map((e) => e.provenance)).toEqual([
      "cold_sourcefree",
      "cold_salvage",
    ]);
  });

  it("EXCLUDES edit-provenance rows by default (cold-only export)", () => {
    const out = buildSftExamples([
      base,
      { ...base, promptId: "p2", provenance: "edit" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].provenance).toBe("cold_sourcefree");
  });

  it("admits edits only behind includeEdits, flagged as edits", () => {
    const out = buildSftExamples(
      [
        base,
        { ...base, promptId: "p2", provenance: "cold_salvage" },
        { ...base, promptId: "p3", provenance: "cold_sourcefree" },
        { ...base, promptId: "p4", provenance: "edit" },
      ],
      { includeEdits: true },
    );
    // 3 cold rows admit exactly 1 edit under the 30% default cap (1/4 = 25%).
    expect(out).toHaveLength(4);
    expect(out.filter((e) => e.provenance === "edit")).toHaveLength(1);
  });

  it("caps the edit share of an includeEdits export at maxEditShare (default 30%)", () => {
    const cold = Array.from({ length: 7 }, (_, i) => ({
      ...base,
      promptId: `cold_${i}`,
    }));
    const edits = Array.from({ length: 10 }, (_, i) => ({
      ...base,
      promptId: `edit_${i}`,
      provenance: "edit" as const,
    }));
    const out = buildSftExamples([...cold, ...edits], { includeEdits: true });
    const editCount = out.filter((e) => e.provenance === "edit").length;
    // 7 cold rows admit at most 3 edits (3/10 = 30%); 4 would be 4/11 > 30%.
    expect(editCount).toBe(3);
    expect(out.filter((e) => e.provenance !== "edit")).toHaveLength(7);
    expect(editCount / out.length).toBeLessThanOrEqual(0.3);
  });

  it("never drops cold rows to satisfy the cap", () => {
    const out = buildSftExamples(
      [{ ...base, promptId: "e1", provenance: "edit" }],
      { includeEdits: true },
    );
    // Zero cold rows -> the cap admits zero edits, not "all edits".
    expect(out).toHaveLength(0);
  });
});

describe("toJsonl", () => {
  it("serializes one JSON object per line", () => {
    const jsonl = toJsonl([{ a: 1 }, { b: 2 }]);
    expect(jsonl.split("\n")).toHaveLength(2);
    expect(JSON.parse(jsonl.split("\n")[0])).toEqual({ a: 1 });
  });
});
