import { describe, it, expect } from "vitest";
import {
  checkIgalaOutput,
  findAllowlistViolations,
  findDroppedNames,
  findSourceProperNouns,
  isTranslationRequest,
  labelRunsRepairRound,
  isPlainAscii,
  quotedPassages,
  REPAIR_ROUND_VERSION_LABELS,
  requestsEnglish,
  sourceWordSet,
  stripEdgeQuotes,
} from "./repair-round";

/**
 * THE 2026-09-01 BUG AND ITS FIX.
 *
 * Reviewing a live English-Wikipedia-to-Igala translation, Agnes Abah and
 * Charity reported that the model was respelling proper nouns: Igala has no
 * /s/, so Lagos, Egbuson, Bayelsa and "Green Spring Montessori" came back
 * altered. Charity: "Lagos is still Lagos."
 *
 * The prompt was only half the cause. The repair round's character allowlist
 * has no s in it - correctly, for IGALA words - and it was being applied to
 * the whole answer, so it flagged those very names as "letters that do not
 * exist in Igala" and re-asked the model to rewrite them. The serving lint
 * was manufacturing the error the community reported.
 *
 * These tests pin the fix in both directions: copied words are exempt, and
 * invented words are still caught.
 */

const SOURCE =
  "Translate this into Igala: Timini Egbuson was born in Bayelsa, in the south of Nigeria. He attended Green Spring Montessori in Lagos and studied psychology.";

describe("the bug: the allowlist flagged names the community says to keep", () => {
  it("flags every s-bearing proper noun when it has no source to compare against", () => {
    // This is the SHIPPED behaviour before the fix, kept as a test so the
    // regression is visible rather than remembered.
    const answer =
      "Egbuson chi ọma Bayelsa, i la Green Spring Montessori ki de Lagos.";
    expect(findAllowlistViolations(answer)).toEqual(
      expect.arrayContaining([
        "Egbuson",
        "Bayelsa",
        "Spring",
        "Montessori",
        "Lagos",
      ]),
    );
  });

  it("exempts those same words once the question they came from is supplied", () => {
    const answer =
      "Egbuson chi ọma Bayelsa, i la Green Spring Montessori ki de Lagos.";
    expect(findAllowlistViolations(answer, sourceWordSet(SOURCE))).toEqual([]);
    expect(checkIgalaOutput(answer, { sourceText: SOURCE })).toEqual([]);
  });

  it("exempts the untranslatable term too - the likeliest reason a fact was dropped", () => {
    // "he didn't tell us what he studied": psychology trips the allowlist on
    // its s, so borrowing it was penalised and omitting it was not.
    expect(findAllowlistViolations("i kọ psychology")).toEqual(["psychology"]);
    expect(
      findAllowlistViolations("i kọ psychology", sourceWordSet(SOURCE)),
    ).toEqual([]);
  });

  it("still catches the model's OWN inventions, which are never in the question", () => {
    // The adsa family: zero-attested, recurring verbatim across unrelated
    // prompts. The exemption is a scope, not a weakening.
    const v = checkIgalaOutput("ádṣa é-jẹu ki de Lagos", {
      sourceText: SOURCE,
    });
    expect(v.map((x) => x.kind)).toContain("banned-character");
    expect(v.find((x) => x.kind === "banned-character")!.detail).toContain(
      "ádṣa",
    );
    expect(v.find((x) => x.kind === "banned-character")!.detail).not.toContain(
      "Lagos",
    );
  });

  it("matches case-insensitively but nothing looser", () => {
    expect(sourceWordSet("Visit Lagos").has("lagos")).toBe(true);
    expect(
      findAllowlistViolations("lagos", sourceWordSet("Visit Lagos")),
    ).toEqual([]);
    // A DIFFERENT word that merely starts the same is not exempt.
    expect(
      findAllowlistViolations("Lagosia", sourceWordSet("Visit Lagos")),
    ).toEqual(["Lagosia"]);
  });

  it("is a no-op when no source is supplied, so untouched call sites keep their behaviour", () => {
    expect(checkIgalaOutput("ádṣa")).toEqual(checkIgalaOutput("ádṣa", {}));
    expect(sourceWordSet(undefined).size).toBe(0);
  });
});

