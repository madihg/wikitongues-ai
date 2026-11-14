import type { EvalBucket, DifficultyLevel } from "@prisma/client";
import { contentWords, jaccard, type BankPrompt } from "./prompt-bank-v45";

/**
 * The v4.6 prompt bank (2026-11-13): 320 questions built from the gaps that
 * are still measurable in the v4.4 and v4.5 answers, plus a speech queue
 * chosen for sound coverage. The data lives here, apart from the seed script
 * (prisma/seed-prompt-bank-v46.ts), so the invariants are tested without a
 * database (prompt-bank-v46.test.ts).
 *
 * Every figure quoted in a family below is measured on production data read
 * on 2026-11-13 (484 judged sides of v4.4 and v4.5 since Oct 8, 136 speaker
 * corrections of those arms holding 352 changed spans, 1,758 train answers,
 * the tone restoration test) unless it says "estimated". The analysis is in
 * tasks/model-gap-analysis-2026-11.md and the per-family evidence in
 * tasks/prompt-bank-v46-evidence-2026-11.md.
 *
 * Two rules hold for the whole file and are tested:
 *  - Prompt text is English. No Igala word is quoted anywhere in this file,
 *    so nothing here can hand a speaker a form or carry a speaker's text.
 *    The only Igala characters are single letters of the alphabet (the two
 *    dotted vowels and the velar nasal) inside four speech prompts that ask for
 *    a sound by its letter.
 *  - A prompt asks; it never says which Igala form is right.
 */

export const V46_PROVENANCE = "claude_authored_v46_2026_11_13";
/** The speech set carries its own provenance so its pool outputs can be filled, or not, on their own. */
export const V46_SPEECH_PROVENANCE = "claude_authored_v46_speech_2026_11_13";

export type GapId =
  | "G1_sentence_construction"
  | "G2_tone_marks"
  | "G3_fixed_formulas"
  | "G4_spelling_and_word_choice"
  | "G5_word_strength"
  | "G6_english_kept"
  | "G7_neighbour_language"
  | "G8_proper_names"
  | "G9_dialect"
  | "G10_homographs"
  | "G11_numbers"
  | "G12_untested_buckets"
  | "S1_speech_coverage";

/** The ranked gaps, with the measured size each family points back to. */
export const V46_GAPS: Record<GapId, { rank: number; title: string; size: string }> = {
  G1_sentence_construction: {
    rank: 1,
    title: "Sentence construction",
    size: "182 of 352 corrected spans (52%) rewrite two or more words; the grammar tag sits on 85 of 484 judged sides (17.6%), more than every other tag together",
  },
  G2_tone_marks: {
    rank: 2,
    title: "Tone marks",
    size: "tone restoration puts the wrong tone on 1,380 of 5,870 letters (23.5%) and gets 3 of 153 sentences fully right; 7% of train answers are densely toned",
  },
  G3_fixed_formulas: {
    rank: 3,
    title: "Fixed formulas and speech acts",
    size: "10 of 23 judged sides on the v4.5 formula prompts are 'both inadequate' (43%); authenticity is the worst bucket at 11 of 50 (22%)",
  },
  G4_spelling_and_word_choice: {
    rank: 4,
    title: "Spelling and word choice",
    size: "121 of 352 corrected spans (34%) change one word, one dot, one nasal letter or one word joint; 61 touch the final nasal, 63 an apostrophe, 38 the word for 'in'",
  },
  G5_word_strength: {
    rank: 5,
    title: "Word strength and meaning",
    size: "not measurable today: 0 of 136 correction notes and 0 of 407 judgment notes name word strength (1 names meaning), and no tag exists; the nearest tag (cultural) sits on 40 of 484 sides (8.3%)",
  },
  G6_english_kept: {
    rank: 6,
    title: "English kept where speakers use Igala, and the reverse",
    size: "9 corrected spans replace an English common noun with Igala against 1 the other way; english_mixed is the only tag that rose, from 1 of 944 sides on the plain model to 3 of 169 on v4.5",
  },
  G7_neighbour_language: {
    rank: 9,
    title: "Yoruba and Igbo words",
    size: "mostly closed: wrong_language, not_igala and invented together sit on 5 of 484 v4.x sides (1.0%) against 75 of 944 (7.9%) on the plain model",
  },
  G8_proper_names: {
    rank: 10,
    title: "Proper names",
    size: "11 of 352 corrected spans (3%) change a capitalised word",
  },
  G9_dialect: {
    rank: 11,
    title: "Dialect",
    size: "3 of 352 corrected spans are an l or r swap alone; 4 of 28 judged sides on the v4.5 variety prompts are 'both inadequate' and 11 are ties",
  },
  G10_homographs: {
    rank: 7,
    title: "Homographs",
    size: "no tone pair is marked anywhere in production (0 rows) and no judged prompt isolates one, so the size is unknown",
  },
  G11_numbers: {
    rank: 8,
    title: "Numbers",
    size: "8 of 11 judgments on the v4.5 money prompts are ties and the recorded texts write numbers as digits 6 times, never as words",
  },
  G12_untested_buckets: {
    rank: 12,
    title: "Idioms and cultural values, untested on the current model",
    size: "7 idiom prompts and 4 cultural prompts have ever been judged with a v4.x answer, against 80 and 61 train prompts in those buckets",
  },
  S1_speech_coverage: {
    rank: 2,
    title: "Speech coverage",
    size: "63 recorded prompts hold 437 Igala words and 6.5 minutes; 18 clips are under three words, 5 of the 63 texts carry a tone mark, and the texts hold kp 19 times, ny 10, the velar nasal 10",
  },
};

export interface SpeechSpec {
  /** carrier: the English sentence is given. open: the speaker makes the sentence and translates it herself. */
  kind: "carrier" | "open";
  /** The direct English translation to record after the Igala clip. Null for open prompts. */
  english: string | null;
  /** Sound cells this prompt is expected to yield. H-, M-, L- plus a vowel name a tone on a vowel ("ed" and "od" are the dotted vowels). */
  targets: string[];
  /** short: 3 to 8 Igala words expected. long: 12 to 20. */
  length: "short" | "long";
}

export interface V46Prompt extends BankPrompt {
  gap: GapId;
  /** Present on the speech set only. */
  speech?: SpeechSpec;
}

interface Family {
  gap: GapId;
  bucket: EvalBucket;
  /** Shown to annotators as a reference in the factual buckets, so plain English, no Igala, no arm names. */
  note: string;
  /** The measured failure. Not shown to annotators. */
  why: string;
  /** What the answers teach. Not shown to annotators. */
  rule: string;
}

const NONE = ["none: the prompt text is English only; names and towns are in their English spelling"];
const SCHOLAR =
  "none quoted: the English sentence is built on words whose toned forms are in tasks/grammar-evidence-scholarship.md (Omachonu 2012 numerals, Adeniyi 2017 tone, Ejeba 2023 concord) and tasks/salem-lydia-writeup-2026-09-25-inventory.md; the forms stay in those files";
const LETTERS =
  "single letters of the Igala alphabet only (tasks/jwal-ejeba-2023-rule-inventory.md rows E-86-5, E-87-1 to E-87-5), no word";

