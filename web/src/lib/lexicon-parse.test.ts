import { describe, it, expect } from "vitest";
import {
  detectFamily,
  parseVocabularyContent,
  splitSenses,
  cleanSense,
  inferPos,
  promptContentWords,
  FAMILY_CONFIDENCE,
} from "./lexicon-parse";

/**
 * Every fixture line below is copied verbatim from the live RagEntry rows
 * (language='igala', chunkType vocabulary / historical_wordlist), because the
 * parsers exist to handle exactly those rows - invented fixtures would test
 * an invented format.
 */

const WIKTIONARY_SOURCE =
  "English Wiktionary, Igala (igl) entries — https://en.wiktionary.org/wiki/Category:Igala_lemmas — text CC BY-SA 4.0.";
const KOELLE_SOURCE =
  "Koelle, S. W. (1854) Polyglotta Africana, Igala list (III-C-2), digitised as CLDF by Lexibank — https://github.com/lexibank/polyglottaafricana — CC BY 4.0";
const CHIKHAPO_SOURCE =
  "chikhapo Igala-English lexicon — https://huggingface.co/datasets/ec5ug/chikhapo (file data/igl_eng.jsonl) — MIT licence.";
const BLENCH_SOURCE =
  "Blench, Roger & Paul Gross (2005) 'Igala Mammal Names' — https://rogerblench.info/...; English Wiktionary Igala lemmas — https://en.wiktionary.org/wiki/Category:Igala_lemmas (CC BY-SA 4.0)";

describe("detectFamily", () => {
  it("maps the three parseable source families", () => {
    expect(detectFamily(WIKTIONARY_SOURCE)).toBe("wiktionary");
    expect(detectFamily(KOELLE_SOURCE)).toBe("koelle");
    expect(detectFamily(CHIKHAPO_SOURCE)).toBe("chikhapo");
  });

  it("refuses the Blench prose row even though its source cites Wiktionary", () => {
    expect(detectFamily(BLENCH_SOURCE)).toBeNull();
  });
});

describe("wiktionary parsing", () => {
  it("strips IPA, splits senses on ';' and caps at 3", () => {
    const entries = parseVocabularyContent(
      "éjú /é.d͡ʒú/ — eye; face, look; surface, opening; area, neighborhood; intuition, perception",
      "Igala lexicon — Body, person and life",
      "wiktionary",
    );
    expect(entries).toEqual([
      { headword: "éjú", gloss: "eye", pos: null },
      { headword: "éjú", gloss: "face, look", pos: null },
      { headword: "éjú", gloss: "surface, opening", pos: null },
    ]);
  });

  it("keeps parenthetical labels inside the gloss text", () => {
    const entries = parseVocabularyContent(
      "ábíá /á.bʲá/ — dog; (derogatory) dog, animal",
      "Igala lexicon — Domestic animals and livestock",
      "wiktionary",
    );
    expect(entries.map((e) => e.gloss)).toEqual([
      "dog",
      "(derogatory) dog, animal",
    ]);
  });

  it("handles lines without IPA and multi-word headwords", () => {
    const entries = parseVocabularyContent(
      ["òkóò — pig", "wọ́la òdùdu /wɔ́.lā ò.dù.dū/ — good morning!"].join("\n"),
      "Igala lexicon — Greetings and address",
      "wiktionary",
    );
    expect(entries).toEqual([
      { headword: "òkóò", gloss: "pig", pos: null },
      { headword: "wọ́la òdùdu", gloss: "good morning", pos: null },
    ]);
  });

  it("cleans template residue: leading comma kept senses, dangling clauses dropped", () => {
    // Real residue line: the space after the dash was eaten by the failed
    // template expansion, one sense starts with a comma, one is truncated.
    const entries = parseVocabularyContent(
      "Ídá /í.dá/ —, the capital city of the people; (historical) the capital of the",
      "Igala lexicon — Names of the language, people and places",
      "wiktionary",
    );
    expect(entries).toEqual([
      { headword: "Ídá", gloss: "the capital city of the people", pos: null },
    ]);
  });

  it("drops empty parens and dedupes repeated senses", () => {
    const entries = parseVocabularyContent(
      [
        "àìgẹ́lẹ́ /àì.ɡɛ́.lɛ́/ — velvet tamarind ()",
        "Ígáláà /í.ɡá.láà/ — Igala; Igala",
      ].join("\n"),
      "Igala lexicon — Names",
      "wiktionary",
    );
    expect(entries).toEqual([
      { headword: "àìgẹ́lẹ́", gloss: "velvet tamarind", pos: null },
      { headword: "Ígáláà", gloss: "Igala", pos: null },
    ]);
  });

  it("skips the preamble and description lines", () => {
    const entries = parseVocabularyContent(
      [
        "INCOMPLETE LIST: this holds only the numerals that happen to be attested in the source.",
        "Igala forms with tone marking and IPA, as attested in English Wiktionary's Igala entries.",
        "òókáà /òókáà/ — one",
      ].join("\n"),
      "Igala lexicon — Numerals (attested)",
      "wiktionary",
    );
    expect(entries).toEqual([{ headword: "òókáà", gloss: "one", pos: "num" }]);
  });
});

