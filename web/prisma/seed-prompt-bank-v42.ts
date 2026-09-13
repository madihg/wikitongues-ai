/**
 * Seed the v4.2 PROMPT BANK - 124 prompts aimed at the failures the model
 * still has, authored 2026-09-13.
 *
 * WHY THESE PROMPTS
 * -----------------
 * Two things converged. The pairwise queue ran dry (four annotators had
 * 20-30 prompts left, Agnes had zero: she has compared all 55 prompts the
 * pool covers, and an annotator sees each prompt once). And the 2026-09-01
 * community call moved the frontier: reviewing a live English-Wikipedia-to-
 * Igala translation, Agnes and Charity judged the GRAMMAR good and named
 * four failures that are not grammar at all - respelled proper nouns, a fact
 * dropped for want of a word, a wrong cardinal direction, and a wrong year
 * expression. Two of those (names, omission) became rules in
 * generation-prompt-v4-2.ts, because they are procedure and assert no Igala
 * form. The other two CANNOT become rules: the direction words were
 * contested by the speakers themselves on the call, and the year word is
 * single-sourced and half-garbled in the transcript. The sourcing contract
 * says those go to the data layer, which means they go here, as questions.
 *
 * THE NINE FAMILIES, and the measured failure each one probes:
 *   names         (20) proper nouns in translation - the Wikipedia blocker.
 *                      Includes controls: Igala-area names needing NO change,
 *                      so we measure over-correction as well as respelling.
 *   gaps          (16) what a speaker does when Igala has no word. The call's
 *                      second failure was an OMISSION, not a bad coinage.
 *   directions    (12) the contested cardinal directions. Several prompts
 *                      invite the annotator to report disagreement, because
 *                      disagreement is the finding.
 *   time          (12) years, dates, ages, spans. v4.1 tells the model to
 *                      write years in digits and never coin a year-name;
 *                      these test whether that is what speakers actually do.
 *   encyclopedic  (16) a register the corpus has never held. Everything we
 *                      have is community speech or Bible. v4.1's REGISTER
 *                      line prescribes ~7-word first/second-person sentences,
 *                      which is wrong for a Wikipedia article - a tension we
 *                      have no evidence to resolve yet, so we collect it.
 *   formulas      (16) greetings, farewells, thanks, blessings, condolence.
 *                      Failure pattern 2, ~41 rows, the single largest gap.
 *                      RE1-RE9 were written for it but buildRetrievalV4 reads
 *                      no RagEntry rows, so they still fail on the served path.
 *   numbers       (10) the vigesimal system (grade B, never in a prompt).
 *   questions     (10) wh- and yes/no. The yes/no particle is our most
 *                      important OPEN question: two native corrections show a
 *                      final particle, 558 Bible verses show none, so it is
 *                      single-sourced. These prompts hunt a second class,
 *                      without hinting that a particle is expected.
 *   syntax        (12) serial verbs, tag copula, dative allomorphy, optative -
 *                      rules v4.1 enshrined schematically. Did they take?
 *
 * SAFETY - this is a PRODUCTION database with live annotators:
 *  - CREATE-ONLY. Every row is upserted by promptId with `update: {}`, so a
 *    re-run never mutates or deletes an existing row.
 *  - split "train", isHoldout false. Held-out prompts must be
 *    community-authored; nothing here is eligible and nothing here claims to be.
 *  - Fresh promptId namespace ig_v42_<short>_NNN, collision-checked against
 *    every existing namespace.
 *  - Verified before landing: 0 near-duplicates of the 422 existing train
 *    prompts (Jaccard over content words, threshold 0.55, max observed 0.50),
 *    0 internal duplicates, every bucket valid, every text 25-420 chars.
 *
 * THE SOURCING CONTRACT applies to prompt text too: no prompt asserts an
 * Igala form we have not verified. Where the answer is contested - the
 * directions especially - the prompt ASKS rather than tells, and
 * expectedCulturalContext says plainly that we hold no rule there.
 *
 * Run with:  npx tsx --env-file=.env.local prisma/seed-prompt-bank-v42.ts
 */
import { PrismaClient, EvalBucket, DifficultyLevel } from "@prisma/client";
import { buildProtectedSet, checkStatic } from "../src/lib/eval/leak-guard";

const prisma = new PrismaClient();

interface BankPrompt {
  promptId: string;
  bucket: EvalBucket;
  text: string;
  difficultyLevel: DifficultyLevel;
  expectedCulturalContext: string | null;
  /** Which failure family this prompt belongs to (see the header). */
  family: string;
  /** The measured failure it probes. Not shown to annotators. */
  rationale: string;
}

