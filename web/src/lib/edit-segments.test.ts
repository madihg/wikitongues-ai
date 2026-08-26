import { describe, it, expect } from "vitest";
import {
  applySegments,
  attachReasons,
  diffToSegments,
  editSaveLabel,
  nfc,
  reasonCoverage,
  reasonKeyFor,
  sanitizeSegments,
  segmentsEnvelope,
  type EditSegment,
} from "./edit-segments";

// ─── Fixtures: REAL correction pairs from the live DB (fixed, never random -
// pairing.test.ts convention). Sources cited per row. ────────────────────────

/** OutputEdit on ig_bank_auth_012 (Charity Ogali, 2026-08-25): joint two-word
 *  respell, diacritic-heavy. */
const AUTH_012 = { original: "Àgbá Ọ́jọ́", corrected: "Agba ọjọ" };

/** OutputEdit on ig_bank_auth_001 (Charity Ogali, 2026-08-25): single-token
 *  fix with an elision apostrophe. */
const AUTH_001 = {
  original: "Ọjọ ki chẹnyọ ñwu wẹ",
  corrected: "Ọjọ ki d'ẹnyọ ñwu wẹ",
};

/** OutputEdit on ig_bank_reg_033 (Agnes, 2026-08-07): full-paragraph rewrite -
 *  nothing survives the diff, so it must collapse to ONE segment. */
const REG_033 = {
  original:
    "Ọjọ̀mọ̀mọ̀ àgbà, ẹ̀kpẹ̀lẹ̀ ọlụ̀mẹ́, ẹ nẹ́ ọ̀bẹ̀rɛ̀ kẹ́ àchá kẹ́ àbá, mị̀ nà íjì ínyí mẹrẹ̀ wá, álé ẹ̀kpẹ̀lẹ̀ mị̀ wá nẹ̀ kẹ́ àbá mị̀ bọ̀. Ẹ jọ̀ọ́, ẹ jé k'á mụọ̀nù k'á bọ̀ n'ọ́kán mị̀, k'á mụọ̀nù k'á sọọ̀nù k'á yẹnù n'ámá. Ẹ kpànyá mị̀, mị̀ kọ́ bọ̀ yẹnù n'ámá, álé ẹ̀kpẹ̀lẹ̀ k'á bọ̀ mị̀ n'ẹ́kpẹ̀lẹ̀ ọlụ̀mẹ́. Ọjọ̀mọ̀mọ̀ àgbà, ẹ̀kpẹ̀lẹ̀ ọlụ̀mẹ́, mị̀ gbàdá n'ámá.",
  corrected:
    "Agba abọ ọgijọ, na tẹne gbọkọ bumẹ ka ki ni ujẹju dẹ weeki eyi ka ñya tu'nwu ọjọ aladi ọgọ mẹlẹ anẹ",
};

/** Multi-line synthetic pair: newlines must survive the round trip. */
const MULTILINE = {
  original: "Ọjọ ki chẹnyọ\nñwu wẹ dẹẹ",
  corrected: "Ọjọ ki d'ẹnyọ\nñwu wẹ",
};

const ROUND_TRIP_PAIRS = [
  AUTH_012,
  AUTH_001,
  REG_033,
  MULTILINE,
  // pure insertion
  { original: "Agba ọjọ", corrected: "Agba ọjọ dẹẹ" },
  // pure deletion (the "unnecessary ki" class of fix from Agnes's live review)
  { original: "Ọjọ ki d'ẹnyọ ñwu wẹ", corrected: "Ọjọ d'ẹnyọ ñwu wẹ" },
];

/** True at a whitespace boundary or string edge of s. */
function isTokenBoundary(s: string, i: number): boolean {
  if (i === 0 || i === s.length) return true;
  return /\s/.test(s[i - 1]) || /\s/.test(s[i]);
}