describe("finding the names a source supplies", () => {
  it("takes capitalized words that are not sentence-initial", () => {
    const found = findSourceProperNouns(SOURCE);
    expect(found).toEqual(
      expect.arrayContaining([
        "Egbuson",
        "Bayelsa",
        "Nigeria",
        "Green",
        "Spring",
        "Montessori",
        "Lagos",
      ]),
    );
  });

  it("skips sentence-initial words, where capitalization means nothing", () => {
    // "Write" and "Translate" are not names, and neither is the first word
    // after a full stop or a colon.
    expect(findSourceProperNouns("Write the Igala word for water.")).toEqual(
      [],
    );
    expect(
      findSourceProperNouns("Translate: Ada went home. Musa stayed."),
    ).toEqual([]);
    expect(findSourceProperNouns("She met Ada. Musa stayed.")).toEqual(["Ada"]);
  });

  it("skips languages, peoples, God and English calendar words, which do have Igala forms", () => {
    expect(
      findSourceProperNouns(
        "He speaks Igala and English, thanks God every Sunday in March.",
      ),
    ).toEqual([]);
  });

  it("skips words shorter than three letters and lowercase words", () => {
    expect(findSourceProperNouns("He met Al and bought yams")).toEqual([]);
  });
});

describe("check (d): names must survive a translation", () => {
  it("fires only on a translation request", () => {
    expect(isTranslationRequest(SOURCE)).toBe(true);
    expect(
      isTranslationRequest("How do people in Idah greet each other?"),
    ).toBe(false);
    expect(isTranslationRequest(undefined)).toBe(false);
    // A question-and-answer turn has no obligation to repeat a name.
    expect(
      checkIgalaOutput("Wọla ọdudu.", {
        sourceText: "How do people in Idah greet each other?",
        checkNames: true,
      }),
    ).toEqual([]);
  });

  it("names exactly the proper nouns that went missing", () => {
    const mangled = "Timini Egbuchon chi ọma Bayelcha ki de Lachukwu.";
    const dropped = findDroppedNames(mangled, SOURCE);
    expect(dropped).toEqual(
      expect.arrayContaining(["Egbuson", "Bayelsa", "Lagos", "Montessori"]),
    );
    const v = checkIgalaOutput(mangled, {
      sourceText: SOURCE,
      checkNames: true,
    });
    expect(v.map((x) => x.kind)).toContain("name-not-preserved");
    expect(v.find((x) => x.kind === "name-not-preserved")!.detail).toContain(
      "Lagos",
    );
  });

  it("passes an answer that kept every name", () => {
    const good =
      "Timini Egbuson chi ọma Bayelsa ki de Nigeria. I la Green Spring Montessori ki de Lagos, i kọ psychology.";
    expect(findDroppedNames(good, SOURCE)).toEqual([]);
    expect(
      checkIgalaOutput(good, { sourceText: SOURCE, checkNames: true }),
    ).toEqual([]);
  });

  it("stays off unless the caller asks for it, so v4.1 is unchanged", () => {
    const mangled = "Timini Egbuchon chi ọma Bayelcha ki de Lachukwu.";
    // v4.1 supplies sourceText (for the exemption) but never checkNames.
    expect(checkIgalaOutput(mangled, { sourceText: SOURCE })).toEqual([]);
  });
});

describe("which labels run the round", () => {
  it("is v4.1 through v4.5, and nothing else", () => {
    expect([...REPAIR_ROUND_VERSION_LABELS]).toEqual([
      "rag-v4-1",
      "rag-v4-2",
      "rag-v4-3",
      "rag-v4-4",
      "rag-v4-5",
    ]);
    expect(labelRunsRepairRound("rag-v4-5")).toBe(true);
    expect(labelRunsRepairRound("rag-v4-4")).toBe(true);
    expect(labelRunsRepairRound("rag-v4-1")).toBe(true);
    expect(labelRunsRepairRound("rag-v4-2")).toBe(true);
    expect(labelRunsRepairRound("rag-v4-3")).toBe(true);
    expect(labelRunsRepairRound("rag-v4")).toBe(false);
    expect(labelRunsRepairRound("rag-v4-1-norepair")).toBe(false);
    expect(labelRunsRepairRound("rag-v3")).toBe(false);
    expect(labelRunsRepairRound(null)).toBe(false);
    expect(labelRunsRepairRound(undefined)).toBe(false);
  });
});

/**
 * THE 2026-09-28 BUG: QUOTED SOURCES.
 *
 * The v4.2 prompt bank quotes the sentence to translate (Translate 'Musa
 * lives in Idah' into Igala.). The word pattern kept apostrophes, so the
 * quote marks stuck to the names: the exemption looked up "'musa" and missed
 * Musa, and the name check demanded "Idah'", which no answer can contain. A
 * correct answer was flagged, and the forced re-ask respelled names, pasted
 * quote marks in, or appended the task framing ("Wikipedia Write."). The
 * prompts below are the bank's own, verbatim.
 *
 * THE 2026-10-08 REVIEW of that fix found it had over-reached in two places
 * (names read from the quoted span alone; the English exemption switching
 * check (a) off for the whole answer) and under-reached in four (the first
 * word of a quoted sentence, possessives, elided names, closers). Those are
 * pinned below too.
 */
