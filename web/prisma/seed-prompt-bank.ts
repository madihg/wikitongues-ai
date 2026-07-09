/**
 * Seed the Igala PROMPT BANK.
 *
 * The data-size analysis found the binding constraint is PROMPTS: the queue
 * needs 30-50 authored prompts per category and the live DB had exactly 1 per
 * category. This script adds a large, claude-authored training bank so live
 * annotators have real work.
 *
 * SAFETY - this is a PRODUCTION database with live annotators:
 *  - CREATE-ONLY. Every row is upserted by promptId with `update: {}`, so a
 *    re-run never mutates or deletes an existing row. Rows authored elsewhere
 *    (incl. the 8 original seed prompts and any community-authored holdouts)
 *    are never touched.
 *  - All bank prompts are split "train", isHoldout false, provenance
 *    "claude_authored_v1". Held-out/test prompts must be community-authored and
 *    are out of scope here.
 *  - promptIds use a fresh, collision-proof namespace: ig_bank_<short>_NNN.
 *
 * Authoring principles (per src/lib/buckets.ts):
 *  - Every prompt exercises ITS category's in-scope rubric axes.
 *  - Culturally grounded in well-attested Igala domains. Where a specific
 *    cultural fact is uncertain (vs Yoruba/Igbo/Idoma), the prompt asks the
 *    ANNOTATOR to supply the specifics rather than asserting facts.
 *  - Difficulty spread per category: ~30% basic, ~45% intermediate, ~25%
 *    advanced.
 *
 * Run with:  npm run seed:prompt-bank
 */
import { PrismaClient, EvalBucket, DifficultyLevel } from "@prisma/client";

const prisma = new PrismaClient();

interface BankPrompt {
  bucket: EvalBucket;
  text: string;
  difficultyLevel: DifficultyLevel;
  expectedCulturalContext?: string;
}

// Short tokens for the promptId namespace, one per bucket.
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

// ─── orthography ─────────────────────────────────────────────
// Axes: spelling, diacritics, lexicon. Stress the letters and the tone marks.
const orthography: BankPrompt[] = [
  // basic
  {
    bucket: "orthography",
    text: "Write the Igala word for 'water' with correct spelling and tone marks.",
    difficultyLevel: "basic",
  },
  {
    bucket: "orthography",
    text: "Write the Igala word for 'child' with correct spelling and any tone marks.",
    difficultyLevel: "basic",
  },
  {
    bucket: "orthography",
    text: "Write the Igala word for 'house' with correct spelling and diacritics.",
    difficultyLevel: "basic",
  },
  {
    bucket: "orthography",
    text: "Write the Igala word for 'food' with correct spelling and tone marks.",
    difficultyLevel: "basic",
  },
  {
    bucket: "orthography",
    text: "Write the Igala word for 'yam' with correct spelling and any dotted vowels.",
    difficultyLevel: "basic",
  },
  {
    bucket: "orthography",
    text: "Write the Igala word for 'market' with correct spelling and tone marks.",
    difficultyLevel: "basic",
  },
  {
    bucket: "orthography",
    text: "Write the Igala word for 'mother' with correct spelling and diacritics.",
    difficultyLevel: "basic",
  },
  {
    bucket: "orthography",
    text: "Write the Igala word for 'father' with correct spelling and tone marks.",
    difficultyLevel: "basic",
  },
  {
    bucket: "orthography",
    text: "Write the Igala word for 'money' with correct spelling and any tone marks.",
    difficultyLevel: "basic",
  },
  {
    bucket: "orthography",
    text: "Write the Igala word for 'god' or 'the supreme being' with correct spelling and tone marks.",
    difficultyLevel: "basic",
  },
  {
    bucket: "orthography",
    text: "Write the Igala word for 'name' with correct spelling and diacritics.",
    difficultyLevel: "basic",
  },
  {
    bucket: "orthography",
    text: "Write the Igala numbers one to five, each spelled correctly with tone marks.",
    difficultyLevel: "basic",
  },
  // intermediate
  {
    bucket: "orthography",
    text: "Write the Igala word for 'morning' and the word for 'night', showing how the tone marks differ.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "orthography",
    text: "Spell the Igala word for 'king' or 'ruler', paying attention to dotted vowels and tone.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "orthography",
    text: "Write two Igala words that use a dotted vowel (such as ẹ or ọ) and spell them correctly.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "orthography",
    text: "Write the Igala word for 'to eat' and mark the tone correctly.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "orthography",
    text: "Spell the Igala greeting used to say 'welcome', with correct tone marks.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "orthography",
    text: "Write the Igala word for 'farm' with full tone marking, then note which vowel carries the tone.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "orthography",
    text: "Write the Igala word for 'river' or 'stream' with correct spelling and diacritics.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "orthography",
    text: "Spell the Igala word for 'elder' with correct tone marks and dotted vowels.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "orthography",
    text: "Write the Igala days of the traditional market week, spelling each correctly with tone marks.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should supply the correct Igala market-week day names and their spelling; do not assume a Yoruba or Igbo week.",
  },
  {
    bucket: "orthography",
    text: "Write the Igala word for 'to greet' and mark all tones.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "orthography",
    text: "Spell the Igala word for 'song' or 'music' with correct diacritics.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "orthography",
    text: "Write the Igala words for 'today', 'yesterday', and 'tomorrow', each with correct tone marks.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "orthography",
    text: "Write the Igala word for 'chief' or 'titled man', paying attention to tone and dotted vowels.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "orthography",
    text: "Spell the Igala word for 'compound' or 'family home', with correct tone marks.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "orthography",
    text: "Write the Igala word for 'to farm' and the word for 'farmer', showing the correct spelling of each.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "orthography",
    text: "Write two Igala words where a missing tone mark would change the meaning, and spell both correctly.",
    difficultyLevel: "intermediate",
  },
  // advanced
  {
    bucket: "orthography",
    text: "Write a minimal pair in Igala - two words distinguished only by tone - and mark the tones correctly on both.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "orthography",
    text: "Write the Igala words for the numbers six to ten, each spelled correctly with full tone marks.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "orthography",
    text: "Spell three Igala words that each contain a nasalised vowel, marking nasalisation and tone correctly.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "orthography",
    text: "Write the correct Igala spelling of the name of the Attah of Igala's title, with full tone marks.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The Attah is the paramount ruler of the Igala. The annotator should confirm the correct spelling and tone marking of the title.",
  },
  {
    bucket: "orthography",
    text: "Write the Igala fixed expression for 'thank you', with correct spelling and every tone mark.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "orthography",
    text: "Spell the Igala word for a naming ceremony and mark its tones correctly.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply the correct Igala term for a naming ceremony and its spelling.",
  },
  {
    bucket: "orthography",
    text: "Write four Igala kinship terms (for example brother, sister, uncle, grandmother) with correct spelling and tone marks.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "orthography",
    text: "Write the single Igala word for 'blessing' with correct spelling, dotted vowels, and tone marks.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "orthography",
    text: "Spell the Igala words for the parts of the day (dawn, midday, evening, night) with correct diacritics and tone.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "orthography",
    text: "Write the Igala word for 'egg' and the word for 'oil', spelling each correctly with tone marks.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "orthography",
    text: "Write the single Igala word for the everyday 'hello' greeting, spelled correctly with all tone marks.",
    difficultyLevel: "advanced",
  },
];