export const V46_FAMILIES: Record<string, Family> = {
  aspec: {
    gap: "G1_sentence_construction",
    bucket: "grammar_tone",
    note: "No rule is assumed. The answer shows how you mark that an action is going on, finished, not yet done or habitual.",
    why: "The v4.5 aspect prompts are the least solved family: 5 of 13 judged sides are 'both inadequate' and 8 of 13 carry a failure tag. Syntax is the lowest rubric axis of v4.5 (4.20, n 25).",
    rule: "One tense or aspect contrast per prompt, so the speaker's answer differs from the model's by the marker alone.",
  },
  negq: {
    gap: "G1_sentence_construction",
    bucket: "grammar_tone",
    note: "No rule is assumed. The answer shows how you say not, nobody, never and how you close a yes or no question.",
    why: "6 of 20 judged sides on the v4.5 negation prompts are 'both inadequate' and 10 carry a tag; 61 of 352 corrected spans touch the final nasal.",
    rule: "Negation and question closing in shapes the bank has not asked: nobody, nothing, neither, never, no longer, and the answer to a negative question.",
  },
  concd: {
    gap: "G1_sentence_construction",
    bucket: "grammar_tone",
    note: "No rule is assumed. The two lines differ only in one thing against many, so we can see what changes in your sentence.",
    why: "3 of 19 judged sides on the v4.5 agreement prompts are 'both inadequate' and 4 are losses, the most losses of any family beside tone.",
    rule: "Number agreement on verbs the earlier pairs did not use: bring, be missing, pour, lie, throw away, come out, hang, and the mass nouns.",
  },
  order: {
    gap: "G1_sentence_construction",
    bucket: "grammar_tone",
    note: "No rule is assumed. The answer shows where you put each word in the sentence.",
    why: "115 of 352 corrected spans replace a phrase of two or three words and 67 rewrite four or more; one linguist's note on a v4.4 answer names the position of 'but' after the subject, and another speaker's note is 'Wrong order'.",
    rule: "Word order inside the noun phrase and the clause: describing words, counted nouns, owner chains, only, also, but, question words, focus.",
  },
  chain: {
    gap: "G1_sentence_construction",
    bucket: "grammar_tone",
    note: "No rule is assumed. The answer shows how you join two parts of a sentence.",
    why: "Clause rewrites of four or more words are 67 of 352 corrected spans (19%); the v4.5 linker prompts are nearly solved for 'that' and 'who' (2 of 30 sides 'both inadequate'), and no prompt has asked for because, before, after, until, although, unless or than.",
    rule: "One joining word per prompt: because, before, after, until, although, if not, than, so that, when, unless.",
  },
  tonew: {
    gap: "G2_tone_marks",
    bucket: "orthography",
    note: "Write the sentence with its tone marks: the acute mark for a high tone and the grave mark for a low tone. Leave a middle tone bare.",
    why: "The model cannot restore tone: 23.5% of letters wrong, 3 of 153 sentences fully right. It has little to learn from: 123 of 1,758 train answers (7%) mark half their vowels or more. Speakers strip every mark in 60 corrected spans and add marks in 11.",
    rule: "A short everyday sentence written with every tone mark, so each answer is a fully toned line and two speakers can be compared mark by mark.",
  },
  homog: {
    gap: "G10_homographs",
    bucket: "grammar_tone",
    note: "No rule is assumed. Words that look alike are put in sentences that tell them apart. Write every tone mark and every dot.",
    why: "No tone pair is marked in production (0 rows), so the tone test in the Listen tab has nothing to ask. The rule files hold the pairs (tasks/igala-grammar-deduced.md R8.2, the tone triple in tasks/grammar-evidence-scholarship.md section 2.1) but the bank holds no sentence for them.",
    rule: "Each member of a look-alike set in a sentence of its own, fully marked, so the mark that carries the meaning is on record.",
  },
  formu: {
    gap: "G3_fixed_formulas",
    bucket: "authenticity",
    note: "No rule is assumed. Write the words people in your town say at this moment, not a translation of the English.",
    why: "10 of 23 judged sides on the v4.5 formula prompts are 'both inadequate' and none is a loss: both versions fail together. Authenticity has the highest 'both inadequate' share of any bucket, 11 of 50.",
    rule: "One speech act per prompt, in a scene the bank has not used, with who speaks to whom and how many lines.",
  },
  spell: {
    gap: "G4_spelling_and_word_choice",
    bucket: "orthography",
    note: "No rule is assumed. Write the sentence as you spell it, with every dot under e and o where you say one.",
    why: "38 of 352 corrected spans touch the word for 'in', 61 the final nasal and 63 an apostrophe at a word joint; 21 change only a dot or the nasal letter. Speakers disagree with each other on the dots, so the count per speaker is the data.",
    rule: "The dotted vowels, the final nasal and the word joints in sentences built to contain them.",
  },
  lexi: {
    gap: "G4_spelling_and_word_choice",
    bucket: "lexicon_disambig",
    note: "There is no reference answer for this question. Write the everyday word your town uses.",
    why: "90 of 352 corrected spans replace exactly one word (41 near spellings, 49 different words); 4 of 18 judged sides on the v4.5 word prompts are 'both inadequate'. The words corrected since October are household ones.",
    rule: "Everyday nouns and verbs of the house, the body, the farm and the weather, one or two per sentence.",
  },
  inten: {
    gap: "G5_word_strength",
    bucket: "register_honorifics",
    note: "No rule is assumed. The lines say the same thing at different strengths. Write each as you would really say it.",
    why: "Speakers said on the Nov 10 call that the model's words are too strong or too weak for the sentence. The data cannot size it: no tag, and 0 of 543 notes name it. These ladders make it countable.",
    rule: "The same message at two or three strengths with the addressee held fixed, so the strength word is the only thing that changes.",
  },
  engl: {
    gap: "G6_english_kept",
    bucket: "lexicon_disambig",
    note: "There is no fixed rule. Some speakers keep the English word, some respell it with Igala letters, some use an Igala word. Write what you say.",
    why: "9 corrected spans replace an English common noun with Igala and 1 goes the other way; 12 of 14 judgments on the v4.5 loan prompts are ties, so those prompts taught no rule. Speakers have said that school subjects and institution names stay in English.",
    rule: "Which words stay English, counted per word class: school subjects, institutions, devices, illnesses, months and days, offices.",
  },
  neigh: {
    gap: "G7_neighbour_language",
    bucket: "lexicon_disambig",
    note: "There is no reference answer for this question. Write the Igala words, not the words of a neighbouring language.",
    why: "The wrong-language tags are down to 5 of 484 v4.x sides, so this is a guard, not a gap: a few everyday words (water bodies, the market, asking a favour, peace) still surface as single-word corrections.",
    rule: "A small probe on the everyday words where a Yoruba or Igbo word is closest.",
  },
  names: {
    gap: "G8_proper_names",
    bucket: "orthography",
    note: "No rule is assumed. Spell each name as its owner or the signboard spells it.",
    why: "11 of 352 corrected spans change a capitalised word: a personal name given dots, a name swapped, an institution reordered.",
    rule: "Personal names, towns, rivers, schools and states inside an Igala sentence.",
  },
  vari: {
    gap: "G9_dialect",
    bucket: "dialectal_fidelity",
    note: "No rule is assumed. Name your town first, then write the line as your town says it.",
    why: "11 of 22 judgments on the v4.5 variety prompts are ties and 4 of 28 sides 'both inadequate'. The dialect field is filled on 60 to 85% of the two most active speakers' answers, so a line tied to a named town is usable.",
    rule: "One short everyday line per prompt, tied to the speaker's named town.",
  },
  numb: {
    gap: "G11_numbers",
    bucket: "grammar_tone",
    note: "No rule is assumed. Write every number as a word, not as a figure.",
    why: "8 of 11 judgments on the v4.5 money prompts are ties, and two speakers corrected the same composed number on a v4.5 answer. The earlier prompts cover prices and 11 to 20; nothing covers dates, clock time, ordinals or sharing out.",
    rule: "Numbers in the uses the bank lacks: counts above twenty, dates, clock time, ordinals, sharing out, the year.",
  },
  idiom: {
    gap: "G12_untested_buckets",
    bucket: "idioms_metaphor",
    note: "There is no reference answer for this question. Give the saying your town uses, and say so if your town has none for this.",
    why: "Only 7 idiom prompts have been judged with a v4.x answer (20 sides, 4 'both inadequate'), against 80 train prompts in the bucket.",
    rule: "A saying called up by a concrete situation, one line, with its meaning in one English line.",
  },
  cult: {
    gap: "G12_untested_buckets",
    bucket: "cultural_values",
    note: "There is no reference answer for this question. Answer for your own town, and say so if your town has no such custom.",
    why: "Only 4 cultural prompts have been judged with a v4.x answer (16 sides), against 61 train prompts in the bucket.",
    rule: "One custom per prompt, answered for the speaker's own town in at most two sentences.",
  },
  spnum: {
    gap: "S1_speech_coverage",
    bucket: "grammar_tone",
    note: "Write the sentence with every tone mark and every number as a word, then record it. The English to record is the sentence in quotes.",
    why: "The 72 recorded texts write numbers as digits 6 times and never as words. The number words are the best verified toned forms the project holds and cover high, mid and low tone on six of the seven vowels.",
    rule: "A number word in a three to eight word sentence.",
  },
  spcar: {
    gap: "S1_speech_coverage",
    bucket: "orthography",
    note: "Write the sentence with every tone mark, then record it. The English to record is the sentence in quotes.",
    why: "The recorded texts hold kp 19 times, ny 10, the velar nasal 10, kw 9 and p 3 in 733 words. Each sentence here is built on words whose toned forms are published.",
    rule: "A three to eight word sentence around words with a known tone pattern and a target consonant.",
  },
  sppair: {
    gap: "S1_speech_coverage",
    bucket: "grammar_tone",
    note: "Write the sentence with every tone mark, then record it. If the English is in quotes, that is the English to record.",
    why: "No tone pair exists in production (0 rows), so the Listen tab cannot ask 'which word did you hear'. Each member of a pair needs a clip of its own.",
    rule: "One member of a tone or consonant pair per clip, in a sentence that fixes its meaning.",
  },
  spdig: {
    gap: "S1_speech_coverage",
    bucket: "orthography",
    note: "Make your own sentence, write it with every tone mark, then record it. For the English, say the same thing in the same few words.",
    why: "The two-letter sounds and the nasals are the thinnest cells in the 733 recorded words (kp 19, ny 10, the velar nasal 10, kw 9, p 3), and we hold too few verified words to write a sentence for each.",
    rule: "The speaker's own sentence with a named sound at least twice.",
  },
  spvow: {
    gap: "S1_speech_coverage",
    bucket: "orthography",
    note: "Make your own sentence, write it with every tone mark, then record it. For the English, say the same thing in the same few words.",
    why: "The verified words reach 20 of the 21 tone and vowel cells; a mid tone on plain o is missing, and every cell is thin.",
    rule: "The speaker's own sentence built around one vowel.",
  },
  spname: {
    gap: "S1_speech_coverage",
    bucket: "orthography",
    note: "Write the sentence with every tone mark, names included, then record it. The English to record is the sentence in quotes.",
    why: "Names of people and towns are the words a voice model reads most often and has heard least; the 63 prompts recorded so far all come from three buckets (grammar, word choice, spelling).",
    rule: "Igala personal names and town names in a short sentence.",
  },
  speng: {
    gap: "S1_speech_coverage",
    bucket: "lexicon_disambig",
    note: "There is no fixed rule on which words stay English. Write and record the sentence as you say it. The English to record is the sentence in quotes.",
    why: "Speakers keep some English words inside Igala speech and say them with Igala intonation; none of the 63 prompts recorded so far was chosen to hold one.",
    rule: "An English term inside an Igala sentence, said as the speaker says it.",
  },
  splong: {
    gap: "S1_speech_coverage",
    bucket: "grammar_tone",
    note: "Write the sentence with every tone mark, then record it in one breath group per clause. The English to record is the sentence in quotes.",
    why: "18 of 63 recorded clips are under three words, the floor for the voice script, and 3 run over twenty. The set needs connected speech at the upper bound.",
    rule: "A sentence of twelve to twenty Igala words with two or three clauses.",
  },
};

const rows: V46Prompt[] = [];
const counters = new Map<string, number>();

function nextId(family: string): string {
  const n = (counters.get(family) ?? 0) + 1;
  counters.set(family, n);
  return `ig_v46_${family}_${String(n).padStart(3, "0")}`;
}

/** A text prompt: the family carries the gap, the bucket and the evidence; `probe` is what this one prompt isolates. */
function t(family: string, difficultyLevel: DifficultyLevel, text: string, probe: string, sources: string[] = NONE) {
  const f = V46_FAMILIES[family];
  rows.push({
    promptId: nextId(family),
    bucket: f.bucket,
    text,
    difficultyLevel,
    expectedCulturalContext: f.note,
    family,
    rationale: `${f.why} This prompt: ${probe}`,
    targetRule: f.rule,
    igalaSources: sources,
    gap: f.gap,
  });
}