describe("koelle parsing", () => {
  it("reverses the English — Igala direction", () => {
    const entries = parseVocabularyContent(
      "Head — ṓdṣi",
      "Igala 1854 wordlist — body parts",
      "koelle",
    );
    expect(entries).toEqual([{ headword: "ṓdṣi", gloss: "Head", pos: null }]);
  });

  it("keeps clarifying parentheticals in the gloss", () => {
    const entries = parseVocabularyContent(
      "Father (My Father, Thy Father) — áta",
      "Igala 1854 wordlist — kinship and people",
      "koelle",
    );
    expect(entries[0].gloss).toBe("Father (My Father, Thy Father)");
  });

  it("keeps short 1854 sentence attestations but never tags them verb", () => {
    const entries = parseVocabularyContent(
      "I eat rice (yam) — nā dṣọ dṣīkápa",
      "Igala 1854 wordlist — verbs and short sentences",
      "koelle",
    );
    expect(entries).toEqual([
      { headword: "nā dṣọ dṣīkápa", gloss: "I eat rice (yam)", pos: null },
    ]);
  });

  it("tags the adjective and numeral sections", () => {
    expect(
      inferPos(
        "koelle",
        "Igala 1854 wordlist — qualities and adjectives",
        "ínāna",
        "Great, large",
      ),
    ).toBe("adj");
    expect(
      inferPos("koelle", "Igala 1854 wordlist — numerals 1-20", "ī́nye", "One"),
    ).toBe("num");
  });
});

describe("chikhapo parsing", () => {
  it("skips lines still in raw ASJP notation (digit 5 or tilde)", () => {
    const entries = parseVocabularyContent(
      [
        "e5a — breast",
        "gb~o — hear",
        "aby~a — dog",
        "ɛ̀nyà — breast, breasts",
      ].join("\n"),
      "Igala-English lexicon (chikhapo) — general vocabulary 1",
      "chikhapo",
    );
    expect(entries).toEqual([
      { headword: "ɛ̀nyà", gloss: "breast, breasts", pos: null },
    ]);
  });

  it("skips the flagged bad lines but keeps the correct rain compound", () => {
    const entries = parseVocabularyContent(
      ["obɪǯɪ́m — emu", "ómi — rain", "ómi oǯálì — rain", "ómi — water"].join(
        "\n",
      ),
      "Igala-English lexicon (chikhapo) — sky, weather and time",
      "chikhapo",
    );
    expect(entries).toEqual([
      { headword: "ómi oǯálì", gloss: "rain", pos: null },
      { headword: "ómi", gloss: "water", pos: null },
    ]);
  });

  it("removes only the flagged synonym from óǯí and ɔ̀dɔ̀", () => {
    const entries = parseVocabularyContent(
      ["óǯí — head, water", "ɔ̀dɔ̀ — wall, heart, liver"].join("\n"),
      "Igala-English lexicon (chikhapo) — body and health",
      "chikhapo",
    );
    expect(entries).toEqual([
      { headword: "óǯí", gloss: "head", pos: null },
      { headword: "ɔ̀dɔ̀", gloss: "heart, liver", pos: null },
    ]);
  });

  it("tags é- prefixed citation forms as verbs", () => {
    const entries = parseVocabularyContent(
      "é-dakòbì — come back, go back, return",
      "Igala-English lexicon (chikhapo) — body and health",
      "chikhapo",
    );
    expect(entries[0].pos).toBe("verb");
  });
});

describe("sentence guard", () => {
  it("drops anything with more than 4 words on the Igala side", () => {
    const entries = parseVocabularyContent(
      "ábc dèf ghí jkl mno — some sentence gloss",
      "topic",
      "chikhapo",
    );
    expect(entries).toEqual([]);
  });
});

describe("sense helpers", () => {
  it("cleanSense drops truncated template clauses", () => {
    expect(cleanSense("(historical) the capital of the")).toBeNull();
    expect(cleanSense(", the capital city of the people")).toBe(
      "the capital city of the people",
    );
  });

  it("splitSenses never splits on commas", () => {
    expect(splitSenses("earth, ground, land, soil")).toEqual([
      "earth, ground, land, soil",
    ]);
  });

  it("verb glosses are tagged from the 'to ' prefix, past parenthetical labels", () => {
    expect(
      inferPos("wiktionary", "any", "gbọ́", "(transitive|stative) to hear"),
    ).toBe("verb");
  });
});

describe("confidence ladder", () => {
  it("orders wiktionary > chikhapo > koelle", () => {
    expect(FAMILY_CONFIDENCE.wiktionary).toBe(1.0);
    expect(FAMILY_CONFIDENCE.chikhapo).toBe(0.8);
    expect(FAMILY_CONFIDENCE.koelle).toBe(0.6);
  });
});

describe("promptContentWords", () => {
  it("keeps quoted lexical targets, drops scaffolding and function words", () => {
    expect(
      promptContentWords(
        "Translate 'The woman cooks food' into Igala, keeping correct word order.",
      ),
    ).toEqual(["woman", "cooks", "food"]);
  });

  it("keeps numerals as content ('one to five' must be lookupable)", () => {
    expect(
      promptContentWords(
        "Write the Igala numbers one to five, each spelled correctly with tone marks.",
      ),
    ).toEqual(["one", "five"]);
  });

  it("folds diacritics to match glossFolded's key space", () => {
    expect(
      promptContentWords(
        "Write two Igala words that use a dotted vowel (such as ẹ or ọ) and spell them correctly.",
      ),
    ).toEqual(["two", "use", "e", "o"]);
  });
});