// ─── grammar_tone ────────────────────────────────────────────
// Axes: syntax, semantics, lexicon. Stress sentence structure, order, tense,
// agreement.
const grammar_tone: BankPrompt[] = [
  // basic
  {
    bucket: "grammar_tone",
    text: "Translate 'The woman cooks food' into Igala, keeping correct word order.",
    difficultyLevel: "basic",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'The man goes to the farm' into Igala with correct sentence structure.",
    difficultyLevel: "basic",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'I drink water' into Igala.",
    difficultyLevel: "basic",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'The child sleeps' into Igala.",
    difficultyLevel: "basic",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'We eat yam' into Igala, keeping correct word order.",
    difficultyLevel: "basic",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'The dog runs' into Igala.",
    difficultyLevel: "basic",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'She sells fish in the market' into Igala.",
    difficultyLevel: "basic",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'They are singing' into Igala.",
    difficultyLevel: "basic",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'My father works' into Igala.",
    difficultyLevel: "basic",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'The children play' into Igala with correct agreement.",
    difficultyLevel: "basic",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'I am hungry' into Igala.",
    difficultyLevel: "basic",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'The water is cold' into Igala.",
    difficultyLevel: "basic",
  },
  // intermediate
  {
    bucket: "grammar_tone",
    text: "Translate 'The child ate the food yesterday' into Igala, using the correct past tense.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'The woman will go to the market tomorrow' into Igala, using the correct future form.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'The man who farms yam is my uncle' into Igala, keeping the relative clause natural.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'If it rains, we will not go to the farm' into Igala, keeping the conditional structure.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'The elder is greeting the children' into Igala with correct word order.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'She gave the food to her mother' into Igala, handling the two objects correctly.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'They are not eating' into Igala, forming the negative correctly.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'The king spoke and the people listened' into Igala, joining the two clauses naturally.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'Where are you going?' into Igala as a natural question.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'The food that my mother cooked is sweet' into Igala.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'The traders are coming from the market' into Igala with correct aspect.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'He has finished eating' into Igala, showing the completed action.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'We were farming when the rain started' into Igala, keeping both time frames.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'Do not go there' into Igala as a natural command.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'The two women are sisters' into Igala, handling number correctly.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "grammar_tone",
    text: "Turn the Igala statement for 'the child is eating' into a yes-or-no question, keeping natural word order.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'Because he was tired, he slept' into Igala, keeping the cause-and-effect structure.",
    difficultyLevel: "intermediate",
  },
  // advanced
  {
    bucket: "grammar_tone",
    text: "Translate 'The man whose farm we visited has died' into Igala, keeping the embedded clause natural.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'Had we known the elder was coming, we would have waited' into Igala, keeping the counterfactual structure.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'The children were told that the festival had been postponed' into Igala, keeping reported speech natural.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "grammar_tone",
    text: "Write three Igala sentences that use the same verb in past, present, and future, showing how the form changes.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'It is the elder, not the child, who should speak first' into Igala, keeping the focus/emphasis structure.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'The more they farmed, the more they harvested' into Igala, keeping the correlative structure natural.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "grammar_tone",
    text: "Translate a short three-sentence story about a market day into Igala, keeping the sequence of tenses consistent.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'Whoever finishes farming first will rest' into Igala, keeping the free relative clause natural.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'The food was cooked by the women' into Igala, phrasing it the way an Igala speaker naturally would.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "grammar_tone",
    text: "Translate 'My mother and my sister are going to the market together' into Igala, handling the two subjects correctly.",
    difficultyLevel: "basic",
  },
];

