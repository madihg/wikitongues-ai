/**
 * LANGUAGE-IDENTITY GATE - the substrate-leakage detector.
 *
 * The headline failure of every model we have tested on Igala is answering in
 * something that is not Igala: Yoruba (Igala's closest Yoruboid relative), Igbo
 * (the dominant neighbour in training data), English, or Nigerian Pidgin. The
 * human rubric already has an axis for exactly this ("Is it Igala?") and the
 * failure-tag set has two tags for it (`not_igala`, `wrong_language`). This
 * module is the automatic version.
 *
 * METHOD: character n-gram Naive Bayes over orders 1-3, with word-boundary
 * padding, add-alpha smoothing, and a uniform prior over languages. This is the
 * classical approach - Cavnar & Trenkle (1994) "N-gram-based text
 * categorization"; Dunning (1994) "Statistical identification of language" -
 * chosen because it needs no external model, trains in milliseconds on the data
 * we already hold, and is inspectable.
 *
 * ============ WHAT THE PROFILES ARE ACTUALLY BUILT FROM ============
 * This is the part that determines what the gate can and cannot tell you, so it
 * is stated in full rather than buried:
 *
 *   igala    - REAL DATA. Built from the community gold answers
 *              (ColdAuthorAnswer.answerText) passed in by the caller. Hundreds
 *              of native-authored strings. This profile is trustworthy.
 *   english  - REAL DATA. Built from the English prompt texts we hold, plus the
 *              English glosses when supplied. Also trustworthy.
 *   yoruba   - WEAK PROXY. Built from a ~120-word hardcoded seed lexicon below.
 *              It is NOT a Yoruba corpus. It will recognise common Yoruba
 *              function words, greetings and the ṣ signature; it will miss
 *              plenty of real Yoruba.
 *   igbo     - WEAK PROXY. Same, ~110 seed words, plus the ị / ụ / ṅ signature.
 *   pidgin   - WEAKEST PROXY. Nigerian Pidgin shares most of its lexicon with
 *              English, so the pidgin/english boundary here is close to
 *              arbitrary. Treat a "pidgin" verdict as "English-like", nothing
 *              more.
 *
 * CONSEQUENCE: the only distinction this gate makes with measured reliability is
 * IGALA vs ENGLISH (see crossValidate() below, which reports it as a number).
 * A "yoruba" or "igbo" verdict is a flag for a human to look at, never a
 * finding. Any report built on this module must say so.
 *
 * ORTHOGRAPHIC SIGNATURES are handled separately from the n-gram model and
 * exposed in `signals`, because they are the one piece of hard evidence here:
 * standard Igala orthography has no ṣ, ị, ụ or ṅ, so those characters are
 * positive evidence of Yoruba/Igbo regardless of what the n-grams say. They are
 * applied as a BOUNDED log-odds adjustment (never an override) so that one
 * stray character cannot flip a long, obviously-Igala passage.
 */

import { normalizeText } from "./normalize";

export const LANGUAGES = [
  "igala",
  "yoruba",
  "igbo",
  "english",
  "pidgin",
] as const;

export type LanguageCode = (typeof LANGUAGES)[number];

/**
 * English and Nigerian Pidgin are NOT reliably separable by this method - Pidgin
 * shares most of its lexicon with English, and our Pidgin "profile" is a seed
 * word list. Any report that needs "did the model answer in English rather than
 * Igala?" should use `isEnglishLike`, which treats the pair as one class, and
 * must not quote an english-vs-pidgin split as a finding.
 */
export const ENGLISH_LIKE: LanguageCode[] = ["english", "pidgin"];

export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  igala: "Igala",
  yoruba: "Yoruba",
  igbo: "Igbo",
  english: "English",
  pidgin: "Nigerian Pidgin",
};

/** Which profiles come from real project data and which are hardcoded seeds. */
export const PROFILE_PROVENANCE: Record<
  LanguageCode,
  { source: "project-data" | "seed-lexicon"; caveat: string }