/** A speech prompt with a given English sentence, which is also the translation to record. */
function carrier(
  family: string,
  english: string,
  targets: string[],
  length: "short" | "long" = "short",
  lead = "In Igala, tones marked:",
) {
  const f = V46_FAMILIES[family];
  rows.push({
    promptId: nextId(family),
    bucket: f.bucket,
    text: `${lead} '${english}'`,
    difficultyLevel: length === "long" ? "advanced" : "basic",
    expectedCulturalContext: f.note,
    family,
    rationale: `${f.why} Expected sound cells: ${targets.join(", ")}.`,
    targetRule: f.rule,
    igalaSources: [SCHOLAR],
    gap: f.gap,
    speech: { kind: "carrier", english, targets, length },
  });
}

/** A speech prompt where the speaker makes the sentence herself around a named sound. */
function open(family: string, text: string, targets: string[], sources: string[] = [LETTERS]) {
  const f = V46_FAMILIES[family];
  rows.push({
    promptId: nextId(family),
    bucket: f.bucket,
    text,
    difficultyLevel: "intermediate",
    expectedCulturalContext: f.note,
    family,
    rationale: `${f.why} Expected sound cells: ${targets.join(", ")}.`,
    targetRule: f.rule,
    igalaSources: sources,
    gap: f.gap,
    speech: { kind: "open", english: null, targets, length: "short" },
  });
}

// ── G1 sentence construction ────────────────────────────────────────────────

t("aspec", "basic", "Your brother asks whether the tailor has finished his trousers. Write two Igala lines: 'He is still sewing them' and 'He has finished sewing them.'", "ongoing against finished on one verb.");
t("aspec", "basic", "The bus to Abejukolo is late. Write two short Igala lines to the woman waiting beside you: 'It has not come yet' and 'It will come soon.'", "not yet against soon, same verb.");
t("aspec", "intermediate", "Translate into one Igala sentence, as you would tell your mother at night: 'By the time we reached Egume, the market had closed.'", "an action finished before another past action.");
t("aspec", "intermediate", "Your friend asks why your hands are dirty. Answer in one Igala sentence: 'I have been planting cassava since morning.'", "an action that began earlier and still goes on.");
t("aspec", "intermediate", "Write two Igala lines about your grandfather Idoko: 'He used to hunt when he was young' and 'He no longer hunts.'", "past habit against its end.");
t("aspec", "basic", "A small girl keeps asking for the meat in the pot. Tell her in two Igala lines: 'I am about to share it' and 'I have shared it already.'", "about to against already.");
t("aspec", "intermediate", "Translate into one Igala sentence, as you would text a cousin: 'Tomorrow at this hour I will be travelling to Itobe.'", "an action in progress at a future time.");
t("aspec", "basic", "Your neighbour asks about the leaking roof. Write three short Igala lines with the same verb: 'They are mending it today', 'They mended it yesterday', 'They will mend it tomorrow.'", "now, past and future on one verb with a time word.");
t("aspec", "intermediate", "Translate into one Igala sentence, as you would tell a friend: 'Ojone has never tasted rice cooked with coconut.'", "never, as experience.");
t("aspec", "intermediate", "Ask your uncle in one Igala sentence: 'Have you ever seen the Niger at Idah when it is full?'", "ever, in a question.");

t("negq", "basic", "Translate into one Igala sentence, as you would report to your father at dusk: 'Nobody came to help us on the farm today.'", "nobody as subject.");
t("negq", "basic", "You opened the wooden box your aunt left. Tell her in one Igala sentence: 'I did not find anything inside it.'", "nothing as object.");
t("negq", "basic", "Your sister says the carpenter is at home. Correct her in one Igala sentence: 'He is not at home, he has gone to Odolu.'", "negated location followed by a plain clause.");
t("negq", "basic", "A friend is standing at your door in the rain. Write two Igala lines: 'Are you coming in?' and 'Are you not coming in?'", "a yes or no question and its negative twin.");
t("negq", "intermediate", "Tell your younger brother in one Igala sentence: 'Do not lend my bicycle to anyone while I am away.'", "a prohibition with anyone.");
t("negq", "intermediate", "Translate into one Igala sentence: 'Neither the sheep nor the ducks have been fed since morning.'", "neither and nor over two subjects.");
t("negq", "basic", "Your mother asks who broke the plate. Answer in one Igala sentence: 'It was not me, it was the cat.'", "negated focus against a positive one.");
t("negq", "intermediate", "At the clinic in Imane you ask the nurse, 'Has the doctor not arrived yet?' Write your question in Igala, then her answer 'No, he has not', two lines.", "the answer word to a negative question.");
t("negq", "intermediate", "Translate into one Igala sentence, as an elder warns the young men of the village: 'Never cross this river after dark.'", "never, as a standing prohibition to several people.");
t("negq", "intermediate", "Translate into one Igala sentence, as you would tell a friend: 'I no longer have any money, and I do not want to borrow.'", "no longer, and two negated clauses joined.");

t("concd", "basic", "Write two Igala lines to your son: 'Bring that one stool here' and 'Bring all the stools here.'", "bring, one object against many.");
t("concd", "basic", "Write two Igala lines, as you would tell a neighbour over the fence: 'My one hen is missing' and 'My three hens are missing.'", "be missing, one subject against many.", [SCHOLAR]);
t("concd", "intermediate", "Write two Igala lines to the girl helping you at the well: 'Pour the water into this one bottle' and 'Pour the water into these four bottles.'", "the second verb after pour, one container against several.", [SCHOLAR]);
t("concd", "basic", "Write two Igala lines about the yard at noon: 'The dog is lying under the mango tree' and 'The dogs are lying under the mango tree.'", "lie, one animal against many.");
t("concd", "basic", "Write two Igala lines to the children sorting fruit: 'Throw this rotten orange away' and 'Throw these rotten oranges away.'", "throw away, one against many.", [SCHOLAR]);
t("concd", "intermediate", "Tell the labourer in two Igala lines: 'Clear the grass behind the kitchen' and 'Scoop some sand into the head pan.'", "the verbs that go with grass and with sand.", [SCHOLAR]);
t("concd", "basic", "Write two Igala lines for a midwife speaking at the door: 'The baby has come out' and 'The twins have come out.'", "come out, one against two.");
t("concd", "basic", "Write two Igala lines to your daughter on washing day: 'Hang this one wrapper on the line' and 'Hang all the wrappers on the line.'", "hang, one object against many.");

t("order", "basic", "Translate into one Igala sentence: 'Those two big black goats belong to me.'", "noun with a number, two describing words and 'those'.");
t("order", "intermediate", "Translate into one Igala sentence, as you would direct a visitor: 'My elder brother's wife's shop is beside the mosque.'", "a chain of three owners.");
t("order", "intermediate", "Translate into one Igala sentence: 'Ugbede wanted to come with us, but his father refused.'", "where 'but' sits.");
t("order", "basic", "Translate into one Igala sentence: 'Only Ladi knows where the key is kept.'", "only, on the subject.");
t("order", "basic", "Translate into one Igala sentence: 'Abutu also bought a new hoe yesterday.'", "also, and the place of the time word.");
t("order", "basic", "Write two Igala questions about last night's meal, one line each: 'What did Ojima cook?' and 'Who cooked the beans?'", "question word as object and as subject.");
t("order", "intermediate", "Translate into one Igala sentence, as you would tell the trader: 'It is the red cap that I want, not the white one.'", "focus on the object, with a contrast.");
t("order", "intermediate", "Translate into one Igala sentence: 'The woman quickly hid the money under the sleeping mat.'", "a manner word and a place phrase around the verb.");
t("order", "intermediate", "Translate into one Igala sentence: 'Every evening the old men sit and talk in front of the palace.'", "a time phrase first, two verbs, a place phrase last.");
t("order", "intermediate", "Translate into one Igala sentence: 'I gave the tall boy three ripe pawpaws.'", "two objects, each with a describing word.");

t("chain", "basic", "Translate into one Igala sentence, as you would explain to a friend: 'We left early because the road to Akpanya is bad.'", "because.");
t("chain", "basic", "Tell a child in one Igala sentence: 'Wash your hands before you touch the food.'", "before.");
t("chain", "basic", "Translate into one Igala sentence: 'After the rain stopped, the boys went back to the football field.'", "after.");
t("chain", "basic", "Tell your niece in one Igala sentence: 'Wait here until your father returns from the mosque.'", "until.");
t("chain", "intermediate", "Translate into one Igala sentence: 'Although Shaibu was sick, he still went to the farm.'", "although.");
t("chain", "intermediate", "Warn your friend in one Igala sentence: 'If you do not hurry, the bus will leave you behind.'", "a negative condition.");
t("chain", "basic", "Translate into one Igala sentence: 'Alewo is taller than her elder sister.'", "comparison with than.");
t("chain", "intermediate", "Translate into one Igala sentence: 'She hid the dried fish so that the cat would not eat it.'", "purpose with a negative.");
t("chain", "intermediate", "Translate into one Igala sentence, as a grandmother tells it: 'When I was a girl, we fetched firewood from the bush every Saturday.'", "when, with a past habit.");
t("chain", "intermediate", "Translate into one Igala sentence, as a farmer says it: 'Unless it rains this week, the maize will die.'", "unless.");

// ── G2 tone marks, G10 homographs ───────────────────────────────────────────