const GRAM_001 = "Translate 'Musa lives in Idah' into Igala.";
const GRAM_004 =
  "Translate 'Amina's father sells yams at Idah market' into Igala.";
const GRAM_005 =
  "Translate 'Vivian studied computer science at Kogi State University and now works in Abuja' into Igala.";
const GRAM_011 =
  "You are translating an English Wikipedia biography into Igala. One sentence reads: 'He finished secondary school in 2021 and started working the following year.' Write that sentence in Igala.";
const LEX_017 =
  "A child asks you where his sandals are. One is right beside you, the other is across the compound. In Igala, say 'this one is here' and 'that one is over there', in the two short sentences you would really say.";
const AUTH_002 =
  "A woman called Zara Adejoh has come from the Nigerian Television Authority to record your community's songs. Tell your neighbours in Igala who she is and why she has come.";

describe("quoted sources (the v4.2 bank shape)", () => {
  it("strips quote marks from word edges only, never from inside a word", () => {
    expect(stripEdgeQuotes("'Musa")).toBe("Musa");
    expect(stripEdgeQuotes("Idah'")).toBe("Idah");
    expect(stripEdgeQuotes("\u2018Musa\u2019")).toBe("Musa");
    expect(stripEdgeQuotes("w'ọla")).toBe("w'ọla");
    expect(stripEdgeQuotes("'")).toBe("");
    expect(sourceWordSet(GRAM_001).has("musa")).toBe(true);
    expect(sourceWordSet(GRAM_001).has("idah")).toBe(true);
    expect(sourceWordSet(GRAM_001).has("'musa")).toBe(false);
  });

  it("finds quoted passages and ignores possessive apostrophes", () => {
    expect(quotedPassages(GRAM_001)).toEqual(["Musa lives in Idah"]);
    expect(quotedPassages(GRAM_004)).toEqual([
      "Amina's father sells yams at Idah market",
    ]);
    expect(quotedPassages(LEX_017)).toEqual([
      "this one is here",
      "that one is over there",
    ]);
    expect(quotedPassages(AUTH_002)).toEqual([]);
    expect(quotedPassages("the farmers' cooperative")).toEqual([]);
  });

  it("pairs each opener with a closer of its own kind, past inner apostrophes", () => {
    // A plural possessive and an Igala elision inside the passage are not
    // closers (2026-10-08 review); before, the first ' not followed by a
    // letter ended the passage at "farmers'".
    expect(
      quotedPassages("Translate 'the farmers' union meets on Monday' into Igala."),
    ).toEqual(["the farmers' union meets on Monday"]);
    expect(quotedPassages("What does 'ch' ọma' mean here?")).toEqual([
      "ch' ọma",
    ]);
    // A double quote does not close a single one, and the reverse.
    expect(quotedPassages("Say 'he said \"no\" twice' in Igala.")).toEqual([
      'he said "no" twice',
    ]);
    expect(quotedPassages("Translate \u201cAmina's yams\u201d into Igala.")).toEqual([
      "Amina's yams",
    ]);
    // Two quoted sentences with an instruction between them stay separate.
    expect(
      quotedPassages(
        "Translate 'Musa lives in Idah' into Igala, then write 'Amina sells yams' in Igala too.",
      ),
    ).toEqual(["Musa lives in Idah", "Amina sells yams"]);
  });

  it("reads a translation's names from the whole question, framing included", () => {
    // The Sep 28 fix read the quoted span alone, and a translation that
    // quotes only a title or a nickname lost its names (2026-10-08 review).
    const nickname =
      "Translate into Igala: the singer Miriam Makeba, known as 'Mama Africa', sang in Johannesburg.";
    expect(findSourceProperNouns(nickname)).toEqual([
      "Miriam",
      "Makeba",
      "Mama",
      "Africa",
      "Johannesburg",
    ]);
    expect(
      findDroppedNames("Miriam Makeba, 'Mama Africa', kọ ẹla ẹ Lagos.", nickname),
    ).toEqual(["Johannesburg"]);
    // Task-framing words are not names: Wikipedia, Igala, English.
    expect(findSourceProperNouns(GRAM_011)).toEqual([]);
    // Vivian opens the quote: before 2026-10-08 the quote mark hid her.
    expect(findSourceProperNouns(GRAM_005)).toEqual([
      "Vivian",
      "Kogi",
      "State",
      "University",
      "Abuja",
    ]);
  });

  it("checks the first word of a quoted sentence unless it is an English function word", () => {
    // "Jainab" opened the quote in gram_002 and was never checked, so the
    // answer that wrote "Zainab" passed (2026-10-08 review).
    expect(
      findSourceProperNouns("Translate 'Jainab sells fish at Idah' into Igala."),
    ).toEqual(["Jainab", "Idah"]);
    expect(
      findSourceProperNouns("Translate 'Fifian is a nurse in Ankpa' into Igala."),
    ).toEqual(["Fifian", "Ankpa"]);
    expect(
      findDroppedNames(
        "Zainab ta ẹja ẹ Idah.",
        "Translate 'Jainab sells fish at Idah' into Igala.",
      ),
    ).toEqual(["Jainab"]);
    // "The", "He", "When": capitalised by position, not names.
    expect(
      findSourceProperNouns(
        "Translate 'The people of Ajaokuta said When the rain comes, He will go' into Igala.",
      ),
    ).toEqual(["Ajaokuta"]);
  });

  it("asks for the name, not its English possessive clitic", () => {
    // Igala marks possession without 's; demanding "Amina's" verbatim re-asked
    // every correct answer (2026-10-08 review).
    expect(findSourceProperNouns(GRAM_004)).toEqual(["Amina", "Idah"]);
    expect(findDroppedNames("Ata Amina a ta ẹchi ẹ Idah.", GRAM_004)).toEqual(
      [],
    );
  });

  it("counts a name behind an Igala elision prefix as present", () => {
    // t'Ankpa, ef'Abuja, efẹw'Abuja are "to Ankpa", "in Abuja": the name is
    // there, fused to the preposition (2026-10-08 review).
    const q = "Translate 'Musa travelled from Ankpa to Abuja' into Igala.";
    expect(findDroppedNames("Musa lo t'Ankpa ef'Abuja.", q)).toEqual([]);
    expect(findDroppedNames("Musa lo t'Ankpa efẹw'Abuja.", q)).toEqual([]);
    expect(findDroppedNames("Musa lo t'Ankpa ef'Abeokuta.", q)).toEqual([
      "Abuja",
    ]);
    expect(sourceWordSet("lo t'Ankpa").has("ankpa")).toBe(true);
    expect(sourceWordSet("lo t'Ankpa").has("t'ankpa")).toBe(true);
  });

  it("a lone quote mark never takes the sentence-start slot", () => {
    // Before the fix, the closing ' after "year." took the slot, so the next
    // word ("Write") was read as a name.
    expect(
      findSourceProperNouns("It ended in 2021.' Write it for Ada."),
    ).toEqual(["Ada"]);
  });

  it("passes the correct answers the old checker flagged", () => {
    const opts = (sourceText: string) => ({ sourceText, checkNames: true });
    expect(checkIgalaOutput("Musa dodo efẹwọ Idah.", opts(GRAM_001))).toEqual(
      [],
    );
    expect(
      checkIgalaOutput(
        "Vivian kọ computer science efu Kogi State University, i chukọlọ efẹwọ Abuja.",
        opts(GRAM_005),
      ),
    ).toEqual([]);
    expect(
      checkIgalaOutput(
        "I kọ ichekpulu efu ọdọ 2021, ọdọ ki wa lẹ i chanẹ chukọlọ.",
        opts(GRAM_011),
      ),
    ).toEqual([]);
  });

  it("still catches what it is for: a dropped name and an invented s-word", () => {
    const v = checkIgalaOutput("Musa dodo efẹwọ Ida.", {
      sourceText: GRAM_001,
      checkNames: true,
    });
    expect(v.map((x) => x.kind)).toEqual(["name-not-preserved"]);
    expect(v[0].detail).toContain("Idah");
    expect(
      checkIgalaOutput("Musa sọ efẹwọ Idah.", { sourceText: GRAM_001 }).map(
        (x) => x.kind,
      ),
    ).toEqual(["banned-character"]);
  });
});

