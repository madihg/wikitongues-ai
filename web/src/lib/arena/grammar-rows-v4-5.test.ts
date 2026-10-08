import { describe, it, expect } from "vitest";
import {
  lintDrafts,
  V4_5_GRAMMAR_ENTRIES,
} from "../../../prisma/seed-rag-v4-5-grammar";
import { GRAMMAR_NOTE_STATUS } from "./grammar-block";
import { containsWholeWord } from "@/lib/eval/leak-guard";
import { fullFold } from "@/lib/eval/normalize";

/**
 * The v4.5 grammar rows, checked without a database: the seed's own draft
 * lint passes, the grading contract holds (two classes served, one class a
 * note), every row names the write-up and its grade, and the two gold words
 * the Scope-A gate bracketed before (child, pot) are schematized, never
 * spelled. The real Scope-A gate runs inside the seed and in
 * scripts/static-leak-check-v4-5.ts against the frozen protected set.
 */
describe("v4.5 grammar rows", () => {
  const served = V4_5_GRAMMAR_ENTRIES.filter(
    (e) => e.verificationStatus !== GRAMMAR_NOTE_STATUS,
  );
  const notes = V4_5_GRAMMAR_ENTRIES.filter(
    (e) => e.verificationStatus === GRAMMAR_NOTE_STATUS,
  );

  it("passes the seed's draft lint", () => {
    expect(lintDrafts(V4_5_GRAMMAR_ENTRIES)).toEqual([]);
  });

  it("seeds three served rows and five notes, all grammar_rule, topics unique", () => {
    expect(served).toHaveLength(3);
    expect(notes).toHaveLength(5);
    for (const e of V4_5_GRAMMAR_ENTRIES) expect(e.chunkType).toBe("grammar_rule");
    expect(new Set(V4_5_GRAMMAR_ENTRIES.map((e) => e.topic)).size).toBe(
      V4_5_GRAMMAR_ENTRIES.length,
    );
  });

  it("served rows carry the v4.3 statuses for two evidence classes", () => {
    for (const e of served) {
      expect(["external_sourced", "community_verified"]).toContain(
        e.verificationStatus,
      );
      expect(e.source).toMatch(/Evidence grade B/);
    }
    // The community-leg rows and the corpus-only row, by topic.
    const byTopic = (needle: string) =>
      served.find((e) => e.topic.includes(needle))!;
    expect(byTopic("'that' and 'who, which'").verificationStatus).toBe(
      "community_verified",
    );
    expect(byTopic("do not conjugate").verificationStatus).toBe(
      "external_sourced",
    );
    expect(byTopic("tone that changes the word").verificationStatus).toBe(
      "community_verified",
    );
  });

  it("every row names the write-up, its authors, its date and an evidence grade", () => {
    for (const e of V4_5_GRAMMAR_ENTRIES) {
      expect(e.source).toContain("Ejeba, S. and Wiernik, L.");
      expect(e.source).toContain("2026-09-25");
      expect(e.source).toContain("Igala grammar writeup");
      expect(e.source).toMatch(/grade [ABC]/);
    }
  });

  it("notes say they are notes, and name a single evidence class or a rule already served", () => {
    for (const e of notes) {
      expect(e.content.startsWith("Note only")).toBe(true);
    }
  });

  it("schematizes the gold words the gate bracketed before (child, pot) instead of spelling them", () => {
    for (const e of V4_5_GRAMMAR_ENTRIES) {
      const folded = fullFold(`${e.topic}\n${e.content}`);
      expect(containsWholeWord(folded, "oma")).toBe(false);
      expect(containsWholeWord(folded, "ucha")).toBe(false);
    }
  });

  it("carries the forms the prompt lines point at", () => {
    const all = V4_5_GRAMMAR_ENTRIES.map((e) => e.content).join("\n");
    for (const form of [
      "kakini",
      "ka ki ni",
      "kí",
      "kì",
      "jọ̀",
      "tinyo / rinyo",
      "tọ / nyu / ru",
      "Uñ",
      "kpali / kpari",
      "ukpakẹlẹ / ukpankẹrẹ",
      "kwa 'shout'",
      "general_idah",
    ]) {
      expect(all).toContain(form);
    }
  });

  it("obeys the house style: no em or en dashes anywhere in a row", () => {
    for (const e of V4_5_GRAMMAR_ENTRIES) {
      const text = `${e.topic}\n${e.content}\n${e.source}`;
      expect(text).not.toContain("\u2014");
      expect(text).not.toContain("\u2013");
    }
  });
});