describe("diffToSegments / applySegments - the reconstruction proof", () => {
  it("round-trips every real corpus pair: applySegments(nfc(o), diffToSegments(o, c)) === nfc(c)", () => {
    for (const { original, corrected } of ROUND_TRIP_PAIRS) {
      const segments = diffToSegments(original, corrected);
      expect(applySegments(nfc(original), segments)).toBe(nfc(corrected));
    }
  });

  it("the full-paragraph rewrite (ig_bank_reg_033) collapses to ONE segment", () => {
    const segments = diffToSegments(REG_033.original, REG_033.corrected);
    expect(segments.length).toBe(1);
    expect(applySegments(nfc(REG_033.original), segments)).toBe(
      nfc(REG_033.corrected),
    );
  });

  it("identical texts produce no segments", () => {
    expect(diffToSegments(AUTH_001.original, AUTH_001.original)).toEqual([]);
  });

  it("pure insertion yields start === end with empty original", () => {
    const segs = diffToSegments("Agba ọjọ", "Agba ọjọ dẹẹ");
    expect(segs.length).toBe(1);
    expect(segs[0].original).toBe("");
    expect(segs[0].start).toBe(segs[0].end);
    expect(segs[0].replacement).toContain("dẹẹ");
  });

  it("pure deletion yields an empty replacement", () => {
    const segs = diffToSegments("Ọjọ ki d'ẹnyọ ñwu wẹ", "Ọjọ d'ẹnyọ ñwu wẹ");
    expect(segs.length).toBe(1);
    expect(segs[0].replacement).toBe("");
    expect(segs[0].original).toContain("ki");
  });

  it("NFD vs NFC of the same visible string is NOT a diff (phantom-diff kill)", () => {
    for (const { original } of ROUND_TRIP_PAIRS) {
      const nfd = original.normalize("NFD");
      expect(nfd === original || nfd.length > original.length).toBe(true);
      expect(diffToSegments(nfd, original)).toEqual([]);
      expect(diffToSegments(original, nfd)).toEqual([]);
    }
  });

  it("grapheme integrity: no segment begins with a dangling combining mark, and offsets sit on whitespace boundaries", () => {
    for (const { original, corrected } of ROUND_TRIP_PAIRS) {
      const o = nfc(original);
      for (const seg of diffToSegments(original, corrected)) {
        if (seg.original) expect(seg.original).not.toMatch(/^\p{M}/u);
        if (seg.replacement) expect(seg.replacement).not.toMatch(/^\p{M}/u);
        expect(isTokenBoundary(o, seg.start)).toBe(true);
        expect(isTokenBoundary(o, seg.end)).toBe(true);
      }
    }
  });

  it("segment.original is always the exact NFC slice (the validation anchor)", () => {
    for (const { original, corrected } of ROUND_TRIP_PAIRS) {
      const o = nfc(original);
      for (const seg of diffToSegments(original, corrected)) {
        expect(o.slice(seg.start, seg.end)).toBe(seg.original);
      }
    }
  });

  it("applySegments throws on overlapping, descending, or out-of-bounds spans", () => {
    const o = "abc def ghi";
    const seg = (start: number, end: number): EditSegment => ({
      start,
      end,
      original: o.slice(Math.max(0, start), Math.max(0, end)),
      replacement: "x",
    });
    expect(() => applySegments(o, [seg(0, 5), seg(3, 7)])).toThrow(); // overlap
    expect(() => applySegments(o, [seg(4, 7), seg(0, 3)])).toThrow(); // descending
    expect(() =>
      applySegments(o, [{ start: 4, end: 99, original: "", replacement: "x" }]),
    ).toThrow(); // out of bounds
  });
});

