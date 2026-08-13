import { describe, it, expect } from "vitest";
import {
  ENGLISH_STOPWORDS_100,
  MIN_COOC,
  MIN_SCORE,
  associationScore,
  englishContentTokens,
  igalaFoldedTokens,
  igalaSurfaceForm,
  induceLexicon,
  looksEnglish,
  type CorpusPair,
} from "./lexicon-induce";

/**
 * The synthetic corpora below are built around the real pairs the induction
 * exists to find (ọ́mi/water is chikhapo-attested), with tone marking varied
 * across verses the way the Bible corpus actually varies it.
 */

/** N verse pairs in which `en` and `ig` co-occur, with unique filler words. */
function coocVerses(
  en: string,
  ig: string,
  n: number,
  tag: string,
): CorpusPair[] {
  return Array.from({ length: n }, (_, k) => ({
    english: `${en} filler${tag}${k}`,
    igala: `${ig} kpai${tag}${k}`,
  }));
}

describe("ENGLISH_STOPWORDS_100", () => {
  it("holds exactly 100 words, so 'top-100' is a checked fact", () => {
    expect(ENGLISH_STOPWORDS_100.size).toBe(100);
  });
});

describe("englishContentTokens", () => {
  it("folds case and punctuation and drops stopwords", () => {
    expect(englishContentTokens("And the Water, the water!")).toEqual([
      "water",
    ]);
  });

  it("drops tokens with no letters (verse numbers)", () => {
    expect(englishContentTokens("12 loaves")).toEqual(["loaves"]);
  });

  it("returns DISTINCT tokens - counts are verse-level", () => {
    expect(englishContentTokens("boat boat boat")).toEqual(["boat"]);
  });
});

describe("igalaFoldedTokens / igalaSurfaceForm", () => {
  it("drops tone marks but keeps the dot-below vowels", () => {
    // ọ́mi -> ọmi: the acute (tone) folds away, the phonemic ọ survives.
    expect(igalaFoldedTokens("Ọ́mi ọmi")).toEqual(["ọmi"]);
    expect(igalaFoldedTokens("ẹ́lá")).toEqual(["ẹla"]);
  });

  it("keeps the full diacritics on the surface form, lowercased", () => {
    expect(igalaSurfaceForm("Ọ́mi")).toBe("ọ́mi");
  });
});

describe("associationScore", () => {
  it("matches the spec formula c(e,i) / (c(e) + c(i) - c(e,i) + 5)", () => {
    expect(associationScore(6, 6, 6)).toBeCloseTo(6 / 11);
    expect(associationScore(6, 30, 6)).toBeCloseTo(6 / 35);
  });
});

describe("induceLexicon", () => {
  it("keeps an exclusive pair co-occurring at least MIN_COOC times", () => {
    const { induced } = induceLexicon(coocVerses("water", "ọ́mi", 6, "a"));
    const entry = induced.find((e) => e.english === "water");
    expect(entry).toBeDefined();
    expect(entry!.igalaFolded).toBe("ọmi");
    expect(entry!.cEI).toBe(6);
    expect(entry!.score).toBeCloseTo(6 / 11);
    expect(entry!.score).toBeGreaterThanOrEqual(MIN_SCORE);
  });

  it("drops pairs below MIN_COOC even when perfectly exclusive", () => {
    const { induced } = induceLexicon(
      coocVerses("water", "ọ́mi", MIN_COOC - 1, "a"),
    );
    expect(induced.find((e) => e.english === "water")).toBeUndefined();
  });

  it("drops pairs whose score falls under MIN_SCORE", () => {
    // "water" in 30 verses but with ọ́mi in only 6: 6/35 ≈ 0.17 < 0.3.
    const corpus = [
      ...coocVerses("water", "ọ́mi", 6, "a"),
      ...coocVerses("water", "udu", 24, "b"),
    ];
    const { induced } = induceLexicon(corpus);
    expect(
      induced.find((e) => e.english === "water" && e.igalaFolded === "ọmi"),
    ).toBeUndefined();
  });

  it("recovers the most frequent SURFACE form as headword", () => {
    // Tone variation only (omi vs ọmi would differ segmentally): ọ́mi x4 and
    // ọmi x2 pool under the same folded key, and the toned majority spelling
    // wins the headword.
    const corpus = [
      ...coocVerses("water", "ọ́mi", 4, "a"),
      ...coocVerses("water", "ọmi", 2, "b"),
    ];
    const { induced } = induceLexicon(corpus);
    const entry = induced.find((e) => e.english === "water");
    expect(entry).toBeDefined();
    expect(entry!.cEI).toBe(6);
    expect(entry!.headword).toBe("ọ́mi");
  });

  it("uses the shortest verse pair containing both tokens as the example", () => {
    const corpus: CorpusPair[] = [
      ...coocVerses("water", "ọ́mi", 5, "a"),
      {
        english: "the water is deep and wide over everything here",
        igala: "ọ́mi kpalakpala unyi efu ile duu kpai abule",
      },
      { english: "water came", igala: "ọ́mi wa" },
    ];
    const { induced } = induceLexicon(corpus);
    const entry = induced.find((e) => e.english === "water");
    expect(entry!.exampleEn).toBe("water came");
    expect(entry!.exampleIg).toBe("ọ́mi wa");
  });

  it("counts considered pair types and sorts kept entries by score", () => {
    const corpus = [
      ...coocVerses("water", "ọ́mi", 6, "a"),
      ...coocVerses("house", "unyi", 8, "b"),
    ];
    const { considered, induced } = induceLexicon(corpus);
    // Filler words stay under MIN_COOC document frequency, so only the two
    // real pairs get scored at all.
    expect(considered).toBe(2);
    // house: 8/13 ≈ 0.615 beats water: 6/11 ≈ 0.545.
    expect(induced.map((e) => e.english)).toEqual(["house", "water"]);
  });
});

describe("looksEnglish", () => {
  it("flags identity pairs and frequent English-side words", () => {
    const df = new Map([
      ["jesus", 900],
      ["water", 40],
    ]);
    expect(looksEnglish("Jesus", "jesus", df)).toBe(true);
    expect(looksEnglish("water", "sea", df)).toBe(true);
    expect(looksEnglish("ọ́mi", "water", df)).toBe(false);
  });
});