> = {
  igala: {
    source: "project-data",
    caveat: "Community gold answers (ColdAuthorAnswer). Trustworthy.",
  },
  english: {
    source: "project-data",
    caveat: "Prompt texts and English glosses. Trustworthy.",
  },
  yoruba: {
    source: "seed-lexicon",
    caveat:
      "~120 hardcoded words + the ṣ signature. Weak proxy, not a Yoruba corpus.",
  },
  igbo: {
    source: "seed-lexicon",
    caveat:
      "~110 hardcoded words + the ị/ụ/ṅ signature. Weak proxy, not an Igbo corpus.",
  },
  pidgin: {
    source: "seed-lexicon",
    caveat:
      "~70 hardcoded markers. Overlaps English almost completely; read as 'English-like'.",
  },
};

// ─── Seed lexicons (WEAK PROXIES - see the header) ──────────────────────────

/** Common Yoruba function words, greetings and high-frequency nouns. */
export const YORUBA_SEED = `mo ìwọ àwa ẹ̀yin wọn òun ni ti kí báwo ṣe wà bá fẹ́ràn ọjọ́ ilé
omi oúnjẹ ọkùnrin obìnrin ọmọ ẹ kú àárọ̀ ẹ kú alẹ́ ẹ kú ọ̀sán ẹ ṣé ó dàbọ̀ jọ̀wọ́
ọlọ́run ayé orúkọ mi ni báwo ni ṣé dáadáa ni mo wà ilẹ̀ ọ̀rọ̀ ẹ̀kọ́ ìwé ọ̀nà ẹṣin ajá
ológbò ẹyẹ ẹja igi ewé oòrùn òṣùpá ìràwọ̀ ìyá bàbá ẹ̀gbọ́n àbúrò ọkọ ìyàwó ọ̀rẹ́ ìlú
ọjà owó iṣẹ́ ẹ̀ṣẹ̀ ọwọ́ ẹsẹ̀ orí ojú etí imú ẹnu inú ara ọkàn ẹ̀jẹ̀ ounjẹ ìrèsì ẹ̀wà
ọbẹ̀ ata iyọ̀ epo ẹran ẹyin wàrà obì kọfí tíì oyin ṣúgà búrẹ́dì ìgbà kété nísisìyí
lọ́la àná lónìí òní ọ̀la èmi ìwọ àwọn gbogbo púpọ̀ díẹ̀ tóbi kékeré dúdú funfun pupa
ṣíṣe lílọ wíwá jíjẹ mímu sísùn dídúró jíjókòó rírìn sísọ gbígbọ́ rírí`;

/** Common Igbo function words, greetings and high-frequency nouns. */
export const IGBO_SEED = `nke na bụ ọ ị gị anyị unu ha ya m ndewo kedu biko daalụ nwoke
nwaanyị mmiri nri ụlọ ọzọ ihe ka gịnị ebee olee mgbe onye ọnwụ ndụ ụwa chineke aha
m bụ kedu ka ị mere ọ dị mma ezigbo ụtụtụ ọma ehihie abalị nne nna nwanne enyi
akwụkwọ osisi anwụ ọnwa kpakpando ewu ọkụkọ azụ ọkụ ala ugbua taa echi ụnyaahụ
ọtụtụ nta ukwu ojii ọcha uhie aka ụkwụ isi anya ntị imi ọnụ afọ ahụ obi ọbara
ji ede ọka akpụ nnụ mmanụ anụ akwa mmiri ara mmanya utaba jụụ ngwa ngwa ọsọ ọsọ
ọrụ ego ahịa obodo ụzọ ọdụ ụgbọala ụmụaka nwatakịrị agadi okenye`;

/** Nigerian Pidgin markers. Overlaps English heavily by design. */
export const PIDGIN_SEED = `wetin dey abeg una wahala sabi how far chop waka oga pikin
make we e go i dey na so no be dem no dey abi shey comot gist yarn palava jare sef
small small na wa o come go make i talk say e be like say person no go fit
dis dat wey wen im nadey too much plenty well well dey go dey come na him
you don do am make you no vex abeg no wahala i no sabi wetin dey happen`;

