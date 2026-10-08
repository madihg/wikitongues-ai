import { describe, it, expect } from "vitest";
import {
  lintDrafts,
  renderedRowChars,
  V4_5_GRAMMAR_ENTRIES,
} from "../../../prisma/seed-rag-v4-5-grammar";
import {
  GRAMMAR_CHUNK_TYPE_V4_5,
  GRAMMAR_CHUNK_TYPE_V4_5_TONE,
  GRAMMAR_NOTE_STATUS,
  MAX_GRAMMAR_CHARS,
  V4_5_ONLY_CHUNK_TYPES,
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
  const tone = byTopic("for a question that asks for tone");

  it("passes the seed's draft lint", () => {
    expect(lintDrafts(V4_5_GRAMMAR_ENTRIES)).toEqual([]);
  });

  it("every row is a v4.5-only chunkType, never grammar_rule; the tone row has its own, gated to tone questions", () => {
    expect(GRAMMAR_CHUNK_TYPE_V4_5).toBe("grammar_rule_v4_5");
    expect(GRAMMAR_CHUNK_TYPE_V4_5_TONE).toBe("grammar_rule_v4_5_tone");
    for (const e of V4_5_GRAMMAR_ENTRIES) {
      expect(V4_5_ONLY_CHUNK_TYPES).toContain(e.chunkType);
    }
    expect(tone.chunkType).toBe(GRAMMAR_CHUNK_TYPE_V4_5_TONE);
    expect(
      V4_5_GRAMMAR_ENTRIES.filter((e) => e.chunkType === GRAMMAR_CHUNK_TYPE_V4_5_TONE),
    ).toEqual([tone]);
  });

  it("seeds three served rows and six notes, topics unique", () => {
    // Served = not a note; the tone row is served, but only on tone questions.
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

  it("linkers row: every job, lẹ optional, kaki for when, kakini after saying and knowing, ki + subject after want, no toned kí", () => {
    for (const s of [
      "tọdu (because)",
      "chẹñwu (if)",
      "Wherever ki stands, ku writes ki + u (I) and kẹ writes ki + ẹ (you)",
      "most speakers bless in one may-clause",
      "ka ki or kaki is when, while",
      "saying, telling or knowing the linker is kakini, ka ki ni or kaki, never dropped",
      "After 'want' it is ki fused with the next subject",
      "lẹ may close it",
      "A ki with none of these jobs is wrong",
    ]) {
      expect(linkers.content).toContain(s);
    }
    // want takes ki + subject, never kakini.
    expect(linkers.content).not.toContain("telling or wanting");
    expect(`${linkers.topic}\n${linkers.content}`).not.toContain("kí");
    expect(linkers.source).toContain("todu ku 202, todu ki 272, (i)chewñ ku 264, (i)chewñ ki 229");
    expect(linkers.source).not.toContain("704/753");
  });

  it("concord row: tẹ is keep; gwugwu is attested singular data, its plural jọ a single token", () => {
    expect(concord.content).toContain("tẹ / jọ = keep, set down");
    expect(concord.content).toContain("gwugwu (sit) is attested for one person; its plural jọ has a single gold token");
    expect(concord.content).toContain("never a change for person");
    expect(concord.content).not.toContain("gwugwu / jọ");
    expect(concord.topic).not.toContain("gwugwu");
  });

  it("tone row: only for tone questions, no kí for 'that', kakini kept; no row writes a standalone á", () => {
    expect(tone.content.startsWith("This row is served only when the question asks for tone.")).toBe(true);
    expect(tone.content).toContain("Without a request for tone, write ki unmarked.");
    expect(tone.content).toContain("kakini and ka ki ni keep their community spelling");
    expect(`${tone.topic}\n${tone.content}`).not.toContain("kí");
    expect(tone.content).not.toContain("that-clause");
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
      "kì",
      "jọ̀",
      "tinyo / rinyo",
      "tọ / nyu / ru",
      "gwugwu (sit)",
      "kaki",
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