// ─── lexicon_disambig ────────────────────────────────────────
// Axes: lexicon, contamination, semantics, diacritics. Word-sense and the right
// Igala word with no bleed from Yoruba/Idoma/Igbo.
const lexicon_disambig: BankPrompt[] = [
  // basic
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word for 'head' (the body part), making sure it is the true Igala word and not a borrowing.",
    difficultyLevel: "basic",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word for 'fire', and confirm it is Igala rather than a neighbouring language.",
    difficultyLevel: "basic",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word for 'hand'.",
    difficultyLevel: "basic",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word for 'sun'.",
    difficultyLevel: "basic",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word for 'goat'.",
    difficultyLevel: "basic",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word for 'tree'.",
    difficultyLevel: "basic",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word for 'friend'.",
    difficultyLevel: "basic",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word for 'road' or 'path'.",
    difficultyLevel: "basic",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala verb for 'to sleep', in the sense of lying down to rest for the night.",
    difficultyLevel: "basic",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word for 'salt'.",
    difficultyLevel: "basic",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word for 'moon'.",
    difficultyLevel: "basic",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word for 'chicken' or 'fowl'.",
    difficultyLevel: "basic",
  },
  // intermediate
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word for 'hand' and the word for 'arm', and explain how Igala distinguishes them.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "lexicon_disambig",
    text: "The English word 'brother' can mean older or younger brother. Give the Igala words for each and explain the difference.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word for 'day' (24 hours) and 'day' (daytime, not night), and explain how they differ.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word you would use in 'I know that the market is far' and the word you would use in 'I know that man'. Are they the same word or different?",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word for 'water you drink' and 'a river', and explain whether the same word is used.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "lexicon_disambig",
    text: "A learner used a Yoruba word for 'thank you' when speaking Igala. Give the correct Igala word instead.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "Igala and Yoruba are related (Yoruboid); the annotator should give the genuine Igala expression, not the Yoruba one.",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word for 'old' as applied to a person versus 'old' as applied to an object, if they differ.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala verb for 'to carry on the head' and confirm it is distinct from the general verb 'to carry'.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word for 'child' (offspring) versus 'child' (young person), and explain any difference.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word for 'to cook' and 'to boil', and explain how a speaker chooses between them.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala words for maternal grandmother and paternal grandmother, or state that one term covers both.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should supply the Igala kinship terms and whether Igala distinguishes maternal from paternal grandparents.",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word for 'to buy' and 'to sell', making sure neither has bled in from another language.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word for 'medicine' in the pharmacy sense and in the traditional-remedy sense, if they differ.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word for 'story' (a tale) and 'story' (news), and explain whether Igala uses one word or two.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word you would use for 'she said one word' and the word for 'she can speak Igala well'. Are they the same word or different?",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala words for the four cardinal directions, confirming they are Igala terms.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should supply genuine Igala direction terms, or note if directions are expressed relative to landmarks instead.",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word for 'guest' or 'visitor', making sure it is not an English or Hausa borrowing.",
    difficultyLevel: "intermediate",
  },
  // advanced
  {
    bucket: "lexicon_disambig",
    text: "In Igala, give a word whose meaning changes with tone, list both meanings, and mark the tone on each.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give three Igala words that are commonly confused with Idoma equivalents, and identify the genuine Igala form in each case.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "Observed interference in Igala is often from Idoma; the annotator should identify the true Igala words.",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala kinship term for a father's brother versus a mother's brother, and explain whether Igala distinguishes them.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply the correct Igala kinship distinctions rather than assuming an English or Yoruba system.",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala words for different kinds of yam or yam dishes and explain how a speaker distinguishes them.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "Yam is central to Igala food culture; the annotator should supply the correct Igala terms and distinctions.",
  },
  {
    bucket: "lexicon_disambig",
    text: "Provide an Igala word that a machine might mistranslate because Yoruba has a similar-sounding word with a different meaning, and clarify the true Igala sense.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala terms for 'in-law' relationships (for example wife's family, husband's family) and explain the distinctions.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply the Igala in-law terminology; do not assume it matches a neighbouring language.",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word for 'spirit' or 'ancestral spirit' and distinguish it from the general word for a dead person, if they differ.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply the correct Igala terms and the distinction between them.",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala words used to count in a market (for example units, pairs, heaps) and explain how they differ from ordinary numbers.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply genuine Igala counting/measure terms used in trading.",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word you would use for 'go to the farm' and the word for 'go home', and say whether Igala uses the same verb for both or different verbs. (Advanced.)",
    difficultyLevel: "advanced",
  },
  {
    bucket: "lexicon_disambig",
    text: "Give the Igala word for 'to hear' and 'to understand', and explain whether Igala uses one word for both.",
    difficultyLevel: "intermediate",
  },
];

