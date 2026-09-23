import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import {
  buildProtectedSet,
  checkStatic,
  containsWholeWord,
} from "../src/lib/eval/leak-guard";
import { fullFold } from "../src/lib/eval/normalize";
import { GRAMMAR_NOTE_STATUS } from "../src/lib/arena/grammar-block";

/**
 * Seed the v4.3 grammar_rule RagEntry rows: the concord paradigms of Ejeba
 * (2023) "Igala Concord System" (JWAL Anniversary Vol. 50, pp. 85-103, CC
 * BY-NC 4.0), read line by line on 2026-09-23, plus the rules the Sep 13-23
 * annotation round taught us. The map from paper to row, with every rule id,
 * is tasks/jwal-ejeba-2023-rule-inventory.md.
 *
 * WHY THESE ROWS EXIST
 * --------------------
 * The paper was paraphrased on Aug 13 into three abstract rows (four concord
 * relations; animacy and mass; complex predicates and t-/r-). Those rows
 * state principles and say themselves that the tables of agreeing forms were
 * never extracted. v4.3 serves grammar_rule rows in a retrieved GRAMMAR block
 * at the head of the user turn (src/lib/arena/grammar-block.ts), so the forms
 * now have a path to the model. These rows carry the forms: du/kó with wa,
 * tinyo/rinyo, tẹ/jọ, tọ/nyu/ru, the plural prefixes with their class
 * restriction, the clitic table with its distribution.
 *
 * GRADING, AS PUBLISHED IN tasks/grammar-failure-analysis-v4-1.md
 * ---------------------------------------------------------------
 * Two evidence classes to be served (scholarship + corpus, or + community);
 * one class is a note. Served rows carry verificationStatus external_sourced
 * (scholarship + corpus) or community_verified (a community leg too). Notes
 * carry GRAMMAR_NOTE_STATUS, which the block builder skips. The three Aug 13
 * abstract rows are relabelled to that status by this script: their
 * principles are carried, with forms, by the rows below. Nothing is deleted.
 *
 * LICENCE: everything below is restated in our own words; Igala forms and
 * glosses are cited as data, with the paper named as the source. No prose
 * from the paper is reproduced. Corpus counts are from the live ParallelPair
 * table as recorded in tasks/grammar-evidence-scholarship.md section 1.
 *
 * GATES, identical to prisma/seed-rag-v4-1-grammar.ts: draft lint (banned
 * characters, the E8 fabrication denylist), then the REAL Scope-A leak check
 * against frozen benchmark gold (threshold zero, nothing inserted on a hit,
 * offending entries schematized and the script re-run). Idempotent and
 * create-only for rows; the relabel is an idempotent update by id.
 *
 * Run:  npx tsx --env-file=.env.local prisma/seed-rag-v4-3-grammar.ts
 */

const prisma = new PrismaClient();

const LANGUAGE = "igala";

const SOURCE_EJEBA =
  "Ejeba, S. O. (2023), Igala Concord System, Journal of West African Languages, Anniversary Volume 50, pp. 85-103 (CC BY-NC 4.0), paraphrased 2026-09-23 per tasks/jwal-ejeba-2023-rule-inventory.md; Bible-corpus counts from the live ParallelPair table (tasks/grammar-evidence-scholarship.md section 1).";

const SOURCE_EJEBA_COMMUNITY =
  SOURCE_EJEBA +
  " Community leg: native-speaker corrections and answers on the platform (OutputEdit and ColdAuthorAnswer rows, Aug 20 to Sep 23, 2026).";

/** The E8 fabrication denylist, as in the v4.1 seed. */
const FABRICATIONS = [
  "adsa",
  "kpuke",
  "ojoji",
  "teketeke",
  "akeli",
  "gbede",
  "abeki",
  "mimi",
  "kpegwa",
];

const BANNED_CHARS = ["ṣ", "č", "ị", "ụ", "ṅ"];

