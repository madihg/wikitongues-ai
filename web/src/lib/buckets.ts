import type { EvalBucket } from "@prisma/client";

/**
 * PROMPT CATEGORIES (what a prompt tests) — the Prisma `EvalBucket` enum values,
 * relabelled to Lydia's Jul-6 taxonomy. Distinct from the RUBRIC AXES an output
 * is scored on (RUBRIC_V2 below): a prompt category maps to the SUBSET of axes
 * that are in-scope for it (`axes`), so a spelling prompt doesn't force a
 * grammar score and a greeting prompt doesn't force a spelling score. Everything
 * off-scope defaults to N/A. Enum keys are internal; labels are what people see,
 * so we can rename categories without a migration.
 */
export interface BucketDef {
  key: EvalBucket;
  num: number;
  label: string;
  short: string;
  description: string;
  family: "linguistic" | "cultural";
  /**
   * How the winner is scored in the annotation episode:
   *  - "subjective": blind preference, no reference shown (the fluent speaker IS
   *    the authority on form/feel). A low score forces a written rationale.
   *  - "factual": scored against a shown RAG reference so fluency can't rescue an
   *    invented fact (cultural knowledge, idiom meaning, lexical disambiguation).
   */
  scoring: "subjective" | "factual";
  /** The single fail-mode the annotator should watch for on this category. */
  watchFor: string;
  /**
   * A one-line, plain-English hint shown in the "your answer" step telling the
   * annotator what a good gold answer looks like for THIS category — e.g. that a
   * proverb prompt wants the proverb an Igala speaker would actually use, not a
   * word-for-word translation (the confusion Agnes hit on the call).
   */
  goldHint: string;
  /** RUBRIC_V2 axis keys that are in-scope for prompts in this category. */
  axes: string[];
}

export const BUCKETS: BucketDef[] = [
  {
    key: "orthography",
    num: 1,
    label: "Spelling & tone marks",
    short: "Spelling",
    description:
      "Single words and short forms where getting the letters and the tone marks right is the whole point.",
    family: "linguistic",
    scoring: "subjective",
    watchFor:
      "Wrong or missing tone marks / dotted vowels, or English-influenced spelling.",
    goldHint:
      "Spelling and tone marks matter most here - write the exact letters, dotted vowels (ẹ, ọ), and tone marks.",
    axes: ["spelling", "diacritics", "lexicon"],
  },
  {
    key: "grammar_tone",
    num: 2,
    label: "Grammar & sentence structure",
    short: "Grammar",
    description:
      "Full sentences that test word order, tense, and agreement — e.g. keeping correct SVO order in a translation.",
    family: "linguistic",
    scoring: "subjective",
    watchFor:
      "Wrong word order, tense, or agreement — even when the individual words are right.",
    goldHint:
      "Give a full, natural Igala sentence - correct word order, tense, and agreement, not just the right words.",
    axes: ["syntax", "semantics", "lexicon"],
  },
  {
    key: "lexicon_disambig",
    num: 3,
    label: "Vocabulary & word meaning",
    short: "Vocabulary",
    description:
      "The right Igala word, no bleed from neighbours, and tone-distinguished meanings (Igala is Yoruboid; observed confusion with Idoma / Yoruba / Igbo).",
    family: "linguistic",
    scoring: "factual",
    watchFor:
      "A wrong word, or one that bled in from Idoma / Yoruba / Igbo / English instead of true Igala.",
    goldHint:
      "Use the true Igala word for this - not one borrowed from Idoma, Yoruba, Igbo, or English.",
    axes: ["lexicon", "contamination", "semantics", "diacritics"],
  },
  {
    key: "register_honorifics",
    num: 4,
    label: "Register, tone & honorifics",
    short: "Register",
    description:
      "The same content across registers — angry vs polite, to an elder vs a friend — and the deference forms that go with them.",
    family: "cultural",
    scoring: "subjective",
    watchFor:
      "Wrong level of deference or tone-of-voice for who is speaking to whom.",
    goldHint:
      "Say it the way you would to THAT person - match the respect level and tone of voice for who is speaking to whom.",
    axes: ["authenticity", "cultural_relevance", "semantics"],
  },
  {
    key: "idioms_metaphor",
    num: 5,
    label: "Figurative language",
    short: "Figurative",
    description:
      "Idioms, metaphor, proverbs and floating motifs — read culturally, not literally.",
    family: "cultural",
    scoring: "factual",
    watchFor: "Is the proverb read literally instead of for its real meaning?",
    goldHint:
      "Give the proverb an Igala speaker would actually use in this situation - not a word-for-word translation.",
    axes: ["semantics", "cultural_relevance", "authenticity", "contamination"],
  },
  {
    key: "cultural_values",
    num: 6,
    label: "Cultural knowledge & values",
    short: "Culture",
    description:
      "Taboo, sacred, and local knowledge — where a fluent-sounding but invented fact is the danger.",
    family: "cultural",
    scoring: "factual",
    watchFor:
      "Plausible-but-invented detail about Igala people, places, lineage, or taboo.",
    goldHint:
      "Answer from real Igala knowledge - if you are not sure of a detail, say so rather than inventing one.",
    axes: ["cultural_relevance", "contamination", "authenticity", "semantics"],
  },
  {
    key: "authenticity",
    num: 7,
    label: "Authenticity & naturalness",
    short: "Authenticity",
    description:
      "Would a real Igala speaker say it this way, or does it read back-translated from English?",
    family: "cultural",
    scoring: "subjective",
    watchFor:
      "Reads translated-from-English rather than how an Igala speaker would actually say it.",
    goldHint:
      "Write it the way a real Igala speaker would actually say it, not translated word-for-word from English.",
    axes: ["authenticity", "cultural_relevance", "contamination"],
  },
  {
    // Parked per Lydia's Jul-6 finding (Igala dialects are largely mutually
    // intelligible — Unubi & Atadosa 2019). Kept as an experimental category;
    // likely becomes a code-switching benchmark rather than a quality axis.
    key: "dialectal_fidelity",
    num: 8,
    label: "Dialect & code-switching (experimental)",
    short: "Dialect",
    description:
      "Experimental: does the model collapse to one prestige dialect, or mix dialects oddly within a phrase? To be resolved with Agnes.",
    family: "linguistic",
    scoring: "subjective",
    watchFor:
      "Collapse to one prestige standard, or unnatural mixing of dialect forms.",
    goldHint:
      "Write it in your own natural Igala - your everyday dialect is exactly what we want here.",
    axes: ["contamination", "authenticity"],
  },
];