// ─── register_honorifics ─────────────────────────────────────
// Axes: authenticity, cultural_relevance, semantics. Same content across
// registers, deference forms, address forms.
const register_honorifics: BankPrompt[] = [
  // basic
  {
    bucket: "register_honorifics",
    text: "Greet an elder respectfully in Igala in the morning.",
    difficultyLevel: "basic",
    expectedCulturalContext:
      "Igala greetings are hierarchical; a younger person greets an elder first, with appropriate deference.",
  },
  {
    bucket: "register_honorifics",
    text: "Greet a friend of your own age casually in Igala.",
    difficultyLevel: "basic",
  },
  {
    bucket: "register_honorifics",
    text: "Say 'thank you' respectfully to an older person in Igala.",
    difficultyLevel: "basic",
  },
  {
    bucket: "register_honorifics",
    text: "Say 'good evening' to an elder in Igala.",
    difficultyLevel: "basic",
  },
  {
    bucket: "register_honorifics",
    text: "Welcome a visitor politely to your home in Igala.",
    difficultyLevel: "basic",
  },
  {
    bucket: "register_honorifics",
    text: "Ask an elder how they slept, respectfully, in Igala.",
    difficultyLevel: "basic",
  },
  {
    bucket: "register_honorifics",
    text: "Say goodbye politely to an older relative in Igala.",
    difficultyLevel: "basic",
  },
  {
    bucket: "register_honorifics",
    text: "Greet a group of people in Igala when you enter a gathering.",
    difficultyLevel: "basic",
  },
  {
    bucket: "register_honorifics",
    text: "Say 'please' when asking an elder for something in Igala.",
    difficultyLevel: "basic",
  },
  {
    bucket: "register_honorifics",
    text: "Greet your mother warmly in Igala.",
    difficultyLevel: "basic",
  },
  {
    bucket: "register_honorifics",
    text: "Say 'well done' to someone working, in Igala.",
    difficultyLevel: "basic",
  },
  {
    bucket: "register_honorifics",
    text: "Greet an elder in Igala in the afternoon.",
    difficultyLevel: "basic",
  },
  // intermediate
  {
    bucket: "register_honorifics",
    text: "Say 'I am fine, thank you' to an elder and then to a friend, showing how the register changes in Igala.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "register_honorifics",
    text: "Ask an elder to sit down, using the respectful form in Igala.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "register_honorifics",
    text: "Give the same request - 'come and eat' - first to a child, then to an elder, in Igala.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "register_honorifics",
    text: "Politely decline food offered by an elder in Igala without causing offence.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "register_honorifics",
    text: "Address a titled chief respectfully in Igala when greeting him.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should supply the correct Igala forms of address for a titled person.",
  },
  {
    bucket: "register_honorifics",
    text: "Ask an older person for permission to leave a gathering, respectfully, in Igala.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "register_honorifics",
    text: "Express condolences respectfully to an elder who has lost a relative, in Igala.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should supply the appropriate Igala condolence expressions and register.",
  },
  {
    bucket: "register_honorifics",
    text: "Say 'please forgive me' to an elder in Igala after a mistake.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "register_honorifics",
    text: "Invite an elder to a family event, using respectful language in Igala.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "register_honorifics",
    text: "Say the same warning - 'be careful' - to a small child and to a respected elder in Igala.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "register_honorifics",
    text: "Greet your father-in-law respectfully in Igala.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should supply the appropriate Igala in-law address and any customary deference.",
  },
  {
    bucket: "register_honorifics",
    text: "Ask an elder a question politely in Igala without sounding demanding.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "register_honorifics",
    text: "Thank a group of elders after they have blessed you, in Igala.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "register_honorifics",
    text: "Tell a younger sibling firmly but not rudely to wait, in Igala.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "register_honorifics",
    text: "Congratulate a new parent respectfully in Igala.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "register_honorifics",
    text: "Say 'safe journey' to an elder travelling, in Igala.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "register_honorifics",
    text: "Respond to an elder's greeting appropriately in Igala, showing the expected reply.",
    difficultyLevel: "intermediate",
  },
  // advanced
  {
    bucket: "register_honorifics",
    text: "Address the Attah of Igala respectfully in Igala, using the appropriate honorific forms.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The Attah is the paramount ruler of the Igala; the annotator should supply the correct honorific address.",
  },
  {
    bucket: "register_honorifics",
    text: "Deliver a short respectful speech in Igala thanking elders at a community gathering.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "register_honorifics",
    text: "Express the same firm refusal to a peer and then to a superior in Igala, showing how deference reshapes it.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "register_honorifics",
    text: "Make a formal request to a council of elders in Igala, using the appropriate respectful register.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply the customary respectful register for addressing a group of elders.",
  },
  {
    bucket: "register_honorifics",
    text: "Apologise formally in Igala on behalf of a family to another family, using the correct honorifics.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "register_honorifics",
    text: "Give an angry rebuke and then the same message politely in Igala, so the tone-of-voice difference is clear.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "register_honorifics",
    text: "Introduce a respected guest to elders in Igala with the appropriate deferential language.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "register_honorifics",
    text: "Offer a blessing to a younger person as an elder would in Igala, using the elder-to-junior register.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply how an elder addresses and blesses a junior in Igala.",
  },
  {
    bucket: "register_honorifics",
    text: "Word a wedding invitation in Igala with the formality appropriate to inviting senior relatives.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply the appropriate formal register for Igala marriage invitations.",
  },
  {
    bucket: "register_honorifics",
    text: "Ask an elder to bless a meal in Igala, using the respectful form of request.",
    difficultyLevel: "intermediate",
  },
];