/**
 * Orthographic signature characters, MEASURED against the 937 community gold
 * answers in this project rather than assumed:
 *
 *   ṣ  0/937 gold   - Yoruba's s-with-dot-below. Igala does not write it.
 *   ị  0/937 gold   - Igbo dotted i.
 *   ṅ  0/937 gold   - Igbo n-with-dot-above.
 *   ụ  1/937 gold   - Igbo dotted u. NOT absolute: one speaker used it. This is
 *                     why signatures are a bounded nudge, never an override.
 *   ñ  226/937 gold - Igala's n-tilde (velar nasal). Standard Yoruba and Igbo
 *                     orthographies do not use it, so it is POSITIVE evidence
 *                     of Igala - the only positive signature we have.
 *
 * Igala shares ẹ and ọ (dot-below e/o) with Yoruba, so those carry no signal.
 */
export const ORTHOGRAPHIC_SIGNATURES: Partial<
  Record<LanguageCode, { chars: string[]; note: string }>
> = {
  igala: {
    chars: ["ñ"],
    note: "n-tilde is Igala orthography (226/937 community gold answers); absent from standard Yoruba and Igbo.",
  },
  yoruba: {
    chars: ["ṣ"],
    note: "s-with-dot-below is Yoruba orthography; 0/937 Igala gold answers use it.",
  },
  igbo: {
    chars: ["ị", "ụ", "ṅ"],
    note: "dotted i/u and n-with-dot-above are Igbo orthography; 1/937 Igala gold answers use any of them.",
  },
};

/**
 * Bounded log-odds bonus per DISTINCT signature character type observed, capped
 * at 3 types. Deliberately finite: a single ṣ nudges the verdict, it does not
 * dictate it.
 */
const SIGNATURE_LOG_ODDS = 2.5;
const SIGNATURE_MAX_TYPES = 3;

/**
 * Wider English function-word list than purity.ts uses. Kept SEPARATE on
 * purpose: purity.ts's list is frozen for comparability with the Rung A
 * baselines and must not be extended.
 */
const ENGLISH_FUNCTION_WORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "and",
  "or",
  "but",
  "that",
  "this",
  "it",
  "you",
  "your",
  "we",
  "they",
  "he",
  "she",
  "his",
  "her",
  "would",
  "should",
  "could",
  "can",
  "will",
  "have",
  "has",
  "had",
  "not",
  "means",
  "word",
  "means:",
  "translation",
]);

const MAX_ORDER = 3;
const SMOOTHING_ALPHA = 0.5;
/** Below this many letters a verdict is noise; we say so instead of hiding it. */
export const MIN_RELIABLE_CHARS = 6;

export interface LanguageProfile {
  lang: LanguageCode;
  /** order -> ngram -> count */
  counts: Map<number, Map<string, number>>;
  /** order -> total observed n-grams */
  totals: Map<number, number>;
  /** order -> distinct n-gram types (vocabulary size for smoothing) */
  vocab: Map<number, number>;
  nTrainingTexts: number;
}

/** Lowercase, NFC, letters/marks/apostrophes only, one padded token per word. */
function paddedWords(text: string): string[] {
  return normalizeText(text)
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{M}']/gu, ""))
    .filter((w) => w.length > 0)
    .map((w) => `^${w}$`);
}

function extractNgrams(text: string): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (let n = 1; n <= MAX_ORDER; n++) out.set(n, []);
  for (const word of paddedWords(text)) {
    const chars = Array.from(word);
    for (let n = 1; n <= MAX_ORDER; n++) {
      if (chars.length < n) continue;
      const bucket = out.get(n)!;
      for (let i = 0; i + n <= chars.length; i++) {
        bucket.push(chars.slice(i, i + n).join(""));
      }
    }
  }
  return out;
}

/** Train a character n-gram profile from a corpus of texts. */
export function buildProfile(
  lang: LanguageCode,
  texts: string[],
): LanguageProfile {
  const counts = new Map<number, Map<string, number>>();
  const totals = new Map<number, number>();
  for (let n = 1; n <= MAX_ORDER; n++) {
    counts.set(n, new Map());
    totals.set(n, 0);
  }
  for (const text of texts) {
    const grams = extractNgrams(text);
    for (const [n, list] of grams) {
      const m = counts.get(n)!;
      for (const g of list) m.set(g, (m.get(g) ?? 0) + 1);
      totals.set(n, (totals.get(n) ?? 0) + list.length);
    }
  }
  const vocab = new Map<number, number>();
  for (let n = 1; n <= MAX_ORDER; n++) vocab.set(n, counts.get(n)!.size);
  return { lang, counts, totals, vocab, nTrainingTexts: texts.length };
}