export const BUCKET_KEYS: EvalBucket[] = BUCKETS.map((b) => b.key);

const BUCKET_BY_KEY: Record<string, BucketDef> = Object.fromEntries(
  BUCKETS.map((b) => [b.key, b]),
);

export function bucketDef(key: EvalBucket): BucketDef {
  return BUCKET_BY_KEY[key];
}

export function bucketLabel(key: EvalBucket | null | undefined): string {
  if (!key) return "Unassigned";
  return BUCKET_BY_KEY[key]?.label ?? key;
}

export function bucketShort(key: EvalBucket | null | undefined): string {
  if (!key) return "—";
  return BUCKET_BY_KEY[key]?.short ?? key;
}

export function bucketWatchFor(key: EvalBucket | null | undefined): string {
  if (!key) return "";
  return BUCKET_BY_KEY[key]?.watchFor ?? "";
}

/** One-line plain-English guidance for the "your answer" step, per category. */
export function bucketGoldHint(key: EvalBucket | null | undefined): string {
  if (!key) return "";
  return BUCKET_BY_KEY[key]?.goldHint ?? "";
}

/** "factual" buckets show a RAG reference for fact-checking; "subjective" stay blind. */
export function bucketScoring(
  key: EvalBucket | null | undefined,
): "subjective" | "factual" {
  if (!key) return "subjective";
  return BUCKET_BY_KEY[key]?.scoring ?? "subjective";
}

export function isFactualBucket(key: EvalBucket | null | undefined): boolean {
  return bucketScoring(key) === "factual";
}

/** RUBRIC_V2 axis keys in-scope for a prompt category. Empty (all axes) if unknown. */
export function axesForBucket(key: EvalBucket | null | undefined): string[] {
  if (!key) return [];
  return BUCKET_BY_KEY[key]?.axes ?? [];
}

/**
 * Whether the episode should ask the annotator to author their own answer FIRST
 * (cold / source-free gold), before any model output is revealed. Always on for
 * the two highest-value buckets (register is the strongest preference bucket,
 * tone the most diagnostic); a deterministic ~1-in-3 sample of the rest, so the
 * slow cold-author step doesn't gate every single item.
 */