/** The Aug 13 abstract rows: relabelled to notes, never deleted. */
const ABSTRACT_ROW_IDS: readonly string[] = [
  "92d5f938-709e-47e8-b9ab-707a7f7af6fc",
  "61bc4bc6-27f3-4671-92ab-ac4ae3d94cc3",
  "3cfbf706-a197-4074-b906-b65e51ea6418",
];

interface SeedEntry {
  chunkType: string;
  topic: string;
  content: string;
  source: string;
  verificationStatus: string;
}

// ─── Ejeba (2023): served rows (grade A/B) ───────────────────────────────────

const ejebaServed: SeedEntry[] = [
  // ROW plural-prefixes - retrieve for: plural, children, women, goats,
  // people, persons, houses, many, several
  {
    chunkType: "grammar_rule",
    topic:
      "Igala plural - abọ only for people, ama for people and animals; things keep one form (plural, children, goats, people, many)",
    content:
      "Only nouns for people and animals take a plural prefix. People: abọ or ama, both correct (abo obulẹ / am'onobulẹ = women; ama + the word for child = children, the common corpus form). Animals: ama only, never abọ (ama + the word for goat = goats; abọ + an animal word is wrong, abọ is for people). Nouns for large places repeat whole, written as two words (aji aji = rivers; the word for house doubled = houses). Every other noun keeps one form for one and for many (ugba = a plate or plates) and its number is read from the verb or the numeral. Write the prefix attached to the noun or elided with an apostrophe, never with a hyphen. Never put a plural prefix on a thing.\n\nExamples:\n- abo obulẹ / am'onobulẹ = women (both attested in community answers)\n- ama + [goat] = goats (never abọ + [goat])\n- aji aji = rivers; ugba mẹta = three plates (the noun does not change)",
    source: SOURCE_EJEBA_COMMUNITY,
    verificationStatus: "community_verified",
  },
  // ROW verb-carries-number - retrieve for: plates, things, coins, missing,
  // lost, several, one, the verb shows the number
  {
    chunkType: "grammar_rule",
    topic:
      "Igala things have one form for one and many - the verb carries the number (plate, plates, coin, coins, missing, lost)",
    content:
      "A noun for a thing does not change for the plural, so the verb is the only sign of how many. Use the plural verb whenever the meaning is plural even though the noun looks the same; a singular verb with a plural meaning is ungrammatical. du ugba wa = bring the plate; kó ugba wa = bring the plates. du ugba tinyo = throw the plate away; kó ugba rinyo = throw the plates away. As a subject: [coin] kpo tinyo = a coin is missing; [coin] kpo rinyo = coins are missing (the word for coin is the word for seed plus the word for money). When the number matters and the noun cannot show it, the verb must.\n\nExamples:\n- kó ugba wa = bring the plates (plural verb, unchanged noun)\n- [coin] kpo rinyo = the coins are missing (plural verb marks a plural subject)\n- du ugba wa = bring the plate (one)",
    source: SOURCE_EJEBA,
    verificationStatus: "external_sourced",
  },
  // ROW bring-carry - retrieve for: bring, carry, take, fetch, bring him,
  // bring them, bring it, command
  {
    chunkType: "grammar_rule",
    topic:
      "Igala bring and carry - du (one) and kó (many) with wa: du X wa, kó X wa, the object between the two parts, no kẹ",
    content:
      "'Carry, take' is du for one thing or person and kó for several; the choice follows the object, never the subject. 'Bring' is du/kó + object + wa and the object always sits between the two parts: du ugba wa = bring the plate; kó ugba wa = bring the plates. Never join the parts with kẹ, never move wa before the object; wa itself never changes. Pronoun objects: a person is a short clitic between the parts (du u wa = bring him or her; kó ma wa = bring them), a thing has no pronoun at all (du wa = bring it; kó wa = bring them, or bring it of water, sand or another mass). Plural command: mẹ before the verb (mẹ kó ugba wa = bring the plates, all of you). Corpus: du ... wa 137 rows, kó ... wa 77 rows, wa unchanged in every one (mu ko wa = go and bring them).\n\nExamples:\n- du ugba wa = bring the plate; kó ugba wa = bring the plates\n- du u wa = bring him / her; kó ma wa = bring them (people)\n- du wa = bring it; kó wa = bring them (things, no object word)",
    source: SOURCE_EJEBA,
    verificationStatus: "external_sourced",
  },
  // ROW throw-away - retrieve for: throw, throw away, discard, lose, missing,
  // forget, shake off, pour away
  {
    chunkType: "grammar_rule",
    topic:
      "Igala throw away - du X tinyo (one) / kó X rinyo (many): the second verb must agree with the first (throw, discard, lost, missing, forget)",
    content:
      "In a two-verb sentence the second verb agrees in number with the first: du ... tinyo (tínyọ̀) throws one thing away, kó ... rinyo (rínyọ̀) throws several. du rinyo and kó tinyo are both wrong. The object stands between the verbs (du ugba tinyo = throw the plate away; kó ugba rinyo = throw the plates away) and may be left out (du tinyo = throw it away; kó rinyo = throw them away). kpo tinyo / kpo rinyo = be missing, be lost (one / several). The t-/r- pair exists only in this verb: never make an r- form of any other verb. The ending -nyo 'away' also closes gbenyo = forget, gbanyo = shake off, lenyo = go missing, danyo = pour away; write all of these as one word, no hyphen. Corpus: tinyo 356 rows, rinyo 761 rows.\n\nExamples:\n- du ugba tinyo = throw the plate away; kó ugba rinyo = throw the plates away\n- kó rinyo = throw them away (no object word)\n- [coin] kpo rinyo = the coins are lost",
    source: SOURCE_EJEBA,
    verificationStatus: "external_sourced",
  },
  // ROW keep-put-set-down - retrieve for: keep, put, place, set down, pot,
  // bottle, container, into
  {
    chunkType: "grammar_rule",
    topic:
      "Igala keep, put, set down after du/kó - tẹ (one) / jọ (many); tọ (one) / nyu (many into one place) / ru (many into many places)",
    content:
      "After du/kó and the object, a second verb tells where the thing goes, and it agrees: du X tẹ = keep one thing; kó X jọ = keep several. For putting into a container: du X tọ ucha = put one thing in a pot; kó X nyu ucha = put several things in one pot; kó X ru ucha = put several things into several pots. The first verb counts the things, the second counts the places. Word order is fixed: (subject) verb - object - second verb - place; the second verb never comes first and never takes kẹ. Water and other masses take the plural forms (gba [water] jọ anẹ = set the water down; gba [water] nyu ujogo = pour the water into one bottle; gba [water] ru ujogo = into several bottles). These pairs are Ejeba's (2023); the Bible corpus confirms tinyo/rinyo strongly and the others weakly, so when unsure prefer du/kó with wa, tinyo or rinyo.\n\nExamples:\n- du X tẹ = keep one thing; kó X jọ = keep several things\n- kó X nyu ucha = put several things in one pot; kó X ru ucha = in several pots\n- gba [water] nyu ujogo = pour the water into one bottle",
    source: SOURCE_EJEBA,
    verificationStatus: "external_sourced",
  },
  // ROW pronoun-clitics - retrieve for: I, me, you, he, she, we, they, us,
  // them, pronoun, myself, emphasis
  {
    chunkType: "grammar_rule",
    topic:
      "Igala pronouns - short clitics by default (u lọ = I went); full uwẹ, onwu, awa, amẹ, ama (and the o-initial full form of I) only for emphasis, 'X and I', or a one-word answer",
    content:
      "Subject / object / possessive, with the full pronoun in brackets: I = u / mi / mi (the full form is o- plus mi); you = ẹ / ẹ / wẹ (uwẹ); he, she = i / u / -wn (onwu); we = a / wa / wa (awa); you-pl = mẹ / mẹ / mẹ (amẹ); they = ma / ma / ma (ama). The short clitic is the normal form: u lọ = I went, never the full pronoun before the verb. Use the full pronoun only for emphasis ([full I], u lọ = me, I went), in a pair (uwẹ kpai [full I] = you and I), or alone as an answer (Ene? [full I]. = Who? Me.). Never use a full pronoun where a clitic belongs, and never both in one slot; native correctors have replaced the full form with u before a verb. In Ejeba's Dekina data the object clitic for him or her is u after a verb ending in u and ọ after a verb ending in a (du u = take him; ña ọ = show him); them = ma. mẹ before a verb makes a plural command.\n\nExamples:\n- u lọ = I went (clitic); [full I], u lọ = me, I went (full pronoun for emphasis)\n- uwẹ kpai [full I] = you and I (full pronouns in a pair)\n- mẹ wa = come, all of you (plural command with mẹ)",
    source: SOURCE_EJEBA_COMMUNITY,
    verificationStatus: "community_verified",
  },
];

