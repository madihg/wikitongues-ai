import { describe, it, expect } from "vitest";
import {
  lintDrafts,
  renderedRowChars,
  V4_5_GRAMMAR_ENTRIES,
} from "../../../prisma/seed-rag-v4-5-grammar";
import {
  GRAMMAR_CHUNK_TYPE_V4_5,
  GRAMMAR_NOTE_STATUS,
  MAX_GRAMMAR_CHARS,
} from "./grammar-block";
import { containsWholeWord } from "@/lib/eval/leak-guard";
import { fullFold } from "@/lib/eval/normalize";

/**
 * The v4.5 grammar rows, checked without a database: the seed's own draft
 * lint passes; every row is scoped to the v4.5 chunkType, so no other label
 * can read it; the grading contract holds (two classes served, one class a
 * note); every row names the write-up and its grade; the gold words the
 * Scope-A gate bracketed before (child, pot) are not spelled; and the rows
 * say what the review found the evidence says. The real Scope-A gate runs
 * inside the seed and in scripts/static-leak-check-v4-5.ts.
 */
describe("v4.5 grammar rows", () => {
  const served = V4_5_GRAMMAR_ENTRIES.filter(
    (e) => e.verificationStatus !== GRAMMAR_NOTE_STATUS,
  );
  const notes = V4_5_GRAMMAR_ENTRIES.filter(
    (e) => e.verificationStatus === GRAMMAR_NOTE_STATUS,
  );
  const byTopic = (needle: string) =>
    V4_5_GRAMMAR_ENTRIES.find((e) => e.topic.includes(needle))!;
  const linkers = byTopic("every ki needs a job");
  const concord = byTopic("do not conjugate");
  const tone = byTopic("only when the question asks for tone");

  it("passes the seed's draft lint", () => {
    expect(lintDrafts(V4_5_GRAMMAR_ENTRIES)).toEqual([]);
  });

  it("every row is chunkType grammar_rule_v4_5, never grammar_rule, so only rag-v4-5 reads it", () => {
    expect(GRAMMAR_CHUNK_TYPE_V4_5).toBe("grammar_rule_v4_5");
    for (const e of V4_5_GRAMMAR_ENTRIES) {
      expect(e.chunkType).toBe(GRAMMAR_CHUNK_TYPE_V4_5);
    }
  });

  it("seeds three served rows and six notes, topics unique", () => {
    expect(served).toHaveLength(3);
    expect(notes).toHaveLength(6);
    expect(new Set(V4_5_GRAMMAR_ENTRIES.map((e) => e.topic)).size).toBe(
      V4_5_GRAMMAR_ENTRIES.length,
    );
  });

  it("served rows carry the v4.3 statuses for two evidence classes", () => {
    for (const e of served) {
      expect(e.source).toMatch(/Evidence grade B/);
    }
    expect(linkers.verificationStatus).toBe("community_verified");
    expect(concord.verificationStatus).toBe("external_sourced");
    expect(tone.verificationStatus).toBe("community_verified");
  });

  it("each served row fits beside another under the block cap (at most 1,400 rendered chars)", () => {
    for (const e of served) {
      expect(renderedRowChars(e)).toBeLessThanOrEqual(1400);
    }
    expect(2 * 1400).toBeLessThan(MAX_GRAMMAR_CHARS);
  });

  it("linkers row: every job, lẹ optional, kakini after saying, no toned kí taught", () => {
    for (const s of [
      "tọdu (because)",
      "chẹñwu (if)",
      "ku also writes ki + u",
      "kakini or ka ki ni, never dropped",
      "lẹ may close the clause",
      "A ki with none of these jobs is wrong",
    ]) {
      expect(linkers.content).toContain(s);
    }
    expect(`${linkers.topic}\n${linkers.content}`).not.toContain("kí");
  });

  it("concord row: tẹ is keep, gwugwu is sit, none changes for person", () => {
    expect(concord.content).toContain("tẹ / jọ = keep, set down");
    expect(concord.content).toContain("gwugwu / jọ = sit, one or several");
    expect(concord.content).toContain("never a change for person");
    expect(concord.content).not.toMatch(/tẹ[^;]*sit/);
  });

  it("tone row applies only when tone is asked for, and writes no standalone á", () => {
    expect(tone.content.startsWith("Use this only when a question asks for tone marks.")).toBe(true);
    expect(tone.content).toContain("Without a request for tone, write ki unmarked.");
    for (const e of V4_5_GRAMMAR_ENTRIES) {
      expect(containsWholeWord(`${e.topic}\n${e.content}`, "á")).toBe(false);
    }
  });

  it("jọ/jọ̀ is a note, not a served row (the Bible marks no tone)", () => {
    const jo = byTopic("jọ̀ (rejoice");
    expect(jo.verificationStatus).toBe(GRAMMAR_NOTE_STATUS);
    for (const e of served) expect(`${e.topic}\n${e.content}`).not.toContain("jọ̀");
  });

  it("every row names the write-up, its authors, its date and an evidence grade", () => {
    for (const e of V4_5_GRAMMAR_ENTRIES) {
      expect(e.source).toContain("Ejeba, S. and Wiernik, L.");
      expect(e.source).toContain("2026-09-25");
      expect(e.source).toContain("Igala grammar writeup");
      expect(e.source).toMatch(/grade [ABC]/);
    }
  });

  it("notes say they are notes", () => {
    for (const e of notes) expect(e.content.startsWith("Note only")).toBe(true);
  });

  it("does not spell the gold words the gate bracketed before (child, pot)", () => {
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
      "gwugwu / jọ",
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
      expect(text).not.toContain("—");
      expect(text).not.toContain("–");
    }
  });
});