export const V42_PROMPTS: BankPrompt[] = [
  {
    "promptId": "ig_v42_orth_001",
    "bucket": "orthography",
    "text": "You are writing an Igala Wikipedia article that mentions the city of Lagos. Write the city's name as it should appear in your Igala text, and say whether you changed anything from the English spelling.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "We have no settled Igala Wikipedia convention for non-Igala place names. The annotator's written form and their reason are the evidence; we hold no rule here.",
    "family": "names",
    "rationale": "Reproduces the headline 2026-09-01 failure, where Lagos was respelled because Igala has no /s/ and the model substituted ch; deliberately paired with prompt 19, which asks for the same city spoken aloud."
  },
  {
    "promptId": "ig_v42_orth_002",
    "bucket": "orthography",
    "text": "You are writing an Igala Wikipedia article about Kogi State. Write the names of the towns Idah and Ankpa as they should appear in your Igala text.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "Idah and Ankpa are towns in the Igala area of Kogi State. The annotator supplies the written form, including whether any tone marks or dotted vowels are used at all.",
    "family": "names",
    "rationale": "Control case for the respelling failure: an Igala-area place name needs no repair, so this measures over-correction (added tone marks, added dots) rather than substitution."
  },
  {
    "promptId": "ig_v42_orth_003",
    "bucket": "orthography",
    "text": "A branch of Access Bank has opened in Ankpa. Write the bank's name as it should appear in an Igala notice about the opening.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "Access Bank is a Nigerian bank. The annotator supplies how a company name is written inside Igala text.",
    "family": "names",
    "rationale": "Fills the company case the brief asked for and puts the s that triggered the observed respelling inside a brand name people read every day, outside the Wikipedia frame."
  },
  {
    "promptId": "ig_v42_orth_004",
    "bucket": "orthography",
    "text": "Write the names Zainab, Victor and Quadri as they should appear in an Igala article about three Nigerian athletes.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "The annotator supplies how names built from letters outside the Igala alphabet are written; no assumption is made that they must change.",
    "family": "names",
    "rationale": "The v4.1 orthography allowlist names z, v, q and x as 'not Igala: if a word seems to need one, the word is wrong', with no exemption for proper nouns."
  },
  {
    "promptId": "ig_v42_orth_005",
    "bucket": "orthography",
    "text": "You are writing an Igala article about a secondary school called Green Valley International School. Write the school's name as it should appear in the article, and say whether you would leave it in English or put any of it into Igala.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "The annotator supplies how a multi-word English institution name is written in an Igala article, and the convention they are following.",
    "family": "names",
    "rationale": "Probes partial translation of a multi-word institution name, the school-name failure Agnes reported, where some words survived and others were rendered into Igala."
  },
  {
    "promptId": "ig_v42_orth_006",
    "bucket": "orthography",
    "text": "Write the acronym NYSC as it should appear in an Igala article about a young graduate's service year, and say whether you would write it out in full instead.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "NYSC is the Nigerian youth service scheme. The annotator supplies how an acronym is handled inside Igala running text.",
    "family": "names",
    "rationale": "Probes whether an all-caps abbreviation containing s and c is respelled or silently expanded rather than carried across unchanged."
  },
  {
    "promptId": "ig_v42_orth_007",
    "bucket": "orthography",
    "text": "An Igala Wikipedia editor is writing about the novel Things Fall Apart. Write the book's title as it should appear in the article, and say whether you would leave it in English or put it into Igala.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "The annotator supplies how the title of a published work is written in an Igala article, and the convention behind their choice.",
    "family": "names",
    "rationale": "A title made of ordinary English words is the strongest pull toward translation; probes whether title status is recognised at all."
  },
  {
    "promptId": "ig_v42_orth_008",
    "bucket": "orthography",
    "text": "Write the names of the two Nigerian states Bayelsa and Osun as they should appear in an Igala article, and say whether you would write either of them differently from the English spelling.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "Bayelsa and Osun are Nigerian states. The annotator supplies the written form and the convention they are following, since the convention itself is what we lack.",
    "family": "names",
    "rationale": "Both names carry the s that triggered the observed respelling; the second clause sources the community convention instead of us asserting one."
  },
  {
    "promptId": "ig_v42_gram_001",
    "bucket": "grammar_tone",
    "text": "Translate 'Musa lives in Idah' into Igala.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": null,
    "family": "names",
    "rationale": "The simplest name-in-sentence case: whether a personal name carrying s survives, and whether the locative is built correctly around a word the grammar cannot analyse."
  },
  {
    "promptId": "ig_v42_gram_002",
    "bucket": "grammar_tone",
    "text": "Translate 'Zainab is a teacher' into Igala.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": null,
    "family": "names",
    "rationale": "Pairs with prompt 4 on the same string: a z-name in running text, where the copula choice and the sentence frame can collapse even when the name itself is kept."
  },
  {
    "promptId": "ig_v42_gram_003",
    "bucket": "grammar_tone",
    "text": "Translate 'Onoja and Felix were both born in Ankpa' into Igala.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": null,
    "family": "names",
    "rationale": "Coordinated subjects and a birth predicate built around two proper nouns, with a secondary read on whether an Igala-shaped name attracts dots or tone marks and whether the x survives."
  },
  {
    "promptId": "ig_v42_gram_004",
    "bucket": "grammar_tone",
    "text": "Translate 'Amina's father sells yams at Idah market' into Igala.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": null,
    "family": "names",
    "rationale": "The inverse error directly: the possessor follows the noun in Igala, so a kept foreign name still has to be positioned and marked correctly."
  },
  {
    "promptId": "ig_v42_gram_005",
    "bucket": "grammar_tone",
    "text": "Translate 'Vivian studied computer science at Kogi State University and now works in Abuja' into Igala.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": null,
    "family": "names",
    "rationale": "Combines the v-name against the character allowlist with the call's second failure, where the subject studied was dropped for want of an Igala word - and now there is a named subject available to drop."
  },
  {
    "promptId": "ig_v42_gram_006",
    "bucket": "grammar_tone",
    "text": "Translate 'The people of Ajaokuta said that Ibrahim had already left for Lokoja' into Igala.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": null,
    "family": "names",
    "rationale": "Tests whether three proper nouns survive an embedded clause, alongside human-plural marking on 'the people' and the pluperfect."
  },
  {
    "promptId": "ig_v42_auth_001",
    "bucket": "authenticity",
    "text": "You see your friend Sunday across the road. Call out to him by name and ask him to wait for you.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "The annotator calls out as they really would. What happens to the name is what we are watching, but the calling out itself should be natural, not careful.",
    "family": "names",
    "rationale": "Puts a personal name that is also an ordinary English word into a spoken vocative, where the pull to translate it is strongest."
  },
  {
    "promptId": "ig_v42_auth_002",
    "bucket": "authenticity",
    "text": "A woman called Zara Adejoh has come from the Nigerian Television Authority to record your community's songs. Tell your neighbours in Igala who she is and why she has come.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "The annotator speaks to their neighbours as they really would, with a mixed personal name and a multi-word organisation name inside the utterance.",
    "family": "names",
    "rationale": "Probes whether a multi-word organisation name is kept, translated, or quietly replaced by a description, in a natural rather than encyclopedic register."
  },
  {
    "promptId": "ig_v42_auth_003",
    "bucket": "authenticity",
    "text": "A radio presenter in Idah is announcing that Kogi State Polytechnic will reopen next week. Write the announcement in Igala, as it would really be read on air.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "The annotator writes the announcement as it would actually be broadcast, institution name included.",
    "family": "names",
    "rationale": "The inverse error in a register frame: the institution name may be kept while the announcement formula around it reads back-translated from English."
  },
  {
    "promptId": "ig_v42_auth_004",
    "bucket": "authenticity",
    "text": "Imagine an Igala Wikipedia article about a musician called Sule Ejeh, who was born in Ankpa and now lives in Port Harcourt. Write the first two sentences of that article as an Igala encyclopedia article would really read.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "The musician is invented, so no real facts are being asked for. The annotator writes the opening as an Igala article would really open.",
    "family": "names",
    "rationale": "Reproduces the Wikipedia-track failure case whole: a biography opening carrying a personal name with s, an Igala-area town, and a non-Igala city together."
  },
  {
    "promptId": "ig_v42_auth_005",
    "bucket": "authenticity",
    "text": "A cousin who lives in Lagos sends you a voice note. Reply in spoken Igala, telling him you will come and see him after the harvest, and say the city's name the way you would actually say it aloud.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "The annotator answers in speech, not in writing. How a non-Igala place name sounds when spoken may differ from how it is written, and both are useful to us.",
    "family": "names",
    "rationale": "Sources Agnes's claim that an untranslatable term is kept in English but pronounced the Igala way, and keeps the spoken question separate from prompt 1's written one instead of assuming they match."
  },
  {
    "promptId": "ig_v42_lex_001",
    "bucket": "lexicon_disambig",
    "text": "Your neighbour's daughter is called Grace. Give the Igala word that means grace or favour, then write the girl's name as it should appear in an Igala text.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "Give the ordinary Igala word first, then the written form of the name. If you are not sure whether Igala practice keeps the two apart, say so rather than choosing one.",
    "family": "names",
    "rationale": "The substitution failure at its cleanest: a personal name that is also a common noun, where translating the noun destroys the reference."
  },
  {
    "promptId": "ig_v42_lex_002",
    "bucket": "lexicon_disambig",
    "text": "Your child comes home from school in Idah and you ask what they were taught today: mathematics, English, social studies and agricultural science. In Igala, tell your mother what the child was taught, naming every subject on the list.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "All four subjects should come through. What we need on record is what you would really call each one when speaking to your mother.",
    "family": "gaps",
    "rationale": "Reconstructs the 2026-09-01 drop failure in list form - the model omitted the untranslatable item rather than naming it; the subjects are pinned so the annotator cannot substitute easy ones."
  },
  {
    "promptId": "ig_v42_lex_003",
    "bucket": "lexicon_disambig",
    "text": "Your nephew has been admitted to university to study biology. Tell his grandmother in Igala what he will be studying there, in the words you would actually speak to her.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "The name of the field is what we are after. An answer that says he is going to university but never says what he will study is incomplete.",
    "family": "gaps",
    "rationale": "Directly reconstructs the biography-translation failure reported on 2026-09-01, where the academic field was omitted because no Igala word was available."
  },
  {
    "promptId": "ig_v42_lex_004",
    "bucket": "lexicon_disambig",
    "text": "Someone translating a man's life story into Igala wrote that he went to university, but stopped there and never said what he studied. He studied economics. In one Igala sentence, write the part that was left out.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "The missing piece is the field itself. Write it the way you would put it into the story, whatever you would call that field.",
    "family": "gaps",
    "rationale": "Puts the annotator in the position of repairing the exact 2026-09-01 failure (\"he didn't tell us what he studied\"), so the gold answer is the repair itself."
  },
  {
    "promptId": "ig_v42_lex_005",
    "bucket": "lexicon_disambig",
    "text": "You are adding a line to an Igala Wikipedia article about a woman who teaches psychology at a university. Write that line in Igala, saying what she teaches. Then add one line of English saying what you did with the name of the field and why.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "Two parts: the Igala line, then one English line on your choice about the field name. The second line is what tells us how Igala editors should handle terms like this.",
    "family": "gaps",
    "rationale": "Elicits an explicit strategy statement for an abstract academic term - the case where the model both drops content and, per pattern 1 (~65 rows), invents Igala-looking forms."
  },
  {
    "promptId": "ig_v42_lex_006",
    "bucket": "lexicon_disambig",
    "text": "Your phone has gone off and you need to charge it. In Igala, tell a neighbour that the battery is finished and ask where you can charge it, the way you would really say it.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "Everyday speech, not a dictionary entry - including whatever you would really call the battery and the act of charging.",
    "family": "gaps",
    "rationale": "Probes the lexical gap for everyday technology objects, where METHOD step 4 of v4.1 tells the model to keep the community loanword or describe the thing but compliance is unmeasured and no gold exists."
  },
  {
    "promptId": "ig_v42_lex_007",
    "bucket": "lexicon_disambig",
    "text": "Your cousin has heard people in the market talking about the internet and asks you what it is. Answer him in Igala, in one or two sentences, using the words you would really use with him.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "Write what you would genuinely say to him, however you would handle the word itself.",
    "family": "gaps",
    "rationale": "Forces a real choice between loanword and description for a term with no plausible attested Igala equivalent - the exact case where the model fabricates lexicon (pattern 1, ~65 rows)."
  },
  {
    "promptId": "ig_v42_lex_008",
    "bucket": "lexicon_disambig",
    "text": "You are helping your aunt set up an account on her phone, and you must warn her never to give her password to anyone. Say that warning to her in Igala, exactly as you would say it.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "A real spoken warning to an older relative - the words themselves, not a report of the warning.",
    "family": "gaps",
    "rationale": "Probes a technology term with no attested Igala word inside a speech act, testing both the gap strategy and METHOD step 7 (perform, don't describe; pattern 19, ~7 rows)."
  },
  {
    "promptId": "ig_v42_auth_006",
    "bucket": "authenticity",
    "text": "You are running a training session in Anyigba, teaching people to edit Igala Wikipedia. In three or four Igala sentences, tell the room what a computer is and what they will be doing with it today - the Igala you would really speak standing in front of them.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "Researcher note: a good answer sounds spoken rather than written, and handles the technology terms the way a real trainer in the room would, without stalling or skipping them.",
    "family": "gaps",
    "rationale": "Combines the lexical-gap failure with pattern 8 (English calques, ~12 rows) in the project's own Wikipedia-editing setting, where the gap strategy has to hold across several sentences."
  },
  {
    "promptId": "ig_v42_lex_009",
    "bucket": "lexicon_disambig",
    "text": "Health workers are coming to the village next week to give the children a vaccine. In Igala, tell a mother what they are coming to do, in the words you would really say to her.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "The mother has to understand exactly what will happen to her child, so the answer should not stop short of saying what a vaccine is or what you call it.",
    "family": "gaps",
    "rationale": "Probes a medical term with no attested Igala word, where the 2026-09-01 failure mode is silent omission of the untranslatable item."
  },
  {
    "promptId": "ig_v42_lex_010",
    "bucket": "lexicon_disambig",
    "text": "Your uncle needs an operation and you have to explain to his wife what the doctors will do to him. Say it to her in Igala, in one or two sentences, as you would really say it.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "The sentences you would actually speak to her at the hospital. Name it or describe it - either way she should be left knowing what will happen.",
    "family": "gaps",
    "rationale": "Tests whether a medical procedure with no ready Igala word is described in attested words or dropped, per the community-call gap finding."
  },
  {
    "promptId": "ig_v42_lex_011",
    "bucket": "lexicon_disambig",
    "text": "Your younger brother is voting for the first time and asks what he is supposed to do at the polling unit. Tell him in Igala, in one or two sentences, in the words you would really use.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "A real answer to a younger brother. Write what you would say to him, however you would handle the words for voting and the election.",
    "family": "gaps",
    "rationale": "Probes civic vocabulary gaps in a situated explanation, the domain where the model most readily coins Igala-looking forms (pattern 1, ~65 rows)."
  },
  {
    "promptId": "ig_v42_lex_012",
    "bucket": "lexicon_disambig",
    "text": "You are on a community radio programme explaining health insurance to Igala listeners - paying a small amount every month so that the hospital bill is covered when you fall ill. Give your explanation in two or three Igala sentences, as you would say it on air.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "The English gloss is only so you know what is meant. What we are recording is how you would carry that idea to listeners on the radio.",
    "family": "gaps",
    "rationale": "An abstract civic-financial concept with no attested Igala term, forcing the loan-versus-describe decision across several sentences rather than a single word."
  },
  {
    "promptId": "ig_v42_lex_013",
    "bucket": "lexicon_disambig",
    "text": "Your family has just bought a generator. In Igala, tell your younger brother to go outside and switch it on - the sentence you would really say to him.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "Ordinary household speech to a younger sibling, including whatever you would call the machine.",
    "family": "gaps",
    "rationale": "Probes a modern household object whose Igala name is unattested in our sources, testing the everyday-loanword strategy Agnes described on 2026-09-01."
  },
  {
    "promptId": "ig_v42_lex_014",
    "bucket": "lexicon_disambig",
    "text": "Your daughter is leaving for boarding school and the list from the school says she must bring a mattress, a bucket, a torch and a padlock. Read the four items out to your husband in Igala, as you would really say them.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "All four items should come through. Whatever you would really call each one is what we want written down.",
    "family": "gaps",
    "rationale": "A four-item list of modern objects, the shape in which the 2026-09-01 drop failure appears: the item with no Igala name is the one that silently goes missing."
  },
  {
    "promptId": "ig_v42_auth_007",
    "bucket": "authenticity",
    "text": "At a naming ceremony you are about to take a photograph of the whole family. In Igala, call out to them to stand together and look at the camera. Write exactly the words you would shout.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "Researcher note: the answer should be the shouted words themselves, and should handle the photograph and the camera the way a real speaker at the ceremony would rather than working around them.",
    "family": "gaps",
    "rationale": "Pairs the modern-object lexical gap with METHOD step 7 (perform, don't describe; pattern 19, ~7 rows) in a live cultural setting."
  },
  {
    "promptId": "ig_v42_auth_008",
    "bucket": "authenticity",
    "text": "Your town's youth association is arguing about how its next leaders should be chosen. You are asked to stand up and tell the room what democracy means. Say it in three or four Igala sentences, the way you would really say it standing there.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "Researcher note: an authentic answer sounds like speech to a room and carries the idea through without sliding into a report about it or into English sentence shapes.",
    "family": "gaps",
    "rationale": "An abstract civic concept with no attested Igala word, testing whether the gap is bridged in sustained natural speech or collapses into English-shaped calque (pattern 8, ~12 rows)."
  },
  {
    "promptId": "ig_v42_lex_015",
    "bucket": "lexicon_disambig",
    "text": "A teacher points to the top of a map of Nigeria and asks the class what direction it is. Write the Igala word for north. If you know more than one word for it, give them all and say which one you use yourself.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "Speakers on the community call did not agree on the direction words, so more than one form may be right. Listing every form you know is better than picking one to be tidy.",
    "family": "directions",
    "rationale": "On the 2026-09-01 call a cardinal direction word in the model's Wikipedia biography translation was judged wrong, and north was the form speakers hedged on most; the bank asks for all four directions in one prompt (ig_bank_lex_028) and never elicits one on its own."
  },
  {
    "promptId": "ig_v42_lex_016",
    "bucket": "lexicon_disambig",
    "text": "Your neighbour's son has travelled south to look for work. In one short Igala phrase, say which direction he has gone. If your area uses more than one word for that direction, give each one.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "We want the direction word inside a short phrase, not as a bare dictionary entry. Several forms are welcome.",
    "family": "directions",
    "rationale": "Same call finding: the south form was contested and left unresolved in the transcript, so it must be elicited from speakers rather than asserted as a rule."
  },
  {
    "promptId": "ig_v42_lex_017",
    "bucket": "lexicon_disambig",
    "text": "A child asks you where his sandals are. One is right beside you, the other is across the compound. In Igala, say 'this one is here' and 'that one is over there', in the two short sentences you would really say.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "The near and the far pointing words as they are really used, inside the two short sentences rather than as bare words.",
    "family": "directions",
    "rationale": "Open question 6 plus pattern 1: the model invented forms for 'here' because no attested word exists in any source class, and the only nearby bank prompt (ig_bank_dial_004) asks about 'come here' as a dialect variant, not the near/far contrast."
  },
  {
    "promptId": "ig_v42_lex_018",
    "bucket": "lexicon_disambig",
    "text": "You are teaching a small child which hand is which. In Igala, name the left hand and the right hand. Then say whether you use those same two words to tell a driver which way to turn.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "Two things are wanted: the body-side words, and a yes or no on whether they also serve for turning. If turning uses a different expression, give that too.",
    "family": "directions",
    "rationale": "Left and right appear nowhere in the 422-prompt bank and in no elicited source, so the most basic direction-giving vocabulary has never been collected from speakers."
  },
  {
    "promptId": "ig_v42_lex_019",
    "bucket": "lexicon_disambig",
    "text": "Write the Igala word for the direction the sun rises from, and the word for the direction it sets. Then say whether these are the same words you would use for east and west on a map.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "Either answer is a real finding: that the sun-based names double as the map words, or that separate words exist. Say plainly which it is.",
    "family": "directions",
    "rationale": "East and west were the least recoverable of the four directions on the call (east unclear, west transcribed as an English-shaped fragment), so both must be elicited rather than enshrined."
  },
  {
    "promptId": "ig_v42_lex_020",
    "bucket": "lexicon_disambig",
    "text": "A trader is going up the River Niger by canoe and coming back down again. In Igala, say both: that he is travelling upriver, and that he is coming back downriver. Say it the way a person who works the river would, not word for word from English.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "River direction in whatever shape Igala really uses, whether that is a verb, a landmark or a place name. A literal rendering of the English 'up' and 'down' is what we are trying to detect.",
    "family": "directions",
    "rationale": "Pattern 8 (English structural calques, ~12 rows) and pattern 1 (fabrication where no word exists): river direction is absent from the bank, so the model either calques the English or invents a form."
  },
  {
    "promptId": "ig_v42_gram_007",
    "bucket": "grammar_tone",
    "text": "A Wikipedia article says a village lies about thirty kilometres south-east of Idah. Write that sentence in Igala. If there is no single Igala word for a between-direction like south-east, write how you would really say it - do not leave the direction out.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "The whole sentence must arrive, distance and direction included. If there is no single word for the between-direction, we want the wording a speaker would really use.",
    "family": "directions",
    "rationale": "Probes the call's second measured failure - content silently dropped where no Igala word existed ('he didn't tell us what he studied') - in the intercardinal case most likely to trigger it, and sits in grammar_tone so the sentence's structure is scored and the annotator authors cold gold first."
  },
  {
    "promptId": "ig_v42_lex_021",
    "bucket": "lexicon_disambig",
    "text": "You are writing an Igala Wikipedia article about a local government area. In Igala, write the phrase 'the eastern part of Kogi State'. Build it the way Igala really builds such a phrase, not word for word from English.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "How a part of a larger place is named matters as much as the direction word. An English-shaped rendering is exactly what we are looking for.",
    "family": "directions",
    "rationale": "This is the sentence type that failed on the call - a direction word inside a Wikipedia geography phrase - and the calque channel of pattern 8, which the bucket's contamination axis scores because it covers grammar bleed from English."
  },
  {
    "promptId": "ig_v42_dial_001",
    "bucket": "dialectal_fidelity",
    "text": "When people where you live say which way someone has travelled, do they use a direction word, or name a town the person is heading towards? Write the one short Igala sentence people in your area would really say, and note briefly which of the two you used.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "Either device is correct. We are recording what your area actually does, not testing whether you know the cardinal words.",
    "family": "directions",
    "rationale": "Pattern 10 and METHOD step 8 (dialect honesty): the model asserts direction usage it cannot source, and we have no evidence about whether cardinal terms are the everyday device at all."
  },
  {
    "promptId": "ig_v42_dial_002",
    "bucket": "dialectal_fidelity",
    "text": "A visitor uses a direction word he learned in another Igala town, and it is not the one you use at home. Write the short Igala exchange between the two of you as it would really sound. If you have never run into this, say so plainly rather than inventing it.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "A two-voice exchange, not a description of one. 'I have never heard a different form' is a full and correct answer.",
    "family": "directions",
    "rationale": "Pattern 10 (~12 rows of invented town attributions) plus pattern 19 (describe instead of perform): we have no natural example of two variants meeting in one conversation, and the prompt refuses to reward invented variation."
  },
  {
    "promptId": "ig_v42_gram_008",
    "bucket": "grammar_tone",
    "text": "In one Igala sentence, tell a visitor where one town in your area lies in relation to another, naming both towns.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "One sentence, with the locative construction a speaker would really use. The choice of towns is yours - the shape of the sentence is what we are after.",
    "family": "directions",
    "rationale": "The relative-location sentence is the backbone of every Wikipedia place article and the frame in which the call's wrong direction word appeared, and it is untested in the 422-prompt bank."
  },
  {
    "promptId": "ig_v42_auth_009",
    "bucket": "authenticity",
    "text": "A stranger stops you outside the market and asks the way to the health centre. In three or four Igala sentences, give him the directions exactly as you would say them out loud.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "The spoken directions themselves, with whatever turns, landmarks and distances a speaker would really use - not a summary of what one would say.",
    "family": "directions",
    "rationale": "Pattern 19 (~7 rows of third-person reports of the speech act instead of the speech act); connected direction-giving has never been elicited anywhere in the bank."
  },
  {
    "promptId": "ig_v42_gram_009",
    "bucket": "grammar_tone",
    "text": "A teacher writes 1999 on the blackboard and asks the class to say the year out loud. Write, in one short line, what an Igala-speaking child would actually say.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "The annotator should show how a calendar year is voiced in ordinary speech - whether the digits are read out, an English form is used, or Igala numerals carry it. Whatever people genuinely say is the right answer.",
    "family": "time",
    "rationale": "Isolates the measured wrong-year failure from the 2026-09-01 call at its simplest - a bare calendar year with no sentence frame - and checks the system prompt's untested 'write the year in digits' instruction against what a speaker actually says."
  },
  {
    "promptId": "ig_v42_gram_010",
    "bucket": "grammar_tone",
    "text": "Your neighbour asks how old your youngest child is. The child is six. Write your reply in one Igala sentence.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "The annotator should give a whole spoken sentence, not a bare number.",
    "family": "time",
    "rationale": "Tests the age-in-years construction, which the bank never elicits - its only 'old' prompt covers the adjective applied to a person or object."
  },
  {
    "promptId": "ig_v42_lex_022",
    "bucket": "lexicon_disambig",
    "text": "Give the Igala expression for 'next year' and the Igala expression for 'last year', each in a short phrase.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "The annotator should supply how the year ahead and the year just past are named in everyday speech. If one of them is normally said with a borrowed word, that is a real answer; a coined Igala-looking form is not.",
    "family": "time",
    "rationale": "Probes deictic year reference next to the measured year failure; the bank covers only today, yesterday and tomorrow."
  },
  {
    "promptId": "ig_v42_lex_023",
    "bucket": "lexicon_disambig",
    "text": "Give the Igala word for a year, and the general Igala word for a season such as the rainy season or the dry season. Say whether the same word does both jobs.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "The annotator should supply the everyday words and say plainly whether one word covers both. Reporting that a single word serves both is a valid answer.",
    "family": "time",
    "rationale": "Directly probes the year-versus-period lexical confusion behind the measured wrong-year output, where the model had no stable word for the calendar year."
  },
  {
    "promptId": "ig_v42_gram_011",
    "bucket": "grammar_tone",
    "text": "You are translating an English Wikipedia biography into Igala. One sentence reads: 'He finished secondary school in 2021 and started working the following year.' Write that sentence in Igala.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "The annotator should carry both the fixed year and the year counted forward from it; nothing in the sentence may be dropped.",
    "family": "time",
    "rationale": "Reproduces the exact shape of the sentence that failed on the 2026-09-01 call - a graduation year inside a past-tense biography clause, plus a year counted forward from it."
  },
  {
    "promptId": "ig_v42_gram_012",
    "bucket": "grammar_tone",
    "text": "The last time you travelled to Idah was three years ago. Tell a friend that, in one Igala sentence.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "The annotator should express the span counted backwards from now; the place name is not what is being tested.",
    "family": "time",
    "rationale": "Tests a backward-counted span in years, a construction no line in the system prompt covers, sitting directly beside the measured year error."
  },
  {
    "promptId": "ig_v42_gram_013",
    "bucket": "grammar_tone",
    "text": "A man is asked how long he taught at the primary school. He was there for five years. Write his reply in one Igala sentence.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "The annotator should express a run of years, not a point in time.",
    "family": "time",
    "rationale": "Probes duration in years - the third distinct year construction after point-in-time and years-ago, all three collapsed into the system prompt's single dates line."
  },
  {
    "promptId": "ig_v42_gram_014",
    "bucket": "grammar_tone",
    "text": "A clerk enrolling your daughter at primary school asks for her date of birth: 14 September 2018. Write what you would actually say, as one spoken line in Igala.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "The annotator should give a spoken date, not a written one - day, month and year together in one utterance.",
    "family": "time",
    "rationale": "Tests the system prompt's dates rule (ordinal day and month, year in digits) against what a speaker says out loud, which that rule was never checked against."
  },
  {
    "promptId": "ig_v42_lex_024",
    "bucket": "lexicon_disambig",
    "text": "A church notice says the service holds on Sunday. Write how Igala speakers would actually name that day when they tell one another about the service, and say whether the name is an Igala word or one taken from English.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "The annotator should report the seven-day week as people really name it - a native term, a borrowed name pronounced the Igala way, or something else. A borrowed name in ordinary use is a correct answer here, not contamination; an invented Igala-looking day name is not.",
    "family": "time",
    "rationale": "Probes the borrow-or-coin decision Agnes named for untranslatable terms, applied to weekday names, which the bank covers only for the traditional market week."
  },
  {
    "promptId": "ig_v42_lex_025",
    "bucket": "lexicon_disambig",
    "text": "English uses one word, 'time', for a stretch of time, for the right moment to do something, and for a count of occurrences as in 'I called three times'. Give the Igala word for each sense, and say if one word covers more than one of them.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "The annotator should say whether duration, occasion and number of occurrences are separate words in Igala. Reporting that one word serves two or three of them is a good answer; supplying three different words where only one or two exist is the failure to watch for.",
    "family": "time",
    "rationale": "Targets the polysemy behind the wrong period word on the call, where a year expression and a general time expression were treated as interchangeable."
  },
  {
    "promptId": "ig_v42_gram_015",
    "bucket": "grammar_tone",
    "text": "At a family gathering you are asked to tell everyone how old the oldest woman in the compound is: she is a hundred. Write what you would say, in one or two Igala sentences.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "The annotator should hold the large number and the age construction together in a sentence meant to be spoken to a group.",
    "family": "time",
    "rationale": "Combines the untested large-numeral paradigm (pattern 24, where the model produced a malformed form for forty) with the age-in-years frame, in a register where the number must be spoken rather than written in digits."
  },
  {
    "promptId": "ig_v42_auth_010",
    "bucket": "authenticity",
    "text": "An old woman in a village near Idah is asked how old she is. She does not know what year she was born. Write, in one or two Igala sentences, what she would actually say.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "The annotator should show what a speaker does when no number is available - whether an age gets placed against remembered events, and whether anything is said at all.",
    "family": "time",
    "rationale": "Probes the measured drop-the-content failure, where the model omitted material it had no direct equivalent for, in the specific domain of dating a person's age."
  },
  {
    "promptId": "ig_v42_reg_001",
    "bucket": "register_honorifics",
    "text": "For an Igala Wikipedia article about Idah, write the opening sentence in Igala: what Idah is and which state it is in. Word it as a reference book would, not the way you would say it to a neighbour.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "One third-person definitional line - no greeting, no 'I' or 'you'.",
    "family": "encyclopedic",
    "rationale": "Every register in the corpus is community speech in first or second person at ~7 words a sentence, so the encyclopedic lead sentence - the exact form the 2026-09-01 Wikipedia translation needed - has never been sampled."
  },
  {
    "promptId": "ig_v42_orth_009",
    "bucket": "orthography",
    "text": "An Igala Wikipedia biography mentions a man born in Lagos who later worked in Bayelsa. Write one Igala sentence carrying both place names, spelling each name as it should appear in the article.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "The two place names are the point: whether they come through an Igala sentence intact.",
    "family": "encyclopedic",
    "rationale": "On the community call the model respelled every proper noun in the biography, Lagos and Bayelsa among them, because Igala has no /s/ and it converted s to ch."
  },
  {
    "promptId": "ig_v42_auth_011",
    "bucket": "authenticity",
    "text": "You are laying out a biography page for Igala Wikipedia. Write, in Igala, the section headings you would put above early life, education, work, and death.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "Short noun-phrase labels as a published page carries them, not full sentences and not spoken phrasing.",
    "family": "encyclopedic",
    "rationale": "Section headings are a purely encyclopedic form with no counterpart anywhere in the community-speech or Bible material the model is trained and retrieved on."
  },
  {
    "promptId": "ig_v42_auth_012",
    "bucket": "authenticity",
    "text": "Write the opening sentence of an Igala Wikipedia article about the harmattan: a plain statement of what it is and when it comes, not how it feels to you.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "A definition in the third person; the writer's own experience of the season should not appear in it.",
    "family": "encyclopedic",
    "rationale": "The corpus carries this content only as first-person community weather talk (ig_lf_auth_022 complains about the same wind); the neutral definition of the same phenomenon is untested, giving a clean minimal pair."
  },
  {
    "promptId": "ig_v42_reg_002",
    "bucket": "register_honorifics",
    "text": "An Igala Wikipedia biography opens with one line giving when and where the person was born. Write that line in Igala for someone born in Ankpa in 1952, with no greeting, praise or blessing added.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "A bare factual line. Watch the year form, and whether praise or blessing language creeps into a place a reference work leaves plain.",
    "family": "encyclopedic",
    "rationale": "A wrong year expression was one of the four failures named on the call, and the corpus's only model for speaking about a person is blessing and praise, which a biography line must suppress."
  },
  {
    "promptId": "ig_v42_lex_026",
    "bucket": "lexicon_disambig",
    "text": "For an Igala Wikipedia article about a town, write one Igala sentence saying that the town lies to the south of Idah.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "The direction word is what we need. Speakers on the 2026-09-01 community call hedged and could not agree on the cardinal directions, so your own form is the evidence. Write it as an article sentence, not as conversation.",
    "family": "encyclopedic",
    "rationale": "A cardinal direction was one of the four failures named on the call and the call itself could not settle the terms, so the prompt asks rather than asserts; it stays distinct from ig_bank_lex_028, which wants the four words as a list rather than inside reference prose."
  },
  {
    "promptId": "ig_v42_lex_027",
    "bucket": "lexicon_disambig",
    "text": "An Igala Wikipedia article says a man studied economics at university. Write that as one Igala sentence for the article, keeping the subject he studied in the sentence, then note in English how you handled the subject name.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "What matters is that the information survives. Describing it in Igala or keeping the English term said the Igala way are both answers - telling us which you chose is the useful part.",
    "family": "encyclopedic",
    "rationale": "Agnes reported that the model 'didn't tell us what he studied': content was silently dropped wherever no Igala word came to hand."
  },
  {
    "promptId": "ig_v42_orth_010",
    "bucket": "orthography",
    "text": "An Igala Wikipedia biography says that a girl named Grace Egbuson attended a school called Green Spring Montessori. Write one Igala sentence saying so, spelling the person's name and the school's name as they should appear in the article.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "A person's name and an organisation's name inside Igala orthography - watch whether either is respelled.",
    "family": "encyclopedic",
    "rationale": "Egbuson and Green Spring Montessori were both mangled in the biography reviewed on the call, and person names and organisation names are two of the three classes Charity said Wikipedia never translates."
  },
  {
    "promptId": "ig_v42_auth_013",
    "bucket": "authenticity",
    "text": "Write two or three Igala sentences for an Igala Wikipedia entry about a farmers' cooperative: what it is, and what it does for its members. Keep it third-person and factual, with no opinion about whether it is a good thing.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "Institutional description in a neutral voice - no address to a reader, no evaluation, no blessing.",
    "family": "encyclopedic",
    "rationale": "Describing what an organization does is a core encyclopedic move with no attested model in a corpus made of greetings, blessings and Bible verse."
  },
  {
    "promptId": "ig_v42_reg_003",
    "bucket": "register_honorifics",
    "text": "A friend says to you: 'That big market by the river, you know the one - everybody goes there on market day, it has been there forever.' Write the same information in Igala as an Igala Wikipedia article would carry it.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "The shift is the test: the direct address, the vagueness and the exaggeration should be gone and the facts stated plainly.",
    "family": "encyclopedic",
    "rationale": "Converting community speech into reference prose is untested, and the served register line points the other way, at ~7-word first and second person community sentences."
  },
  {
    "promptId": "ig_v42_gram_016",
    "bucket": "grammar_tone",
    "text": "A farmer told an interviewer: 'I planted my yams in April and I harvested them in September.' Write that as one third-person Igala sentence for an Igala Wikipedia article, with no 'I' in it.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "Watch the pronoun shift, and whether both time expressions survive the move into third person.",
    "family": "encyclopedic",
    "rationale": "Every register the corpus covers is first or second person, so the first-to-third person conversion an encyclopedia entry requires has never been exercised; the two month expressions also probe the dates line."
  },
  {
    "promptId": "ig_v42_auth_014",
    "bucket": "authenticity",
    "text": "Write one Igala sentence for an Igala Wikipedia article giving a town's population and the year that count was taken. Use any figure and year you like, written as a published article would write them.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "A large number and a year inside running reference prose.",
    "family": "encyclopedic",
    "rationale": "A wrong year expression was one of the four failures on the call, and large-number handling in written reference prose is absent from the community-speech corpus."
  },
  {
    "promptId": "ig_v42_auth_015",
    "bucket": "authenticity",
    "text": "Igala Wikipedia needs an article about the Igala language itself. Write its opening two sentences in Igala: what the language is, and who speaks it.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "A lead paragraph about the language, written in it - third person throughout.",
    "family": "encyclopedic",
    "rationale": "Writing about the language in the language is a register the corpus contains nowhere, and it is the first article any new Wikipedia edition needs."
  },
  {
    "promptId": "ig_v42_reg_004",
    "bucket": "register_honorifics",
    "text": "Write two Igala sentences for an Igala Wikipedia article about the public work of a living titled elder, using no praise words at all.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "The honorific and praise defaults that are correct in speech are wrong in an article; a good answer is respectful by being accurate.",
    "family": "encyclopedic",
    "rationale": "Every honorific pattern in the corpus is deferential address or praise-singing, so neutral third-person treatment of a senior person is a register the model has never seen."
  },
  {
    "promptId": "ig_v42_gram_017",
    "bucket": "grammar_tone",
    "text": "Write one Igala sentence for an Igala Wikipedia article that states three things about a town at once: what it is, where it is, and what it is known for. Keep it to a single sentence rather than three short ones.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "One long, well-formed sentence. Whether Igala prose carries this length comfortably is itself what we are learning, so a shorter answer with a note saying why is a real answer.",
    "family": "encyclopedic",
    "rationale": "The served register line caps community writing at ~7-word sentences and pattern 9 (~14 rows) shows clause salad whenever the model goes longer, so controlled long-sentence reference prose needs its own probe."
  },
  {
    "promptId": "ig_v42_auth_016",
    "bucket": "authenticity",
    "text": "Write one Igala sentence for an Igala Wikipedia article saying that the year a town was founded is not recorded and cannot be stated with certainty.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "A neutral statement of uncertainty in article voice - no personal-sounding doubt, and no guess filling the gap.",
    "family": "encyclopedic",
    "rationale": "Pattern 10 is twelve rows of fabricated dialect and cultural facts; the encyclopedic 'this is not known' sentence is the form that lets a model decline to invent one."
  },
  {
    "promptId": "ig_v42_reg_005",
    "bucket": "register_honorifics",
    "text": "You set out for your farm before sunrise and meet three women of your mother's age walking to the stream. Greet them in Igala the way you would at that hour.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "A good answer greets more than one person at once and fits the hour it is spoken, rather than one all-purpose greeting.",
    "family": "formulas",
    "rationale": "Failure pattern 2 (~41 rows, the largest gap): the time-of-day greeting frame RE1 documents is not served on the v4.1 retrieval path, and the bank's only time-of-day items greet a single elder."
  },
  {
    "promptId": "ig_v42_reg_006",
    "bucket": "register_honorifics",
    "text": "You reach a neighbour's house and the door is shut. Write in Igala what you call out from outside so they know someone has come.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "A good answer is what is really called out at a shut door, in the speaker's own voice.",
    "family": "formulas",
    "rationale": "Failure pattern 2: the arrival hail is an unserved formula, and the failure set shows the model substituting an English-shaped 'hello' when nothing is retrieved."
  },
  {
    "promptId": "ig_v42_reg_007",
    "bucket": "register_honorifics",
    "text": "You get to the stall of the woman you buy pepper from every week. She is about your own age. Greet her in Igala before you start bargaining.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "A good answer is the everyday greeting between two people who know each other well from the market, not a formal or elder-directed one.",
    "family": "formulas",
    "rationale": "Failure patterns 2 and 7: market greetings are unserved, and the failure set shows blocklist-evading Yoruba greeting forms (clipped alaafia shapes) filling that gap."
  },
  {
    "promptId": "ig_v42_reg_008",
    "bucket": "register_honorifics",
    "text": "Your small daughter brings you a cup of water without being asked. Thank her in Igala the way you would really speak to a child.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "A good answer shows how thanks is pitched to a child rather than to an adult.",
    "family": "formulas",
    "rationale": "Failure pattern 2 with RE4 addressee reshaping: every thanks item in the failure set and the bank is elder-directed, so the child-addressee form of the formula is untested."
  },
  {
    "promptId": "ig_v42_reg_009",
    "bucket": "register_honorifics",
    "text": "You and a friend of your own age have walked back from the market together, and the path now splits towards your two villages. Give in Igala what each of you says as you part.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "A good answer gives both people's words as they part, not a single translated 'goodbye'.",
    "family": "formulas",
    "rationale": "Failure patterns 2 and 7: farewells were failed five times, with the model composing 'go with peace' from a Yoruba alaafia-shaped word that native correctors deleted."
  },
  {
    "promptId": "ig_v42_reg_010",
    "bucket": "register_honorifics",
    "text": "You come in from the farm at dusk and step into your family's house. Give in Igala what you say as you enter, and what your mother says back to you.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "A good answer gives both turns: the words of the person arriving and the answer from the house.",
    "family": "formulas",
    "rationale": "Failure pattern 2: the welcome-home construction is R9.2's best-attested formula and the model failed it three separate times, mis-segmenting the noun in the frame."
  },
  {
    "promptId": "ig_v42_reg_011",
    "bucket": "register_honorifics",
    "text": "You are weeding your farm when a man passing on the path calls out to greet you. Give in Igala what you call back to him without stopping work.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "A good answer is the reply itself, spoken back to him, not an account of the exchange.",
    "family": "formulas",
    "rationale": "Failure patterns 2 and 19: the reply half of a greeting pair is unserved, and the model reports the speech act in the third person instead of performing the return line."
  },
  {
    "promptId": "ig_v42_reg_012",
    "bucket": "register_honorifics",
    "text": "At the market you knock over a fellow trader's tray of tomatoes. She is your own age and you know her well. Apologise to her in Igala.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "A good answer apologises between equals, without the deference forms used towards an elder.",
    "family": "formulas",
    "rationale": "Failure pattern 2: the apology formulas in the bank are all elder-directed or formal family-to-family, so a same-age everyday apology has never been tested."
  },
  {
    "promptId": "ig_v42_reg_013",
    "bucket": "register_honorifics",
    "text": "You carried an old woman's bundle of firewood to her door, and she thanks you warmly for it. Give in Igala what you say back to her.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "A good answer is the reply a person actually gives when thanked, addressed to someone much older than them.",
    "family": "formulas",
    "rationale": "Failure pattern 2: the bank holds twelve prompts that give thanks and none that answer it, so the second half of the pair has never been measured on any path."
  },
  {
    "promptId": "ig_v42_reg_014",
    "bucket": "register_honorifics",
    "text": "A neighbour paid your child's school fees without being asked and without telling you. Give in Igala what you say to her the next time you see her.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "A good answer is whatever the speaker would genuinely say for a kindness of that size, at whatever length that takes.",
    "family": "formulas",
    "rationale": "Failure pattern 2 with RE3 and E2: fuller thanks is realised as a wish on the giver rather than a plain thank-you, and the model reduces it to a one-word thanks."
  },
  {
    "promptId": "ig_v42_reg_015",
    "bucket": "register_honorifics",
    "text": "A death has happened in a neighbour's house and you are going there for the first time. Give in Igala the words you speak as you arrive, before anything is said about the death itself.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "A good answer is only the arrival words, kept separate from the condolences that come after.",
    "family": "formulas",
    "rationale": "Failure patterns 2 and 10: consolation frames were calqued or filled with an Igbo-flavoured import the miners flagged, and RE6's prohibitive-plus-optative shape is not served on this path."
  },
  {
    "promptId": "ig_v42_reg_016",
    "bucket": "register_honorifics",
    "text": "A man of your own age, whom you have joked with since childhood, has just been given a chieftaincy title. Give in Igala what you say to him at the gathering, in front of other people.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "A good answer shows the address changing now that his standing has changed, even though he is your age-mate.",
    "family": "formulas",
    "rationale": "Failure pattern 2 with RE4: reshaping the same message by addressee status is the register layer's core test, and the honorific-plural and vocative layer is unserved on the current path."
  },
  {
    "promptId": "ig_v42_cult_001",
    "bucket": "cultural_values",
    "text": "Walk through a full day, from before dawn until people go to bed. Which Igala greetings do you use, and when in the day does each one belong? Give each greeting and name its part of the day. If the same greeting serves all day, say so, and say plainly wherever you are unsure or where people differ.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "A good answer lists the greetings by the part of the day they belong to in the speaker's own usage, and marks any that vary or that the speaker is not certain about. Leaving a gap open is a correct answer; filling it with a guess is not.",
    "family": "formulas",
    "rationale": "Failure pattern 2 with RE1: the productive time-noun greeting paradigm is the single most-failed frame, and the model invented a noun-plus-adjective 'good night' rather than using it."
  },
  {
    "promptId": "ig_v42_cult_002",
    "bucket": "cultural_values",
    "text": "Someone from another town arrives at your compound for the first time, and you are the one who receives them. Give in Igala the words spoken as they arrive - theirs and yours, in the order they are said. Say plainly where families do this differently or where you are unsure.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "A good answer gives the spoken turns in sequence, from both sides, rather than a description of what a host should do. Saying that a detail varies between families, or that you are unsure, is a correct answer.",
    "family": "formulas",
    "rationale": "Failure patterns 2, 19 and 10: the bank's welcome prompts all ask for a single host utterance, so the ordered exchange is untested, and the failure set shows the model describing the custom and inventing town-specific attributions."
  },
  {
    "promptId": "ig_v42_idiom_001",
    "bucket": "idioms_metaphor",
    "text": "Your brother's daughter has just passed the examination that takes her into secondary school, and the family has gathered at the house. Give in Igala what an older aunt would say to her, and explain in English the picture inside those words.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "A good answer is the well-wish as it would really be spoken to the girl, plus what its imagery means - not a literal English congratulation rendered word for word. If there is no set saying for this, say so and give the closest one there is.",
    "family": "formulas",
    "rationale": "Failure patterns 2, 8 and 19: congratulation produced a third-person description with English-shaped imagery instead of the spoken well-wish, and no congratulation prompt in the bank falls outside the crowded newborn and wedding cases."
  },
  {
    "promptId": "ig_v42_idiom_002",
    "bucket": "idioms_metaphor",
    "text": "A young man is opening his own shop in Ankpa tomorrow. Give in Igala the words an older relative would speak over him, and explain in English the image those words carry.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "A good answer is a blessing as an older relative would actually pronounce it over a new venture, with its imagery explained. If no set saying exists for this, say so and give the closest one that does.",
    "family": "formulas",
    "rationale": "Failure patterns 2 and 22: the affirmative optative blessing frame was missing from every blessing the model produced, and new-venture blessings are absent from the bank entirely."
  },
  {
    "promptId": "ig_v42_orth_011",
    "bucket": "orthography",
    "text": "Write the Igala words for twenty, thirty and forty, each spelled correctly with full tone marks.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "Researcher note: no numeral above ten has ever been community-checked in writing. Three separate written forms, with the speaker's own dotted vowels and tone marking.",
    "family": "numbers",
    "rationale": "Pattern 24 (vigesimal numeral forms): the served numeral line stops at the small attributive numerals, so no written form above ten is attested to the model and its one measured attempt at forty was mis-spelled."
  },
  {
    "promptId": "ig_v42_orth_012",
    "bucket": "orthography",
    "text": "Write the Igala words for fifty, one hundred and two hundred, each spelled correctly with full tone marks.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "Researcher note: the large end of the paradigm. Three written forms; whatever internal structure each has is for us to read off the set, not for the speaker to analyse.",
    "family": "numbers",
    "rationale": "Pattern 24: the multiplicative end of the numeral system is served nowhere, and the model invented a base word the one time it attempted a multiplied number."
  },
  {
    "promptId": "ig_v42_gram_018",
    "bucket": "grammar_tone",
    "text": "You are introducing your grandmother at a family gathering. She is seventy years old. Say, in one Igala sentence, how old she is.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "Researcher note: seventy inside an ordinary sentence, not a citation form - we want the number as it is really said when someone states an age.",
    "family": "numbers",
    "rationale": "Pattern 24 plus the 2026-09-01 call finding that a time expression came back wrong: numbers between the round decades are the hardest case, and age is probed nowhere in the existing bank."
  },
  {
    "promptId": "ig_v42_gram_019",
    "bucket": "grammar_tone",
    "text": "You are selling yams at the market in Idah and a buyer asks your price. It is one thousand five hundred naira. Say the price to her in one Igala sentence, the way you would really say it aloud.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "Researcher note: the whole spoken line with the amount inside it, as a trader would really say it - including whether the amount comes out in Igala, in English, or mixed.",
    "family": "numbers",
    "rationale": "Pattern 24's second half - the money and market counting paradigm is never deployed - and the one eval row whose judgement collapsed into an off-topic naira list shows we have no reference at all for how prices are spoken."
  },
  {
    "promptId": "ig_v42_gram_020",
    "bucket": "grammar_tone",
    "text": "Your neighbour asks how many people came to the community meeting last night. Eighty-five came. Answer her in one Igala sentence.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "Researcher note: a full answering sentence, not the bare number - we want to see where a large count sits relative to the noun and the verb in a real reply.",
    "family": "numbers",
    "rationale": "Pattern 24 against the served rule that numerals follow the noun: we have no evidence whether a large composed number behaves postnominally the way a small one does."
  },
  {
    "promptId": "ig_v42_gram_021",
    "bucket": "grammar_tone",
    "text": "You are counting goats back into the pen at dusk. Write how you would count them aloud, one after another, from eighteen up to twenty-three.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "Researcher note: the sequence itself is the answer - six numbers in order, every step written out rather than skipping to the end.",
    "family": "numbers",
    "rationale": "Pattern 24: the model's only measured attempt past twenty invented a base, and this span is also the exact point where a subtractive form would surface, so it tests the documented never-subtractive claim rather than assuming it."
  },
  {
    "promptId": "ig_v42_gram_022",
    "bucket": "grammar_tone",
    "text": "You got to the clinic early and you are the twelfth person waiting. Tell the nurse, in one Igala sentence, which position you are in the queue.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "Researcher note: an ordinal well past the ones the model has been shown, in an ordinary sentence rather than a date.",
    "family": "numbers",
    "rationale": "The served prompt gives an ordinal prefix but only ever pairs it with the small numerals and with dates, so any ordinal above third is unattested to the model."
  },
  {
    "promptId": "ig_v42_gram_023",
    "bucket": "grammar_tone",
    "text": "A visitor asks what year the health centre in your town was built. It was 1965. Answer her in one Igala sentence, saying the year out loud the way you really would.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "Researcher note: we have a written convention for years and nothing on how one is spoken. Whatever the speaker would truly say - digit by digit, as numbers, or in English.",
    "family": "numbers",
    "rationale": "The served prompt handles years only as digits on the page, and the 2026-09-01 call found a year expression came back wrong, so the spoken realisation is entirely unmeasured."
  },
  {
    "promptId": "ig_v42_lex_028",
    "bucket": "lexicon_disambig",
    "text": "A trader is quoting a price of one thousand naira. Give the words she actually uses for the amount, or say plainly if people use the English number instead.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "The annotator should supply the amount as it is really said in the market today; reporting that people use the English number is a correct answer if that is the truth.",
    "family": "numbers",
    "rationale": "Pattern 1 and the 2026-09-01 call finding that content is fabricated or dropped when no Igala word surfaces, against Agnes's rule of keeping the English word pronounced the Igala way."
  },
  {
    "promptId": "ig_v42_dial_003",
    "bucket": "dialectal_fidelity",
    "text": "A friend asks for your number so she can call you. Read this number out to her in Igala, the way you would really say it aloud: 0803 421 5566.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "Researcher note: whatever the speaker would truly say - digit by digit, in grouped numbers, in English, or switching between them. A mixed answer is the right answer if that is what people do.",
    "family": "numbers",
    "rationale": "Digit strings are served only for years, and the 2026-09-01 call showed the model respelling or silently dropping content it has no Igala form for rather than reporting real usage."
  },
  {
    "promptId": "ig_v42_gram_024",
    "bucket": "grammar_tone",
    "text": "Your mother is at the fire cooking. In one Igala sentence, ask her whether the soup is ready.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "An everyday question inside the compound, spoken to a close family member. We want the one sentence she would really be asked, not a description of asking her.",
    "family": "questions",
    "rationale": "Pattern 21 (yes-no question particle, single-sourced): elicits a cold native-authored yes/no question in the most ordinary domestic setting, with no hint that any final element is expected, and forms a deliberate minimal pair against the existing declarative ig_lf_gram_014 ('tell someone the food is ready')."
  },
  {
    "promptId": "ig_v42_gram_025",
    "bucket": "grammar_tone",
    "text": "You are travelling to Ankpa and you are no longer sure you are on the right road. In one Igala sentence, ask a man standing by the roadside whether this road goes to Ankpa.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "A short question to a stranger met on the road, in the words a traveller would actually use.",
    "family": "questions",
    "rationale": "Pattern 21 in a stranger-directed context: tests whether the yes/no frame the model produces (the invented 'Aba' opener, both native fixes deleted) holds up outside the family setting."
  },
  {
    "promptId": "ig_v42_gram_026",
    "bucket": "grammar_tone",
    "text": "Your neighbour's bicycle is leaning against his wall. In one Igala sentence, ask him whether you can take it to the market.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "Asking a peer, not an elder. One sentence, as spoken.",
    "family": "questions",
    "rationale": "Pattern 21 in a permission context, addressed to a peer, so the yes/no shape is elicited without the deference layer that would confound it."
  },
  {
    "promptId": "ig_v42_gram_027",
    "bucket": "grammar_tone",
    "text": "A woman from your compound has just come back after three weeks away. In one Igala sentence, ask her whether the children she left at home are well.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "Asking after someone's people on meeting them again. We want the question itself, in the form it is really spoken.",
    "family": "questions",
    "rationale": "Pattern 21 re-elicited in the one context where two native corrections both closed the question with a final particle, but from a fresh speaker and a fresh angle (named children, not the household formula), so it yields an independent datapoint on the open question rather than a repeat of the corrected item."
  },
  {
    "promptId": "ig_v42_gram_028",
    "bucket": "grammar_tone",
    "text": "You have just told a younger cousin how to find your uncle's compound. In one Igala sentence, ask him whether he has understood you.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "A check that someone younger has followed your directions. One spoken sentence.",
    "family": "questions",
    "rationale": "Pattern 21 over a completed event: the comprehension-check context tests whether yes/no marking and the bare completed verb coexist in one utterance."
  },
  {
    "promptId": "ig_v42_gram_029",
    "bucket": "grammar_tone",
    "text": "A boy has sat by himself all afternoon while the other children play. In one Igala sentence, ask him why he is not playing with them.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "A question put gently to a child. One natural spoken sentence, not an explanation about the child.",
    "family": "questions",
    "rationale": "Pattern 23 (wh-question formation calqued): the measured failure built 'why' out of the word for 'because', and no why-question exists anywhere in the 422-prompt bank, so this is the single widest wh gap; it also puts the clause-final negation inside a question."
  },
  {
    "promptId": "ig_v42_gram_030",
    "bucket": "grammar_tone",
    "text": "A mother wants to know whether her young son washed his hands before eating. Write her question in Igala, then write his answer if he did wash them, and his answer if he did not.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "Three short spoken lines: the mother's question, and the boy's two possible replies, each in his own voice.",
    "family": "questions",
    "rationale": "Pattern 21 plus open linguist question 2: no source class in the evidence base attests the plain affirmative and negative replies (the model invented them, including the tomorrow/yesterday word), so the question and the two answers that respond to it are collected in one item."
  },
  {
    "promptId": "ig_v42_gram_031",
    "bucket": "grammar_tone",
    "text": "Your father sent you to the farm to call your sister home. You find her still weeding. In one Igala sentence, tell her that he is asking whether she has finished.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "Passing on someone else's question rather than asking your own. We want the sentence spoken to the sister, not a report of the errand.",
    "family": "questions",
    "rationale": "Pattern 21 under embedding: whether a yes/no question keeps its marking when reported inside another clause is the sharpest available test of whether the marker is syntactic or purely utterance-final, which is what open question 1 has to settle."
  },
  {
    "promptId": "ig_v42_gram_032",
    "bucket": "grammar_tone",
    "text": "You are recording an old man's life story for an Igala Wikipedia article. Write the two Igala questions you would put to him: one to find out what work he did as a young man, and one to find out what year he came to live in this town.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "Two interview questions to an older man, in the words a Wikipedia contributor would really use on a recording.",
    "family": "questions",
    "rationale": "Pattern 23 (wh in situ, no inversion) on the two frames the bank does not already cover - 'what' and a year question - plus the 2026-09-01 call's reported failure on a year and time expression, set in the Wikipedia recording work the contributors actually do."
  },
  {
    "promptId": "ig_v42_reg_017",
    "bucket": "register_honorifics",
    "text": "You have recorded an elder telling his family's history and you want to publish it on Igala Wikipedia. In Igala, ask him respectfully whether he agrees for his words to be put there.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "A consent question to an elder, so the forms of address you would really use to him matter as much as the question itself.",
    "family": "questions",
    "rationale": "Scored on the audit-cut register layer (RE4 vocatives and honorific address, pattern 2), and harvests a yes/no question inside a deference frame as a by-product - register_honorifics is gold-first, so the cold native answer reaches the pattern 21 dataset either way."
  },
  {
    "promptId": "ig_v42_gram_033",
    "bucket": "grammar_tone",
    "text": "Your mother is cooking and the pepper has finished. In one Igala sentence, tell your younger brother to go and buy pepper.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "One instruction covering two actions, said in a single breath rather than as two sentences.",
    "family": "syntax",
    "rationale": "Pattern 12 (~9 rows): the serial chain was missing or its linker swapped for the clause subordinator; v4.1 ships E1 schematically with no example, so this checks the bare frame took."
  },
  {
    "promptId": "ig_v42_gram_034",
    "bucket": "grammar_tone",
    "text": "Rain has started and the stool is still outside in the compound. In one Igala sentence, tell your son to take it and bring it inside.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "Two chained actions over one single object, with the object carried across the chain.",
    "family": "syntax",
    "rationale": "Pattern 12 crossed with pattern 26: a singular object moving through a chain probes both the linker and the take-verb that agrees with object number."
  },
  {
    "promptId": "ig_v42_gram_035",
    "bucket": "grammar_tone",
    "text": "Some young men are helping you dig yams on the farm. In one Igala sentence, tell them to carry the yams and put them under the tree.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "Two chained actions over a plural object, addressed to more than one person.",
    "family": "syntax",
    "rationale": "Pattern 26 (the corrected row 'a du ogwu wewe' used the singular take-verb on a plural object) stacked on the pattern-12 chain, with a plural addressee added."
  },
  {
    "promptId": "ig_v42_gram_036",
    "bucket": "grammar_tone",
    "text": "You are writing the opening line of an Igala Wikipedia article about Idah. In one Igala sentence, say that Idah is a town in Kogi State.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "The plain definition sentence every Wikipedia article opens with.",
    "family": "syntax",
    "rationale": "Pattern 14 (~8 copula rows, one of them the copula produced with no complement) in the exact Wikipedia-lead task the 2026-09-01 community call was reviewing."
  },
  {
    "promptId": "ig_v42_gram_037",
    "bucket": "grammar_tone",
    "text": "A visitor asks after your father. In two short Igala sentences, say that he is a farmer, and that he is at the farm right now.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "Two different senses of 'is' inside one item.",
    "family": "syntax",
    "rationale": "Pattern 14 and pattern 25: the equative-versus-locative copula choice is stated thinly in v4.1, and the failure set shows the equative used where the locative belongs plus the tag-copula closure absent on an occupation predicate."
  },
  {
    "promptId": "ig_v42_gram_038",
    "bucket": "grammar_tone",
    "text": "Your elder brother is travelling to Ankpa tomorrow. In two short Igala sentences, ask him to buy salt for your mother and to bring soap back for you.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "Two 'for someone' phrases in one item: one recipient a named relative, one the speaker.",
    "family": "syntax",
    "rationale": "Pattern 13 (~7 rows written as nwi, nw or nwe): E3 is new in v4.1 and this is the only bank item that puts two recipients of different grammatical shape side by side."
  },
  {
    "promptId": "ig_v42_gram_039",
    "bucket": "grammar_tone",
    "text": "The elders have ruled that nobody may farm the disputed land until the case is settled. In one Igala sentence, tell the young men of your compound not to farm there this season.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "A prohibition addressed to a group, with a time limit on it.",
    "family": "syntax",
    "rationale": "Pattern 11 and the negation line: v4.1 put the prohibitive and the wish frame on one line separated only by the final nasal, so this checks the prohibition still closes correctly after that edit."
  },
  {
    "promptId": "ig_v42_gram_040",
    "bucket": "grammar_tone",
    "text": "Your friend is writing her final school exam tomorrow. In one Igala sentence, tell her you hope she passes.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "An everyday wish, outside the formal blessing genre.",
    "family": "syntax",
    "rationale": "Pattern 22 (~3 rows): the affirmative optative was absent from v3 and entered v4.1 as one appended clause; every other wish prompt in the bank sits in the blessing-shaped authenticity bucket, so nothing tests the frame as syntax."
  },
  {
    "promptId": "ig_v42_gram_041",
    "bucket": "grammar_tone",
    "text": "You reach the riverside late in the afternoon. In one Igala sentence, say that the women who sell fish there have all gone home.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "A plural group of people carrying a describing clause.",
    "family": "syntax",
    "rationale": "Pattern 20 (4 rows of the explicitly banned determiner) plus the plural relativizer, which v4.1 states in half a clause and which no bank prompt reaches - every existing relative-clause item has a singular head."
  },
  {
    "promptId": "ig_v42_gram_042",
    "bucket": "grammar_tone",
    "text": "Your teacher picks up two exercise books and asks whose they are. In one Igala sentence, tell her that one is yours and the other one belongs to your friend.",
    "difficultyLevel": "intermediate",
    "expectedCulturalContext": "Two possessors in one sentence: the speaker and a named other.",
    "family": "syntax",
    "rationale": "Pattern 11 (~10 rows of pronoun cell errors, including the possessive form used as a subject) against the possessor-after-noun order, which no prompt in the 422-item bank tests directly."
  },
  {
    "promptId": "ig_v42_gram_043",
    "bucket": "grammar_tone",
    "text": "A neighbour asks why your compound is so quiet today. In one Igala sentence, say that the children have gone to the farm with their mothers.",
    "difficultyLevel": "basic",
    "expectedCulturalContext": "Two plural groups of people in one short sentence.",
    "family": "syntax",
    "rationale": "Exercises the people-and-animals half of the plural rule, enshrined since v3 and probed by no prompt in the bank."
  },
  {
    "promptId": "ig_v42_gram_044",
    "bucket": "grammar_tone",
    "text": "A visitor who has never been to Kogi State asks what your area looks like. In one Igala sentence, tell her there are many hills and many streams around your village.",
    "difficultyLevel": "advanced",
    "expectedCulturalContext": "Plural landscape features, with no people or animals in the sentence.",
    "family": "syntax",
    "rationale": "The landscape half of the plural rule is stated in v4.1 and probed by nothing in the bank; pattern 26 shows number marking collapses as soon as the model leaves people."
  }
];