// ─── idioms_metaphor ─────────────────────────────────────────
// Axes: semantics, cultural_relevance, authenticity, contamination. Figurative
// language read culturally, not literally.
const idioms_metaphor: BankPrompt[] = [
  // basic
  {
    bucket: "idioms_metaphor",
    text: "Share a common Igala proverb and give its meaning in plain English.",
    difficultyLevel: "basic",
  },
  {
    bucket: "idioms_metaphor",
    text: "Give an Igala saying about patience and explain what it teaches.",
    difficultyLevel: "basic",
  },
  {
    bucket: "idioms_metaphor",
    text: "Give an Igala proverb about the value of family and explain it.",
    difficultyLevel: "basic",
  },
  {
    bucket: "idioms_metaphor",
    text: "Someone keeps starting new tasks before finishing the one before. Give an Igala proverb an elder might say to them, and explain how it fits.",
    difficultyLevel: "basic",
  },
  {
    bucket: "idioms_metaphor",
    text: "Give an Igala saying about respect for elders and explain it.",
    difficultyLevel: "basic",
  },
  {
    bucket: "idioms_metaphor",
    text: "Give a short Igala proverb, then say first what its words mean literally and second what it really teaches.",
    difficultyLevel: "basic",
  },
  {
    bucket: "idioms_metaphor",
    text: "Give an Igala proverb that mentions an animal, and explain what the animal stands for.",
    difficultyLevel: "basic",
  },
  {
    bucket: "idioms_metaphor",
    text: "Give an Igala proverb an elder would use to gently correct a child who is misbehaving, and explain the lesson in it.",
    difficultyLevel: "basic",
  },
  {
    bucket: "idioms_metaphor",
    text: "Name a situation in which it would be wrong or disrespectful to use a light, joking Igala proverb, and explain why.",
    difficultyLevel: "basic",
  },
  {
    bucket: "idioms_metaphor",
    text: "Give a simple Igala riddle and its answer.",
    difficultyLevel: "basic",
  },
  {
    bucket: "idioms_metaphor",
    text: "Give an Igala saying about money or wealth and explain it.",
    difficultyLevel: "basic",
  },
  {
    bucket: "idioms_metaphor",
    text: "Two brothers are quarrelling over something small. Give an Igala proverb that would calm them, and explain how it applies.",
    difficultyLevel: "basic",
  },
  // intermediate
  {
    bucket: "idioms_metaphor",
    text: "Give an Igala proverb, then describe a real situation in which someone would use it.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "idioms_metaphor",
    text: "Explain the figurative meaning of an Igala expression that mentions an animal, and say what the animal stands for.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "idioms_metaphor",
    text: "Give an Igala idiom whose literal words are misleading, and explain what it really means.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "idioms_metaphor",
    text: "Share an Igala proverb used to advise a young person about marriage, and explain it.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should supply a genuine Igala proverb and its situational use in marriage advice.",
  },
  {
    bucket: "idioms_metaphor",
    text: "Give an Igala saying that uses the image of a farm or harvest as a metaphor, and explain the metaphor.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "idioms_metaphor",
    text: "Explain an Igala proverb about the consequences of one's actions, and give a situation where it fits.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "idioms_metaphor",
    text: "Give an Igala expression used to warn against greed, and explain its imagery.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "idioms_metaphor",
    text: "Share an Igala proverb that would be spoken at a naming ceremony, and explain why it fits.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should supply a genuine Igala proverb appropriate to a naming ceremony.",
  },
  {
    bucket: "idioms_metaphor",
    text: "Give an Igala idiom about speech or gossip, and explain what it cautions against.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "idioms_metaphor",
    text: "Explain an Igala proverb that uses water or a river as an image, and what it teaches.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "idioms_metaphor",
    text: "Give an Igala saying about the relationship between a chief and his people, and explain it.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "idioms_metaphor",
    text: "Share an Igala proverb that would settle a quarrel between two people, and explain how.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "idioms_metaphor",
    text: "Give an Igala expression that praises perseverance, and explain the picture behind it.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "idioms_metaphor",
    text: "Explain an Igala proverb about death or ancestors, being careful to read it figuratively.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should supply a genuine Igala proverb and its figurative meaning.",
  },
  {
    bucket: "idioms_metaphor",
    text: "Give an Igala idiom that describes someone who is stubborn, and explain the imagery.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "idioms_metaphor",
    text: "Share an Igala proverb about the importance of one's roots or origin, and explain it.",
    difficultyLevel: "intermediate",
  },
  // advanced
  {
    bucket: "idioms_metaphor",
    text: "Take a well-known Igala proverb and explain both its literal wording and its deeper cultural meaning, showing how they differ.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "idioms_metaphor",
    text: "Give two Igala proverbs that give opposite advice, and explain when each would be used.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "idioms_metaphor",
    text: "Explain an Igala proverb that relies on a local landmark, festival, or historical figure, and unpack the reference.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply a genuine Igala proverb and the local reference it depends on.",
  },
  {
    bucket: "idioms_metaphor",
    text: "Compose a short piece of Igala praise poetry or a proverb-string as an elder might, and explain the imagery.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "idioms_metaphor",
    text: "Explain an Igala proverb whose meaning would be lost if translated word-for-word into English, and show the trap.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "idioms_metaphor",
    text: "Give an Igala proverb used in traditional dispute resolution, and explain how an elder would apply it.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply a genuine Igala proverb used in adjudication and its application.",
  },
  {
    bucket: "idioms_metaphor",
    text: "Interpret an Igala metaphor about a masquerade or an ancestral spirit, reading it culturally rather than literally.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "Masquerades are sacred in Igala culture; the annotator should supply the figurative reading.",
  },
  {
    bucket: "idioms_metaphor",
    text: "Give an Igala riddle and its answer, and explain the figurative logic connecting them.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply a genuine Igala riddle and its culturally understood answer.",
  },
  {
    bucket: "idioms_metaphor",
    text: "Explain how the same Igala proverb can carry a different meaning depending on who says it and to whom.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "idioms_metaphor",
    text: "Give an Igala proverb about the danger of pride, then describe a situation in which it would be spoken.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "idioms_metaphor",
    text: "Explain an Igala proverb whose imagery draws on farming or the seasons, and unpack how the metaphor maps onto human life.",
    difficultyLevel: "advanced",
  },
];