describe("sanitizeSegments", () => {
  const o = nfc(AUTH_012.original); // "Àgbá Ọ́jọ́"
  const c = nfc(AUTH_012.corrected); // "Agba ọjọ"
  const good = () => diffToSegments(AUTH_012.original, AUTH_012.corrected);

  it("server-derivation parity: what the server derives, the server accepts", () => {
    for (const pair of ROUND_TRIP_PAIRS) {
      const derived = diffToSegments(pair.original, pair.corrected);
      expect(
        sanitizeSegments(derived, nfc(pair.original), nfc(pair.corrected)),
      ).not.toBeNull();
    }
  });

  it("rejects overlapping spans", () => {
    const segs = [
      { start: 0, end: 5, original: o.slice(0, 5), replacement: "x" },
      { start: 3, end: 6, original: o.slice(3, 6), replacement: "y" },
    ];
    expect(sanitizeSegments(segs, o, c)).toBeNull();
  });

  it("rejects descending order", () => {
    const segs = [
      { start: 5, end: 6, original: o.slice(5, 6), replacement: "x" },
      { start: 0, end: 2, original: o.slice(0, 2), replacement: "y" },
    ];
    expect(sanitizeSegments(segs, o, c)).toBeNull();
  });

  it("rejects out-of-bounds spans", () => {
    const segs = [{ start: 0, end: 999, original: "zzz", replacement: "x" }];
    expect(sanitizeSegments(segs, o, c)).toBeNull();
  });

  it("rejects an original that does not match the NFC slice", () => {
    const segs = good().map((s) => ({ ...s, original: s.original + "!" }));
    expect(sanitizeSegments(segs, o, c)).toBeNull();
  });

  it("rejects segments whose reconstruction misses correctedText", () => {
    const segs = good().map((s) => ({ ...s, replacement: "wrong words" }));
    expect(sanitizeSegments(segs, o, c)).toBeNull();
  });

  it("drops unknown reasonTags, keeps known ones and the free-text reason", () => {
    const segs = good().map((s) => ({
      ...s,
      reason: "The team writes it without the marks.",
      reasonTags: ["tone_marks", "nonsense_tag", "unsure", 42],
    }));
    const out = sanitizeSegments(segs, o, c);
    expect(out).not.toBeNull();
    expect(out![0].reasonTags).toEqual(["tone_marks", "unsure"]);
    expect(out![0].reason).toBe("The team writes it without the marks.");
  });

  it("caps oversize reasons instead of rejecting the segment", () => {
    const segs = good().map((s) => ({ ...s, reason: "x".repeat(5000) }));
    const out = sanitizeSegments(segs, o, c);
    expect(out).not.toBeNull();
    expect(out![0].reason!.length).toBe(2000);
  });

  it("never throws on garbage - returns null instead", () => {
    for (const garbage of [
      "x",
      42,
      null,
      undefined,
      {},
      [{}],
      [null],
      ["x"],
      [[]],
      [{ start: "a", end: 1, original: "", replacement: "" }],
      [{ start: 0.5, end: 1, original: "À", replacement: "" }],
      [{ start: 0, end: 1 }],
      [{ deeply: { nested: ["junk"] } }],
    ]) {
      expect(() => sanitizeSegments(garbage, o, c)).not.toThrow();
      expect(sanitizeSegments(garbage, o, c)).toBeNull();
    }
  });

  it("an empty array only passes when nothing changed", () => {
    expect(sanitizeSegments([], o, c)).toBeNull(); // texts differ, [] cannot rebuild c
    expect(sanitizeSegments([], o, o)).toEqual([]); // no change, no segments - fine
  });
});

describe("adversarial: tampering with a stored segment set is DETECTED", () => {
  // Simulated DB tamper: a valid envelope is stored, then a segment set is
  // mutated behind the write path's back. sanitizeSegments is the platform's
  // re-validation gate (every consumer that trusts segments must go through
  // it), so each mutation below MUST come back null - the mutated set can
  // never masquerade as a faithful reconstruction of correctedText.
  const o = nfc(AUTH_001.original); // "Ọjọ ki chẹnyọ ñwu wẹ"
  const c = nfc(AUTH_001.corrected); // "Ọjọ ki d'ẹnyọ ñwu wẹ"
  const stored = () => diffToSegments(AUTH_001.original, AUTH_001.corrected);

  it("the untampered stored set still validates (control)", () => {
    expect(sanitizeSegments(stored(), o, c)).not.toBeNull();
  });

  it("a silently reworded replacement is caught by the reconstruction check alone", () => {
    // start/end/original all still valid - ONLY the final
    // applySegments === correctedText comparison can catch this class.
    const tampered = stored().map((s, i) =>
      i === 0 ? { ...s, replacement: s.replacement + "x" } : s,
    );
    expect(applySegments(o, tampered)).not.toBe(c);
    expect(sanitizeSegments(tampered, o, c)).toBeNull();
  });

  it("a shifted offset is caught by the slice anchor", () => {
    const tampered = stored().map((s) => ({
      ...s,
      start: s.start + 1,
      end: s.end + 1,
    }));
    expect(sanitizeSegments(tampered, o, c)).toBeNull();
  });

  it("a dropped segment no longer reconstructs and is rejected", () => {
    // AUTH_001 yields one segment; dropping it leaves [] which cannot
    // rebuild a differing correctedText.
    expect(sanitizeSegments([], o, c)).toBeNull();
  });

  it("an appended extra segment is rejected", () => {
    const extra = [
      ...stored(),
      { start: o.length, end: o.length, original: "", replacement: " gbọ" },
    ];
    expect(sanitizeSegments(extra, o, c)).toBeNull();
  });

  it("swapping in another prompt's originalText is rejected", () => {
    const other = nfc(AUTH_012.original);
    expect(sanitizeSegments(stored(), other, c)).toBeNull();
  });
});

