import { describe, it, expect } from "vitest";
import {
  buildLanguageIdModel,
  identifyLanguage,
  crossValidateLangId,
  PROFILE_PROVENANCE,
  ORTHOGRAPHIC_SIGNATURES,
  SIGNATURE_MEASURED_AT,
  SIGNATURE_MEASURED_N,
  LANGUAGES,
  ENGLISH_LIKE,
  MIN_RELIABLE_CHARS,
} from "./langid";

/**
 * REAL community gold answers, sampled from the production ColdAuthorAnswer
 * table (isDemo=false). Embedded rather than fetched so the test is
 * deterministic and offline, and so the fixture is reviewable.
 */
const IGALA_GOLD = [
  "ọdudu",
  "Ọdudu",
  "ódùdù",
  "Ọ lo’dudu",
  "Baba ọ lo’dudu",
  "Wọla ọdudu",
  "Ọma lẹ a jẹ ñwu",
  "Ọma lẹ aj'ẹñwu",
  "Ọma le a jẹñwu",
  "Iye lẹ aj'ẹñwu",
  "I’moto",
  "Imọtọ",
  "Imoto",
  "Ụñyi",
  "Ujẹñwu",
  "Uchu",
  "Ukwọ",
  "Áttáh",
  "Abẹrẹ mẹlẹ",
  "Ọlañẹ",
  "Mama ọlañẹ",
  "Ọjọ ki deñyo ñwe",
  "Aka ma gbọ ñ oñwu chi ukwu imọtọ",
  "Egwu chi ureya ami ata ata wa",
  "ẹnẹ ki chi ìmoto dupẹ tẹkpe baki da'ñyeku ki gwi ogijo",
  "A d'ọmọ aluchẹ ẹgba k'omi chanẹ elọ",
  "A gwa luchẹ ọkọ ka ki ọmi chanẹ lọ",
  "Á jì òkò à lùchẹ tàkòmì chànẹ",
  "Á mà àtẹñwù á wá kwì èfù ájá",
  "Á tódù kọlá ñwù chẹkpà ì dólù ì",
  "Abẹ le ñw'ọjọ",
  "Ábía lẹ á rúle",
  "Àbìà lẹ à rùle",
  "Abimọtọ lẹ ach'iya",
  "Abo obulẹ mẹjì-ì chì ọmaye",
  "Ábo'gìjo ágwu amo'ma gwa",
  "Achichi kima gbọ'ọlañ a lebi ọgwu tefura",
  "Agba du ba ñwu mi",
  "Agba ẹñwu choduwẹ",
  "Agba kpia etẹkpẹ baki eda'ñyẹkwu",
  "Agba ọjọ ki pẹnẹ",
  "Agba ọmi atẹnẹ lọ ta",
  "Agba, mẹ w'ọla eche",
  "Ajẹ uchu or aj'uchu",
  "Alu ku ma luchẹ nana alu lẹ ma ja",
  "Alu ma mujọñ, ya fifon",
  "Am'onobulẹ meji lẹ ch'ọmaye ma che",
  "Ama a'ñyaja chi ẹfu aja ma gwo í",
  "Ámá má ká kìnì Ògìjò á wà, á mà dèdè ñwù",
  "amanyaja dáwa Kwa aja",
];

/** REAL prompt texts from the frozen benchmark (Prompt.text, isHoldout=true). */
const ENGLISH_PROMPTS = [
  "Write a short, natural Igala blessing as a community member would say it, not back-translated from English.",
  "Translate 'The woman cooks food' into Igala, keeping correct word order.",
  "Translate 'The man goes to the farm' into Igala with correct sentence structure.",
  "Translate 'I drink water' into Igala.",
  "Translate 'The child sleeps' into Igala.",
  "Translate 'We eat yam' into Igala, keeping correct word order.",
  "Translate 'The dog runs' into Igala.",
  "Translate 'She sells fish in the market' into Igala.",
  "Translate 'They are singing' into Igala.",
  "Translate 'My father works' into Igala.",
  "Translate 'The children play' into Igala with correct agreement.",
  "Translate 'I am hungry' into Igala.",
  "Translate 'The water is cold' into Igala.",
  "Translate 'The child ate the food yesterday' into Igala, using the correct past tense.",
  "Translate 'The woman will go to the market tomorrow' into Igala, using the correct future form.",
  "Translate 'The man who farms yam is my uncle' into Igala, keeping the relative clause natural.",
  "Give the Igala word for 'head' (the body part), making sure it is the true Igala word and not a borrowing.",
  "Give the Igala word for 'fire', and confirm it is Igala rather than a neighbouring language.",
  "Give the Igala word for 'hand'.",
  "Give the Igala word for 'sun'.",
];