// ─── Ejeba (2023): notes (grade C, scholarship only) ─────────────────────────

const ejebaNotes: SeedEntry[] = [
  {
    chunkType: "grammar_rule",
    topic:
      "Igala mass nouns (water, sand, grass, soup) - uncountable, take plural verb forms, and their own handling verbs",
    content:
      "Mass nouns cannot be counted: the words for water, sand (ẹkẹtẹ), grass (egbe) and soup (obo). They go with plural verb forms and plural second verbs (gba [water] jọ anẹ is grammatical, gba [water] tẹ anẹ is not), and with a mass object the second verb counts the containers (nyu ujogo = one bottle, ru ujogo = several). Each substance has its handling verbs: da = pour out entirely; ba = scoop some; gba = fetch grain or pour water; gwo = clear grass; ja = cut grass or hair; che = fetch water or another fluid; tẹ = arrange cloth or dress a bed. A plural verb with no object can therefore mean 'them' (several things) or 'it' (a mass). Scholarship only (Ejeba 2023, section on verb-mass noun concord); no corpus count yet.",
    source: SOURCE_EJEBA,
    verificationStatus: GRAMMAR_NOTE_STATUS,
  },
  {
    chunkType: "grammar_rule",
    topic:
      "Igala sounds and spelling as Ejeba (2023) writes them - seven vowels, digraphs, palatalized pi bi fi mi li, tone accents, the Dekina variety",
    content:
      "Seven vowels written i, e, ẹ, a, ọ, o, u (ẹ and ọ are the open mid vowels). Consonants written as themselves: p b t d k g kp gb f h m n r l w; kp and gb are single sounds. Palatalized consonants are written with i: pi, bi, fi, mi, li, so bia or fia is one onset plus a vowel, not i plus another vowel. Labialized: kw, gw, nw (nw is one sound). ny = the palatal nasal; ñ = the velar nasal; ch = the ch of church; j = the j of judge, never the y-glide; y = the glide. Tone: acute = high, grave = low, mid unmarked; a circumflex on some final vowels marks a fall. The description is of the Dekina variety, with five consultants; ŋm as a separate sound is a Dekina pronunciation of m after a word-initial high vowel, not a phoneme. Note only: the served orthography line already carries the allowlist; this row records the source convention.",
    source: SOURCE_EJEBA,
    verificationStatus: GRAMMAR_NOTE_STATUS,
  },
];