t("tonew", "basic", "Your baby brother has woken up. Tell your mother in one Igala line with every tone mark: 'The child is crying.'", "a three word sentence, fully toned.");
t("tonew", "basic", "A visitor asks for your mother. Answer in one Igala line with every tone mark: 'She went to the market.'", "a motion verb and a place, fully toned.");
t("tonew", "basic", "Your father lifts the lid of the pot. Tell him in one Igala line with every tone mark: 'The yam is not cooked.'", "the negative, fully toned.");
t("tonew", "basic", "Somebody knocks at night. Call out in one Igala line with every tone mark: 'Who is at the door?'", "a question word, fully toned.");
t("tonew", "basic", "An old man has walked far to see your family. Tell your sister in one Igala line with every tone mark: 'Bring water for the visitor.'", "a command with two nouns, fully toned.");
t("tonew", "basic", "Your friend asks why the path is muddy. Answer in one Igala line with every tone mark: 'Rain fell all night.'", "a past event with a time phrase, fully toned.");
t("tonew", "basic", "A lorry driver asks where you live. Answer in one Igala line with every tone mark: 'Our house is near the road.'", "a possessive and a place, fully toned.");
t("tonew", "basic", "Your uncle asks about Atayi's goat. Answer in one Igala line with every tone mark: 'He sold it yesterday.'", "an object pronoun and a time word, fully toned.");
t("tonew", "basic", "Your grandmother hears voices on Sunday morning. Tell her in one Igala line with every tone mark: 'They are singing in the church.'", "a plural subject and an ongoing action, fully toned.");
t("tonew", "basic", "You are leaving your friend's shop in the evening. Say in one Igala line with every tone mark: 'I will see you tomorrow morning.'", "the future, fully toned.");
t("tonew", "basic", "You taste the stew at your cousin's house. Say in one Igala line with every tone mark: 'The pepper is too much.'", "a degree word, fully toned.");
t("tonew", "basic", "A stranger asks what Opaluwa does for a living. Answer in one Igala line with every tone mark: 'He is a hunter.'", "the linking verb, fully toned.");
t("tonew", "intermediate", "Write two Igala lines with every tone mark: 'I know that Negedu came' and 'I know the man who came.'", "the word after 'know' against the word after 'the man', which the linguists say differ in tone alone.", [SCHOLAR]);
t("tonew", "basic", "You find an exercise book on the bench. Ask the boy beside you in one Igala line with every tone mark: 'Is this your book?'", "a yes or no question, fully toned.");

t("homog", "intermediate", "Write two Igala sentences, one line each, with every tone mark and every dot: 'The canoe is at the riverbank' and 'The money is inside the box.'", "the look-alike words for canoe and money.");
t("homog", "advanced", "Write one Igala sentence with every tone mark and every dot: 'Her husband took money to the farm.'", "three look-alike words in one sentence.");
t("homog", "intermediate", "Write two Igala sentences, one line each, with every tone mark: 'The moon is bright tonight' and 'He will return next month.'", "one word for moon and month, or two.");
t("homog", "intermediate", "Write three short Igala lines with every tone mark: 'Close the window', 'Pick the mango', 'He makes drums.'", "the three verbs the scholars give as one spelling with three tones.", [SCHOLAR]);
t("homog", "intermediate", "Write two Igala sentences, one line each, with every tone mark: 'The elders sat down' and 'The elders were glad.'", "the many-people verb for sit against the verb for be glad.", [SCHOLAR]);
t("homog", "intermediate", "Write two Igala sentences, one line each, with every tone mark: 'Ikani built a barn' and 'Ikani refused the gift.'", "build against refuse.");
t("homog", "advanced", "Think of two Igala words that are written with the same letters and mean different things when the tone changes. Write each in a short sentence of its own with every tone mark, then the English of each sentence.", "the speaker's own tone pair.");
t("homog", "advanced", "Think of two Igala words that differ only by a dot under one vowel. Write each in a short sentence of its own, dots and tone marks on, then the English of each sentence.", "the speaker's own dot pair.");
t("homog", "advanced", "Think of two Igala words that are the same except that one ends in a nasal sound. Write each in a short sentence of its own, then the English of each sentence.", "the speaker's own final nasal pair.");
t("homog", "intermediate", "Write one Igala sentence with every tone mark and every dot: 'A millipede crawled into the canoe.'", "two more members of the money and canoe set.");
t("homog", "intermediate", "Write two Igala sentences, one line each, with every tone mark: 'She said my name' and 'She shouted my name.'", "say against shout, which differ in one consonant.", [SCHOLAR]);
t("homog", "intermediate", "Write one Igala sentence with every tone mark: 'They came, but they did not eat.'", "the word for they beside the word for but.");

// ── G3 fixed formulas ───────────────────────────────────────────────────────

t("formu", "basic", "You pass a man hoeing his farm near Ugwolawo at midday. Say in Igala exactly what you call out to him as you walk by, one line.", "greeting someone at work.");
t("formu", "intermediate", "You walk into your friend's compound while the family is eating. Give in Igala what they say to invite you, and what you answer if you will not eat, two lines.", "the invitation to a meal and the polite refusal.");
t("formu", "basic", "Your neighbour's wife gave birth to a boy last night. Say in Igala exactly what you say to the father when you meet him this morning, one line.", "congratulation on a birth, to the father.");
t("formu", "basic", "Your friend's little daughter has had a fever for three days. Say in Igala what you say to the mother when you come to visit, one line.", "sympathy for illness.");
t("formu", "basic", "You step on an old woman's foot in the crowd at Ankpa market. Say in Igala exactly what you say to her at once, one line.", "an apology to an elder for a small hurt.");
t("formu", "basic", "Your nephew has passed his final school examination. Say in Igala exactly what you say when he brings you the result, one line.", "congratulation on success.");
t("formu", "intermediate", "It is the first morning of the new year and you meet your uncle in the compound. Give in Igala the greeting you say and his reply, two lines.", "the new year greeting and its reply.");
t("formu", "basic", "You must squeeze past elders seated in a narrow doorway. Say in Igala what you say as you pass between them, one line.", "asking leave to pass.");
t("formu", "basic", "A man of your own age lends you his umbrella in heavy rain. Thank him in Igala in one line, as friends do.", "thanks between equals.");
t("formu", "intermediate", "At the end of a long day of shared farm work the leader sends everybody home. Give in Igala what he says to the workers, one line.", "thanks and dismissal to a group.");
t("formu", "basic", "Your friend is about to go in for a job interview in Lokoja. Say in Igala what you wish him at the door, one line.", "a wish for success.");
t("formu", "intermediate", "You knock over your host's cup of water. Say in Igala what you say, then what the host answers to put you at ease, two lines.", "an apology and the reply that waves it away.");
t("formu", "intermediate", "A hawker calls at your gate with tomatoes and you do not need any. Say in Igala how you send her on kindly, one line.", "a kind refusal to a seller.");
t("formu", "intermediate", "You meet your old primary school teacher at the motor park in Idah after ten years. Give in Igala your first words to him, one line.", "greeting after a long absence.");
t("formu", "basic", "It is evening, you are leaving a friend's house and you will meet again tomorrow. Say in Igala your parting words and his reply, two lines.", "parting until tomorrow.");
t("formu", "basic", "A small child fetches you a cup of water without being asked. Say in Igala how you praise the child, one line.", "praise to a child.");
t("formu", "intermediate", "Your neighbour's barn burned in the night and nobody was hurt. Say in Igala what you say to him when you see him at dawn, one line.", "sympathy for a loss that is not a death.");
t("formu", "intermediate", "An elder has just finished advising you about your marriage. Say in Igala the words you answer to show you have heard and accept, one line.", "the reply to advice.");
t("formu", "basic", "You arrive late to the meeting of your age group and everyone is seated. Say in Igala what you say as you enter, one line.", "greeting a seated group, with a word for lateness.");
t("formu", "intermediate", "In the afternoon you pass women coming back from the farm with loads on their heads. Give in Igala the greeting you call to them and their reply, two lines.", "greeting several people who are carrying loads.");
t("formu", "intermediate", "A guest is leaving your house in Dekina after a short stay. Say in Igala what you say at the gate to send your greetings to her family, one line.", "sending greetings through someone.");
t("formu", "basic", "Somebody calls your name from behind the kitchen. Give in Igala the word or short phrase you call back to show you heard, one line.", "the answer to one's name.");

// ── G4 spelling and word choice ─────────────────────────────────────────────

t("spell", "basic", "Write in Igala on one line, with every dot under e and o where you say one: 'Enemona lives in Ankpa.'", "the word for 'in' before a town.");
t("spell", "basic", "Write in Igala on one line, with every dot under e and o where you say one: 'The chickens are inside the basket.'", "the word for 'inside' before a common noun.");
t("spell", "basic", "Write in Igala on one line, as you spell it: 'There is no salt in the stew.'", "the final nasal after a short clause.");
t("spell", "intermediate", "Write 'Take the baby's wrapper to her grandmother' in Igala on two lines: first as you would text it to a friend, then with every word written out in full and no apostrophe.", "the joints of a four word sentence, contracted and in full.");
t("spell", "basic", "Write two Igala lines, as you spell them: 'He did not sleep' and 'Did he not sleep?'", "the final nasal in a statement and in a question.");
t("spell", "basic", "Write in Igala on one line, as you spell it: 'Give me something cold to drink.'", "the word for something, which is spelled two ways.");
t("spell", "basic", "Write in Igala on one line, with its dots: 'What is the name of this village?'", "the word for what.");
t("spell", "intermediate", "Write in Igala on one line, as you spell it: 'His own is heavier than mine.'", "the ending for his and for mine.");
t("spell", "basic", "Write in Igala on one line, with every dot under e and o where you say one: 'Their father's compound is in Abocho.'", "an owner phrase and the word for 'in'.");
t("spell", "intermediate", "Write in Igala on one line, as you spell it: 'We ate, we drank, and we lay down.'", "the short subject word before three verbs.");
t("spell", "intermediate", "Write in Igala on one line, as you spell it: 'Come and see what the goat has done to the garden.'", "two verbs in a row and a clause after 'see'.");
t("spell", "intermediate", "Write in Igala on one line, as you spell it: 'That is not my bag, it is hers.'", "the final nasal next to an owner word.");