// ─── cultural_values ─────────────────────────────────────────
// Axes: cultural_relevance, contamination, authenticity, semantics. Taboo,
// sacred, and local knowledge - where an invented fact is the danger.
const cultural_values: BankPrompt[] = [
  // basic
  {
    bucket: "cultural_values",
    text: "Describe how a naming ceremony is traditionally carried out among the Igala.",
    difficultyLevel: "basic",
    expectedCulturalContext:
      "The annotator should supply the genuine Igala naming-ceremony customs rather than a generic account.",
  },
  {
    bucket: "cultural_values",
    text: "Explain the importance of yam in Igala food culture.",
    difficultyLevel: "basic",
    expectedCulturalContext:
      "Yam is a staple in Igala culture; the annotator should confirm the specifics.",
  },
  {
    bucket: "cultural_values",
    text: "Describe how elders are treated in an Igala household.",
    difficultyLevel: "basic",
  },
  {
    bucket: "cultural_values",
    text: "Explain what pounded yam means at an Igala gathering or feast.",
    difficultyLevel: "basic",
  },
  {
    bucket: "cultural_values",
    text: "Describe a common way that Igala families welcome a new baby.",
    difficultyLevel: "basic",
    expectedCulturalContext:
      "The annotator should supply genuine Igala birth-welcome customs.",
  },
  {
    bucket: "cultural_values",
    text: "Explain who the Attah of Igala is and why the office matters.",
    difficultyLevel: "basic",
    expectedCulturalContext:
      "The Attah is the paramount ruler of the Igala kingdom.",
  },
  {
    bucket: "cultural_values",
    text: "Describe a typical Igala market day.",
    difficultyLevel: "basic",
  },
  {
    bucket: "cultural_values",
    text: "Explain the role of storytelling in teaching Igala children.",
    difficultyLevel: "basic",
  },
  {
    bucket: "cultural_values",
    text: "Describe how greetings show respect in Igala culture.",
    difficultyLevel: "basic",
  },
  {
    bucket: "cultural_values",
    text: "Explain the importance of farming in Igala life.",
    difficultyLevel: "basic",
  },
  {
    bucket: "cultural_values",
    text: "Describe a food commonly eaten at Igala celebrations.",
    difficultyLevel: "basic",
    expectedCulturalContext:
      "The annotator should supply a genuine Igala celebratory food.",
  },
  {
    bucket: "cultural_values",
    text: "Explain why family lineage matters in Igala society.",
    difficultyLevel: "basic",
  },
  // intermediate
  {
    bucket: "cultural_values",
    text: "Describe the customs surrounding a traditional Igala marriage, including the role of both families.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should supply genuine Igala marriage customs rather than assuming Yoruba or Igbo practice.",
  },
  {
    bucket: "cultural_values",
    text: "Explain how condolences and mourning are traditionally observed among the Igala.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should supply genuine Igala mourning customs.",
  },
  {
    bucket: "cultural_values",
    text: "Describe the role of the traditional council of chiefs under the Attah of Igala.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should supply the genuine structure of Igala traditional governance.",
  },
  {
    bucket: "cultural_values",
    text: "Explain the agricultural calendar the Igala follow, from planting to harvest.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should supply the genuine Igala farming calendar and its seasons.",
  },
  {
    bucket: "cultural_values",
    text: "Describe a traditional Igala festival and what it celebrates.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should name and describe a genuine Igala festival; do not assert festival details without confirmation.",
  },
  {
    bucket: "cultural_values",
    text: "Explain the customs a guest should observe when visiting an Igala family home.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "cultural_values",
    text: "Describe how a new yam is traditionally celebrated among the Igala, if such a custom exists.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should confirm whether the Igala hold a new-yam observance and describe it accurately.",
  },
  {
    bucket: "cultural_values",
    text: "Explain the role of music and dance in Igala community life.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "cultural_values",
    text: "Describe how disputes are traditionally settled within an Igala community.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should supply genuine Igala dispute-resolution practice.",
  },
  {
    bucket: "cultural_values",
    text: "Explain what is expected of a first son or first daughter in an Igala family.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should supply genuine Igala expectations around birth order.",
  },
  {
    bucket: "cultural_values",
    text: "Describe the significance of naming a child after an ancestor in Igala culture, if this is practised.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should confirm and describe genuine Igala naming beliefs.",
  },
  {
    bucket: "cultural_values",
    text: "Explain how hospitality toward strangers is regarded in Igala culture.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "cultural_values",
    text: "Describe a craft or trade that is traditionally important to the Igala.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should supply a genuine Igala craft or trade.",
  },
  {
    bucket: "cultural_values",
    text: "Explain the place of proverbs in Igala public speaking and decision-making.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "cultural_values",
    text: "Describe the traditional Igala week and how market days are organised within it.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should supply the genuine Igala market-week structure.",
  },
  {
    bucket: "cultural_values",
    text: "Explain how respect for the land and farming is expressed in Igala customs.",
    difficultyLevel: "intermediate",
  },
  // advanced
  {
    bucket: "cultural_values",
    text: "Explain the significance of masquerades in Igala tradition, being careful to distinguish sacred belief from entertainment.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "Masquerades represent ancestral spirits and are sacred in Igala belief; the annotator should correct any invented detail.",
  },
  {
    bucket: "cultural_values",
    text: "Describe the history and role of the Attah of Igala institution and its place in the wider Igala kingdom.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply genuine historical detail and flag any invented lineage or dates.",
  },
  {
    bucket: "cultural_values",
    text: "Explain a taboo or sacred prohibition in Igala culture and why it is observed.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply a genuine Igala taboo; a plausible-but-invented taboo is the danger here.",
  },
  {
    bucket: "cultural_values",
    text: "Describe the traditional Igala funeral rites for an elder, distinguishing what is customary from what varies by family.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply genuine Igala funeral customs and flag any invented specifics.",
  },
  {
    bucket: "cultural_values",
    text: "Explain the role of ancestral veneration in Igala spiritual life, without conflating it with a neighbouring culture's practice.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply genuine Igala belief and correct any bleed from Yoruba or Igbo practice.",
  },
  {
    bucket: "cultural_values",
    text: "Describe the origins or founding traditions of the Igala kingdom as they are commonly told.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply genuine Igala origin traditions and flag invented history.",
  },
  {
    bucket: "cultural_values",
    text: "Explain the meaning and observance of a specific Igala festival, correcting any invented details a model might add.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should confirm the festival is genuinely Igala and supply accurate details.",
  },
  {
    bucket: "cultural_values",
    text: "Describe the traditional titles and their responsibilities within the Igala chieftaincy system.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply genuine Igala titles and their duties; a fluent-sounding invented title is the danger.",
  },
  {
    bucket: "cultural_values",
    text: "Explain how land and inheritance are traditionally handled in Igala families.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply genuine Igala inheritance custom rather than a generic account.",
  },
  {
    bucket: "cultural_values",
    text: "Describe the role of the extended family and age-grades in organising Igala community work, if age-grades are used.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should confirm whether the Igala organise labour by age-grade and describe it accurately.",
  },
  {
    bucket: "cultural_values",
    text: "Explain the relationship between the Igala and the River Niger in daily life, trade, and tradition.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply genuine detail about the Igala relationship to the river rather than a generic account.",
  },
];