/**
 * Add-alpha smoothed log P(ngram | profile) for one order, using a SHARED
 * vocabulary size across all languages.
 *
 * Why shared and not per-profile: our profiles are trained on wildly unequal
 * corpora - 937 Igala gold answers against a ~120-word Yoruba seed list. With
 * per-profile smoothing the tiny profile gets a small denominator, so every
 * n-gram it happens to contain is assigned a HIGH probability and it wins
 * comparisons it has no right to win. Measured on production data, per-profile
 * smoothing classified only 488 of 937 Igala gold answers as Igala even with
 * the Igala profile trained on those very answers. A shared vocabulary makes a
 * data-poor profile produce diffuse, weak evidence - which is exactly what a
 * data-poor profile should produce.
 */
function logProb(
  profile: LanguageProfile,
  order: number,
  gram: string,
  sharedVocab: number,
): number {
  const c = profile.counts.get(order)?.get(gram) ?? 0;
  const total = profile.totals.get(order) ?? 0;
  // +1 reserves probability mass for n-grams unseen by EVERY profile.
  const v = sharedVocab + 1;
  return Math.log((c + SMOOTHING_ALPHA) / (total + SMOOTHING_ALPHA * v));
}

export interface LanguageIdModel {
  profiles: Record<LanguageCode, LanguageProfile>;
  /** How many texts trained each profile - surfaced so reports can caveat. */
  trainingSizes: Record<LanguageCode, number>;
  /** order -> union of n-gram types across every profile. See `logProb`. */
  sharedVocab: Map<number, number>;
}

export interface BuildModelInput {
  /** Igala gold answers. The more the better; hundreds is plenty. */
  igalaTexts: string[];
  /** English text we hold: prompt texts, English glosses. */
  englishTexts: string[];
  /** Override the seed corpora (used by tests / cross-validation). */
  yorubaTexts?: string[];
  igboTexts?: string[];
  pidginTexts?: string[];
}

export function buildLanguageIdModel(input: BuildModelInput): LanguageIdModel {
  const profiles: Record<LanguageCode, LanguageProfile> = {
    igala: buildProfile("igala", input.igalaTexts),
    english: buildProfile("english", input.englishTexts),
    yoruba: buildProfile("yoruba", input.yorubaTexts ?? [YORUBA_SEED]),
    igbo: buildProfile("igbo", input.igboTexts ?? [IGBO_SEED]),
    pidgin: buildProfile("pidgin", input.pidginTexts ?? [PIDGIN_SEED]),
  };
  const trainingSizes = Object.fromEntries(
    LANGUAGES.map((l) => [l, profiles[l].nTrainingTexts]),
  ) as Record<LanguageCode, number>;
  const sharedVocab = new Map<number, number>();
  for (let n = 1; n <= MAX_ORDER; n++) {
    const union = new Set<string>();
    for (const lang of LANGUAGES) {
      for (const gram of profiles[lang].counts.get(n)!.keys()) union.add(gram);
    }
    sharedVocab.set(n, union.size);
  }
  return { profiles, trainingSizes, sharedVocab };
}

export interface LanguageIdSignals {
  /** Distinct signature-character types found, per language. */
  signatureChars: Partial<Record<LanguageCode, string[]>>;
  /** Share of tokens that are common English function words. */
  englishFunctionWordShare: number;
  /** Letter count after normalisation - drives `lowConfidence`. */
  letterCount: number;
}