t("lexi", "basic", "Tell your wife in one Igala sentence: 'The generator has no fuel, so there will be no light tonight.'", "generator, fuel, light.");
t("lexi", "basic", "Tell your daughter in one Igala sentence: 'Wake your grandfather, he has been asleep since noon.'", "grandfather, sleep, wake.");
t("lexi", "basic", "Tell a traveller in one Igala sentence: 'The stream behind the school has dried up.'", "stream, school, dry up.");
t("lexi", "basic", "Tell the girl in one Igala sentence: 'Set the basin on your head and carry it to the well.'", "basin, well, carry on the head.");
t("lexi", "basic", "Tell the nurse in one Igala sentence: 'My tooth aches and my body is hot.'", "tooth, ache, fever as people say it.");
t("lexi", "basic", "Tell your husband in one Igala sentence: 'The thunder frightened the baby.'", "thunder, frighten.");
t("lexi", "basic", "Tell your son in one Igala sentence: 'Sharpen the cutlass before we leave for the bush.'", "cutlass, sharpen.");
t("lexi", "basic", "Tell the landlord in one Igala sentence: 'The roof leaks whenever it rains.'", "roof, leak.");
t("lexi", "basic", "Answer a caller in one Igala sentence: 'She is pounding yam in the mortar behind the house.'", "pound, mortar.");
t("lexi", "basic", "Tell your brother in one Igala sentence: 'Light the lamp, the room is dark.'", "lamp, light as a verb, dark.");
t("lexi", "basic", "Tell a friend in one Igala sentence: 'The tailor measured my arm and my neck.'", "measure, arm, neck.");
t("lexi", "intermediate", "Tell a neighbour in one Igala sentence: 'He borrowed a ladder to reach the oranges.'", "borrow, ladder.");
t("lexi", "intermediate", "Ask a classmate in one Igala sentence: 'Lend me your pen, I will give it back tomorrow.'", "lend against borrow, give back.");
t("lexi", "basic", "Tell the cook in one Igala sentence: 'This meat smells bad, do not serve it.'", "smell, spoiled.");
t("lexi", "basic", "Tell your mother-in-law in one Igala sentence: 'The baby is learning to crawl.'", "crawl, learn.");
t("lexi", "basic", "Tell the shopkeeper in one Igala sentence: 'I forgot my key on your counter.'", "forget, key.", [SCHOLAR]);

// ── G5 word strength ────────────────────────────────────────────────────────

t("inten", "basic", "You are back from the farm. Write three Igala lines of rising strength to your wife or husband: 'I am a little tired', 'I am tired', 'I am completely worn out.'", "tiredness at three strengths.");
t("inten", "intermediate", "Your son has broken the lamp. Write three Igala lines of rising strength to him: 'Be more careful next time', 'Why did you do this?', 'I am very angry with you.'", "a scolding at three strengths.");
t("inten", "basic", "It is past noon and you have not eaten. Write three Igala lines of rising strength to your friend: 'I could eat something', 'I am hungry', 'I am starving.'", "hunger at three strengths.");
t("inten", "basic", "Your aunt offers you okra soup. Write three Igala lines of rising strength, as you would say them to your sister afterwards: 'I do not much like okra soup', 'I do not like okra soup', 'I cannot stand okra soup.'", "dislike at three strengths.");
t("inten", "intermediate", "You need your neighbour's wheelbarrow, and he is a man of your own age. Write three Igala lines of rising strength: a soft request, a plain request, and a demand.", "a request at three strengths, addressee fixed.");
t("inten", "basic", "Write three Igala lines of rising strength about the weather, as you would say them to a passer-by: 'It is warm today', 'It is hot today', 'The heat today is too much to bear.'", "heat at three strengths.");
t("inten", "basic", "You fell off a motorbike. Write three Igala lines of rising strength to the nurse: 'My leg hurts a little', 'My leg hurts', 'My leg hurts so much that I cannot stand.'", "pain at three strengths.");
t("inten", "basic", "You are eating at your friend's house. Write three Igala lines of rising strength to the cook: 'The stew is fine', 'The stew is good', 'I have never eaten stew as good as this.'", "praise at three strengths.");
t("inten", "intermediate", "You hear a noise outside at midnight. Write three Igala lines of rising strength to your brother: 'I am uneasy', 'I am afraid', 'I am shaking with fear.'", "fear at three strengths.");
t("inten", "intermediate", "Your cousin keeps asking you to travel with him to Kano. Write three Igala lines of rising strength: 'I would rather not go', 'I will not go', 'I will never go, do not ask me again.'", "refusal at three strengths.");
t("inten", "basic", "Your sister has had a baby girl. Write three Igala lines of rising strength to your mother: 'I am glad', 'I am very happy', 'My joy has no end.'", "joy at three strengths.");
t("inten", "basic", "You are telling friends what you met on the bush path. Write three Igala lines: 'I saw a small snake', 'I saw a big snake', 'I saw a snake as long as a house.'", "size at three strengths.");
t("inten", "basic", "You need your younger brother. Write three Igala lines of rising strength: 'Come when you are free', 'Come now', 'Run here this minute.'", "urgency at three strengths.");
t("inten", "intermediate", "A friend asks whether the chief will attend the wedding. Write three Igala lines of rising strength: 'Perhaps he will come', 'He will come', 'He will surely come, nothing can stop him.'", "certainty at three strengths.");
t("inten", "advanced", "Your close friend has sold his only bicycle for almost nothing. Write three Igala lines of rising strength, as friends speak: a light tease, a plain 'that was foolish', and the harsh words you would use only in real anger.", "blame between friends at three strengths.");
t("inten", "advanced", "You are a grown son or daughter and you need money for a hospital bill. Ask your grandmother in one Igala sentence that is neither too bold nor too childish for your age.", "one request pitched at the right weight for an adult speaking to an elder.");
t("inten", "basic", "A stranger pushed your car out of the mud. Write three Igala lines of rising strength to him: 'Thanks', 'Thank you very much', 'I do not know how to thank you.'", "thanks at three strengths.");
t("inten", "advanced", "An elder at the family meeting has said something you believe is wrong. Write two Igala lines: how you disagree with respect, and the blunt version that must never be said to an elder.", "disagreement, fitting and too strong.");
t("inten", "basic", "Write three Igala lines of rising strength about last night's rain, as you would tell a neighbour: 'A few drops fell', 'It rained', 'It poured until dawn.'", "rain at three strengths.");
t("inten", "advanced", "Your neighbour's mother is very old. Write two Igala lines about her: the respectful way an adult says she is very old, and the blunt way a small child might say it.", "one fact in a respectful word and in a blunt one.");

// ── G6 English kept, G7 neighbour languages, G8 names, G9 dialect ───────────

const HOME = "In Igala as you speak it at home, keeping English only where you keep it:";
t("engl", "intermediate", `${HOME} 'My daughter is studying physics at Prince Abubakar Audu University, Anyigba.'`, "a school subject and a university name.");
t("engl", "intermediate", `${HOME} 'Ikani teaches philosophy at the Federal University Lokoja.'`, "a subject with no everyday Igala word, and an institution.");
t("engl", "basic", `${HOME} 'The doctor says the X-ray shows no broken bone.'`, "a medical device beside an everyday body word.");
t("engl", "basic", `${HOME} 'Send me the wedding photos on WhatsApp tonight.'`, "an app name and a common loan noun.");
t("engl", "basic", `${HOME} 'The naming ceremony is on the second Saturday of December.'`, "a day name, a month name and an ordinal.");
t("engl", "intermediate", `${HOME} 'Ojodale did his youth service in Sokoto and came home in August.'`, "a national scheme and a month.");
t("engl", "basic", `${HOME} 'I paid the school fees with the bank app on my phone.'`, "three everyday loan nouns.");
t("engl", "intermediate", `${HOME} 'The governor will open the new General Hospital ward in Idah.'`, "an office and an institution.");
t("engl", "basic", `${HOME} 'She bought a laptop and a memory card at the computer shop.'`, "device names.");
t("engl", "intermediate", `${HOME} 'My brother is a civil engineer; he builds bridges for the state.'`, "a profession with no Igala word beside one with an Igala word.");
t("engl", "basic", `${HOME} 'Malaria and typhoid are common in the rainy season.'`, "illness names.");
t("engl", "intermediate", `${HOME} 'The election is in February, and I already have my voter's card.'`, "civic terms and a month.");
t("engl", "basic", `${HOME} 'The pastor read from the Gospel of Matthew and the choir sang.'`, "church terms.");
t("engl", "basic", `${HOME} 'Our football team won the cup, three goals to one.'`, "sport terms with numbers.");

t("neigh", "basic", "Tell your daughter in one Igala sentence, in Igala words only: 'Buy fish at the market beside the river.'", "market, river, buy.");
t("neigh", "basic", "Bless the family as you enter their new home, in one Igala sentence, in Igala words only: 'Peace be on this household.'", "peace, household.");
t("neigh", "intermediate", "Plead with the headmaster in one Igala sentence, in Igala words only: 'I beg you, forgive my son this once.'", "the word for asking a favour.");
t("neigh", "basic", "Tell the women in one Igala sentence, in Igala words only: 'The work is finished, thanks be to God.'", "work, finish, thanks to God.");
t("neigh", "basic", "Announce in one Igala sentence, in Igala words only: 'The king's messenger has arrived with good news.'", "king, messenger, news.");
t("neigh", "basic", "Tell your friend in one Igala sentence, in Igala words only: 'My elder sister's husband is a blacksmith.'", "kin terms and a trade.");

t("names", "intermediate", "Write in one Igala sentence, spelling every name as its owner spells it: 'Blessing Unekwuojo Ocholi and Emmanuel Atayi will marry at Saint Boniface Cathedral, Idah.'", "English and Igala personal names and a church name.");
t("names", "intermediate", "Write in one Igala sentence, spelling every name as it is known: 'The palace at Idah received guests from Benin City and Nsukka.'", "three towns, two of them outside Igala land.");
t("names", "basic", "Write in one Igala sentence, spelling every name as the signboard spells it: 'Mr Okpanachi teaches at Our Lady of Schools, Anyigba.'", "a surname with a title, and a school name.");
t("names", "basic", "Write in one Igala sentence, spelling every name as it is known: 'We crossed the River Niger at Itobe and reached Ajaokuta before noon.'", "a river name and two towns.");
t("names", "basic", "Write in one Igala sentence, spelling every name as its owner spells it: 'Peter, Musa and Hadiza live on Hospital Road in Dekina.'", "three names of different origin and a street name.");
t("names", "basic", "Write in one Igala sentence, spelling every name as it is known: 'Kogi shares borders with Benue, Enugu and Anambra.'", "four state names.");

