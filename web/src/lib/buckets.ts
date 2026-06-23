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
  },
  {
    key: "grammar_tone",
    num: 2,
    label: "Grammar, morphology & tone",
    short: "Grammar & tone",
    description:
      "Igala is tonal. Tone is largely unmarked in available text, so this is as much a data-creation problem as a method one.",
    family: "linguistic",
  },
  {
    key: "lexicon_disambig",
    num: 3,
    label: "Lexicon & disambiguation",
    short: "Lexicon",
    description:
      "Correct Igala words, no bleed from neighbors. Observed confusion: Idoma. Genetic interference risk during training: Yoruba/Igbo (Igala is Yoruboid). Flag for Lydia.",
    family: "linguistic",
  },
  {
    key: "dialectal_fidelity",
    num: 4,
    label: "Dialectal fidelity",
    short: "Dialect",
    description:
      "No collapse to a single prestige standard. Multi-annotator agreement guards against it.",
    family: "linguistic",
  },
  {
    key: "register_honorifics",
    num: 5,
    label: "Register & honorifics",
    short: "Register",
    description:
      "Correct register and honorific conventions. Rule-like; strongest preference-optimization bucket.",
    family: "cultural",
  },
  {
    key: "idioms_metaphor",
    num: 6,
    label: "Idioms, metaphor & floating motifs",
    short: "Idioms",
    description:
      "Idioms read culturally, not literally. Novel idioms stay hard regardless of method.",
    family: "cultural",
  },
  {
    key: "cultural_values",
    num: 7,
    label: "Cultural knowledge & values",
    short: "Culture",
    description:
      "Taboo, sacred, local knowledge and values. Keep facts in retrieval, not weights.",
    family: "cultural",
  },
  {
    key: "authenticity",
    num: 8,
    label: "Authenticity vs translationese",
    short: "Authenticity",
    description: "Community-written, not back-translated from English.",
    family: "cultural",
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