export function isGoldFirstBucket(key: EvalBucket | null | undefined): boolean {
  return key === "register_honorifics" || key === "grammar_tone";
}

// ─── RUBRIC AXES (rubric v-next, aligned to Lydia's Jul-6 revision) ──────────
// Axes are DATA, not schema, so this set stays mutable for the ~2 weeks of live
// annotation before it stabilises — no migration to rename/add/drop an axis, and
// every score is stamped with RUBRIC_VERSION so a change never silently mixes
// data. Two passes: the language itself (scored first), then a reflective
// "as a whole" pass. Scale 0-5 (0 = completely wrong, anchors below) or N/A.
//
// Deltas from the first draft, per the Jul-6 calls + our recommendation:
//  - "Words" -> "Word choice", "Diacritics" -> "Tone marks", "Meaning" kept
//    plain — accessible to non-linguist annotators (Sonja's concern).
//  - DROPPED "dialect" as a scored axis (Igala dialects are largely mutually
//    intelligible; it becomes a separate code-switching benchmark, not a score).
//  - KEPT "Is it Igala?" (cross-linguistic contamination) as its OWN axis rather
//    than folding it into authenticity — it is the headline, most-measurable,
//    most-trainable failure mode and must be reportable on its own.
export const RUBRIC_VERSION = "v3";

export interface RubricV2Axis {
  key: string;
  label: string;
  description: string;
  pass: "linguistic" | "pragmatics";
}

export const RUBRIC_V2: RubricV2Axis[] = [
  {
    key: "syntax",
    label: "Grammar & word order",
    description:
      "Is the grammatical structure right — word order, tense, agreement?",
    pass: "linguistic",
  },
  {
    key: "lexicon",
    label: "Word choice",
    description:
      "Are these real, correct Igala words — nothing invented, nothing borrowed from another language?",
    pass: "linguistic",
  },
  {
    key: "spelling",
    label: "Spelling",
    description: "Are the words spelled correctly (the letters themselves)?",
    pass: "linguistic",
  },
  {
    key: "diacritics",
    label: "Tone marks",
    description:
      "Are the tone marks and dotted vowels present and correct? This is where Igala models fail most.",
    pass: "linguistic",
  },
  {
    key: "semantics",
    label: "Meaning",
    description:
      "Did the intended meaning come across, even if the wording isn't perfect?",
    pass: "linguistic",
  },
  {
    key: "cultural_relevance",
    label: "Cultural fit",
    description:
      "Does the content match Igala culture and practice (not a Western-centric assumption)?",
    pass: "pragmatics",
  },
  {
    key: "authenticity",
    label: "Authenticity",
    description:
      "Would a real Igala speaker actually say it this way — natural register and tone, not translated-from-English?",
    pass: "pragmatics",
  },
  {
    key: "contamination",
    label: "Is it Igala?",
    description:
      "Free of bleed from Yoruba, Idoma, Igbo, or English — in words, grammar, or references. 5 = fully Igala, 0 = another language.",
    pass: "pragmatics",
  },
];

export const RUBRIC_V2_KEYS = RUBRIC_V2.map((a) => a.key);

export function isRubricV2Axis(value: unknown): boolean {
  return typeof value === "string" && RUBRIC_V2_KEYS.includes(value);
}

export function rubricV2Label(key: string): string {
  return RUBRIC_V2.find((a) => a.key === key)?.label ?? key;
}

/** Generic 0-5 wording, shown on hover over each score button. */
export const RUBRIC_ANCHORS: Record<number, string> = {
  0: "Completely wrong — nothing is correct",
  1: "Many mistakes; only one or two things correct",
  2: "Somewhat accurate; several mistakes",
  3: "About half right",
  4: "Mostly accurate; a few mistakes",
  5: "Very accurate — I'd say it like this",
};

/**
 * Per-axis worked examples of the 0 / 3 / 5 points, shown UNDER each axis so an
 * annotator sees exactly what they're rating. Draft anchors: the concepts are
 * solid and the cross-linguistic-contamination example uses real Yoruba, but
 * the Igala-specific wording is illustrative and will be replaced with
 * community-vetted examples by Lydia/Agnes. Kept as config so that swap is a
 * one-line edit, no migration.
 */
export interface AxisAnchor {
  score: number;
  text: string;
}