const TOWN = "Name the Igala town or area you speak for. Then";
t("vari", "basic", `${TOWN} ask a small boy 'What are you doing there?' in one Igala line, as your town says it.`, "the what question and the word for there.");
t("vari", "basic", `${TOWN} tell a friend 'It is not here, look over there' in one Igala line, as your town says it.`, "here against there.");
t("vari", "basic", `${TOWN} tell your companions 'Let us get up and go' in one Igala line, as your town says it.`, "the let us form.");
t("vari", "basic", `${TOWN} tell a fast talker 'I do not understand, say it slowly' in one Igala line, as your town says it.`, "understand, and slowly.");
t("vari", "basic", `${TOWN} ask about a hoe left by the wall, 'Whose is this?', in one Igala line, as your town says it.`, "whose.");
t("vari", "basic", `${TOWN} tell a tired guest 'Sit down and rest a while' in one Igala line, as your town says it.`, "sit for one person, and rest.");

// ── G11 numbers ─────────────────────────────────────────────────────────────

const WORDS = "Write in Igala in one sentence, every number as a word:";
t("numb", "basic", `${WORDS} 'There are twenty-five pupils in the classroom.'`, "a count between twenty and thirty.", [SCHOLAR]);
t("numb", "intermediate", `${WORDS} 'The baby was born on the thirteenth day of the month.'`, "a date as an ordinal.", [SCHOLAR]);
t("numb", "basic", `${WORDS} 'The hunters walked for four days and four nights.'`, "one number with two nouns.", [SCHOLAR]);
t("numb", "intermediate", `${WORDS} 'My grandmother has thirty-two grandchildren.'`, "thirty plus a unit.", [SCHOLAR]);
t("numb", "intermediate", `${WORDS} 'Share the forty tubers between the two families, twenty each.'`, "sharing out, with 'each'.", [SCHOLAR]);
t("numb", "intermediate", `${WORDS} 'It is half past six in the morning.'`, "clock time with a half.", [SCHOLAR]);
t("numb", "intermediate", `${WORDS} 'She is the third child, and her brother is the first.'`, "two ordinals.", [SCHOLAR]);
t("numb", "intermediate", `${WORDS} 'Sixty guests came, but only seventeen stayed to eat.'`, "sixty and a teen in one sentence.", [SCHOLAR]);
t("numb", "advanced", `${WORDS} 'This is the year two thousand and twenty-six.'`, "the year said aloud.", [SCHOLAR]);
t("numb", "intermediate", `${WORDS} 'I have counted the eggs, and there are one hundred and eight.'`, "a hundred plus a unit.", [SCHOLAR]);

// ── G12 buckets the current model has hardly been judged on ────────────────

const SAYING = "Give in Igala the saying an elder would answer with, one line, then its meaning in one English line.";
t("idiom", "intermediate", `A young man boasts that he needs nobody's help on his farm. ${SAYING}`, "a saying on needing others.");
t("idiom", "intermediate", `A woman blames her neighbours for a quarrel that she began herself. ${SAYING}`, "a saying on blaming others.");
t("idiom", "intermediate", `A boy wants to take a wife before he has learned any trade. ${SAYING}`, "a saying on doing things in their order.");
t("idiom", "intermediate", `Two friends sell a cow together and one of them hides part of the price. ${SAYING}`, "a saying on cheating a partner.");
t("idiom", "intermediate", `A guest has stayed three weeks and shows no sign of leaving. ${SAYING}`, "a saying on outstaying a welcome.");
t("idiom", "basic", "A girl finds a purse on the road and carries it back to its owner. Give in Igala the saying people use to praise such a child, one line, then its meaning in one English line.", "a saying of praise.");
t("idiom", "intermediate", "The rains are late and a farmer wants to sow anyway. Give in Igala the saying a neighbour would use to make him wait, one line, then its meaning in one English line.", "a saying on waiting for the right time.");
t("idiom", "intermediate", "Give one Igala expression that names a part of the body (eye, hand, belly or head) but is not about the body. Use it in one short Igala sentence, then give its real meaning in one English line.", "a body-part idiom, which a word-for-word reading gets wrong.");

t("cult", "intermediate", "A child asks which hand to use when giving something to an elder, and why. Answer for your own town in at most two Igala sentences.", "a rule of respect, with its reason.");
t("cult", "intermediate", "A visitor asks whether the new yam may be eaten as soon as it is dug up. Answer for your own town in at most two Igala sentences, or say in Igala that your town has no rule about it.", "a custom that may or may not hold, with room to deny it.");
t("cult", "intermediate", "Say in at most two Igala sentences what a young man's family carries with them the first time they visit the family of the woman he wants to marry, in your own town.", "the first marriage visit.");
t("cult", "intermediate", "Say in at most two Igala sentences what people in your own town do on the day a new village head is installed.", "an installation day.");
t("cult", "basic", "Food is being shared in a large compound. Say in at most two Igala sentences who is served first in your own town, and who serves.", "order of serving.");
t("cult", "intermediate", "A man has died in the night. Say in at most two Igala sentences who must be told first in your own town, and how the news is carried.", "how a death is announced.");

// ── S1 the speech queue ─────────────────────────────────────────────────────
// Numbers: Omachonu's forms (tasks/grammar-evidence-scholarship.md section 3).

carrier("spnum", "I have one brown dog at home.", ["H-o", "L-a", "H-a", "pal"]);
carrier("spnum", "She bought two fat hens at Ejule.", ["L-e", "L-i", "j", "L-a"]);
carrier("spnum", "Three tall men came to our gate.", ["L-ed", "M-a"]);
carrier("spnum", "The goat hurt one of its four legs.", ["L-ed"]);
carrier("spnum", "He counted five big yams in the barn.", ["L-ed", "H-u"]);
carrier("spnum", "Six eggs are lying under the hen.", ["L-ed", "L-a", "f"]);
carrier("spnum", "One week has seven days and seven nights.", ["L-e", "M-e", "pal"]);
carrier("spnum", "Eight women are singing in the square.", ["L-ed", "M-od", "j"]);
carrier("spnum", "Nine small birds flew over the river.", ["L-ed", "H-a"]);
carrier("spnum", "Ten children are playing in the sand.", ["L-ed", "H-a", "gw"]);
carrier("spnum", "Eleven thatched houses burned last night.", ["L-ed", "H-a", "L-a", "gw"]);
carrier("spnum", "She is twelve years old this month.", ["L-ed", "H-e", "L-i", "gw", "j"]);
carrier("spnum", "Fifteen people are waiting for the bus.", ["L-ed", "H-ed", "M-u", "gw"]);
carrier("spnum", "Nineteen goats were sold at Ankpa market.", ["L-ed", "H-ed", "M-a", "gw"]);
carrier("spnum", "There are twenty ripe mangoes in the basket.", ["H-o", "H-u", "gw"]);
carrier("spnum", "My brother turned twenty-one last week.", ["H-o", "H-u", "H-od", "M-e", "ny", "gw"]);
carrier("spnum", "Thirty soldiers passed through the town.", ["H-o", "H-ed", "M-a", "gw"]);
carrier("spnum", "Forty days have gone since the funeral.", ["L-od", "H-ed", "L-i", "gb", "j"]);
carrier("spnum", "The old chief is seventy this year.", ["L-ed", "H-a", "gw"]);
carrier("spnum", "One hundred people ate at the wedding.", ["H-o", "H-u", "H-ed", "M-u", "gw"]);

// Carriers: one or two words per sentence have a published toned form.
carrier("spcar", "The thirsty dog drank water from the pot.", ["H-a", "pal", "H-o", "M-i"]);
carrier("spcar", "The tortoise is hiding under the tall grass.", ["H-a", "H-ed", "M-e", "j", "H-e", "gb"]);
carrier("spcar", "A clever bat bought a ripe banana.", ["L-o", "L-u", "L-e", "L-a"]);
carrier("spcar", "Somebody dropped sand into my soup.", ["H-ed", "L-ed", "H-o"]);
carrier("spcar", "The jar of honey is here on the shelf.", ["H-i", "H-o", "velar-nasal", "L-e"]);
carrier("spcar", "Morning dew wets the grass by the path.", ["H-i", "M-ed", "pal", "H-e", "gb"]);
carrier("spcar", "Jealousy between brothers is not good.", ["L-u", "H-ed", "M-a", "pal", "final-nasal"]);
carrier("spcar", "This medicine is bitter, but it heals.", ["H-od", "L-u", "gw"]);
carrier("spcar", "A hungry dog found a bone behind the kitchen.", ["H-a", "H-i", "L-u", "ch", "pal"]);
carrier("spcar", "Wash this cloth for me before evening.", ["L-e", "gw", "H-u", "L-o", "kp"]);
carrier("spcar", "Pour all the dirty water away.", ["L-a", "H-o", "M-i"]);
carrier("spcar", "Scoop some sand into the bucket for the builder.", ["L-a", "H-ed", "L-ed"]);
carrier("spcar", "Go and fetch water from the stream.", ["H-a", "gb", "H-o", "M-e", "ch"]);
carrier("spcar", "The labourer is clearing grass around the school.", ["H-o", "gw", "H-e", "gb"]);
carrier("spcar", "The barber will cut the child's hair tomorrow.", ["H-a", "j"]);
carrier("spcar", "She arranged the yams neatly on the ground.", ["H-e", "H-a", "L-ed"]);
carrier("spcar", "Pour drinking water into one bottle only.", ["H-u", "ny", "L-u", "H-o", "L-o", "j"]);
carrier("spcar", "The chief's pot is made of brass.", ["L-u", "L-a", "ch", "H-a"]);
carrier("spcar", "The scent of honey fills the room.", ["L-u", "kw", "H-i", "H-od"]);
carrier("spcar", "He forgot his cap at the mosque.", ["H-e", "gb", "L-od", "ny"]);
carrier("spcar", "My one silver coin is lost.", ["H-o", "kp", "H-i", "L-od", "ny"]);
carrier("spcar", "All the trader's coins went missing on the road.", ["H-o", "kp", "r", "H-i", "L-od", "ny"]);
carrier("spcar", "Throw that bad egg far away.", ["M-u", "H-i", "L-od", "ny"]);
carrier("spcar", "A hornbill is calling from the iroko tree.", ["H-a", "H-ed", "p", "pal", "falling"]);
carrier("spcar", "Come and sit here beside me.", ["L-u", "H-u", "gw", "L-e", "H-i"]);
carrier("spcar", "The visitors all sat on the bare ground.", ["M-od", "j", "H-a", "L-ed"]);
carrier("spcar", "I can see the child from my window.", ["M-i"]);
carrier("spcar", "Twenty and ten make thirty.", ["H-o", "H-u", "L-ed", "H-a", "gw", "downstep"]);
carrier("spcar", "Bring the child something to eat.", ["nw", "M-u"]);
carrier("spcar", "In the old story the tortoise killed the leopard.", ["H-a", "H-ed", "M-e", "j", "kp"]);