describe("adversarial: the full Igala grapheme hazard battery", () => {
  // Every hazard the corpus actually contains, in both Unicode shapes:
  //   - ẹ́ : NFC is U+1EB9 (ẹ) + combining acute - TWO code units even in NFC
  //   - ọ̀ : U+1ECD + combining grave
  //   - ñ : U+00F1, NFD n + combining tilde
  //   - ǹ : U+01F9 (clause-final particle), NFD n + combining grave
  //   - d'ẹnyọ : apostrophized elision (straight AND curly apostrophe)
  const HAZARD_PAIRS = [
    // tone-mark-only change on a dotted vowel: ẹ́ -> ẹ̀ (acute to grave)
    { original: "ẹ́ dẹ́", corrected: "ẹ̀ dẹ́" },
    // ọ̀ respelled to bare ọ
    { original: "ọ̀jọ̀ gbọ", corrected: "ọjọ gbọ" },
    // ñ added and removed (ñwu <-> nwu, the Igbo-word class of fix)
    { original: "Ọjọ ñwu wẹ", corrected: "Ọjọ nwu wẹ" },
    // clause-final ǹ appended (precomposed U+01F9)
    { original: "Ọjọ d'ẹnyọ wẹ", corrected: "Ọjọ d'ẹnyọ wẹ ǹ" },
    // clause-final ǹ typed decomposed (explicit escape: n + U+0300)
    { original: "Ọjọ d'ẹnyọ wẹ", corrected: "Ọjọ d'ẹnyọ wẹ n\u0300" },
    // apostrophized elision inserted (straight apostrophe)
    { original: "Ọjọ ki chẹnyọ ñwu wẹ", corrected: "Ọjọ ki d'ẹnyọ ñwu wẹ" },
    // curly apostrophe variant of the same elision
    { original: "Ọjọ ki chẹnyọ ñwu wẹ", corrected: "Ọjọ ki d’ẹnyọ ñwu wẹ" },
    // straight -> curly apostrophe INSIDE a token (punctuation-only change)
    { original: "Ọjọ ki d'ẹnyọ ñwu wẹ", corrected: "Ọjọ ki d’ẹnyọ ñwu wẹ" },
  ];

  it("round-trips every hazard pair exactly", () => {
    for (const { original, corrected } of HAZARD_PAIRS) {
      const segs = diffToSegments(original, corrected);
      expect(applySegments(nfc(original), segs)).toBe(nfc(corrected));
    }
  });

  it("never places a boundary inside a grapheme: boundaries sit on whitespace or string edges, never before a combining mark", () => {
    for (const { original, corrected } of HAZARD_PAIRS) {
      const o = nfc(original);
      for (const seg of diffToSegments(original, corrected)) {
        for (const boundary of [seg.start, seg.end]) {
          expect(isTokenBoundary(o, boundary)).toBe(true);
          // The character AFTER the boundary must not be a combining mark -
          // a mark there would mean its base letter was cut off.
          if (boundary < o.length) {
            expect(o[boundary]).not.toMatch(/\p{M}/u);
          }
        }
        if (seg.original) expect(seg.original).not.toMatch(/^\p{M}/u);
        if (seg.replacement) expect(seg.replacement).not.toMatch(/^\p{M}/u);
      }
    }
  });

  it("NFD retyping of a hazard string plus ONE real fix yields ONLY the real fix", () => {
    // The realistic phone case: the model output arrives NFD, the annotator's
    // keyboard emits NFC, and they change one word. Without normalization the
    // whole string would light up as a phantom diff.
    const originalNfd = "Ọjọ ki chẹnyọ ñwu wẹ".normalize("NFD");
    const correctedNfc = nfc("Ọjọ ki d'ẹnyọ ñwu wẹ");
    const segs = diffToSegments(originalNfd, correctedNfc);
    expect(segs).toHaveLength(1);
    expect(segs[0].original).toBe("chẹnyọ");
    expect(segs[0].replacement).toBe("d'ẹnyọ");
    expect(applySegments(nfc(originalNfd), segs)).toBe(correctedNfc);
  });

  it("MIXED normalization inside one string still yields zero phantom segments", () => {
    // First half NFC, second half NFD of the same visible text.
    const visible = "ẹ́lẹ̀ ọ̀nà ñwu ǹ";
    const mixed =
      visible.slice(0, 6).normalize("NFC") + visible.slice(6).normalize("NFD");
    expect(diffToSegments(mixed, visible.normalize("NFC"))).toEqual([]);
    expect(diffToSegments(visible.normalize("NFD"), mixed)).toEqual([]);
  });
});