const model = buildLanguageIdModel({
  igalaTexts: IGALA_GOLD,
  englishTexts: ENGLISH_PROMPTS,
});

describe("buildLanguageIdModel", () => {
  it("builds a profile for every language and reports training sizes", () => {
    for (const lang of LANGUAGES) {
      expect(model.profiles[lang]).toBeDefined();
    }
    expect(model.trainingSizes.igala).toBe(IGALA_GOLD.length);
    expect(model.trainingSizes.english).toBe(ENGLISH_PROMPTS.length);
  });

  it("labels which profiles are real data and which are weak seeds", () => {
    expect(PROFILE_PROVENANCE.igala.source).toBe("project-data");
    expect(PROFILE_PROVENANCE.english.source).toBe("project-data");
    expect(PROFILE_PROVENANCE.yoruba.source).toBe("seed-lexicon");
    expect(PROFILE_PROVENANCE.igbo.source).toBe("seed-lexicon");
    expect(PROFILE_PROVENANCE.pidgin.source).toBe("seed-lexicon");
  });
});

describe("identifyLanguage - the axis we actually trained on", () => {
  it("calls a long Igala sentence Igala", () => {
    const r = identifyLanguage(
      model,
      "Aka ma gbọ ñ oñwu chi ukwu imọtọ ka ki ali maka la",
    );
    expect(r.top).toBe("igala");
    expect(r.isIgala).toBe(true);
    expect(r.lowConfidence).toBe(false);
  });

  it("calls an English essay English-like, and definitely not Igala", () => {
    // This is the real failure the tuned model showed on ig_cult_001: a full
    // English essay in answer to an Igala prompt. The gate must catch it.
    const r = identifyLanguage(
      model,
      "The Egwu masquerade festivals in Igala society are deeply rooted in the community's spiritual and cultural beliefs, and they serve as a medium for communicating with ancestral spirits.",
    );
    expect(r.isIgala).toBe(false);
    expect(r.isEnglishLike).toBe(true);
  });

  it("DOCUMENTS that English and Pidgin are not separable by this method", () => {
    // The seed Pidgin lexicon is mostly English words, so on English prose the
    // two profiles compete and either can win. We therefore never report an
    // english-vs-pidgin split as a finding - only `isEnglishLike`.
    const r = identifyLanguage(
      model,
      "The Egwu masquerade festivals in Igala society are deeply rooted in the community's spiritual and cultural beliefs.",
    );
    expect(ENGLISH_LIKE).toContain(r.top);
  });

  it("returns a normalised probability distribution", () => {
    const r = identifyLanguage(model, "Ọma lẹ a jẹ ñwu");
    const total = LANGUAGES.reduce((s, l) => s + r.probs[l], 0);
    expect(total).toBeCloseTo(1, 8);
    expect(r.topProb).toBeGreaterThan(0);
    expect(r.topProb).toBeLessThanOrEqual(1);
  });
});

describe("identifyLanguage - abstention", () => {
  it("flags very short text as low confidence rather than guessing", () => {
    const r = identifyLanguage(model, "ọ");
    expect(r.signals.letterCount).toBeLessThan(MIN_RELIABLE_CHARS);
    expect(r.lowConfidence).toBe(true);
  });

  it("calls an empty output NOTHING, not Igala", () => {
    // A real candidate returned empty strings on several frozen prompts. Before
    // this guard the softmax tie-break silently reported them as Igala, which
    // would have credited a model for producing no answer at all.
    for (const empty of ["", "   ", "...", "\n\n"]) {
      const r = identifyLanguage(model, empty);
      expect(r.noEvidence).toBe(true);
      expect(r.isIgala).toBe(false);
      expect(r.isEnglishLike).toBe(false);
      expect(r.lowConfidence).toBe(true);
    }
  });

  it("does not set noEvidence on real text", () => {
    expect(identifyLanguage(model, "Ọma lẹ a jẹ ñwu").noEvidence).toBe(false);
  });
});