// Pairs: one member per clip.
carrier("sppair", "Close the door of the room.", ["H-ed", "r", "pair:close-pick-drum"]);
carrier("sppair", "Pick the ripe mango.", ["M-e", "r", "pair:close-pick-drum"]);
carrier("sppair", "He makes drums for the chief.", ["L-e", "r", "pair:close-pick-drum"]);
carrier("sppair", "The elders sat down together.", ["M-od", "j", "pair:sit-rejoice"]);
carrier("sppair", "The elders rejoiced together.", ["L-od", "j", "pair:sit-rejoice"]);
carrier("sppair", "She said my name.", ["M-a", "pair:say-shout"]);
carrier("sppair", "She shouted my name.", ["kw", "pair:say-shout"]);
carrier("sppair", "I know that Ladi came.", ["H-i", "pair:that-who"]);
carrier("sppair", "I know the man who came.", ["L-i", "pair:that-who"]);
open("sppair", "Two animals or foods whose Igala names look the same in writing and differ only in tone: put each in its own short sentence, tone marks on, and record both one after the other. Then record the English of both, word for word.", ["pair:own-1"], NONE);
open("sppair", "Two Igala action words, things a person does, that are spelled alike and told apart by tone: one short sentence for each, tones marked, recorded back to back. After that, the plain English of the pair.", ["pair:own-2"], NONE);
open("sppair", "Is there a body part or a kinship term in Igala that shares its letters with another word of a different tone? Make a brief sentence with each of the two, mark the tones, record them in turn, then give the direct English.", ["pair:own-3"], NONE);
open("sppair", "Look around the kitchen: name something there whose Igala spelling is shared by another word with another tone. Build a small sentence around each, tone marks included, and record the two, followed by their English meaning in as few words.", ["pair:own-4"], NONE);
open("sppair", "From the farm or the bush, choose an Igala word that has a twin with different tones. A line for the word, a line for its twin, each toned, both recorded; the English follows, short and literal.", ["pair:own-5"], NONE);
open("sppair", "Find a pair of Igala words that are identical apart from a dot under one vowel. Give each its own little sentence with dots and tones written, record them together, and close with the English of each.", ["pair:own-dot", "ed", "od"], NONE);
open("sppair", "Find a pair of Igala words that are identical except that one finishes with a nasal. Each goes into a separate short sentence; write the tones, record the pair, and add the English translation of each.", ["pair:own-nasal", "final-nasal"], NONE);

// Two-letter sounds and nasals: the speaker's own sentence.
open("spdig", "Cooking day. Say what is in the pot in one Igala sentence of four to ten words where the sound written kp comes at least twice. Tone marks on. English after, in the same few words.", ["kp"]);
open("spdig", "On the path to the farm. Describe what you are carrying in an Igala sentence, four to ten words long, in which gb is heard two times or more. Mark the tones, then translate it directly.", ["gb"]);
open("spdig", "A mother is calling her children by name at dusk. Write what she shouts as a single Igala sentence that has the ny sound in two of its words, with tones. Its English comes next, kept short.", ["ny"]);
open("spdig", "Somebody asks you what is in the bag. Reply with an Igala sentence of your choice containing the letter ñ inside or at the end of two different words. Put the tone marks, and add a literal English version.", ["velar-nasal"]);
open("spdig", "You are giving presents to three relatives. Compose an Igala sentence about who gets which present so that the sound written ñw or nw appears twice. Tones written. English beneath it, plain.", ["nw"]);
open("spdig", "Evening by the fire with the old people. Tell where each one is seated, in a brief Igala sentence that uses gw in at least two words; write its tones; follow with the English, nothing added.", ["gw"]);
open("spdig", "A noisy market at noon. Report what the traders are doing, using an Igala sentence where kw occurs twice or more, fully toned. Finish with the straight English of that sentence.", ["kw"]);
open("spdig", "Your friend asks what work you did this week. Give an Igala answer, one sentence, with ch sounding in two words at the least. The linguists need the tone marks, so include them. The English equivalent goes last.", ["ch"]);
open("spdig", "Travelling day at the motor park. Make an Igala sentence about the journey with the letter j in two or more of its words, and show the tones. Translate it afterwards without explaining it.", ["j"]);
open("spdig", "Think of the small soft sounds written bi, mi, li, fi or pi before another vowel. Use two words that have one of them in an Igala sentence about animals. Tones on top. English right after, literal.", ["pal"]);
open("spdig", "Speakers of some towns say r where others say l. In the speech of your own town, make an Igala sentence about a visit to the stream that has r or l in three words. Write tones, then English.", ["r"]);
open("spdig", "Harvest is over and the barn is full. Describe it in Igala with a sentence that has f in one word and h in another. Include every tone mark and, last of all, an English rendering of equal length.", ["f", "h"]);
open("spdig", "The sound p alone, not kp, is rare in Igala. If you know two words that have it, set them in an Igala sentence about birds or trees, toned. If you know only one, use that one. English to finish.", ["p"]);
open("spdig", "Refuse three things a child asks for, in three very short Igala clauses joined into one sentence, so that the closing nasal of 'not' is heard three times. Tones written out; English of the whole after it.", ["final-nasal"]);

// One vowel each.
open("spvow", "Harvest at your father's farm: tell it in one Igala sentence of six to twelve words that is full of the vowel a. Tones marked, plain English after.", ["H-a", "M-a", "L-a"]);
open("spvow", "What does a goat do from morning to night? Answer with an Igala sentence, six to twelve words, where plain e (no dot) keeps returning. Show each tone and then the English.", ["H-e", "M-e", "L-e"]);
open("spvow", "A wedding in the village square. Paint the scene in a single Igala sentence that leans on the dotted vowel ẹ in many of its words; tone marks written; a direct English line to follow.", ["H-ed", "M-ed", "L-ed"]);
open("spvow", "Children at the stream on a hot afternoon. Report it using an Igala sentence, not too long, with the vowel i sounding four times or more. Add tones, and the English beneath.", ["H-i", "M-i", "L-i"]);
open("spvow", "The blacksmith is busy. Say so in Igala with a sentence built on plain o (undotted), including a word where that o is neither high nor low. Tones shown. Translate it straight.", ["H-o", "M-o", "L-o"]);
open("spvow", "Night falls and the lamps are lit. Compose an Igala sentence about the compound in which the dotted vowel ọ is frequent, write the tone on every syllable that has one, and supply its English.", ["H-od", "M-od", "L-od"]);
open("spvow", "Rain is coming and the washing is outside. Give the warning in Igala, in a sentence rich in the vowel u, toned throughout. The English version, equally brief, comes last.", ["H-u", "M-u", "L-u"]);

// Names.
carrier("spname", "Ojochide and Ilemona are going to Idah.", ["name", "town"]);
carrier("spname", "Unekwuojo lives in Anyigba.", ["name", "town", "kw", "ny"]);
carrier("spname", "Ocholi came from Ankpa yesterday.", ["name", "town", "ch", "kp"]);
carrier("spname", "Achenyo and Ojoma sell cloth in Dekina.", ["name", "town", "ch", "ny"]);
carrier("spname", "Omachonu is the head of our village.", ["name", "ch"]);
carrier("spname", "The king lives in the palace at Idah.", ["town"]);
carrier("spname", "Ugbede crossed the river at Ibaji.", ["name", "town", "gb", "j"]);
carrier("spname", "Ojonugwa, Eleojo and Enemona are sisters.", ["name", "gw", "j"]);
carrier("spname", "Idoko built a house in Ejule.", ["name", "town", "j"]);
carrier("spname", "Akoji and Ameh are farmers from Ogugu.", ["name", "town", "j"]);

// English terms kept in English.
const KEPT = "Igala as you speak it, English kept, tones marked:";
carrier("speng", "The new teacher wrote the date on the blackboard.", ["english-term"], "short", KEPT);
carrier("speng", "Charge my phone, the battery is low.", ["english-term"], "short", KEPT);
carrier("speng", "She is studying biology at the university.", ["english-term"], "short", KEPT);
carrier("speng", "The bus to Abuja leaves at six o'clock.", ["english-term", "town"], "short", KEPT);
carrier("speng", "I heard the news on the radio this morning.", ["english-term"], "short", KEPT);
carrier("speng", "The nurse gave the child an injection.", ["english-term"], "short", KEPT);
carrier("speng", "Turn off the television and go to sleep.", ["english-term"], "short", KEPT);
carrier("speng", "Send the money to my bank account.", ["english-term"], "short", KEPT);
carrier("speng", "Our church choir has a new keyboard.", ["english-term"], "short", KEPT);
carrier("speng", "He is reading philosophy in Lokoja.", ["english-term", "town"], "short", KEPT);