export const PROVENANCE = "claude_authored_v42_2026_09_13";

async function main() {
  const owner = await prisma.user.findUnique({
    where: { email: "madihalim@gmail.com" },
    select: { id: true },
  });
  const createdById = owner?.id ?? null;

  const ids = new Set(V42_PROMPTS.map((p) => p.promptId));
  if (ids.size !== V42_PROMPTS.length) {
    throw new Error("duplicate promptId in the bank - refusing to seed");
  }
  const clashes = await prisma.prompt.findMany({
    where: { promptId: { in: [...ids] } },
    select: { promptId: true, provenance: true },
  });
  const foreign = clashes.filter((c) => c.provenance !== PROVENANCE);
  if (foreign.length > 0) {
    throw new Error(
      `promptId namespace collision with rows this script did not write: ${foreign
        .map((c) => c.promptId)
        .join(", ")}`,
    );
  }

  // ── Scope A on the prompt TEXT ──────────────────────────────────────────
  // A prompt is served to the very annotators whose independent answers the
  // frozen benchmark depends on. A prompt that quoted a frozen gold answer
  // would hand them the answer, so the bank is checked against the real
  // protected set before a single row is written, with a spiked negative
  // control so a PASS means "checked", not "checker asleep".
  const frozen = await prisma.prompt.findMany({
    where: { isHoldout: true, language: "igala" },
    select: { id: true, promptId: true },
  });
  const slugOf = new Map(frozen.map((f) => [f.id, f.promptId]));
  const golds = await prisma.coldAuthorAnswer.findMany({
    where: {
      promptId: { in: frozen.map((f) => f.id) },
      isDemo: false,
      consentBenchmark: true,
    },
    select: { promptId: true, answerText: true },
  });
  if (golds.length === 0) {
    throw new Error("protected set is empty - wrong database? refusing to seed");
  }
  const protectedSet = buildProtectedSet(
    golds.map((g) => ({
      promptId: slugOf.get(g.promptId) ?? g.promptId,
      answerText: g.answerText,
    })),
  );
  const spike = checkStatic(
    [{ where: "negative control", text: `x ${golds[0].answerText} y` }],
    protectedSet,
  );
  if (spike.pass) {
    throw new Error(
      "NEGATIVE CONTROL DEAD: a spiked frozen gold was not flagged - refusing to seed",
    );
  }
  const report = checkStatic(
    V42_PROMPTS.map((p) => ({
      where: p.promptId,
      text: `${p.text}\n${p.expectedCulturalContext ?? ""}`,
    })),
    protectedSet,
  );
  if (!report.pass) {
    for (const h of report.hits) {
      console.error(`  [${h.tier}] frozen prompt ${h.promptId} appears in ${h.where}`);
    }
    throw new Error(`SCOPE A: ${report.hitCount} hit(s) - refusing to seed`);
  }
  console.log(
    `Scope A: PASS over ${protectedSet.length} protected strings (negative control live).`,
  );

  let created = 0;
  for (const p of V42_PROMPTS) {
    const before = await prisma.prompt.findUnique({
      where: { promptId: p.promptId },
      select: { promptId: true },
    });
    await prisma.prompt.upsert({
      where: { promptId: p.promptId },
      update: {}, // never mutate an existing row
      create: {
        promptId: p.promptId,
        bucket: p.bucket,
        language: "igala",
        text: p.text,
        targetCulture: "igala",
        expectedCulturalContext: p.expectedCulturalContext,
        difficultyLevel: p.difficultyLevel,
        split: "train",
        isHoldout: false,
        provenance: PROVENANCE,
        createdById,
      },
    });
    if (!before) created++;
  }

  const byFamily: Record<string, number> = {};
  for (const p of V42_PROMPTS) byFamily[p.family] = (byFamily[p.family] ?? 0) + 1;
  console.log(`v4.2 bank: ${V42_PROMPTS.length} prompts, ${created} newly created.`);
  console.log("by family:", byFamily);

  const byBucket = await prisma.prompt.groupBy({
    by: ["bucket"],
    where: { provenance: PROVENANCE },
    _count: true,
  });
  console.log("by bucket:", Object.fromEntries(byBucket.map((b) => [b.bucket, b._count])));
  console.log(
    "\nNEXT: these prompts are NOT servable until BOTH pooled arms have an\n" +
      "output on them - a prompt with one arm can never form a pair.\n" +
      "  npx tsx --env-file=.env.local scripts/train-queue-fill.ts generate \\\n" +
      "    gemini-3-1-pro gemini-3-1-pro-rag-v3 --provenance " +
      PROVENANCE +
      "\n" +
      "then confirm the queue actually serves them:\n" +
      "  npx tsx --env-file=.env.local scripts/check-queue-servable.ts",
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