// ─── authenticity ────────────────────────────────────────────
// Axes: authenticity, cultural_relevance, contamination. Natural, non-
// translationese Igala.
const authenticity: BankPrompt[] = [
  // basic
  {
    bucket: "authenticity",
    text: "Write a short, natural Igala blessing as a community member would actually say it, not translated from English.",
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: "Write how an Igala speaker would naturally greet someone returning from a journey.",
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: "Write a natural Igala way of telling someone to eat well and be strong.",
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: "Write how an Igala speaker would naturally wish someone a good night.",
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: "Write a natural Igala expression of gratitude after a shared meal.",
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: "Write how an Igala speaker would naturally encourage a friend who is discouraged.",
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: "Write a natural Igala way of welcoming someone into your home.",
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: "Write how an Igala speaker would naturally say 'take care of yourself'.",
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: "Write a natural Igala blessing a parent might give a child leaving home.",
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: "Write how an Igala speaker would naturally respond to good news from a friend.",
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: "Write a natural Igala way of asking after someone's family.",
    difficultyLevel: "basic",
  },
  {
    bucket: "authenticity",
    text: "Write how an Igala speaker would naturally say 'thank God' on hearing good news.",
    difficultyLevel: "basic",
  },
  // intermediate
  {
    bucket: "authenticity",
    text: "Write a short Igala market exchange between a buyer and a seller as it would really be spoken.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: "Write how an Igala mother would naturally call her children in to eat.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: "Write a natural Igala conversation opener between two neighbours meeting on the road.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: "Write how an Igala speaker would naturally tease a friend in a warm, joking way.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: "Write a natural Igala blessing said over a newborn child, as a grandmother might say it.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should supply a genuine, natural Igala blessing for a newborn.",
  },
  {
    bucket: "authenticity",
    text: "Write how an Igala speaker would naturally comfort someone who is grieving.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should supply natural Igala words of comfort.",
  },
  {
    bucket: "authenticity",
    text: "Write a natural Igala way of praising a good cook after a meal.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: "Write how an Igala elder would naturally advise a young person to be patient.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: "Write a short natural Igala exchange of morning greetings between a wife and husband.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: "Write how an Igala speaker would naturally invite a friend to share food.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: "Write a natural Igala way of congratulating someone on a new child.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: "Write how an Igala trader would naturally call out to attract customers in a market.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: "Write a natural Igala prayer of thanks before eating, as a family might say it.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should supply a natural Igala expression, not a translated English grace.",
  },
  {
    bucket: "authenticity",
    text: "Write how an Igala speaker would naturally reassure someone that everything will be fine.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: "Write a natural Igala way of scolding a child gently for being late.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: "Write how an Igala speaker would naturally say farewell to a visitor leaving after a long stay.",
    difficultyLevel: "intermediate",
  },
  // advanced
  {
    bucket: "authenticity",
    text: "Write a short Igala folktale opening the way a village storyteller would actually tell it, not as a translated English story.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply a natural Igala storytelling opening and formulae.",
  },
  {
    bucket: "authenticity",
    text: "Write a natural Igala speech of thanks an elder would give at a wedding, avoiding translationese.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "authenticity",
    text: "Write how an Igala speaker would naturally recount a busy market day to a friend, in a colloquial voice.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "authenticity",
    text: "Write a natural Igala lullaby or soothing song a mother would sing, as it would really sound.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply a genuine Igala lullaby or natural soothing phrasing.",
  },
  {
    bucket: "authenticity",
    text: "Write an Igala blessing for a new house or compound as an elder would pronounce it, keeping it fully natural.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply a natural Igala blessing for a new home.",
  },
  {
    bucket: "authenticity",
    text: "Write a natural Igala exchange in which one person consoles another after a poor harvest, avoiding stiff translation.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "authenticity",
    text: "Write how an Igala praise-singer would naturally honour a respected person, in an authentic voice.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply authentic Igala praise phrasing.",
  },
  {
    bucket: "authenticity",
    text: "Write a natural Igala welcome an elder would give to guests arriving for a ceremony, avoiding English-shaped phrasing.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "authenticity",
    text: "Rewrite a stiff, English-sounding Igala sentence about going to the farm so that it sounds like a real Igala speaker, and note what changed.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "authenticity",
    text: "Write how an Igala speaker would naturally greet a neighbour they pass every day, in the offhand way it is really said.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "authenticity",
    text: "Write a natural Igala exchange between an elder and a young person over a shared meal, keeping both voices authentic rather than translated.",
    difficultyLevel: "advanced",
  },
];