export interface LanguageIdResult {
  probs: Record<LanguageCode, number>;
  top: LanguageCode;
  topProb: number;
  /**
   * Log-odds gap between the top language and the runner-up. Small gaps mean
   * the call is a coin flip; the composite runner uses this to abstain.
   */
  margin: number;
  /**
   * True when the text contains no letters at all (empty or punctuation-only
   * output). There is nothing to classify, so `isIgala` and `isEnglishLike` are
   * both false: an empty answer is not Igala, it is nothing. Discovered on real
   * data - one candidate returned empty strings for several frozen prompts, and
   * without this guard the tie-break in the softmax reported them as Igala.
   */
  noEvidence: boolean;
  isIgala: boolean;
  /**
   * Top verdict is English or Pidgin. Use THIS, not `top === "english"`, when
   * asking whether a model answered in English - see ENGLISH_LIKE.
   */
  isEnglishLike: boolean;
  /**
   * True when the text is too short, or the margin too small, for the verdict
   * to mean anything. Callers MUST NOT count a low-confidence verdict as a
   * detection.
   */
  lowConfidence: boolean;
  signals: LanguageIdSignals;
}

/** Minimum log-odds margin for a verdict to count as confident. */
export const MIN_CONFIDENT_MARGIN = 2;

export function identifyLanguage(
  model: LanguageIdModel,
  text: string,
): LanguageIdResult {
  const normalized = normalizeText(text);
  const grams = extractNgrams(normalized);
  const letterCount = (normalized.match(/\p{L}/gu) ?? []).length;

  // Naive Bayes log-likelihood with a uniform prior.
  const scores: Record<string, number> = {};
  for (const lang of LANGUAGES) {
    let s = 0;
    for (const [n, list] of grams) {
      const v = model.sharedVocab.get(n) ?? 0;
      for (const g of list) s += logProb(model.profiles[lang], n, g, v);
    }
    scores[lang] = s;
  }

  // Orthographic signatures: bounded, additive, and reported. Lowercased so
  // "Ụñyi" is treated the same as "ụñyi" - one real gold answer is capitalised.
  const signatureChars: Partial<Record<LanguageCode, string[]>> = {};
  const nfcLower = normalized.normalize("NFC").toLowerCase();
  for (const [lang, sig] of Object.entries(ORTHOGRAPHIC_SIGNATURES)) {
    if (!sig) continue;
    const found = sig.chars.filter((c) => nfcLower.includes(c));
    if (found.length === 0) continue;
    signatureChars[lang as LanguageCode] = found;
    const bonus =
      Math.min(found.length, SIGNATURE_MAX_TYPES) * SIGNATURE_LOG_ODDS;
    scores[lang] += bonus;
    // A character Igala does not write is symmetric evidence AGAINST Igala -
    // but only for the other languages' signatures, obviously not for its own.
    if (lang !== "igala") scores.igala -= bonus;
  }

  const tokens = normalized.toLowerCase().split(/\s+/).filter(Boolean);
  const englishHits = tokens.filter((t) =>
    ENGLISH_FUNCTION_WORDS.has(t.replace(/[^\p{L}\p{M}']/gu, "")),
  ).length;
  const englishFunctionWordShare =
    tokens.length > 0 ? englishHits / tokens.length : 0;

  // Softmax over log-likelihoods.
  const values = LANGUAGES.map((l) => scores[l]);
  const max = Math.max(...values);
  const exps = values.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  const probs = Object.fromEntries(
    LANGUAGES.map((l, i) => [l, exps[i] / sum]),
  ) as Record<LanguageCode, number>;

  const ordered = [...LANGUAGES].sort((a, b) => scores[b] - scores[a]);
  const top = ordered[0];
  const margin = scores[ordered[0]] - scores[ordered[1]];

  const noEvidence = letterCount === 0;

  return {
    probs,
    top,
    topProb: probs[top],
    margin,
    noEvidence,
    isIgala: !noEvidence && top === "igala",
    isEnglishLike: !noEvidence && ENGLISH_LIKE.includes(top),
    lowConfidence:
      noEvidence ||
      letterCount < MIN_RELIABLE_CHARS ||
      margin < MIN_CONFIDENT_MARGIN,
    signals: { signatureChars, englishFunctionWordShare, letterCount },
  };
}

// ─── Measuring the gate's own reliability ───────────────────────────────────

export interface CrossValidationResult {
  /** Per-class accuracy: label -> {correct, total, accuracy}. */
  perClass: Record<
    string,
    { correct: number; total: number; accuracy: number }
  >;
  overallCorrect: number;
  overallTotal: number;
  overallAccuracy: number;
  folds: number;
  /**
   * The number that actually matters operationally: is a text Igala, or not?
   * A "pidgin" or "yoruba" verdict on an English text still correctly says
   * "not Igala", and an English text is only wrong here if it is called Igala.
   */
  igalaVsNotIgala: { correct: number; total: number; accuracy: number };
  /**
   * English-class accuracy when Pidgin is allowed to count as English (the two
   * are not separable by this method - see ENGLISH_LIKE).
   */
  englishLikeAccuracy: number;
  /**
   * The classes actually validated. Yoruba/Igbo/Pidgin are absent because we
   * hold no labelled data for them - which is the point.
   */
  validatedClasses: string[];
  unvalidatedClasses: string[];
}

function chunk<T>(items: T[], k: number): T[][] {
  const out: T[][] = Array.from({ length: k }, () => []);
  items.forEach((item, i) => out[i % k].push(item));
  return out;
}

/**
 * K-fold cross-validation of the ONLY axis we have labelled data for:
 * Igala (community gold) vs English (prompt texts). Held-out texts are removed
 * from the profile before being classified, so this is an honest generalisation
 * estimate, not a memorisation score.
 *
 * A text is scored CORRECT if the top language equals its true label. Verdicts
 * of "pidgin" on an English text count as WRONG even though they are arguably
 * excusable - we do not grade on a curve.
 */
export function crossValidateLangId(
  igalaTexts: string[],
  englishTexts: string[],
  folds = 5,
): CrossValidationResult {
  const k = Math.max(2, folds);
  const igalaFolds = chunk(igalaTexts, k);
  const englishFolds = chunk(englishTexts, k);

  const perClass: Record<
    string,
    { correct: number; total: number; accuracy: number }
  > = {
    igala: { correct: 0, total: 0, accuracy: 0 },
    english: { correct: 0, total: 0, accuracy: 0 },
  };
  let englishLikeCorrect = 0;
  let binaryCorrect = 0;
  let binaryTotal = 0;

  for (let f = 0; f < k; f++) {
    const trainIgala = igalaFolds.filter((_, i) => i !== f).flat();
    const trainEnglish = englishFolds.filter((_, i) => i !== f).flat();
    if (trainIgala.length === 0 || trainEnglish.length === 0) continue;
    const model = buildLanguageIdModel({
      igalaTexts: trainIgala,
      englishTexts: trainEnglish,
    });
    for (const t of igalaFolds[f]) {
      perClass.igala.total++;
      binaryTotal++;
      const r = identifyLanguage(model, t);
      if (r.top === "igala") perClass.igala.correct++;
      if (r.isIgala) binaryCorrect++;
    }
    for (const t of englishFolds[f]) {
      perClass.english.total++;
      binaryTotal++;
      const r = identifyLanguage(model, t);
      if (r.top === "english") perClass.english.correct++;
      if (r.isEnglishLike) englishLikeCorrect++;
      if (!r.isIgala) binaryCorrect++;
    }
  }

  for (const key of Object.keys(perClass)) {
    const c = perClass[key];
    c.accuracy = c.total > 0 ? c.correct / c.total : 0;
  }
  const overallCorrect = Object.values(perClass).reduce(
    (s, c) => s + c.correct,
    0,
  );
  const overallTotal = Object.values(perClass).reduce((s, c) => s + c.total, 0);

  return {
    perClass,
    overallCorrect,
    overallTotal,
    overallAccuracy: overallTotal > 0 ? overallCorrect / overallTotal : 0,
    folds: k,
    igalaVsNotIgala: {
      correct: binaryCorrect,
      total: binaryTotal,
      accuracy: binaryTotal > 0 ? binaryCorrect / binaryTotal : 0,
    },
    englishLikeAccuracy:
      perClass.english.total > 0
        ? englishLikeCorrect / perClass.english.total
        : 0,
    validatedClasses: ["igala", "english"],
    unvalidatedClasses: ["yoruba", "igbo", "pidgin"],
  };
}
