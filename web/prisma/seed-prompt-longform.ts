/**
 * Seed the Igala PROMPT BANK - LONG-FORM + COVERAGE WAVE (v2).
 *
 * WHY THIS WAVE. The first 300-prompt bank (prisma/seed-prompt-bank.ts) is
 * excellent but its gold skews to single words and single sentences, and the
 * coverage audit (tasks/coverage-audit-v1.md) found two compounding gaps:
 * passage-length gold is functionally absent (1 of 547 rows), and whole DOMAINS
 * (civic_news, modern_life_tech, body_health) are near-zero and absent from the
 * frozen benchmark. The steering metric is now TOKENS PER ANNOTATOR HOUR, so
 * this wave pushes connected text AND fills the domain gaps.
 *
 * THREE PARTS, one file:
 *   PART 1  ig_lf_<short>_NNN   100 prompts aligned to the audit's "quota for the
 *                               next 100 prompts" (section e): a 9-domain x
 *                               3-length matrix. EVERY prompt states its target
 *                               elicitation length in its own instruction text
 *                               ("in one word", "in one sentence", "in three or
 *                               four sentences") - audit observation 3 found that
 *                               annotators default to minimal answers otherwise.
 *   PART 2  ig_motif_NNN        ~35 floating-motif prompts. Each names a
 *                               comparative-folklore motif in plain words and
 *                               asks, conditionally, whether Igala tradition has
 *                               it - never presuming that it does.
 *   PART 3  ig_use_NNN          ~30 enrichment prompts that take the most common
 *                               single-word gold concepts already in the
 *                               production DB and ask for the word USED in two
 *                               or three natural sentences (connected text).
 *
 * PART 1 QUOTA (from coverage-audit-v1.md section e; the script asserts the
 * built set matches this exactly before any write):
 *   civic_news             16 = 4 word /  6 sentence / 6 passage
 *   modern_life_tech       14 = 4 word /  6 sentence / 4 passage
 *   kinship_ceremony       14 = 3 word /  6 sentence / 5 passage
 *   faith_proverbs_stories 14 = 2 word /  5 sentence / 7 passage
 *   body_health            12 = 3 word /  6 sentence / 3 passage
 *   weather_nature         10 = 3 word /  5 sentence / 2 passage
 *   market_trade            8 = 2 word /  4 sentence / 2 passage
 *   household_daily_life     6 = 1 word /  3 sentence / 2 passage
 *   farm_food                6 = 1 word /  3 sentence / 2 passage
 *   Total 100 = 23 word / 44 sentence / 33 passage.
 * Three audit findings honoured: (1) civic_news + modern_life_tech get real
 * weight (they are volume-poor AND absent from the frozen exam); (2) body_health
 * is built as real illness/wellness/care sub-topics, not more body-part words,
 * with traditional-remedy specifics deferred to the annotator; (3) explicit
 * target length in every instruction. Register variety follows the quota's
 * register notes: casual/peer voice is seeded across most domains (a corpus-wide
 * gap, audit finding 4), while household/farm stay neutral (already saturated).
 *
 * SAFETY - this is a PRODUCTION database with live annotators:
 *  - CREATE-ONLY. Every row is upserted by promptId with `update: {}`, so a
 *    re-run never mutates or deletes an existing row. Rows from the v1 bank, the
 *    original seeds, and any community-authored holdouts are never touched.
 *  - Fresh, collision-proof namespaces: ig_lf_<short>_NNN, ig_motif_NNN,
 *    ig_use_NNN. None overlap the v1 ig_bank_<short>_NNN namespace.
 *  - All rows: split "train", isHoldout false, provenance
 *    "claude_authored_v2_longform". Held-out/test prompts must be community
 *    authored and are out of scope here.
 *
 * AUTHORING RULES (unchanged from v1, per Lydia + src/lib/buckets.ts):
 *  - English instructions only. A community drive adds Igala-authored ones.
 *  - Never assert an unverified cultural fact. Where a specific is uncertain
 *    (vs Yoruba/Igbo/Idoma), the prompt DEFERS to the annotator ("as it is
 *    genuinely done in your community", "only state what you are sure of").
 *  - No em dashes (" - " instead), no emojis.
 *  - SINGLE-TARGET per prompt (Lydia's rule): each prompt asks for exactly one
 *    thing, so the episode has one unambiguous gold target. (A "proverb +
 *    explanation + example" passage is one connected answer, per the audit's
 *    observation 10 model of what a passage should look like, not two targets.)
 *
 * DOMAIN / LENGTH / REGISTER are AUTHORING METADATA only, used for the quota
 * assertion and the coverage report. The Prompt table has no such columns (the
 * audit derives domain by keyword rules), so they are NOT written to the DB;
 * each row still persists just its EvalBucket, text, difficulty, etc.
 *
 * GOLD-HINT COMPATIBILITY (buckets stay as-is; NO src/lib/buckets.ts change).
 * The "your answer" step shows the annotator a per-category goldHint. These
 * prompts are authored to remain answerable exactly as each goldHint describes:
 *   lexicon_disambig    -> "Use the true Igala word for this - not one borrowed
 *                           from Idoma, Yoruba, Igbo, or English." Every
 *                           word-tier prompt asks for the true Igala word and
 *                           flags borrowing risk (phone, government, school...).
 *   grammar_tone        -> "Give a full, natural Igala sentence - correct word
 *                           order, tense, and agreement." Single-sentence and
 *                           ordered procedural prompts want exactly that.
 *   authenticity        -> "Write it the way a real Igala speaker would actually
 *                           say it, not translated word-for-word from English."
 *                           Casual/peer, descriptive and personal-voice prompts,
 *                           plus the Part 3 "use the word" prompts.
 *   cultural_values     -> "Answer from real Igala knowledge - if you are not
 *                           sure of a detail, say so rather than inventing one."
 *                           Every custom/governance/care prompt defers specifics.
 *   idioms_metaphor     -> "Give the proverb an Igala speaker would actually use
 *                           ... not a word-for-word translation." Proverb and
 *                           folktale prompts, and the conditional Part 2 motifs.
 *   register_honorifics -> "Say it the way you would to THAT person - match the
 *                           respect level and tone." Elder-facing blessings,
 *                           condolences and deferential requests name the
 *                           speaker/hearer so the register is unambiguous.
 *
 * BEREZKIN SOURCING (Part 2). Berezkin's online motif database
 * (https://ruthenia.ru/folklore/berezkin/) was fetched but is a Russian-only
 * frameset (Windows-1251); its index, section pages, and entry pages carry no
 * accessible English motif catalogue. Per the brief's fallback, the 35 motifs
 * below are well-established comparative-folklore motifs (Aarne-Thompson-Uther
 * tale types and Berezkin-style motif themes) that are attested or highly
 * plausible in West African / Niger-Congo oral tradition - trickster and
 * tortoise cycles, why-animal-is-X etiologies, sun/moon and death-origin
 * cosmogony, the disobedient child, the greedy guest, twins, the talking drum.
 * They are KNOWLEDGE-FALLBACK, flagged as such, and every motif prompt is
 * framed conditionally so it never asserts the motif exists in Igala.
 *
 * Run with:  npm run seed:longform
 * Dry validate (no DB, no writes):  SEED_DRY_RUN=1 npx tsx prisma/seed-prompt-longform.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, EvalBucket, DifficultyLevel } from "@prisma/client";

const prisma = new PrismaClient();

type Domain =
  | "household_daily_life"
  | "farm_food"
  | "market_trade"
  | "kinship_ceremony"
  | "faith_proverbs_stories"
  | "body_health"
  | "weather_nature"
  | "civic_news"
  | "modern_life_tech";

type LengthBand = "word" | "sentence" | "passage";
type Register = "neutral" | "respectful_elder" | "casual";

interface LongformPrompt {
  bucket: EvalBucket;
  text: string;
  difficultyLevel: DifficultyLevel;
  expectedCulturalContext?: string;
  // Authoring metadata (NOT persisted - no such columns on Prompt).
  domain?: Domain;
  length?: LengthBand;
  register?: Register;
}

// Short tokens for the Part 1 promptId namespace, one per bucket (mirrors v1).
const SHORT: Record<EvalBucket, string> = {
  orthography: "orth",
  grammar_tone: "gram",
  lexicon_disambig: "lex",
  register_honorifics: "reg",
  idioms_metaphor: "idiom",
  cultural_values: "cult",
  authenticity: "auth",
  dialectal_fidelity: "dial",
};

// The audit's quota for the next 100 prompts (section e). Asserted at runtime.
const QUOTA: Record<Domain, Record<LengthBand, number>> = {
  civic_news: { word: 4, sentence: 6, passage: 6 },
  modern_life_tech: { word: 4, sentence: 6, passage: 4 },
  kinship_ceremony: { word: 3, sentence: 6, passage: 5 },
  faith_proverbs_stories: { word: 2, sentence: 5, passage: 7 },
  body_health: { word: 3, sentence: 6, passage: 3 },
  weather_nature: { word: 3, sentence: 5, passage: 2 },
  market_trade: { word: 2, sentence: 4, passage: 2 },
  household_daily_life: { word: 1, sentence: 3, passage: 2 },
  farm_food: { word: 1, sentence: 3, passage: 2 },
};

// Minimum casual-register prompts per domain (audit register notes). household
// and farm must stay at 0 casual (already saturated - seed passage only there).
const CASUAL_MIN: Partial<Record<Domain, number>> = {
  civic_news: 3,
  modern_life_tech: 6, // "skew casual"
  kinship_ceremony: 3,
  faith_proverbs_stories: 2,
  body_health: 3,
  weather_nature: 2,
};
const CASUAL_ZERO: Domain[] = ["household_daily_life", "farm_food"];

// Difficulty follows the length band: word -> basic, sentence -> intermediate,
// passage -> advanced. Keeps a clean spread and a defensible mapping.
const DIFF_BY_LENGTH: Record<LengthBand, DifficultyLevel> = {
  word: "basic",
  sentence: "intermediate",
  passage: "advanced",
};

// Part 1 authoring helper: length drives difficulty; metadata is attached.
function p1(
  bucket: EvalBucket,
  domain: Domain,
  length: LengthBand,
  register: Register,
  text: string,
  expectedCulturalContext?: string,
): LongformPrompt {
  return {
    bucket,
    domain,
    length,
    register,
    text,
    difficultyLevel: DIFF_BY_LENGTH[length],
    expectedCulturalContext,
  };
}

// ============================================================================
// PART 1 - 100 PROMPTS, aligned to the audit's 9-domain x 3-length quota.
// Ordered by the audit's priority (civic_news + modern_life_tech first;
// household + farm last, used only to seed passage-length).
// ============================================================================
const PART1: LongformPrompt[] = [
  // ─── civic_news: 4 word / 6 sentence / 6 passage ─────────────
  p1(
    "lexicon_disambig",
    "civic_news",
    "word",
    "neutral",
    "Give the true Igala word for a town or community meeting, in one word or short phrase, not a borrowed English word.",
  ),
  p1(
    "lexicon_disambig",
    "civic_news",
    "word",
    "neutral",
    "Give the Igala word for a 'law' or 'rule' that the whole community must follow, in one word or short phrase.",
  ),
  p1(
    "lexicon_disambig",
    "civic_news",
    "word",
    "neutral",
    "Give the Igala word or short title for the person who announces news and summons people in a community, in one word or short phrase.",
  ),
  p1(
    "lexicon_disambig",
    "civic_news",
    "word",
    "casual",
    "In one word, give the everyday Igala word people would use for 'the government' or 'the authorities', avoiding a borrowed English word.",
  ),
  p1(
    "register_honorifics",
    "civic_news",
    "sentence",
    "respectful_elder",
    "In one respectful Igala sentence, greet a chief or community leader as you would at a public gathering.",
  ),
  p1(
    "grammar_tone",
    "civic_news",
    "sentence",
    "neutral",
    "In one Igala sentence, announce to the community that a town meeting will hold this evening.",
  ),
  p1(
    "authenticity",
    "civic_news",
    "sentence",
    "casual",
    "In one casual Igala sentence, complain to a friend about a decision the local leaders made.",
  ),
  p1(
    "grammar_tone",
    "civic_news",
    "sentence",
    "neutral",
    "In one Igala sentence, ask an official when the road in your area will be repaired.",
  ),
  p1(
    "register_honorifics",
    "civic_news",
    "sentence",
    "respectful_elder",
    "In one respectful Igala sentence, thank the community elders for settling a dispute.",
  ),
  p1(
    "authenticity",
    "civic_news",
    "sentence",
    "casual",
    "In one casual Igala sentence, tell a neighbour the news that a new market is being built in town.",
  ),
  p1(
    "register_honorifics",
    "civic_news",
    "passage",
    "respectful_elder",
    "In three or four Igala sentences, give the respectful words a community representative would use to present a request to the Attah or a chief on behalf of the people.",
    "The Attah is the paramount ruler of the Igala kingdom; the annotator should use genuine deferential forms and confirm the specifics.",
  ),
  p1(
    "cultural_values",
    "civic_news",
    "passage",
    "neutral",
    "In a short Igala paragraph of four to six sentences, explain how leaders are chosen or recognised in your community, stating only what you are sure of.",
    "Governance specifics are deferred to the annotator; state only what is genuinely known.",
  ),
  p1(
    "cultural_values",
    "civic_news",
    "passage",
    "neutral",
    "In three or four Igala sentences, describe what happens at a community meeting when a dispute between two families is settled.",
  ),
  p1(
    "authenticity",
    "civic_news",
    "passage",
    "neutral",
    "In a short Igala paragraph of four to six sentences, describe a piece of local news or a recent event in your town and why it matters to people.",
  ),
  p1(
    "register_honorifics",
    "civic_news",
    "passage",
    "respectful_elder",
    "In three or four Igala sentences, give the words an elder would use to open a town meeting and call people to order respectfully.",
  ),
  p1(
    "cultural_values",
    "civic_news",
    "passage",
    "neutral",
    "In a short Igala paragraph of four to six sentences, explain to a young person why taking part in community decisions matters, without asserting anything you are unsure of.",
  ),

  // ─── modern_life_tech: 4 word / 6 sentence / 4 passage ───────
  p1(
    "lexicon_disambig",
    "modern_life_tech",
    "word",
    "casual",
    "In one word, give the Igala word a speaker would use for a mobile phone, or say plainly if the borrowed word is what people actually use.",
  ),
  p1(
    "lexicon_disambig",
    "modern_life_tech",
    "word",
    "neutral",
    "Give the Igala word for 'work' or a 'job', in one word, not a borrowed English word.",
  ),
  p1(
    "lexicon_disambig",
    "modern_life_tech",
    "word",
    "neutral",
    "Give the Igala word for 'school', in one word or short phrase.",
  ),
  p1(
    "lexicon_disambig",
    "modern_life_tech",
    "word",
    "casual",
    "In one word or short phrase, give what an Igala speaker would call the motor park or bus station.",
  ),
  p1(
    "authenticity",
    "modern_life_tech",
    "sentence",
    "casual",
    "In one casual Igala sentence, tell a friend to call you later on the phone.",
  ),
  p1(
    "authenticity",
    "modern_life_tech",
    "sentence",
    "casual",
    "In one casual Igala sentence, ask a friend to send you money through their phone.",
  ),
  p1(
    "authenticity",
    "modern_life_tech",
    "sentence",
    "casual",
    "In one casual Igala sentence, tell a friend you saw their post online.",
  ),
  p1(
    "grammar_tone",
    "modern_life_tech",
    "sentence",
    "neutral",
    "In one Igala sentence, say that the electricity has gone off again.",
  ),
  p1(
    "authenticity",
    "modern_life_tech",
    "sentence",
    "casual",
    "In one casual Igala sentence, invite a friend to watch a football match with you.",
  ),
  p1(
    "grammar_tone",
    "modern_life_tech",
    "sentence",
    "neutral",
    "In one Igala sentence, ask how to get to the city by bus.",
  ),
  p1(
    "authenticity",
    "modern_life_tech",
    "passage",
    "casual",
    "In a short Igala paragraph of four to six sentences, describe a day in the city to a friend back home, in the natural way a young person would speak.",
  ),
  p1(
    "authenticity",
    "modern_life_tech",
    "passage",
    "casual",
    "In three or four Igala sentences, explain to a friend how you use your phone to keep in touch with family far away, in everyday Igala.",
  ),
  p1(
    "cultural_values",
    "modern_life_tech",
    "passage",
    "neutral",
    "In a short Igala paragraph of four to six sentences, describe how life in town today is different from life in the village, without asserting anything you are unsure of.",
  ),
  p1(
    "authenticity",
    "modern_life_tech",
    "passage",
    "casual",
    "In three or four casual Igala sentences, tell a friend about a football match or a show you enjoyed.",
  ),

  // ─── kinship_ceremony: 3 word / 6 sentence / 5 passage ───────
  p1(
    "lexicon_disambig",
    "kinship_ceremony",
    "word",
    "neutral",
    "Give the Igala word for 'elder brother' or an older sibling, in one word or short phrase.",
  ),
  p1(
    "lexicon_disambig",
    "kinship_ceremony",
    "word",
    "neutral",
    "Give the Igala word for a grandparent, in one word or short phrase.",
  ),
  p1(
    "lexicon_disambig",
    "kinship_ceremony",
    "word",
    "neutral",
    "Give the Igala word for an in-law, a relative by marriage, in one word or short phrase.",
  ),
  p1(
    "register_honorifics",
    "kinship_ceremony",
    "sentence",
    "respectful_elder",
    "In one respectful Igala sentence, give a blessing to a newborn child.",
  ),
  p1(
    "register_honorifics",
    "kinship_ceremony",
    "sentence",
    "respectful_elder",
    "In one respectful Igala sentence, offer condolences to someone who has lost a parent.",
  ),
  p1(
    "authenticity",
    "kinship_ceremony",
    "sentence",
    "casual",
    "In one casual Igala sentence, tease your younger sibling the way family members joke with each other.",
  ),
  p1(
    "grammar_tone",
    "kinship_ceremony",
    "sentence",
    "neutral",
    "In one Igala sentence, invite a relative to your child's naming ceremony.",
  ),
  p1(
    "authenticity",
    "kinship_ceremony",
    "sentence",
    "casual",
    "In one casual Igala sentence, gossip with a cousin about a family wedding.",
  ),
  p1(
    "register_honorifics",
    "kinship_ceremony",
    "sentence",
    "respectful_elder",
    "In one respectful Igala sentence, thank an elder for coming to a family ceremony.",
  ),
  p1(
    "register_honorifics",
    "kinship_ceremony",
    "passage",
    "respectful_elder",
    "In three or four Igala sentences, give the respectful words an elder would say to bless a couple at their wedding.",
  ),
  p1(
    "cultural_values",
    "kinship_ceremony",
    "passage",
    "neutral",
    "In a short Igala paragraph of four to six sentences, describe how a naming ceremony is carried out in your community, as it is genuinely done.",
    "The annotator should supply the genuine Igala naming-ceremony customs of their own community, not a generic or borrowed account.",
  ),
  p1(
    "cultural_values",
    "kinship_ceremony",
    "passage",
    "neutral",
    "In a short Igala paragraph of four to six sentences, describe how the community comforts and supports a family that is mourning, keeping to what is really done.",
    "The annotator should supply genuine Igala mourning customs; specifics are deferred to them.",
  ),
  p1(
    "authenticity",
    "kinship_ceremony",
    "passage",
    "casual",
    "In three or four casual Igala sentences, catch up with a cousin about what relatives have been doing lately.",
  ),
  p1(
    "register_honorifics",
    "kinship_ceremony",
    "passage",
    "respectful_elder",
    "In three or four Igala sentences, give the words a young person would use to introduce their future spouse to their parents respectfully.",
  ),

  // ─── faith_proverbs_stories: 2 word / 5 sentence / 7 passage ─
  p1(
    "lexicon_disambig",
    "faith_proverbs_stories",
    "word",
    "neutral",
    "Give the Igala word for a 'proverb' or wise saying, in one word or short phrase.",
  ),
  p1(
    "lexicon_disambig",
    "faith_proverbs_stories",
    "word",
    "neutral",
    "Give the Igala word for a 'story' or folktale, in one word or short phrase.",
  ),
  p1(
    "idioms_metaphor",
    "faith_proverbs_stories",
    "sentence",
    "neutral",
    "In one Igala sentence, give a short proverb about patience.",
  ),
  p1(
    "authenticity",
    "faith_proverbs_stories",
    "sentence",
    "neutral",
    "In one Igala sentence, give a common blessing you would say to someone setting out on a journey.",
  ),
  p1(
    "idioms_metaphor",
    "faith_proverbs_stories",
    "sentence",
    "casual",
    "In one casual Igala sentence, tease a friend using a light, playful proverb.",
  ),
  p1(
    "idioms_metaphor",
    "faith_proverbs_stories",
    "sentence",
    "neutral",
    "In one Igala sentence, give a proverb an elder uses to warn against laziness.",
  ),
  p1(
    "idioms_metaphor",
    "faith_proverbs_stories",
    "sentence",
    "casual",
    "In one casual Igala sentence, share a short riddle with a friend, then give its answer.",
  ),
  p1(
    "idioms_metaphor",
    "faith_proverbs_stories",
    "passage",
    "neutral",
    "Give an Igala proverb, then in three or four sentences explain what it means and describe a real situation where someone would use it.",
  ),
  p1(
    "idioms_metaphor",
    "faith_proverbs_stories",
    "passage",
    "neutral",
    "Tell a short Igala folktale a grandmother would tell about why greed brings trouble, in five or six sentences, ending with the lesson.",
  ),
  p1(
    "idioms_metaphor",
    "faith_proverbs_stories",
    "passage",
    "neutral",
    "Give an Igala proverb about hard work, then in three or four sentences explain its meaning and give an example of when to say it.",
  ),
  p1(
    "idioms_metaphor",
    "faith_proverbs_stories",
    "passage",
    "neutral",
    "Tell a short Igala folktale about a clever tortoise, in five or six sentences, and end by stating plainly what it teaches.",
  ),
  p1(
    "cultural_values",
    "faith_proverbs_stories",
    "passage",
    "neutral",
    "In a short Igala paragraph of four to six sentences, explain to a child why we give thanks to God, keeping to what you are sure of.",
  ),
  p1(
    "idioms_metaphor",
    "faith_proverbs_stories",
    "passage",
    "neutral",
    "Give an Igala proverb used to counsel someone facing a difficult choice, then in three or four sentences explain it and give an example situation.",
  ),
  p1(
    "idioms_metaphor",
    "faith_proverbs_stories",
    "passage",
    "neutral",
    "Tell a short Igala story with a moral about honesty, in five or six sentences, and end with the lesson it teaches.",
  ),

  // ─── body_health: 3 word / 6 sentence / 3 passage ───────────
  p1(
    "lexicon_disambig",
    "body_health",
    "word",
    "neutral",
    "Give the Igala word for 'sickness' or illness, in one word or short phrase.",
  ),
  p1(
    "lexicon_disambig",
    "body_health",
    "word",
    "neutral",
    "Give the Igala word for 'pain', in one word or short phrase.",
  ),
  p1(
    "lexicon_disambig",
    "body_health",
    "word",
    "neutral",
    "Give the Igala word for 'health' or being well, in one word or short phrase.",
  ),
  p1(
    "authenticity",
    "body_health",
    "sentence",
    "casual",
    "In one casual Igala sentence, tell a friend that you are not feeling well today.",
  ),
  p1(
    "grammar_tone",
    "body_health",
    "sentence",
    "neutral",
    "In one Igala sentence, ask a sick person where it hurts.",
  ),
  p1(
    "authenticity",
    "body_health",
    "sentence",
    "neutral",
    "In one gentle Igala sentence, tell a sick person to rest and get well soon.",
  ),
  p1(
    "authenticity",
    "body_health",
    "sentence",
    "casual",
    "In one casual Igala sentence, ask a friend how they are recovering from their illness.",
  ),
  p1(
    "grammar_tone",
    "body_health",
    "sentence",
    "neutral",
    "In one Igala sentence, tell someone to go to the hospital or see a healer.",
  ),
  p1(
    "authenticity",
    "body_health",
    "sentence",
    "casual",
    "In one casual Igala sentence, tell a family member you have a headache and need to lie down.",
  ),
  p1(
    "authenticity",
    "body_health",
    "passage",
    "neutral",
    "In three or four Igala sentences, describe how you feel when you have a fever, in natural everyday Igala.",
  ),
  p1(
    "cultural_values",
    "body_health",
    "passage",
    "neutral",
    "In a short Igala paragraph of four to six sentences, describe how someone at home cares for a person who is unwell, keeping to what is genuinely done in your community.",
    "Traditional-remedy specifics are deferred to the annotator; describe only care that is genuinely practised, without asserting medical claims.",
  ),
  p1(
    "authenticity",
    "body_health",
    "passage",
    "casual",
    "In three or four casual Igala sentences, comfort a friend who is sick and encourage them to get better.",
  ),

  // ─── weather_nature: 3 word / 5 sentence / 2 passage ────────
  p1(
    "lexicon_disambig",
    "weather_nature",
    "word",
    "neutral",
    "Give the Igala word for 'rain', in one word or short phrase.",
  ),
  p1(
    "lexicon_disambig",
    "weather_nature",
    "word",
    "neutral",
    "Give the Igala word for 'wind', in one word or short phrase.",
  ),
  p1(
    "lexicon_disambig",
    "weather_nature",
    "word",
    "neutral",
    "Give the Igala word for the harmattan or dry-season cold wind, in one word or short phrase.",
  ),
  p1(
    "authenticity",
    "weather_nature",
    "sentence",
    "casual",
    "In one casual Igala sentence, remark to a neighbour that it looks like rain today.",
  ),
  p1(
    "grammar_tone",
    "weather_nature",
    "sentence",
    "neutral",
    "In one Igala sentence, say that the sun is very hot this afternoon.",
  ),
  p1(
    "authenticity",
    "weather_nature",
    "sentence",
    "casual",
    "In one casual Igala sentence, complain to a friend about the harmattan cold.",
  ),
  p1(
    "grammar_tone",
    "weather_nature",
    "sentence",
    "neutral",
    "In one Igala sentence, say that the river is full after the heavy rains.",
  ),
  p1(
    "grammar_tone",
    "weather_nature",
    "sentence",
    "neutral",
    "In one Igala sentence, tell someone the dry season has begun.",
  ),
  p1(
    "authenticity",
    "weather_nature",
    "passage",
    "neutral",
    "In three or four Igala sentences, describe the rainy season and how it changes daily life, in natural Igala.",
  ),
  p1(
    "authenticity",
    "weather_nature",
    "passage",
    "neutral",
    "In three or four Igala sentences, describe a bright morning after rain, the way someone stepping outside would say it.",
  ),

  // ─── market_trade: 2 word / 4 sentence / 2 passage ──────────
  p1(
    "lexicon_disambig",
    "market_trade",
    "word",
    "neutral",
    "Give the Igala word for a 'trader' or seller, in one word or short phrase.",
  ),
  p1(
    "lexicon_disambig",
    "market_trade",
    "word",
    "neutral",
    "Give the Igala word for the 'price' or cost of something, in one word or short phrase.",
  ),
  p1(
    "authenticity",
    "market_trade",
    "sentence",
    "casual",
    "In one casual Igala sentence, ask a seller to reduce the price for you.",
  ),
  p1(
    "grammar_tone",
    "market_trade",
    "sentence",
    "neutral",
    "In one Igala sentence, ask how much a basket of yams costs.",
  ),
  p1(
    "authenticity",
    "market_trade",
    "sentence",
    "casual",
    "In one casual Igala sentence, tell a fellow trader that business was good today.",
  ),
  p1(
    "grammar_tone",
    "market_trade",
    "sentence",
    "neutral",
    "In one Igala sentence, offer to sell your goods at a fair price.",
  ),
  p1(
    "authenticity",
    "market_trade",
    "passage",
    "neutral",
    "In three or four Igala sentences, describe how a buyer and a seller bargain over a price in the market, in natural Igala.",
  ),
  p1(
    "authenticity",
    "market_trade",
    "passage",
    "neutral",
    "In a short Igala paragraph of four to six sentences, describe what a busy market day is like from a trader's point of view.",
  ),

  // ─── household_daily_life: 1 word / 3 sentence / 2 passage ──
  // (No casual added - already saturated; used to seed passage-length.)
  p1(
    "lexicon_disambig",
    "household_daily_life",
    "word",
    "neutral",
    "Give the Igala word for a 'broom' or a household item used for sweeping, in one word or short phrase.",
  ),
  p1(
    "grammar_tone",
    "household_daily_life",
    "sentence",
    "neutral",
    "In one Igala sentence, ask a child to fetch water from the pot.",
  ),
  p1(
    "grammar_tone",
    "household_daily_life",
    "sentence",
    "neutral",
    "In one Igala sentence, tell someone the food is ready.",
  ),
  p1(
    "grammar_tone",
    "household_daily_life",
    "sentence",
    "neutral",
    "In one Igala sentence, ask who swept the compound this morning.",
  ),
  p1(
    "authenticity",
    "household_daily_life",
    "passage",
    "neutral",
    "In a short Igala paragraph of four to six sentences, describe the morning chores in your household from waking to leaving for the day, in order.",
  ),
  p1(
    "authenticity",
    "household_daily_life",
    "passage",
    "neutral",
    "In three or four Igala sentences, describe an evening at home with your family, in natural everyday Igala.",
  ),

  // ─── farm_food: 1 word / 3 sentence / 2 passage ─────────────
  // (No casual added - passage-length seeding, not volume.)
  p1(
    "lexicon_disambig",
    "farm_food",
    "word",
    "neutral",
    "Give the Igala word for 'cassava', in one word or short phrase.",
  ),
  p1(
    "grammar_tone",
    "farm_food",
    "sentence",
    "neutral",
    "In one Igala sentence, say that the yams are ready to be harvested.",
  ),
  p1(
    "grammar_tone",
    "farm_food",
    "sentence",
    "neutral",
    "In one Igala sentence, ask someone to help you on the farm tomorrow.",
  ),
  p1(
    "authenticity",
    "farm_food",
    "sentence",
    "neutral",
    "In one Igala sentence, describe the taste of a good pot of soup.",
  ),
  p1(
    "grammar_tone",
    "farm_food",
    "passage",
    "neutral",
    "In a short Igala paragraph of four to six sentences, describe how your family prepares a favourite meal, from the farm to the pot, in order.",
  ),
  p1(
    "authenticity",
    "farm_food",
    "passage",
    "neutral",
    "In three or four Igala sentences, describe a farm at harvest time, in natural everyday Igala.",
  ),
];

// ============================================================================
// PART 2 - FLOATING-MOTIF SET (~35). KNOWLEDGE-FALLBACK motifs (see header:
// Berezkin's DB is Russian-only). Each is framed conditionally so it never
// presumes the motif exists in Igala tradition. (Unaffected by the coverage
// quota, per the coordinator.)
// ============================================================================
function motif(motifInPlainWords: string): string {
  return `In Igala storytelling, is there a tale or proverb about ${motifInPlainWords}? If yes, tell it in Igala the way it would be told; if this motif is not part of Igala tradition, say so and share the closest one that is.`;
}

const motifs: LongformPrompt[] = [
  // Trickster and tortoise cycles (idioms_metaphor)
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "intermediate",
    text: motif(
      "the tortoise who outwits animals far bigger and stronger than itself",
    ),
  },
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "advanced",
    text: motif(
      "a small clever animal that gets two big animals to unknowingly pull against each other in a tug of war",
    ),
  },
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "advanced",
    text: motif(
      "a slow animal that wins a race against a swift one by placing look-alike relatives along the path",
    ),
  },
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "intermediate",
    text: motif(
      "how the tortoise came to have a shell that looks cracked or patched together",
    ),
  },
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "advanced",
    text: motif(
      "the animal that borrows feathers from the birds to fly up to a feast in the sky and then betrays them",
    ),
  },
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "intermediate",
    text: motif("the hare or rabbit as a trickster who fools bigger animals"),
  },
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "intermediate",
    text: motif("the spider as a cunning trickster and keeper of stories"),
  },
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "intermediate",
    text: motif(
      "a trickster who pretends to be dead so he can steal food from the farm or the store",
    ),
  },
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "advanced",
    text: motif(
      "an animal that is freed from a trap and then turns on the one who saved it, until a third animal judges the case",
    ),
  },
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "intermediate",
    text: motif("why the dog chose to live beside people at their fire"),
  },
  // Why-animal-is-X etiologies (idioms_metaphor)
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "basic",
    text: motif(
      "why the cat and the mouse, or the dog and the cat, became enemies",
    ),
  },
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "basic",
    text: motif("why the hen scratches the ground looking for food"),
  },
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "intermediate",
    text: motif("why the lizard nods its head up and down"),
  },
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "intermediate",
    text: motif(
      "why the bat flies only at night and belongs neither to the birds nor to the beasts",
    ),
  },
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "intermediate",
    text: motif("why the tortoise moves so slowly and stays near water"),
  },
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "basic",
    text: motif("why the snake has no legs"),
  },
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "intermediate",
    text: motif("why the mosquito whines close to people's ears"),
  },
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "intermediate",
    text: motif("why the leopard carries its spotted markings"),
  },
  // Human and social motifs (idioms_metaphor)
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "advanced",
    text: motif(
      "a singing bone, tree or drum whose voice reveals a hidden murder",
    ),
  },
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "advanced",
    text: motif(
      "the kind child and the unkind child who meet a spirit at the river and are rewarded or punished for how they behave",
    ),
  },
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "advanced",
    text: motif(
      "the maiden who refuses every suitor and then marries a handsome stranger who turns out to be a spirit wearing borrowed body parts",
    ),
  },
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "intermediate",
    text: motif(
      "the grateful animals who repay a person's kindness after being helped",
    ),
  },
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "intermediate",
    text: motif(
      "the greedy guest who takes far more than his share and is shamed for it",
    ),
  },
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "basic",
    text: motif(
      "the disobedient child who ignores a warning and comes to harm",
    ),
  },
  {
    bucket: "idioms_metaphor",
    difficultyLevel: "intermediate",
    text: motif("the talking drum that carries a message across a distance"),
  },
  // Cosmogony, celestial and death-origin motifs (cultural_values)
  {
    bucket: "cultural_values",
    difficultyLevel: "advanced",
    text: motif(
      "why the sky, which once lay low enough to touch, moved far away from the earth after people offended it",
    ),
  },
  {
    bucket: "cultural_values",
    difficultyLevel: "advanced",
    text: motif(
      "how the sun and the moon came to be, and why they no longer share the sky at the same time",
    ),
  },
  {
    bucket: "cultural_values",
    difficultyLevel: "intermediate",
    text: motif("the dark patches seen on the face of the moon"),
  },
  {
    bucket: "cultural_values",
    difficultyLevel: "intermediate",
    text: motif("where the stars came from"),
  },
  {
    bucket: "cultural_values",
    difficultyLevel: "advanced",
    text: motif(
      "how death first came into the world through a message that arrived late or was delivered wrongly by a slow messenger",
    ),
  },
  {
    bucket: "cultural_values",
    difficultyLevel: "advanced",
    text: motif(
      "death pictured as a person, and how it first came among people",
    ),
  },
  {
    bucket: "cultural_values",
    difficultyLevel: "intermediate",
    text: motif("why those who have died do not come back to the living"),
  },
  {
    bucket: "cultural_values",
    difficultyLevel: "intermediate",
    text: motif(
      "the special beliefs or customs that surround the birth of twins",
    ),
  },
  {
    bucket: "cultural_values",
    difficultyLevel: "advanced",
    text: motif(
      "how an important food such as yam first came to people, perhaps from a sacrifice or a buried body",
    ),
  },
  {
    bucket: "cultural_values",
    difficultyLevel: "intermediate",
    text: motif(
      "how a particular river, hill or rock in the land first came to be",
    ),
  },
];

// ============================================================================
// PART 3 - ENRICHMENT (~30). The most common single-word gold concepts already
// in the production DB, each asked for USED in connected sentences (not a
// dictionary example). Home bucket: authenticity - the "not a dictionary
// example" instruction is exactly the anti-translationese naturalness signal.
// Concepts were sourced from a read-only query of ColdAuthorAnswer. (Unaffected
// by the coverage quota, per the coordinator.)
// ============================================================================
function useWord(concept: string, dailyLifeContext: string): string {
  return `Use the Igala word for '${concept}' in two or three natural sentences an Igala speaker would really say ${dailyLifeContext}, not a dictionary example.`;
}

const enrichment: LongformPrompt[] = [
  {
    bucket: "authenticity",
    text: useWord("water", "in daily life at home"),
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: useWord("morning", "about the start of a day"),
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: useWord("market", "about a day at the market"),
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: useWord("mother", "about family life"),
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: useWord("father", "about family life"),
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: useWord("child", "about family life"),
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: useWord("house", "about home and daily life"),
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: useWord("food", "about a meal at home"),
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: useWord("yam", "about food and farming"),
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: useWord("money", "about buying and selling"),
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: useWord("river or stream", "about the water near a village"),
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: useWord("name", "about a person or a naming"),
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: useWord("god or the supreme being", "about faith in everyday speech"),
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: useWord("vehicle", "about travelling"),
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: useWord("king or ruler", "about the community"),
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: useWord("farm", "about working the land"),
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: useWord("song or music", "about a gathering or celebration"),
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: useWord("chief or titled man", "about the community"),
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: useWord("elder", "about respect at home or in the community"),
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: useWord("compound or family home", "about home life"),
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: useWord("blessing", "about wishing someone well"),
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: useWord("welcome", "about receiving a guest"),
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: useWord("fire", "about cooking or the home"),
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: useWord("sun", "about the weather or the day"),
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: useWord("moon", "about the night"),
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: useWord("goat", "about animals at home or on the farm"),
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: useWord("tree", "about the surroundings"),
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: useWord("friend", "about everyday friendship"),
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: useWord("road or path", "about going somewhere"),
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: useWord("salt", "about cooking"),
    difficultyLevel: "basic",
  },
];

// ============================================================================
// promptId assignment. Three namespaces, none overlapping v1's ig_bank_*.
// ============================================================================
type WithId = LongformPrompt & { promptId: string };

// Part 1: ig_lf_<short>_NNN, counters per bucket.
function part1WithIds(prompts: LongformPrompt[]): WithId[] {
  const counters: Record<string, number> = {};
  return prompts.map((p) => {
    const short = SHORT[p.bucket];
    counters[short] = (counters[short] ?? 0) + 1;
    return {
      ...p,
      promptId: `ig_lf_${short}_${String(counters[short]).padStart(3, "0")}`,
    };
  });
}

// Part 2: ig_motif_NNN, one flat counter.
function part2WithIds(prompts: LongformPrompt[]): WithId[] {
  return prompts.map((p, i) => ({
    ...p,
    promptId: `ig_motif_${String(i + 1).padStart(3, "0")}`,
  }));
}

// Part 3: ig_use_NNN, one flat counter.
function part3WithIds(prompts: LongformPrompt[]): WithId[] {
  return prompts.map((p, i) => ({
    ...p,
    promptId: `ig_use_${String(i + 1).padStart(3, "0")}`,
  }));
}

// Normalize text the same way the v1 bank does, for dedup.
function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Read the v1 bank's prompt texts straight from source (do NOT import it - its
// module body runs main() on import). Regex-extract each `text: "..."`.
function existingBankTexts(): string[] {
  const bankPath = join(__dirname, "seed-prompt-bank.ts");
  let src = "";
  try {
    src = readFileSync(bankPath, "utf8");
  } catch {
    console.warn(
      `Note: could not read ${bankPath} for cross-bank dedup; skipping that check.`,
    );
    return [];
  }
  const re = /text:\s*\n?\s*"((?:[^"\\]|\\.)*)"/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1].replace(/\\"/g, '"'));
  return out;
}

// Assert Part 1 exactly matches the audit quota (domain x length) and the
// register minimums. Aborts on any mismatch so a drifted set never seeds.
function assertQuota(p1: WithId[]): void {
  const problems: string[] = [];
  const domains = Object.keys(QUOTA) as Domain[];

  for (const d of domains) {
    for (const len of ["word", "sentence", "passage"] as LengthBand[]) {
      const want = QUOTA[d][len];
      const got = p1.filter((p) => p.domain === d && p.length === len).length;
      if (got !== want) {
        problems.push(`${d} / ${len}: expected ${want}, got ${got}`);
      }
    }
  }
  // Every Part 1 prompt must carry domain + length metadata.
  const untagged = p1.filter((p) => !p.domain || !p.length);
  if (untagged.length) {
    problems.push(
      `${untagged.length} Part 1 prompts missing domain/length metadata`,
    );
  }
  // Casual-register minimums / zeros.
  for (const [d, min] of Object.entries(CASUAL_MIN) as [Domain, number][]) {
    const got = p1.filter(
      (p) => p.domain === d && p.register === "casual",
    ).length;
    if (got < min) problems.push(`${d}: expected >=${min} casual, got ${got}`);
  }
  for (const d of CASUAL_ZERO) {
    const got = p1.filter(
      (p) => p.domain === d && p.register === "casual",
    ).length;
    if (got !== 0)
      problems.push(`${d}: expected 0 casual (saturated), got ${got}`);
  }
  if (problems.length) {
    console.error(
      "Part 1 does not match the audit quota - aborting:\n  " +
        problems.join("\n  "),
    );
    process.exit(1);
  }
}

async function main() {
  const DRY_RUN = process.env.SEED_DRY_RUN === "1";

  const p1 = part1WithIds(PART1);
  const p2 = part2WithIds(motifs);
  const p3 = part3WithIds(enrichment);
  const withIds: WithId[] = [...p1, ...p2, ...p3];

  // ── Self-check 1: Part 1 matches the audit quota. ────────────
  assertQuota(p1);

  // ── Self-check 2: no duplicate promptIds. ────────────────────
  const ids = new Set<string>();
  for (const p of withIds) {
    if (ids.has(p.promptId)) {
      console.error(`Duplicate promptId ${p.promptId} - aborting`);
      process.exit(1);
    }
    ids.add(p.promptId);
  }

  // ── Self-check 3: no duplicate text within this wave AND none that
  //    collide with the v1 bank. ────────────────────────────────
  const bankNorms = new Set(existingBankTexts().map(norm));
  const seen = new Map<string, string>();
  const dupes: string[] = [];
  for (const p of withIds) {
    const n = norm(p.text);
    if (bankNorms.has(n)) {
      dupes.push(
        `${p.promptId} duplicates an existing v1 bank prompt: "${p.text}"`,
      );
    }
    if (seen.has(n)) {
      dupes.push(`${p.promptId} duplicates ${seen.get(n)}: "${p.text}"`);
    } else {
      seen.set(n, p.promptId);
    }
  }
  if (dupes.length) {
    console.error(
      "Duplicate prompt texts found - aborting:\n" + dupes.join("\n"),
    );
    process.exit(1);
  }

  // ── Report. ──────────────────────────────────────────────────
  console.log(
    `\nLong-form + coverage wave: ${withIds.length} prompts ` +
      `(Part1 quota=${p1.length}, Part2 motif=${p2.length}, Part3 use=${p3.length}).`,
  );

  console.log("\nPart 1 - domain x length (matches audit quota):");
  console.log("  domain".padEnd(26) + "word  sent  pass  total");
  const domains = Object.keys(QUOTA) as Domain[];
  for (const d of domains) {
    const w = p1.filter((p) => p.domain === d && p.length === "word").length;
    const s = p1.filter(
      (p) => p.domain === d && p.length === "sentence",
    ).length;
    const pa = p1.filter(
      (p) => p.domain === d && p.length === "passage",
    ).length;
    console.log(
      `  ${d.padEnd(24)}${String(w).padStart(4)}${String(s).padStart(6)}${String(pa).padStart(6)}${String(w + s + pa).padStart(7)}`,
    );
  }
  const tw = p1.filter((p) => p.length === "word").length;
  const ts = p1.filter((p) => p.length === "sentence").length;
  const tp = p1.filter((p) => p.length === "passage").length;
  console.log(
    `  ${"TOTAL".padEnd(24)}${String(tw).padStart(4)}${String(ts).padStart(6)}${String(tp).padStart(6)}${String(tw + ts + tp).padStart(7)}`,
  );

  console.log(
    "\nPart 1 - register per domain (neutral / respectful_elder / casual):",
  );
  for (const d of domains) {
    const n = p1.filter(
      (p) => p.domain === d && p.register === "neutral",
    ).length;
    const r = p1.filter(
      (p) => p.domain === d && p.register === "respectful_elder",
    ).length;
    const c = p1.filter(
      (p) => p.domain === d && p.register === "casual",
    ).length;
    console.log(`  ${d.padEnd(24)} ${n} / ${r} / ${c}`);
  }

  const byBucket: Record<string, number> = {};
  const byDiff: Record<string, number> = {};
  for (const p of withIds) {
    byBucket[p.bucket] = (byBucket[p.bucket] ?? 0) + 1;
    byDiff[p.difficultyLevel] = (byDiff[p.difficultyLevel] ?? 0) + 1;
  }
  console.log("\nWhole wave - by bucket:", byBucket);
  console.log("Whole wave - by difficulty:", byDiff);

  if (DRY_RUN) {
    console.log("\nSEED_DRY_RUN=1 - validation only, no DB access, no writes.");
    return;
  }

  // ── Belt-and-braces DB collision check (create-only anyway). ──
  const existing = await prisma.prompt.findMany({
    where: { promptId: { in: withIds.map((p) => p.promptId) } },
    select: { promptId: true },
  });
  if (existing.length) {
    console.warn(
      `Note: ${existing.length} promptIds already exist and will be left untouched (create-only): ` +
        existing.map((e) => e.promptId).join(", "),
    );
  }

  // Stable owner for createdById (matches seed.ts / v1 bank convention).
  const annotator = await prisma.user.findFirst({
    where: { email: "annotator@test.com" },
    select: { id: true },
  });
  const createdById = annotator?.id ?? null;

  // ── CREATE-ONLY upserts. ─────────────────────────────────────
  let processed = 0;
  for (const p of withIds) {
    await prisma.prompt.upsert({
      where: { promptId: p.promptId },
      update: {}, // never mutate an existing row
      create: {
        promptId: p.promptId,
        bucket: p.bucket,
        language: "igala",
        text: p.text,
        targetCulture: "igala",
        expectedCulturalContext: p.expectedCulturalContext ?? null,
        difficultyLevel: p.difficultyLevel,
        split: "train",
        isHoldout: false,
        provenance: "claude_authored_v2_longform",
        createdById,
      },
    });
    processed++;
  }
  console.log(`\nProcessed ${processed} prompts (create-only).`);

  const waveRows = await prisma.prompt.findMany({
    where: { provenance: "claude_authored_v2_longform" },
    select: { bucket: true },
  });
  const waveByBucket: Record<string, number> = {};
  for (const r of waveRows)
    waveByBucket[r.bucket] = (waveByBucket[r.bucket] ?? 0) + 1;
  console.log("\nWave rows in DB by bucket:", waveByBucket);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
