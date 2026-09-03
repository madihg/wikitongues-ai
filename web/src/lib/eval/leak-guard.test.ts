import { describe, it, expect } from "vitest";
import {
  buildProtectedSet,
  containsWholeWord,
  checkStatic,
  filterAssembled,
  leakFreePrompts,
  formatLeakReport,
  renderLexPieceForGuard,
  renderEditPieceForGuard,
  MIN_PROTECTED_LENGTH,
} from "./leak-guard";

const golds = [
  { promptId: "ig_bank_orth_002", answerText: "Ọma" },
  { promptId: "ig_bank_orth_009", answerText: "Ọkọ" },
  { promptId: "ig_bank_gram_003", answerText: "Ómi" },
  // duplicate of the first, from a second annotator
  { promptId: "ig_bank_orth_002", answerText: "ọma" },
  // too short to protect without matching inside ordinary words
  { promptId: "ig_short_001", answerText: "ẹ" },
];

describe("buildProtectedSet", () => {
  it("folds, dedupes per prompt, and drops strings below the length floor", () => {
    const p = buildProtectedSet(golds);
    // Ọma and ọma fold to the same string for the same prompt -> one entry.
    expect(p.filter((x) => x.promptId === "ig_bank_orth_002")).toHaveLength(1);
    // The single-character answer is dropped.
    expect(p.some((x) => x.promptId === "ig_short_001")).toBe(false);
    expect(p.every((x) => x.full.length >= MIN_PROTECTED_LENGTH)).toBe(true);
    // Folding actually happened.
    expect(p.find((x) => x.promptId === "ig_bank_gram_003")?.full).toBe("omi");
  });
});

describe("containsWholeWord", () => {
  it("matches a standalone word", () => {
    expect(containsWholeWord("the word is omi today", "omi")).toBe(true);
  });

  it("does NOT match inside a longer word", () => {
    // This is the whole reason for word boundaries: naive substring matching
    // fires on 96/238 real golds against 95/238 word-boundary, and the extra
    // hit is spurious.
    expect(containsWholeWord("omido is a different word", "omi")).toBe(false);
    expect(containsWholeWord("this is anomi", "omi")).toBe(false);
  });

  it("matches next to punctuation and at string edges", () => {
    expect(containsWholeWord("omi", "omi")).toBe(true);
    expect(containsWholeWord("water: omi.", "omi")).toBe(true);
    expect(containsWholeWord("(omi)", "omi")).toBe(true);
    expect(containsWholeWord("omi - water", "omi")).toBe(true);
  });

  it("returns false for an empty needle rather than matching everything", () => {
    expect(containsWholeWord("anything at all", "")).toBe(false);
  });
});

describe("checkStatic", () => {
  const protectedSet = buildProtectedSet(golds);

  it("catches the anti-Yoruba say-instead trap", () => {
    // The real finding this encodes: five of the obvious Igala replacement
    // forms are themselves whole gold answers on frozen prompts. Shipping the
    // DO side statically hands the model those answers on every query.
    const report = checkStatic(
      [
        {
          where: "IGALA_LEXICAL_BLOCK",
          text: "Do not write omo. Write ọma instead.",
        },
      ],
      protectedSet,
    );
    expect(report.pass).toBe(false);
    expect(report.hitCount).toBeGreaterThan(0);
    expect(report.hits[0].promptId).toBe("ig_bank_orth_002");
  });

  it("passes the prohibition-only form of the same rule", () => {
    // The DON'T side is safe: Yoruba forms are not frozen golds.
    const report = checkStatic(
      [
        {
          where: "IGALA_LEXICAL_BLOCK",
          text: "Do not write omo, iya, or baba - these are Yoruba.",
        },
      ],
      protectedSet,
    );
    expect(report.pass).toBe(true);
    expect(report.hitCount).toBe(0);
  });

  it("catches a leak that only survives tone folding", () => {
    // Written with different tone marks, same word. fullFold strips all marks
    // so this is caught at tier full; the tone tier is the backstop for cases
    // where dot-below must be preserved to avoid false positives.
    const report = checkStatic(
      [{ where: "block", text: "the form Òmì appears here" }],
      protectedSet,
    );
    expect(report.pass).toBe(false);
  });

  it("does not fire on unrelated reference material", () => {
    const report = checkStatic(
      [
        {
          where: "IGALA_ORTHOGRAPHY_BLOCK",
          text: "Seven vowels: a e ẹ i o ọ u. Digraphs ch, gb, gw, kp, kw. Never write ṣ.",
        },
      ],
      protectedSet,
    );
    expect(report.pass).toBe(true);
  });
});