describe("orthographic signatures", () => {
  it("detects the Yoruba s-with-dot and pushes the verdict away from Igala", () => {
    // The exact example in the rubric's contamination anchor: a Yoruba greeting
    // returned for an Igala prompt.
    const r = identifyLanguage(model, "Ẹ kú àárọ̀, ẹ ṣé");
    expect(r.signals.signatureChars.yoruba).toEqual(["ṣ"]);
    expect(r.isIgala).toBe(false);
  });

  it("detects Igbo dotted vowels", () => {
    const r = identifyLanguage(model, "Kedu ka ị mere? Ọ dị mma, daalụ");
    expect(r.signals.signatureChars.igbo?.length).toBeGreaterThan(0);
    expect(r.isIgala).toBe(false);
  });

  it("treats the Igala n-tilde as POSITIVE evidence, not evidence against", () => {
    const withTilde = identifyLanguage(model, "Ọma lẹ a jẹ ñwu");
    expect(withTilde.signals.signatureChars.igala).toEqual(["ñ"]);
    expect(withTilde.top).toBe("igala");
  });

  it("is case-insensitive, because one real gold answer capitalises Ụ", () => {
    const r = identifyLanguage(model, "Ụñyi Ụñyi Ụñyi");
    expect(r.signals.signatureChars.igbo).toEqual(["ụ"]);
  });

  it("documents each signature as a DATED measurement, not a live count", () => {
    // The gold corpus grows every day annotators work, so a bare "N/937" in
    // shipped copy would silently rot. We assert the shape - a count against a
    // stated corpus size, stamped with when it was taken - rather than the
    // exact ratio, so growth does not break the test but the claim stays
    // auditable.
    for (const lang of ["igala", "yoruba", "igbo"] as const) {
      const note = ORTHOGRAPHIC_SIGNATURES[lang]?.note ?? "";
      expect(note).toContain(String(SIGNATURE_MEASURED_N));
      expect(note).toContain(SIGNATURE_MEASURED_AT);
    }
    expect(SIGNATURE_MEASURED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("does NOT let one stray character flip a long obviously-Igala passage", () => {
    const longIgala = IGALA_GOLD.slice(20).join(" ");
    const r = identifyLanguage(model, `${longIgala} ṣ`);
    expect(r.signals.signatureChars.yoruba).toEqual(["ṣ"]);
    expect(r.top).toBe("igala");
  });
});

describe("crossValidateLangId - the measured reliability number", () => {
  const cv = crossValidateLangId(IGALA_GOLD, ENGLISH_PROMPTS, 5);

  it("classifies held-out text it never saw in training", () => {
    expect(cv.overallTotal).toBe(IGALA_GOLD.length + ENGLISH_PROMPTS.length);
    // This is a real generalisation number on a small fixture; the production
    // run uses all 937 gold answers. We assert only that it is clearly better
    // than chance (1/5 languages), never that it is perfect.
    expect(cv.overallAccuracy).toBeGreaterThan(0.8);
  });

  it("names the classes it CANNOT validate", () => {
    expect(cv.validatedClasses).toEqual(["igala", "english"]);
    expect(cv.unvalidatedClasses).toEqual(["yoruba", "igbo", "pidgin"]);
  });

  it("reports per-class accuracy so a skew cannot hide behind the mean", () => {
    expect(cv.perClass.igala.total).toBe(IGALA_GOLD.length);
    expect(cv.perClass.english.total).toBe(ENGLISH_PROMPTS.length);
    expect(cv.perClass.igala.accuracy).toBeGreaterThan(0.7);
    expect(cv.perClass.english.accuracy).toBeGreaterThan(0.9);
  });

  it("reports the binary Igala/not-Igala number, which is what gates use", () => {
    expect(cv.igalaVsNotIgala.total).toBe(cv.overallTotal);
    expect(cv.igalaVsNotIgala.accuracy).toBeGreaterThanOrEqual(
      cv.overallAccuracy,
    );
    expect(cv.englishLikeAccuracy).toBeGreaterThanOrEqual(
      cv.perClass.english.accuracy,
    );
  });
});
