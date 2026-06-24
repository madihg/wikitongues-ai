import type { EvalBucket } from "@prisma/client";

/**
 * The 8 Igala evaluation buckets. Each bucket is three things at once:
 * a prompt category, a rubric axis, and a data-collection target.
 * Canonical taxonomy for the whole platform. Keep in sync with the
 * Prisma `EvalBucket` enum.
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
  /** The single fail-mode the annotator should watch for on this bucket. */
  watchFor: string;
}

export const BUCKETS: BucketDef[] = [
  {
    key: "orthography",
    num: 1,
    label: "Orthography & spelling",
    short: "Orthography",
    description:
      "Correct spelling and diacritics. Only weights truly teach letterforms.",
    family: "linguistic",
    scoring: "subjective",
    watchFor:
      "Wrong or missing diacritics, dropped tone marks, or English-influenced spelling.",
  },
  {
    key: "grammar_tone",
    num: 2,
    label: "Grammar, morphology & tone",
    short: "Grammar & tone",
    description:
      "Igala is tonal. Tone is largely unmarked in available text, so this is as much a data-creation problem as a method one.",
    family: "linguistic",
    scoring: "subjective",
    watchFor:
      "Is the tone melody preserved? Watch for dropped tone marks and wrong morphology.",
  },
  {
    key: "lexicon_disambig",
    num: 3,
    label: "Lexicon & disambiguation",
    short: "Lexicon",
    description:
      "Correct Igala words, no bleed from neighbors. Observed confusion: Idoma. Genetic interference risk during training: Yoruba/Igbo (Igala is Yoruboid). Flag for Lydia.",
    family: "linguistic",
    scoring: "factual",
    watchFor:
      "A wrong word, or one that bled in from Idoma / Yoruba / Igbo instead of true Igala.",
  },
  {
    key: "dialectal_fidelity",
    num: 4,
    label: "Dialectal fidelity",
    short: "Dialect",
    description:
      "No collapse to a single prestige standard. Multi-annotator agreement guards against it.",
    family: "linguistic",
    scoring: "subjective",
    watchFor:
      "Collapse to one prestige standard, or a form that erases your dialect's variant.",
  },
  {
    key: "register_honorifics",
    num: 5,
    label: "Register & honorifics",
    short: "Register",
    description:
      "Correct register and honorific conventions. Rule-like; strongest preference-optimization bucket.",
    family: "cultural",
    scoring: "subjective",
    watchFor:
      "Wrong deference — is the honorific form right for who is speaking to whom?",
  },
  {
    key: "idioms_metaphor",
    num: 6,
    label: "Idioms, metaphor & floating motifs",
    short: "Idioms",
    description:
      "Idioms read culturally, not literally. Novel idioms stay hard regardless of method.",
    family: "cultural",
    scoring: "factual",
    watchFor: "Is the proverb read literally instead of for its real meaning?",
  },
  {
    key: "cultural_values",
    num: 7,
    label: "Cultural knowledge & values",
    short: "Culture",
    description:
      "Taboo, sacred, local knowledge and values. Keep facts in retrieval, not weights.",
    family: "cultural",
    scoring: "factual",
    watchFor:
      "Plausible-but-invented detail about Igala people, places, lineage, or taboo.",
  },
  {
    key: "authenticity",
    num: 8,
    label: "Authenticity vs translationese",
    short: "Authenticity",
    description: "Community-written, not back-translated from English.",
    family: "cultural",
    scoring: "subjective",
    watchFor:
      "Does it read translated-from-English rather than how an Igala speaker would actually say it?",
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