describe("filterAssembled", () => {
  const protectedSet = buildProtectedSet(golds);

  it("drops only the chunk carrying THIS prompt's own answer", () => {
    const { kept, report } = filterAssembled(
      "ig_bank_gram_003",
      [
        { where: "chunk:lexicon", text: "omi - water; ele - four" },
        {
          where: "chunk:grammar",
          text: "Igala marks tone with acute and grave",
        },
        { where: "chunk:other", text: "ọma - child" },
      ],
      protectedSet,
    );
    // The lexicon chunk leaked this prompt's own answer and is gone.
    expect(kept.map((k) => k.where)).toEqual(["chunk:grammar", "chunk:other"]);
    expect(report.pass).toBe(false);
    expect(report.hitCount).toBe(1);
  });

  it("does NOT drop a chunk containing a DIFFERENT prompt's answer", () => {
    // Treating every gold as protected for every prompt would forbid writing
    // any Igala reference material at all.
    const { kept, report } = filterAssembled(
      "ig_bank_gram_003",
      [{ where: "chunk:kinship", text: "ọma - child; ọkọ - husband" }],
      protectedSet,
    );
    expect(kept).toHaveLength(1);
    expect(report.pass).toBe(true);
  });

  it("keeps everything when nothing leaks", () => {
    const { kept, report } = filterAssembled(
      "ig_bank_orth_002",
      [{ where: "a", text: "tone is acute for high" }],
      protectedSet,
    );
    expect(kept).toHaveLength(1);
    expect(report.pass).toBe(true);
  });
});

describe("leakFreePrompts", () => {
  it("derives subset membership mechanically from the hits", () => {
    const all = ["p1", "p2", "p3", "p4"];
    const subset = leakFreePrompts(all, [
      { where: "x", promptId: "p2", tier: "full" },
      { where: "y", promptId: "p4", tier: "tone" },
    ]);
    expect(subset).toEqual(["p1", "p3"]);
  });
});

describe("renderLexPieceForGuard - finding 19", () => {
  it("builds the guard piece from the RENDERED (toOrthography) line, not the raw phonemic headword", () => {
    // ig_bank_lex_001's own gold is "Ẹga". The chikhapo lexicon stores this
    // headword in PHONEMIC notation, "ɛga" - a different base letter (ɛ vs
    // ẹ) that survives fullFold untouched, so a guard checking the raw
    // headword sees no match at all. toOrthography maps ɛ -> ẹ before the
    // guard ever runs, because that mapping is exactly what the model is
    // served (retrieval-v2.ts's renderDictionaryLine).
    const protectedSet = buildProtectedSet([
      { promptId: "ig_bank_lex_001", answerText: "Ẹga" },
    ]);
    const rendered = renderLexPieceForGuard("ɛga", "bird");
    expect(rendered).toBe("ẹga bird");

    const { report } = filterAssembled(
      "ig_bank_lex_001",
      [{ where: "lex:1", text: rendered }],
      protectedSet,
    );
    expect(report.pass).toBe(false);

    // MUTATION CHECK: reverting to the raw headword (the bug finding 19
    // describes) clears the guard on the exact same gold - proving the fix
    // is load-bearing, not cosmetic.
    const rawPiece = `ɛga bird`;
    const { report: rawReport } = filterAssembled(
      "ig_bank_lex_001",
      [{ where: "lex:1", text: rawPiece }],
      protectedSet,
    );
    expect(rawReport.pass).toBe(true);
  });
});

describe("renderEditPieceForGuard - finding 18", () => {
  it("matches retrieval-v4.ts's own served correction text exactly", () => {
    expect(renderEditPieceForGuard("wrong", "Ọmi", "spelling fix")).toBe(
      "wrong\nỌmi\nspelling fix",
    );
    // No reason: retrieval-v4.ts still serves original + corrected + an
    // empty Reason line (correctionReason returns null, joined as "").
    expect(renderEditPieceForGuard("wrong", "Ọmi", null)).toBe("wrong\nỌmi\n");
  });

  it("catches a correction whose SERVED text repeats the prompt's own gold", () => {
    // Before finding 18, edit: ids were dropped by the splitter entirely -
    // this piece would never have reached the guard at all.
    const protectedSet = buildProtectedSet([
      { promptId: "ig_bank_orth_009", answerText: "Ọkọ" },
    ]);
    const piece = renderEditPieceForGuard(
      "wrong word",
      "the correct word is Ọkọ",
      null,
    );
    const { report } = filterAssembled(
      "ig_bank_orth_009",
      [{ where: "edit:e1", text: piece }],
      protectedSet,
    );
    expect(report.pass).toBe(false);
  });
});

describe("formatLeakReport - information hygiene", () => {
  it("never prints the leaked string or the gold answer", () => {
    const protectedSet = buildProtectedSet(golds);
    const report = checkStatic(
      [{ where: "IGALA_LEXICAL_BLOCK", text: "Write ọma instead." }],
      protectedSet,
    );
    const text = formatLeakReport(report);
    // A guard that says "the string ọma leaked" has handed ọma to the person
    // writing the prompt and has become the leak it was meant to prevent.
    expect(text).not.toMatch(/ọma|oma/i);
    // It still has to be actionable.
    expect(text).toContain("FAIL");
    expect(text).toContain("IGALA_LEXICAL_BLOCK");
    expect(text).toContain("1");
  });

  it("reports a clean pass plainly", () => {
    expect(formatLeakReport({ pass: true, hitCount: 0, hits: [] })).toContain(
      "PASS",
    );
  });
});