// ─── dialectal_fidelity (experimental) ───────────────────────
// Axes: contamination, authenticity. Dialect variation and code-switching.
// Target 20 total incl. the 1 existing -> 19 new.
const dialectal_fidelity: BankPrompt[] = [
  // basic
  {
    bucket: "dialectal_fidelity",
    text: "Give an everyday Igala greeting and note if it is said differently in another Igala-speaking area.",
    difficultyLevel: "basic",
    expectedCulturalContext:
      "The annotator should supply any dialectal variation they know across Igala-speaking communities.",
  },
  {
    bucket: "dialectal_fidelity",
    text: "Give the Igala word for 'water' and note whether it varies between Igala localities.",
    difficultyLevel: "basic",
  },
  {
    bucket: "dialectal_fidelity",
    text: "Give a common Igala farewell and mention any local variation you know.",
    difficultyLevel: "basic",
  },
  {
    bucket: "dialectal_fidelity",
    text: "Give the Igala word for 'come here' and note any difference between areas.",
    difficultyLevel: "basic",
  },
  {
    bucket: "dialectal_fidelity",
    text: "Give an Igala way of saying 'how are you' and note if some communities say it differently.",
    difficultyLevel: "basic",
  },
  {
    bucket: "dialectal_fidelity",
    text: "Give the Igala word for 'yes' and 'no' and note any local variation.",
    difficultyLevel: "basic",
  },
  // intermediate
  {
    bucket: "dialectal_fidelity",
    text: "Provide a short Igala sentence and note whether speakers from different Igala areas would phrase it differently.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should supply known dialectal differences; Igala dialects are largely mutually intelligible.",
  },
  {
    bucket: "dialectal_fidelity",
    text: "Give an Igala greeting and show how a speaker might mix in English or Hausa in everyday code-switching.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should show natural code-switching as it really occurs, not forced mixing.",
  },
  {
    bucket: "dialectal_fidelity",
    text: "Give an Igala phrase and identify any word within it that a neighbouring language shares, noting the Igala form.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "dialectal_fidelity",
    text: "Write how a young Igala speaker in town might naturally mix Igala and English in one sentence.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "dialectal_fidelity",
    text: "Give an Igala expression for counting money in a market, noting any variation between communities.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "dialectal_fidelity",
    text: "Provide a short Igala sentence and mark any word whose pronunciation differs across Igala areas.",
    difficultyLevel: "intermediate",
    expectedCulturalContext:
      "The annotator should supply pronunciation differences they are aware of.",
  },
  {
    bucket: "dialectal_fidelity",
    text: "Give an everyday Igala request and show both a fully-Igala version and a naturally code-switched version.",
    difficultyLevel: "intermediate",
  },
  {
    bucket: "dialectal_fidelity",
    text: "Give an Igala kinship term and note whether different Igala communities use different words for it.",
    difficultyLevel: "intermediate",
  },
  // advanced
  {
    bucket: "dialectal_fidelity",
    text: "Provide the same short Igala message in two different Igala dialect forms and explain the differences.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply genuine dialect forms; note that Igala dialects are largely mutually intelligible.",
  },
  {
    bucket: "dialectal_fidelity",
    text: "Write a natural Igala-English code-switched conversation snippet as urban Igala speakers really talk, and mark the switch points.",
    difficultyLevel: "advanced",
  },
  {
    bucket: "dialectal_fidelity",
    text: "Give a common Igala word or phrase that has a well-known regional variant, and provide both forms, noting where each is used.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply both variant forms and, if known, the areas where each is used.",
  },
  {
    bucket: "dialectal_fidelity",
    text: "Give an Igala proverb and note whether its wording changes between Igala-speaking communities.",
    difficultyLevel: "advanced",
    expectedCulturalContext:
      "The annotator should supply any known variation in the proverb's wording.",
  },
  {
    bucket: "dialectal_fidelity",
    text: "Give an everyday Igala phrase in two variant forms used by different Igala-speaking communities, and note any difference in meaning or usage.",
    difficultyLevel: "advanced",
  },
];

const ALL: BankPrompt[] = [
  ...orthography,
  ...grammar_tone,
  ...lexicon_disambig,
  ...register_honorifics,
  ...idioms_metaphor,
  ...cultural_values,
  ...authenticity,
  ...dialectal_fidelity,
];

// Assign collision-proof promptIds per bucket: ig_bank_<short>_NNN.
function withPromptIds(
  prompts: BankPrompt[],
): (BankPrompt & { promptId: string })[] {
  const counters: Record<string, number> = {};
  return prompts.map((p) => {
    const short = SHORT[p.bucket];
    counters[short] = (counters[short] ?? 0) + 1;
    const promptId = `ig_bank_${short}_${String(counters[short]).padStart(3, "0")}`;
    return { ...p, promptId };
  });
}

async function main() {
  const withIds = withPromptIds(ALL);

  // ── Self-checks before any DB write ──────────────────────────
  // 1. No duplicate or near-duplicate prompt text.
  const seen = new Map<string, string>();
  const dupes: string[] = [];
  for (const p of withIds) {
    const norm = p.text
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (seen.has(norm)) {
      dupes.push(`${p.promptId} duplicates ${seen.get(norm)}: "${p.text}"`);
    } else {
      seen.set(norm, p.promptId);
    }
  }
  if (dupes.length) {
    console.error(
      "Duplicate prompt texts found - aborting:\n" + dupes.join("\n"),
    );
    process.exit(1);
  }

  // 2. No duplicate promptIds.
  const ids = new Set<string>();
  for (const p of withIds) {
    if (ids.has(p.promptId)) {
      console.error(`Duplicate promptId ${p.promptId} - aborting`);
      process.exit(1);
    }
    ids.add(p.promptId);
  }

  // 3. Collision check against existing DB promptIds (belt and braces; the
  //    upsert is create-only anyway).
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

  // A stable owner for createdById (matches seed.ts convention). Prefer the
  // seeded annotator; fall back to null if not present so this never fails on a
  // fresh DB.
  const annotator = await prisma.user.findFirst({
    where: { email: "annotator@test.com" },
    select: { id: true },
  });
  const createdById = annotator?.id ?? null;

  // ── CREATE-ONLY upserts ──────────────────────────────────────
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
        provenance: "claude_authored_v1",
        createdById,
      },
    });
    processed++;
  }

  // ── Report per-category counts (bank-only, then whole DB) ─────
  console.log(`\nProcessed ${processed} bank prompts (create-only).`);

  const bankRows = await prisma.prompt.findMany({
    where: { provenance: "claude_authored_v1" },
    select: { bucket: true },
  });
  const bankByBucket: Record<string, number> = {};
  for (const r of bankRows)
    bankByBucket[r.bucket] = (bankByBucket[r.bucket] ?? 0) + 1;

  const allRows = await prisma.prompt.findMany({ select: { bucket: true } });
  const allByBucket: Record<string, number> = {};
  for (const r of allRows)
    allByBucket[r.bucket] = (allByBucket[r.bucket] ?? 0) + 1;

  console.log("\nPer-category counts (bank / total in DB):");
  for (const b of Object.keys(SHORT) as EvalBucket[]) {
    console.log(
      `  ${b.padEnd(20)} bank=${String(bankByBucket[b] ?? 0).padStart(3)}  total=${String(allByBucket[b] ?? 0).padStart(3)}`,
    );
  }
  console.log(`\nTotal prompts in DB now: ${allRows.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