export const RUBRIC_AXIS_ANCHORS: Record<string, AxisAnchor[]> = {
  syntax: [
    {
      score: 0,
      text: "Words are jumbled or in English order — it doesn't read as an Igala sentence.",
    },
    {
      score: 3,
      text: "Mostly the right order, but one part is off (a misplaced verb, or the wrong tense).",
    },
    {
      score: 5,
      text: "Correct Igala word order, tense and agreement all the way through.",
    },
  ],
  lexicon: [
    {
      score: 0,
      text: "The key word is invented, or borrowed from another language, not Igala.",
    },
    {
      score: 3,
      text: "Real Igala words, but one is the wrong choice for the meaning here.",
    },
    {
      score: 5,
      text: "Every word is the correct, natural Igala word for what's meant.",
    },
  ],
  spelling: [
    {
      score: 0,
      text: "English-ised spelling — dotted vowels (ẹ, ọ) written as plain e / o.",
    },
    { score: 3, text: "Recognisable, but with a couple of letter mistakes." },
    {
      score: 5,
      text: "Spelled correctly, including ẹ / ọ and the right letters throughout.",
    },
  ],
  diacritics: [
    {
      score: 0,
      text: "No tone marks at all — the word is written bare, so its meaning is ambiguous.",
    },
    {
      score: 3,
      text: "Some tone marks present, but at least one is missing or on the wrong vowel.",
    },
    { score: 5, text: "All tone marks and dotted vowels present and correct." },
  ],
  semantics: [
    { score: 0, text: "Says something unrelated to what was asked." },
    {
      score: 3,
      text: "The gist is there, but part of the meaning is lost or changed.",
    },
    { score: 5, text: "Conveys exactly the intended meaning." },
  ],
  cultural_relevance: [
    {
      score: 0,
      text: "Assumes a Western norm that doesn't fit Igala practice.",
    },
    {
      score: 3,
      text: "Broadly appropriate, but a detail doesn't match Igala custom.",
    },
    {
      score: 5,
      text: "Fully matches how this is actually done in Igala culture.",
    },
  ],
  authenticity: [
    {
      score: 0,
      text: "Reads as a stiff, word-for-word translation from English.",
    },
    {
      score: 3,
      text: "Understandable, but not quite how a native speaker would phrase it.",
    },
    { score: 5, text: "Exactly how a real Igala speaker would say it." },
  ],
  contamination: [
    {
      score: 0,
      text: 'It\'s another language — e.g. the Yoruba greeting "Ẹ kú àárọ̀" returned for an Igala prompt.',
    },
    {
      score: 3,
      text: "Mostly Igala, but a word or phrase has bled in from Yoruba / Idoma / Igbo / English.",
    },
    {
      score: 5,
      text: "Entirely Igala, with no bleed from any other language.",
    },
  ],
};

export function axisAnchors(key: string): AxisAnchor[] {
  return RUBRIC_AXIS_ANCHORS[key] ?? [];
}

/** The four scored rubric axes (creativeDepth was renamed to culturalNormAdherence). */
export interface RubricAxis {
  key:
    | "culturalAccuracy"
    | "linguisticAuthenticity"
    | "culturalNormAdherence"
    | "factualCorrectness";
  notesKey:
    | "notesCulturalAccuracy"
    | "notesLinguisticAuthenticity"
    | "notesCulturalNormAdherence"
    | "notesFactualCorrectness";
  label: string;
  description: string;
}

export const RUBRIC_AXES: RubricAxis[] = [
  {
    key: "culturalAccuracy",
    notesKey: "notesCulturalAccuracy",
    label: "Cultural accuracy",
    description: "Does the response reflect Igala cultural reality and values?",
  },
  {
    key: "linguisticAuthenticity",
    notesKey: "notesLinguisticAuthenticity",
    label: "Linguistic authenticity",
    description: "Is the Igala natural and correct (spelling, grammar, tone)?",
  },
  {
    key: "culturalNormAdherence",
    notesKey: "notesCulturalNormAdherence",
    label: "Cultural-norm adherence",
    description:
      "Does it respect honorifics, register, taboo and sacred norms?",
  },
  {
    key: "factualCorrectness",
    notesKey: "notesFactualCorrectness",
    label: "Factual correctness",
    description: "Are the facts about Igala language and culture correct?",
  },
];

export const RUBRIC_KEYS = RUBRIC_AXES.map((a) => a.key);

export function isBucket(value: unknown): value is EvalBucket {
  return typeof value === "string" && BUCKET_KEYS.includes(value as EvalBucket);
}