// ─── The Sep 13-23 annotation round: rules the community taught us ──────────
// Filled from the annotation mine of 2026-09-23 (see the inventory's section
// on annotation-derived rows). Each row names its community evidence.

const SOURCE_COMMUNITY =
  "Native-speaker corrections and blind judgments on the platform, Sep 13 to Sep 23, 2026 (OutputEdit and PairwiseComparison rows on the claude_authored_v42_2026_09_13 prompt bank), mined 2026-09-23; each row names how many annotators converged. Served only where three or more annotators agree, per the v4.1 precedent for community-sourced rows.";

const annotationRows: SeedEntry[] = [
  // Locative: 4 annotators (1, 2, 3, 5), 9 edits on 7 prompts; clipping: 2
  // annotators (2, 4). Retrieve for: in, town, city, state, year, live in.
  {
    chunkType: "grammar_rule",
    topic:
      "Igala 'in' - efu before a state or a year, efẹwọ before a town (efu fused with the word for town); ef' only before a vowel, never clipped before a consonant",
    content:
      "'In' is efu. Before a town or city name the community writes efẹwọ (also spelled efewo): efẹwọ Abuja = in Abuja; efẹwọ Ankpa = in Ankpa; chukọlọ efẹwọ Abuja = works in Abuja. Before a state or a year it stays efu: efu Kogi State; efu ọdọ 1952 = in 1952. efu keeps its vowel before a consonant (efu Idah, never ef Idah) and elides only before a vowel (ef'ọdọ 2021 = in 2021; ef' + the word for market = in the market). Never write efu and the word for town as two words. Four annotators made this correction independently on seven questions.\n\nExamples:\n- efẹwọ Ankpa efu ọdọ 1952 = in Ankpa in 1952 (town takes efẹwọ, year takes efu)\n- i chukọlọ efẹwọ Abuja = he or she works in Abuja\n- efu Kogi State = in Kogi State; ef'ọdọ 2021 = in 2021",
    source: SOURCE_COMMUNITY,
    verificationStatus: "community_verified",
  },
  // Motion + destination: 4 annotators (1, 2, 4, 5), 9 edits on 6 prompts,
  // plus a 3/3 judgment. Retrieve for: go, went, leave, travel, to, journey.
  {
    chunkType: "grammar_rule",
    topic:
      "Igala going somewhere - the destination takes ti after the motion verb: lo ti Idah = go to Idah (also written loti, lotí, t'Idah)",
    content:
      "A destination after a verb of motion is introduced by ti: lo ti Idah = go to Idah; u lo ti Ankpa = I went to Ankpa; chẹ loti Lokoja = has left for Lokoja. Before a vowel it elides: lo t'Idah, lo t'Ankpa. Never write the bare 'lo Idah', and never invent a verb for 'leave for'. Four annotators supplied ti on the same sentence independently, and 'Í lo t'Ídah' beat the bare form 3 judgments to 0.\n\nExamples:\n- Ibrahim chẹ loti Lokoja = Ibrahim has already left for Lokoja\n- u lo ti Ankpa = I went to Ankpa; lo t'Idah = go to Idah\n- Grace lotí [school] = Grace went to school",
    source: SOURCE_COMMUNITY,
    verificationStatus: "community_verified",
  },
  // Volitive / speech-act subject na: 3 annotators (2, 4, 5), 7 edits.
  // Retrieve for: tell, inform, announce, say, I will, I want, message.
  {
    chunkType: "grammar_rule",
    topic:
      "Igala 'I want to tell you', 'I say to you', 'I will come' - the speaker is na in these frames: na tẹnẹ ku kà ... ka ki ni; na kà ñwẹ; na wa",
    content:
      "When a speaker announces, requests or promises, the first person is na, not u: na tẹnẹ ku kà ukọla ñwẹ = I want to tell you something; na tẹnẹ ku kà ñw'ẹ ka ki ni ... = I would like to inform you that ...; na kà ñwẹ = I say to you; na wa = I will come. 'u á kà ñwẹ' and 'u kà ñwẹ' were corrected to the na frame every time three annotators saw them. Outside these frames 'I' stays u (u lọ = I went). Whether na is a pronoun or a particle is an open question for the linguists; the forms are not.\n\nExamples:\n- [Mother], na tẹnẹ ku kà nw'ẹ ka ki ni ... = Mother, I would like to tell you that ...\n- Ọmami onobulẹ, na kà ñwẹ = My daughter, I say to you\n- Ọmaye mi, na wa = My brother, I will come",
    source: SOURCE_COMMUNITY,
    verificationStatus: "community_verified",
  },
  // Dates and years: 3 annotators (2, 4, 8) on the same formula; digits
  // for the year confirmed by every annotator who saw one. Retrieve for:
  // date, born, birthday, year, month, when, ago.
  {
    chunkType: "grammar_rule",
    topic:
      "Igala dates as the community writes them - month first as an ordinal, then the day as a cardinal, then ọdọ and the year in digits: ọchu ẹkẹla nọlu mi mẹgwẹlẹ ọdọ 2018 = 14 September 2018",
    content:
      "Three annotators, working separately, wrote the same date formula: the month as an ordinal (ọchu ẹkẹla = the ninth month, September), then the element nọlu mi, then the day as a plain cardinal with mẹ- (mẹgwẹlẹ = fourteen; two of the three wrote the word for day before it), then ọdọ and the year in digits. The day is not an ordinal and does not come first. 'In 1952' is efu ọdọ 1952, always digits; never spell a year out and never compose a year-name. 'Three years ago' was written ọdọ mẹta ki la le gudu (two annotators). 'Next week' = aladi ki ya wa (two annotators).\n\nExamples:\n- [day] k'ùbí chi ọchu ẹkẹla nọlu mi mẹgwẹlẹ ọdọ 2018 = the birthday is 14 September 2018\n- efu ọdọ 1952 = in 1952 (digits, always)\n- ọdọ mẹta ki la le gudu = three years ago",
    source: SOURCE_COMMUNITY,
    verificationStatus: "community_verified",
  },
  // Numerals above twenty: annotators 2 and 4 agree on every value but 100,
  // annotator 8 on 100; extends RE8 (grade B, corpus-backed). Retrieve for:
  // number, count, thirty, forty, eighty, hundred, two hundred, zero, phone.
  {
    chunkType: "grammar_rule",
    topic:
      "Igala numbers above twenty as the community counts - ogwu ñyọ ka 21, ogwu ẹgwa 30, ọgbọ meji 40, ooje 50, ẹtẹẹgwa 70, ọgbọ mẹlẹ 80, ọgwọkọ 200, òfò zero; the linker is ñyọ, never kpai",
    content:
      "Twenty is ogwu. 21, 22, 23 = ogwu ñyọ ka, ogwu ñyọ meji, ogwu ñyọ mẹta (ñyọ, also written nyoke, is the additive linker; kpai is never used between number words). 30 = ogwu ẹgwa (written as two words, never oguegwa). 40 = ọgbọ meji (not ogwu meji). 50 = ooje. 70 = ẹtẹẹgwa (the blended form, not twenty times three plus ten spelled out). 80 = ọgbọ mẹlẹ; 85 = ọgbọ mẹlẹ ñyọ mẹlu. 100 = ogwu mẹlu or ọgbọ mẹlu (both twenty times five; annotators split). 200 = ọgwọkọ. Counting aloud, 18 and 19 are bare ẹgwẹjọ, ẹgwẹla. In a phone number zero is òfò and each digit is read as a bare numeral; six is ẹfa, never ẹfẹ. After a noun a small numeral keeps its mẹ- (ọdọ mẹta = three years, never ọdọ eta).\n\nExamples:\n- ogwu ẹgwa = 30; ọgbọ meji = 40; ọgbọ mẹlẹ ñyọ mẹlu = 85\n- ọgwọkọ = 200; ogwu mẹlu = 100\n- òfò ẹjọ òfò ẹta ... = 0 8 0 3 ... (a phone number read digit by digit)",
    source: SOURCE_COMMUNITY,
    verificationStatus: "community_verified",
  },
  // Vocabulary the community corrected with two or more annotators each.
  // Retrieve for the English words named. The r-forms are fabrications.
  {
    chunkType: "grammar_rule",
    topic:
      "Igala words the community corrected (Sep 2026) - woman onobulẹ, young man onokẹlẹ, English enẹfu, can neke, where ugbo, right hand [hand] awohì, left hand [hand] awọtọ, week aladi, bicycle anya, padlock igede, doctor dọkita, lives in dodo, buy la, said that kakini",
    content:
      "woman = onobulẹ (never onobirẹ; four annotators); young man, male = onokẹlẹ or ọnẹkẹlẹ (never onokẹrẹ); the English language = enẹfu, also written ẹnẹfu or enefu (three annotators; never the word English or a respelling of it; alu enẹfu = the English way of writing); can, be able = neke or nẹkẹ (three annotators); where = ugbo (never ubo); right hand = [hand] awohì, left hand = [hand] awọtọ (awehi is a vowel error); week = aladi; bicycle = anya or añya; padlock = igede; doctor = dọkita, no initial a-; lives in = dodo (i dodo efẹwọ Idah = he lives in Idah); buy = la or l' (never ra); 'said that' = kakini; 'a, one' after the noun = ka ([town] ka = a town), 'this one' = oka, 'the other one' = ẹkẹji; onka is not Igala.\n\nExamples:\n- Onobulẹ ka ku ma do Zara = a woman called Zara\n- Ugbo u neke chaji ñwu? = Where can I charge it?\n- Musa dodo efẹwọ Idah = Musa lives in Idah",
    source: SOURCE_COMMUNITY,
    verificationStatus: "community_verified",
  },
  // Single-annotator or split items: stored as notes, not served.
  {
    chunkType: "grammar_rule",
    topic:
      "Igala open questions from the Sep 2026 annotation round - yí as 'this', yes-no final particle, directions, di vs du, teacher, younger brother, borrowed nouns",
    content:
      "Recorded for the linguists, not settled. yí = 'this' ([road] yí = this road; oroka yi = this afternoon; two annotators), while 'the' stays lẹ. Yes-no questions closed with a final particle a / á / ba (three annotators, three shapes; the Bible corpus has none). Directions: south = opata (two annotators, one rejects); east = [sun] + [morning], west = [sun] + anẹ (one annotator); north unresolved. Three annotators wrote di where the prompt table has du for take or hand over (di añya, di ogwu, di'wọ). Teacher: iticha accepted in judgment, edited to akukọ and ẹnẹ ukọchẹ. Younger brother: abíne kept by one annotator, agíní by another. Borrowed academic nouns (economics, university, computer science): keeping the English word was accepted by three annotators and won in judgment; one annotator respells with s becoming ch. 'The following year': ki ro no / ki le bọ / ki wa le, three renderings. Next year, last year, season and Sunday were judged inadequate for both models: a vocabulary hole.",
    source: SOURCE_COMMUNITY,
    verificationStatus: GRAMMAR_NOTE_STATUS,
  },
];