// Longer connected speech: twelve to twenty Igala words expected.
carrier("splong", "When the rain stopped, the children ran out to play in the water behind the house.", ["connected"], "long");
carrier("splong", "My mother went to the market early, bought fish and pepper, and came back before noon.", ["connected"], "long");
carrier("splong", "The old man sat under the tree and told the children a story about the tortoise and the dog.", ["connected", "H-a", "pal"], "long");
carrier("splong", "If you see my brother on the road, tell him that our father is looking for him.", ["connected", "H-i"], "long");
carrier("splong", "We planted maize and beans this year because the rain came early and the soil was soft.", ["connected"], "long");
carrier("splong", "The woman who sells oil at the market gave me this bottle and said I should pay tomorrow.", ["connected", "L-i", "M-a"], "long");
carrier("splong", "Before the sun rose, the hunters had already crossed the river and entered the forest.", ["connected"], "long");
carrier("splong", "The child was hungry, so his sister cooked rice, and they ate together and slept.", ["connected"], "long");
carrier("splong", "Take this letter to the chief, greet him for me, and wait there until he answers.", ["connected", "M-u"], "long");
carrier("splong", "Yesterday the wind blew the roof off our kitchen, and today the men are mending it.", ["connected"], "long");
carrier("splong", "She does not eat meat, but she likes fish, eggs and every kind of soup.", ["connected", "final-nasal", "H-o"], "long");
carrier("splong", "The teacher asked who had broken the window, and nobody in the class said a word.", ["connected", "final-nasal", "M-a"], "long");
carrier("splong", "I am going to the farm now, and when I come back this evening we will greet your uncle.", ["connected"], "long");

/** The whole bank: 200 text prompts and 120 speech prompts. */
export const V46_PROMPTS: V46Prompt[] = rows;

export const V46_SPEECH_FAMILIES = ["spnum", "spcar", "sppair", "spdig", "spvow", "spname", "speng", "splong"] as const;

export function isSpeechPrompt(p: V46Prompt): boolean {
  return p.speech !== undefined;
}

/** The provenance a row is seeded under: the speech set has its own. */
export function provenanceFor(p: V46Prompt): string {
  return isSpeechPrompt(p) ? V46_SPEECH_PROVENANCE : V46_PROVENANCE;
}

const byId = new Map(rows.map((p) => [p.promptId, p]));

/**
 * The direct English translation to record after the Igala clip, or null when
 * the speaker makes the sentence herself (she then translates her own words).
 * The Record page can show this instead of the written gloss.
 */
export function v46SpeechEnglish(promptId: string): string | null {
  return byId.get(promptId)?.speech?.english ?? null;
}

/** Seconds per clip measured on the 113 clips recorded by Nov 13 (6.2 s Igala, 6.5 s English, 6.9 words). */
export const MEASURED_SECONDS_PER_WORD = 0.9;
const WORDS_SHORT = 7;
const WORDS_LONG = 16;

/** Clips and minutes the speech set yields: one Igala clip and one English clip per prompt. Estimated from the measured pace. */
export function speechYield(prompts: V46Prompt[] = rows): { prompts: number; clips: number; igalaMinutes: number; totalMinutes: number } {
  const speech = prompts.filter(isSpeechPrompt);
  let igalaSeconds = 0;
  for (const p of speech) {
    const s = p.speech!;
    // Open pair prompts hold two sentences in one clip.
    const words = s.length === "long" ? WORDS_LONG : s.kind === "open" && p.family === "sppair" ? WORDS_SHORT * 2 : WORDS_SHORT;
    igalaSeconds += Math.max(3, words * MEASURED_SECONDS_PER_WORD);
  }
  const igalaMinutes = Math.round((igalaSeconds / 60) * 10) / 10;
  return {
    prompts: speech.length,
    clips: speech.length * 2,
    igalaMinutes,
    totalMinutes: Math.round(igalaMinutes * 2 * 10) / 10,
  };
}

/** Every sound cell the speech set is expected to yield, with how many prompts target it. */
export function speechCoverage(prompts: V46Prompt[] = rows): Map<string, number> {
  const cells = new Map<string, number>();
  for (const p of prompts) {
    for (const cell of p.speech?.targets ?? []) cells.set(cell, (cells.get(cell) ?? 0) + 1);
  }
  return cells;
}

/**
 * The order the seed writes the rows in, which is the order a speaker meets
 * them (the queue serves prompts with no speaker answer first, in the order
 * the database returns them, and rows written one after another come back in
 * that order).
 *
 * Text: everyday and vocabulary families first, then the grammar, tone and
 * strength families, then idioms and cultural values last (a speaker asked
 * for vocabulary before proverbs). Inside a tier the families take turns, so
 * no speaker meets ten prompts of one kind in a row.
 *
 * Speech: spread evenly through the text prompts, about three in every eight
 * items, short given sentences before the ones the speaker makes herself.
 */
export const V46_TEXT_TIERS: readonly (readonly string[])[] = [
  ["lexi", "formu", "engl", "spell", "numb", "neigh", "names", "vari"],
  ["inten", "tonew", "aspec", "negq", "order", "chain", "concd", "homog"],
  ["idiom", "cult"],
];
export const V46_SPEECH_TIERS: readonly (readonly string[])[] = [
  ["spnum", "spcar", "spname", "speng"],
  ["sppair", "spdig", "spvow", "splong"],
];

function takeTurns(tiers: readonly (readonly string[])[], pool: V46Prompt[]): V46Prompt[] {
  const out: V46Prompt[] = [];
  for (const tier of tiers) {
    const lanes = tier.map((f) => pool.filter((p) => p.family === f));
    const longest = Math.max(0, ...lanes.map((l) => l.length));
    for (let i = 0; i < longest; i++) {
      for (const lane of lanes) if (i < lane.length) out.push(lane[i]);
    }
  }
  return out;
}

export function v46ServingOrder(prompts: V46Prompt[] = rows): V46Prompt[] {
  const text = takeTurns(V46_TEXT_TIERS, prompts.filter((p) => !isSpeechPrompt(p)));
  const speech = takeTurns(V46_SPEECH_TIERS, prompts.filter(isSpeechPrompt));
  const out: V46Prompt[] = [];
  const total = text.length + speech.length;
  let t = 0;
  let s = 0;
  for (let i = 0; i < total; i++) {
    // Even spread: a speech prompt goes in whenever speech has fallen behind its share.
    const speechDue = speech.length > 0 && s < speech.length && (s + 1) * total <= (i + 1) * speech.length;
    if ((speechDue || t >= text.length) && s < speech.length) out.push(speech[s++]);
    else out.push(text[t++]);
  }
  return out;
}

/**
 * The creation stamp the seed gives each row: one millisecond apart in
 * serving order, so no two rows share a createdAt and the queue order
 * (createdAt, then id) is the designed order whatever ids the rows get.
 *
 * The base is the moment the first seed run starts. A later run (after a
 * failure, or with --only) reads the base back from a row that already
 * exists, so the missing rows land at their designed places, not at the end.
 */
export function v46StampBase(
  existing: { promptId: string; createdAt: Date }[],
  now: Date,
  order: V46Prompt[] = v46ServingOrder(),
): Date {
  const index = new Map(order.map((p, i) => [p.promptId, i]));
  for (const e of existing) {
    const i = index.get(e.promptId);
    if (i !== undefined) return new Date(e.createdAt.getTime() - i);
  }
  return now;
}

export function v46Stamps(base: Date, order: V46Prompt[] = v46ServingOrder()): Map<string, Date> {
  return new Map(order.map((p, i) => [p.promptId, new Date(base.getTime() + i)]));
}

/** Mean minutes per text prompt of the two annotators who ran out of prompts, measured on the v4.5 bank (gaps under 30 minutes between submissions, Oct 9 to Nov 13). */
export const MEASURED_MINUTES_PER_TEXT_PROMPT = { firstAnnotator: 10.3, secondAnnotator: 10.6 } as const;

export interface NearDuplicate {
  a: string;
  b: string;
  score: number;
  against: "frozen" | "train" | "internal";
}

/**
 * The members of a minimal pair are near-duplicates on purpose: 'She said my
 * name' and 'She shouted my name' differ by the one word under test. They are
 * exempt from the internal check only, and only when both name the same pair.
 */
export function sameDeclaredPair(a: string, b: string): boolean {
  const pa = byId.get(a)?.speech?.targets.filter((c) => c.startsWith("pair:")) ?? [];
  const pb = new Set(byId.get(b)?.speech?.targets.filter((c) => c.startsWith("pair:")) ?? []);
  return pa.some((c) => pb.has(c));
}

export const DUP_TRAIN = 0.55;
export const DUP_FROZEN = 0.45;

/**
 * Near-duplicates by Jaccard over content words, the v4.5 rule: 0.55 against
 * any existing train prompt and inside the bank, 0.45 against a frozen prompt
 * (a restated frozen prompt would rehearse the exam). Pure, so the seed and
 * the tests run the same check.
 */
export function findNearDuplicates(
  fresh: { promptId: string; text: string }[],
  existing: { promptId: string; text: string; isHoldout: boolean }[],
  /** Two fresh prompts that are meant to differ by one word (the members of a declared pair). */
  declaredPair: (a: string, b: string) => boolean = sameDeclaredPair,
): { dupes: NearDuplicate[]; maxTrain: number; maxFrozen: number; maxInternal: number } {
  const nw = fresh.map((p) => ({ id: p.promptId, words: contentWords(p.text) }));
  const ex = existing.map((e) => ({ id: e.promptId, frozen: e.isHoldout, words: contentWords(e.text) }));
  const own = new Set(nw.map((n) => n.id));
  const dupes: NearDuplicate[] = [];
  let maxTrain = 0;
  let maxFrozen = 0;
  let maxInternal = 0;
  for (let i = 0; i < nw.length; i++) {
    const n = nw[i];
    for (const e of ex) {
      if (own.has(e.id)) continue; // a rerun sees its own rows
      const score = jaccard(n.words, e.words);
      if (e.frozen) {
        maxFrozen = Math.max(maxFrozen, score);
        if (score >= DUP_FROZEN) dupes.push({ a: n.id, b: e.id, score, against: "frozen" });
      } else {
        maxTrain = Math.max(maxTrain, score);
        if (score >= DUP_TRAIN) dupes.push({ a: n.id, b: e.id, score, against: "train" });
      }
    }
    for (let j = i + 1; j < nw.length; j++) {
      const score = jaccard(n.words, nw[j].words);
      if (declaredPair(n.id, nw[j].id)) continue;
      maxInternal = Math.max(maxInternal, score);
      if (score >= DUP_TRAIN) dupes.push({ a: n.id, b: nw[j].id, score, against: "internal" });
    }
  }
  return { dupes, maxTrain, maxFrozen, maxInternal };
}
