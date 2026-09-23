import { describe, it, expect } from "vitest";
import {
  checkIgalaOutput,
  findAllowlistViolations,
  findDroppedNames,
  findSourceProperNouns,
  isTranslationRequest,
  labelRunsRepairRound,
  REPAIR_ROUND_VERSION_LABELS,
  sourceWordSet,
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
  it("is v4.1 through v4.4, and nothing else", () => {
    expect([...REPAIR_ROUND_VERSION_LABELS]).toEqual([
      "rag-v4-1",
      "rag-v4-2",
      "rag-v4-3",
      "rag-v4-4",
    ]);
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