const entries: SeedEntry[] = [...ejebaServed, ...ejebaNotes, ...annotationRows];

async function embed(text: string): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const openai = new OpenAI({ apiKey: key });
    const res = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    return res.data[0]?.embedding ?? null;
  } catch (e) {
    console.warn(`  embedding failed: ${(e as Error).message}`);
    return null;
  }
}

/** Lint the drafts against the spec's own lists. Returns problem strings. */
export function lintDrafts(drafts: readonly SeedEntry[] = entries): string[] {
  const problems: string[] = [];
  for (const e of drafts) {
    const text = `${e.topic}\n${e.content}`;
    for (const ch of BANNED_CHARS) {
      if (text.normalize("NFC").includes(ch)) {
        problems.push(
          `banned character U+${ch.codePointAt(0)!.toString(16).toUpperCase()} in "${e.topic}"`,
        );
      }
    }
    if (text.includes("\u2014") || text.includes("\u2013")) {
      problems.push(`dash in "${e.topic}"`);
    }
    const folded = fullFold(text);
    for (const fab of FABRICATIONS) {
      if (containsWholeWord(folded, fab)) {
        problems.push(`fabricated word "${fab}" in "${e.topic}"`);
      }
    }
  }
  return problems;
}

async function main() {
  // ── Gate 0: draft lint ────────────────────────────────────────────────────
  const lint = lintDrafts();
  if (lint.length > 0) {
    for (const p of lint) console.error(`LINT: ${p}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `draft lint: PASS (${entries.length} entries, no banned characters, no denylist words, no dashes)\n`,
  );

  // ── Gate 1: Scope-A leak check against the REAL frozen protected set ─────
  const frozen = await prisma.prompt.findMany({
    where: { isHoldout: true, language: LANGUAGE },
    select: { id: true, promptId: true },
  });
  const slugOf = new Map(frozen.map((p) => [p.id, p.promptId]));
  const golds = await prisma.coldAuthorAnswer.findMany({
    where: {
      promptId: { in: frozen.map((p) => p.id) },
      isDemo: false,
      consentBenchmark: true,
    },
    select: { promptId: true, answerText: true },
  });
  const protectedSet = buildProtectedSet(
    golds.map((g) => ({
      promptId: slugOf.get(g.promptId) ?? g.promptId,
      answerText: g.answerText,
    })),
  );
  console.log(
    `frozen prompts: ${frozen.length}  gold answers: ${golds.length}  protected strings: ${protectedSet.length}`,
  );
  const report = checkStatic(
    entries.map((e) => ({ where: e.topic, text: `${e.topic}\n${e.content}` })),
    protectedSet,
  );
  if (!report.pass) {
    console.error(
      `SCOPE A: FAIL - ${report.hitCount} hit(s); NOTHING was inserted. Schematize the offending entries and re-run:`,
    );
    for (const h of report.hits) {
      console.error(`  [${h.tier}] prompt ${h.promptId}  in  ${h.where}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(
    "SCOPE A: PASS - no frozen gold answer appears in any draft entry.\n",
  );

  // ── Relabel the Aug 13 abstract rows to notes (idempotent) ───────────────
  const relabelled = await prisma.ragEntry.updateMany({
    where: {
      id: { in: [...ABSTRACT_ROW_IDS] },
      language: LANGUAGE,
      chunkType: "grammar_rule",
      NOT: { verificationStatus: GRAMMAR_NOTE_STATUS },
    },
    data: { verificationStatus: GRAMMAR_NOTE_STATUS },
  });
  console.log(
    `abstract Ejeba rows relabelled ${GRAMMAR_NOTE_STATUS}: ${relabelled.count} (of ${ABSTRACT_ROW_IDS.length})`,
  );

  // ── pgvector probe, same fix as src/lib/rag.ts ───────────────────────────
  let vectorSupported = true;
  try {
    await prisma.$queryRawUnsafe(
      `SELECT ('[1,2,3]'::extensions.vector OPERATOR(extensions.<=>) '[1,2,4]'::extensions.vector) AS d`,
    );
  } catch {
    vectorSupported = false;
    console.warn("pgvector unreachable - entries will be created unembedded.");
  }

  let created = 0;
  let embedded = 0;
  let skipped = 0;

  for (const e of entries) {
    const existing = await prisma.ragEntry.findFirst({
      where: { language: LANGUAGE, topic: e.topic },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const vector = vectorSupported
      ? await embed(`${e.topic}\n${e.content}`)
      : null;

    if (vector) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "RagEntry"
           (id, language, "chunkType", topic, content, source, "verificationStatus", embedding, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7::extensions.vector, now(), now())`,
        LANGUAGE,
        e.chunkType,
        e.topic,
        e.content,
        e.source,
        e.verificationStatus,
        `[${vector.join(",")}]`,
      );
      embedded++;
    } else {
      await prisma.ragEntry.create({
        data: {
          language: LANGUAGE,
          chunkType: e.chunkType,
          topic: e.topic,
          content: e.content,
          source: e.source,
          verificationStatus: e.verificationStatus,
        },
        select: { id: true },
      });
    }
    created++;
    console.log(`  + ${e.topic}${vector ? "" : " (no embedding)"}`);
  }

  const total = await prisma.ragEntry.count({
    where: { language: LANGUAGE, chunkType: "grammar_rule" },
  });
  const notes = await prisma.ragEntry.count({
    where: {
      language: LANGUAGE,
      chunkType: "grammar_rule",
      verificationStatus: GRAMMAR_NOTE_STATUS,
    },
  });
  console.log(
    `\nv4.3 grammar seed: ${created} created (${embedded} embedded), ${skipped} skipped as already present.`,
  );
  console.log(
    `grammar_rule rows for "${LANGUAGE}" now: ${total}, of which ${notes} are notes the v4.3 block skips.`,
  );
}

if (process.argv[1] && /seed-rag-v4-3-grammar/.test(process.argv[1])) {
  main()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error(e);
      return prisma.$disconnect().then(() => process.exit(1));
    });
}
