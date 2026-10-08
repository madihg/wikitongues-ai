import { describe, it, expect } from "vitest";
import { EvalBucket } from "@prisma/client";
import {
  V45_PROMPTS,
  V45_PROVENANCE,
  contentWords,
  jaccard,
} from "./prompt-bank-v45";
import { bucketScoring } from "./buckets";

/**
 * The v4.5 bank's invariants, checked without a database. The seed
 * (prisma/seed-prompt-bank-v45.ts) re-checks namespace, length, dashes, near-
 * duplicates against the live bank and Scope A against the frozen gold before
 * it writes; these tests pin what can be pinned offline, so a later edit to a
 * prompt cannot quietly break the bank's design.
 */

// Family sizes from the design spec (tasks/prompt-bank-v45-evidence-2026-10-08.md).
const FAMILY_COUNTS: Record<string, number> = {
  comp: 10, vari: 8, erel: 4, loan: 6, tone: 8, expd: 6, concd: 7, negq: 6,
  pron: 6, aspec: 5, formu: 10, regis: 6, money: 6, words: 7, locat: 4,
  dirct: 3, provb: 4, expos: 2,
};

// Igala letters and tone marks. A note shown to annotators (the factual
// buckets display expectedCulturalContext as a reference) must not hand them
// the forms we want them to produce, so notes are English only.
const IGALA_MARKS = /[ẹọñṇẸỌÑ̀́̂̄̌]/u;

describe("the v4.5 prompt bank", () => {
  it("has 108 prompts in the 18 families of the design, numbered without gaps", () => {
    expect(V45_PROMPTS).toHaveLength(108);
    const byFamily = new Map<string, string[]>();
    for (const p of V45_PROMPTS) {
      byFamily.set(p.family, [...(byFamily.get(p.family) ?? []), p.promptId]);
    }
    expect(Object.fromEntries([...byFamily].map(([k, v]) => [k, v.length]))).toEqual(
      FAMILY_COUNTS,
    );
    for (const [family, ids] of byFamily) {
      const expected = ids.map((_, i) => `ig_v45_${family}_${String(i + 1).padStart(3, "0")}`);
      expect([...ids].sort()).toEqual(expected);
    }
  });

  it("uses unique ids in the v45 namespace and valid buckets", () => {
    const ids = V45_PROMPTS.map((p) => p.promptId);
    expect(new Set(ids).size).toBe(ids.length);
    const buckets = new Set(Object.values(EvalBucket));
    for (const p of V45_PROMPTS) {
      expect(p.promptId).toMatch(/^ig_v45_[a-z]{3,6}_\d{3}$/);
      expect(buckets.has(p.bucket)).toBe(true);
      expect(["basic", "intermediate", "advanced"]).toContain(p.difficultyLevel);
    }
    expect(V45_PROVENANCE).toBe("claude_authored_v45_2026_10_08");
  });

  it("keeps every text 25 to 420 characters, with no dash, emoji or 'please'", () => {
    for (const p of V45_PROMPTS) {
      expect(p.text.length, p.promptId).toBeGreaterThanOrEqual(25);
      expect(p.text.length, p.promptId).toBeLessThanOrEqual(420);
      const all = `${p.text}\n${p.expectedCulturalContext ?? ""}\n${p.rationale}\n${p.targetRule}`;
      expect(all, p.promptId).not.toMatch(/[\u2014\u2013]/);
      expect(all, p.promptId).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(p.text.toLowerCase(), p.promptId).not.toMatch(/\bplease\b/);
    }
  });

  it("names a source for every prompt's Igala, and quotes Igala in few texts", () => {
    for (const p of V45_PROMPTS) {
      expect(p.igalaSources.length, p.promptId).toBeGreaterThan(0);
      expect(p.igalaSources.join(" ").toLowerCase(), p.promptId).not.toMatch(/frozen|holdout/);
    }
    const withIgala = V45_PROMPTS.filter((p) => IGALA_MARKS.test(p.text) || /\b\w'\w/.test(p.text));
    // The linter counted five (formu_007, erel_004, provb_004, expd_004,
    // expd_005); a new one must come with a source and a reason.
    expect(withIgala.length).toBeLessThanOrEqual(6);
  });

  it("shows annotators no Igala form and no arm: notes in factual buckets are English only", () => {
    // annotation-interface.tsx renders the note as "Reference - fact-check
    // against this" in factual buckets only; elsewhere it is stored metadata
    // (admin prompt list, exports) and may quote train-split speaker forms.
    for (const p of V45_PROMPTS) {
      const note = p.expectedCulturalContext ?? "";
      if (bucketScoring(p.bucket) === "factual") {
        expect(note, p.promptId).not.toMatch(IGALA_MARKS);
      }
      // No note names an arm or an annotator, in any bucket: either would
      // unblind the comparison or expose a speaker.
      expect(note, p.promptId).not.toMatch(/annotator_\d|annotators? \d|v4\.\d|rag-v|gemini|retrieval arm/i);
    }
  });

  it("has no near-duplicate pair inside the bank (Jaccard over content words below 0.55)", () => {
    const words = V45_PROMPTS.map((p) => contentWords(p.text));
    let max = 0;
    for (let i = 0; i < words.length; i++) {
      for (let j = i + 1; j < words.length; j++) {
        max = Math.max(max, jaccard(words[i], words[j]));
      }
    }
    expect(max).toBeLessThan(0.55);
  });

  it("tells the speaker no Igala form is correct: the prompts ask", () => {
    for (const p of V45_PROMPTS) {
      expect(p.text, p.promptId).not.toMatch(/\bthe (correct|right) (word|form) (is|for)\b/i);
      expect(p.text, p.promptId).not.toMatch(/\bthe igala word for [a-z ]+ is\b/i);
    }
  });
});