describe("adversarial: span-level uncertainty replaces the dead confidence widget", () => {
  // The removed 1-4 widget produced 1,166/1,170 identical values - zero
  // variance, zero information. The replacement channel is the `unsure`
  // reason tag on a SPAN. This simulation proves the new channel actually
  // COLLECTS variance: differently-confident annotators produce
  // distinguishable stored envelopes.
  it("a simulated team's edits carry differing unsure signal end to end", () => {
    const o = nfc(AUTH_001.original);
    const c = nfc(AUTH_001.corrected);
    // Six annotators fix the same output; three flag their change unsure.
    const team = [true, false, true, false, false, true].map((unsure) =>
      diffToSegments(o, c).map((s) => ({
        ...s,
        ...(unsure
          ? { reasonTags: ["unsure"], reason: "please check with Salem" }
          : { reasonTags: ["wrong_word"] }),
      })),
    );
    const stored = team.map((segs) => sanitizeSegments(segs, o, c));
    // Every envelope survives sanitization with its tags intact…
    for (const envelope of stored) {
      expect(envelope).not.toBeNull();
      expect(envelope![0].reasonTags?.length).toBeGreaterThan(0);
    }
    // …and the unsure rate across the team is neither 0 nor 1: variance
    // exists, which the old widget never once produced.
    const unsureCount = stored.filter((s) =>
      s![0].reasonTags?.includes("unsure"),
    ).length;
    expect(unsureCount).toBe(3);
    expect(unsureCount).toBeGreaterThan(0);
    expect(unsureCount).toBeLessThan(stored.length);
  });
});

describe("reason keys and attachment", () => {
  it("reasonKeyFor disambiguates repeated identical slices by occurrence", () => {
    const segs: EditSegment[] = [
      { start: 0, end: 2, original: "ki", replacement: "a" },
      { start: 5, end: 7, original: "ki", replacement: "b" },
      { start: 10, end: 12, original: "wẹ", replacement: "c" },
    ];
    const keys = segs.map((_, i) => reasonKeyFor(segs, i));
    expect(new Set(keys).size).toBe(3);
    expect(keys[0]).not.toBe(keys[1]); // same slice, different occurrence
  });

  it("reasons survive an offset shift caused by edits elsewhere (key is text, not offset)", () => {
    const before = diffToSegments("aa bb cc", "aa xx cc");
    const key = reasonKeyFor(before, 0);
    // An unrelated insertion earlier in the text shifts the offsets…
    const after = diffToSegments("zz aa bb cc", "zz aa xx cc");
    expect(after[0].start).not.toBe(before[0].start);
    // …but the key is identical, so the stored reason re-attaches.
    expect(reasonKeyFor(after, 0)).toBe(key);
    const attached = attachReasons(after, {
      [key]: { tags: ["wrong_word"], text: "bb is not a word" },
    });
    expect(attached[0].reasonTags).toEqual(["wrong_word"]);
    expect(attached[0].reason).toBe("bb is not a word");
  });

  it("attachReasons drops reasons whose segment disappeared and sanitizes tags", () => {
    const segs = diffToSegments("aa bb", "aa xx");
    const attached = attachReasons(segs, {
      "gone␟0": { tags: ["grammar"], text: "stale" },
      [reasonKeyFor(segs, 0)]: { tags: ["grammar", "bogus"], text: "  " },
    });
    expect(attached).toHaveLength(1);
    expect(attached[0].reason).toBeUndefined(); // blank text not attached
    expect(attached[0].reasonTags).toEqual(["grammar"]); // bogus dropped
  });
});

describe("the nudge label (never a gate)", () => {
  const seg = (withReason: boolean): EditSegment => ({
    start: 0,
    end: 1,
    original: "a",
    replacement: "b",
    ...(withReason ? { reasonTags: ["tone_marks"] } : {}),
  });

  it("all reasons given -> Save suggestions", () => {
    expect(editSaveLabel([seg(true), seg(true)])).toBe("Save suggestions");
  });

  it("some reasons given -> Save - N of M reasons given", () => {
    expect(editSaveLabel([seg(true), seg(false), seg(false)])).toBe(
      "Save - 1 of 3 reasons given",
    );
  });

  it("no reasons -> Save without reasons", () => {
    expect(editSaveLabel([seg(false)])).toBe("Save without reasons");
    expect(reasonCoverage([seg(false)])).toEqual({ given: 0, total: 1 });
  });
});

describe("segmentsEnvelope", () => {
  it("stamps v1 around the segments", () => {
    const segs = diffToSegments(AUTH_001.original, AUTH_001.corrected);
    expect(segmentsEnvelope(segs)).toEqual({ v: 1, segments: segs });
  });
});