describe("questions that ask for English", () => {
  const IDIOM_001 =
    "Your brother's daughter has just passed the examination that takes her into secondary school, and the family has gathered at the house. Give in Igala what an older aunt would say to her, and explain in English the picture inside those words.";
  const IDIOM_002 =
    "A young man is opening his own shop in Ankpa tomorrow. Give in Igala the words an older relative would speak over him, and explain in English the image those words carry.";
  const LEX_005 =
    "You are adding a line to an Igala Wikipedia article about a woman who teaches psychology at a university. Write that line in Igala, saying what she teaches. Then add one line of English saying what you did with the name of the field and why.";
  const LEX_027 =
    "An Igala Wikipedia article says a man studied economics at university. Write that as one Igala sentence for the article, keeping the subject he studied in the sentence, then note in English how you handled the subject name.";
  const ORTH_005 =
    "You are writing an Igala article about a secondary school called Green Valley International School. Write the school's name as it should appear in the article, and say whether you would leave it in English or put any of it into Igala.";

  it("recognises a request for English prose, and not a question about a name", () => {
    expect(requestsEnglish(IDIOM_001)).toBe(true);
    expect(requestsEnglish(LEX_005)).toBe(true);
    expect(requestsEnglish(LEX_027)).toBe(true);
    expect(
      requestsEnglish("note in English how you handled the subject name"),
    ).toBe(true);
    expect(requestsEnglish(ORTH_005)).toBe(false);
    expect(requestsEnglish(GRAM_001)).toBe(false);
    expect(requestsEnglish(undefined)).toBe(false);
  });

  it("is not fooled by a negated or a quoted English phrase", () => {
    // Both shapes made the Sep 28 checker switch check (a) off (2026-10-08
    // review): the first forbids English, the second translates a phrase
    // that happens to mention it.
    expect(requestsEnglish("Do not answer in English. Say it in Igala.")).toBe(
      false,
    );
    expect(requestsEnglish("Never reply in English here.")).toBe(false);
    expect(
      requestsEnglish("Translate 'write your name in English' into Igala."),
    ).toBe(false);
    expect(requestsEnglish("Answer in Igala, not in English.")).toBe(false);
    // The Igala answer to those is held to the full allowlist.
    expect(
      checkIgalaOutput("Adsa ki wẹ.", {
        sourceText: "Do not answer in English. Say it in Igala.",
      }).map((x) => x.kind),
    ).toEqual(["banned-character"]);
    expect(
      checkIgalaOutput("Adsa ki wẹ.", {
        sourceText: "Translate 'write your name in English' into Igala.",
      }).map((x) => x.kind),
    ).toEqual(["banned-character"]);
  });

  it("does not flag the English the question asked for", () => {
    const answer =
      "Ọma mi, Ọjọ kì d'ẹnyọ ñwu wẹ. This blessing wishes her success like a river that keeps flowing.";
    expect(
      checkIgalaOutput(answer, { sourceText: IDIOM_001 }).map((x) => x.kind),
    ).toEqual([]);
  });

  it("exempts English words only, never the model's own respellings", () => {
    // The three rewritten v4.4 rows of 2026-09-28: the whole-answer exemption
    // let shọpu, yuñivasítí and yunifásítì into the queue (2026-10-08 review).
    expect(isPlainAscii("shop")).toBe(true);
    expect(isPlainAscii("psychology")).toBe(true);
    expect(isPlainAscii("shọpu")).toBe(false);
    expect(isPlainAscii("yuñivasítí")).toBe(false);
    const flagged = (answer: string, sourceText: string) =>
      checkIgalaOutput(answer, { sourceText })
        .filter((v) => v.kind === "banned-character")
        .map((v) => v.detail);
    expect(
      flagged(
        "Ọmámì onokẹlẹ, alu k'ẹ a lo t'Ankpa ọ̀na k'ẹ ch'ọna shọpu wẹ, Ọjọ kì d'ẹnyọ ñwu wẹ.\n\nThe picture inside these words compares his new business to a tree bearing sweet fruit.",
        IDIOM_002,
      ).join(" "),
    ).toMatch(/shọpu/);
    expect(
      flagged(
        "Onobulẹ lẹ á kọ ukọchẹ psychology efu yuñivasítí.\nI retained the English word \"psychology\" with its original spelling because there is no native Igala word for the field.",
        LEX_005,
      ).join(" "),
    ).toMatch(/yuñivasítí/);
    expect(
      flagged(
        "Ónokẹ́lẹ lẹ kọ economics efu yunifásítì.\n\nI kept the English word \"economics\" because there is no direct native Igala equivalent.",
        LEX_027,
      ).join(" "),
    ).toMatch(/yunifásítì/);
    // And the English sentences in those same answers are not flagged.
    expect(
      flagged(
        "Onobulẹ lẹ á kọ ukọchẹ psychology efu ilekọ.\nI retained the English word \"psychology\" because there is no native Igala word for the field.",
        LEX_005,
      ),
    ).toEqual([]);
  });
});
