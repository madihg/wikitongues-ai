# Prompt bank v4.6: evidence per family (2026-11-13)

This file is generated from `web/src/lib/prompt-bank-v46.ts` and lists, for each of the 26 prompt families, the measured failure it answers and what each prompt isolates. The ranking and the method are in `tasks/model-gap-analysis-2026-11.md`. All counts were read from production on 2026-11-13, read-only. No Igala text from a speaker and no frozen answer is quoted here: the prompts are English and the Igala comes from the speakers.

The bank holds 320 prompts: 200 text prompts and 120 speech prompts. Nothing is seeded until the seed script is run without `--check`.

## Gaps and prompts

| Rank | Gap | Measured size | Prompts |
|---|---|---|---|
| 1 | Sentence construction | 182 of 352 corrected spans (52%) rewrite two or more words; the grammar tag sits on 85 of 484 judged sides (17.6%), more than every other tag together | 48 |
| 2 | Tone marks | tone restoration puts the wrong tone on 1,380 of 5,870 letters (23.5%) and gets 3 of 153 sentences fully right; 7% of train answers are densely toned | 14 |
| 2 | Speech coverage | 63 recorded prompts hold 437 Igala words and 6.5 minutes; 18 clips are under three words, 5 of the 63 texts carry a tone mark, and the texts hold kp 19 times, ny 10, the velar nasal 10 | 120 |
| 3 | Fixed formulas and speech acts | 10 of 23 judged sides on the v4.5 formula prompts are 'both inadequate' (43%); authenticity is the worst bucket at 11 of 50 (22%) | 22 |
| 4 | Spelling and word choice | 121 of 352 corrected spans (34%) change one word, one dot, one nasal letter or one word joint; 61 touch the final nasal, 63 an apostrophe, 38 the word for 'in' | 28 |
| 5 | Word strength and meaning | not measurable today: 0 of 136 correction notes and 0 of 407 judgment notes name word strength (1 names meaning), and no tag exists; the nearest tag (cultural) sits on 40 of 484 sides (8.3%) | 20 |
| 6 | English kept where speakers use Igala, and the reverse | 9 corrected spans replace an English common noun with Igala against 1 the other way; english_mixed is the only tag that rose, from 1 of 944 sides on the plain model to 3 of 169 on v4.5 | 14 |
| 7 | Homographs | no tone pair is marked anywhere in production (0 rows) and no judged prompt isolates one, so the size is unknown | 12 |
| 8 | Numbers | 8 of 11 judgments on the v4.5 money prompts are ties and the recorded texts write numbers as digits 6 times, never as words | 10 |
| 9 | Yoruba and Igbo words | mostly closed: wrong_language, not_igala and invented together sit on 5 of 484 v4.x sides (1.0%) against 75 of 944 (7.9%) on the plain model | 6 |
| 10 | Proper names | 11 of 352 corrected spans (3%) change a capitalised word | 6 |
| 11 | Dialect | 3 of 352 corrected spans are an l or r swap alone; 4 of 28 judged sides on the v4.5 variety prompts are 'both inadequate' and 11 are ties | 6 |
| 12 | Idioms and cultural values, untested on the current model | 7 idiom prompts and 4 cultural prompts have ever been judged with a v4.x answer, against 80 and 61 train prompts in those buckets | 14 |

Speech coverage shares rank 2 with tone marks because every speech prompt is also a fully toned line.

## Text families

### aspec (10 prompts, bucket grammar_tone, gap: Sentence construction)

- **Measured failure.** The v4.5 aspect prompts are the least solved family: 5 of 13 judged sides are 'both inadequate' and 8 of 13 carry a failure tag. Syntax is the lowest rubric axis of v4.5 (4.20, n 25).
- **What the answers teach.** One tense or aspect contrast per prompt, so the speaker's answer differs from the model's by the marker alone.
- **Note shown beside the prompt.** No rule is assumed. The answer shows how you mark that an action is going on, finished, not yet done or habitual.

| Prompt | Level | What it isolates |
|---|---|---|
| ig_v46_aspec_001 | basic | ongoing against finished on one verb. |
| ig_v46_aspec_002 | basic | not yet against soon, same verb. |
| ig_v46_aspec_003 | intermediate | an action finished before another past action. |
| ig_v46_aspec_004 | intermediate | an action that began earlier and still goes on. |
| ig_v46_aspec_005 | intermediate | past habit against its end. |
| ig_v46_aspec_006 | basic | about to against already. |
| ig_v46_aspec_007 | intermediate | an action in progress at a future time. |
| ig_v46_aspec_008 | basic | now, past and future on one verb with a time word. |
| ig_v46_aspec_009 | intermediate | never, as experience. |
| ig_v46_aspec_010 | intermediate | ever, in a question. |

### negq (10 prompts, bucket grammar_tone, gap: Sentence construction)

- **Measured failure.** 6 of 20 judged sides on the v4.5 negation prompts are 'both inadequate' and 10 carry a tag; 61 of 352 corrected spans touch the final nasal.
- **What the answers teach.** Negation and question closing in shapes the bank has not asked: nobody, nothing, neither, never, no longer, and the answer to a negative question.
- **Note shown beside the prompt.** No rule is assumed. The answer shows how you say not, nobody, never and how you close a yes or no question.

| Prompt | Level | What it isolates |
|---|---|---|
| ig_v46_negq_001 | basic | nobody as subject. |
| ig_v46_negq_002 | basic | nothing as object. |
| ig_v46_negq_003 | basic | negated location followed by a plain clause. |
| ig_v46_negq_004 | basic | a yes or no question and its negative twin. |
| ig_v46_negq_005 | intermediate | a prohibition with anyone. |
| ig_v46_negq_006 | intermediate | neither and nor over two subjects. |
| ig_v46_negq_007 | basic | negated focus against a positive one. |
| ig_v46_negq_008 | intermediate | the answer word to a negative question. |
| ig_v46_negq_009 | intermediate | never, as a standing prohibition to several people. |
| ig_v46_negq_010 | intermediate | no longer, and two negated clauses joined. |

### concd (8 prompts, bucket grammar_tone, gap: Sentence construction)

- **Measured failure.** 3 of 19 judged sides on the v4.5 agreement prompts are 'both inadequate' and 4 are losses, the most losses of any family beside tone.
- **What the answers teach.** Number agreement on verbs the earlier pairs did not use: bring, be missing, pour, lie, throw away, come out, hang, and the mass nouns.
- **Note shown beside the prompt.** No rule is assumed. The two lines differ only in one thing against many, so we can see what changes in your sentence.

| Prompt | Level | What it isolates |
|---|---|---|
| ig_v46_concd_001 | basic | bring, one object against many. |
| ig_v46_concd_002 | basic | be missing, one subject against many. |
| ig_v46_concd_003 | intermediate | the second verb after pour, one container against several. |
| ig_v46_concd_004 | basic | lie, one animal against many. |
| ig_v46_concd_005 | basic | throw away, one against many. |
| ig_v46_concd_006 | intermediate | the verbs that go with grass and with sand. |
| ig_v46_concd_007 | basic | come out, one against two. |
| ig_v46_concd_008 | basic | hang, one object against many. |

### order (10 prompts, bucket grammar_tone, gap: Sentence construction)

- **Measured failure.** 115 of 352 corrected spans replace a phrase of two or three words and 67 rewrite four or more; one linguist's note on a v4.4 answer names the position of 'but' after the subject, and another speaker's note is 'Wrong order'.
- **What the answers teach.** Word order inside the noun phrase and the clause: describing words, counted nouns, owner chains, only, also, but, question words, focus.
- **Note shown beside the prompt.** No rule is assumed. The answer shows where you put each word in the sentence.

| Prompt | Level | What it isolates |
|---|---|---|
| ig_v46_order_001 | basic | noun with a number, two describing words and 'those'. |
| ig_v46_order_002 | intermediate | a chain of three owners. |
| ig_v46_order_003 | intermediate | where 'but' sits. |
| ig_v46_order_004 | basic | only, on the subject. |
| ig_v46_order_005 | basic | also, and the place of the time word. |
| ig_v46_order_006 | basic | question word as object and as subject. |
| ig_v46_order_007 | intermediate | focus on the object, with a contrast. |
| ig_v46_order_008 | intermediate | a manner word and a place phrase around the verb. |
| ig_v46_order_009 | intermediate | a time phrase first, two verbs, a place phrase last. |
| ig_v46_order_010 | intermediate | two objects, each with a describing word. |

### chain (10 prompts, bucket grammar_tone, gap: Sentence construction)

- **Measured failure.** Clause rewrites of four or more words are 67 of 352 corrected spans (19%); the v4.5 linker prompts are nearly solved for 'that' and 'who' (2 of 30 sides 'both inadequate'), and no prompt has asked for because, before, after, until, although, unless or than.
- **What the answers teach.** One joining word per prompt: because, before, after, until, although, if not, than, so that, when, unless.
- **Note shown beside the prompt.** No rule is assumed. The answer shows how you join two parts of a sentence.

| Prompt | Level | What it isolates |
|---|---|---|
| ig_v46_chain_001 | basic | because. |
| ig_v46_chain_002 | basic | before. |
| ig_v46_chain_003 | basic | after. |
| ig_v46_chain_004 | basic | until. |
| ig_v46_chain_005 | intermediate | although. |
| ig_v46_chain_006 | intermediate | a negative condition. |
| ig_v46_chain_007 | basic | comparison with than. |
| ig_v46_chain_008 | intermediate | purpose with a negative. |
| ig_v46_chain_009 | intermediate | when, with a past habit. |
| ig_v46_chain_010 | intermediate | unless. |

### tonew (14 prompts, bucket orthography, gap: Tone marks)

- **Measured failure.** The model cannot restore tone: 23.5% of letters wrong, 3 of 153 sentences fully right. It has little to learn from: 123 of 1,758 train answers (7%) mark half their vowels or more. Speakers strip every mark in 60 corrected spans and add marks in 11.
- **What the answers teach.** A short everyday sentence written with every tone mark, so each answer is a fully toned line and two speakers can be compared mark by mark.
- **Note shown beside the prompt.** Write the sentence with its tone marks: the acute mark for a high tone and the grave mark for a low tone. Leave a middle tone bare.

| Prompt | Level | What it isolates |
|---|---|---|
| ig_v46_tonew_001 | basic | a three word sentence, fully toned. |
| ig_v46_tonew_002 | basic | a motion verb and a place, fully toned. |
| ig_v46_tonew_003 | basic | the negative, fully toned. |
| ig_v46_tonew_004 | basic | a question word, fully toned. |
| ig_v46_tonew_005 | basic | a command with two nouns, fully toned. |
| ig_v46_tonew_006 | basic | a past event with a time phrase, fully toned. |
| ig_v46_tonew_007 | basic | a possessive and a place, fully toned. |
| ig_v46_tonew_008 | basic | an object pronoun and a time word, fully toned. |
| ig_v46_tonew_009 | basic | a plural subject and an ongoing action, fully toned. |
| ig_v46_tonew_010 | basic | the future, fully toned. |
| ig_v46_tonew_011 | basic | a degree word, fully toned. |
| ig_v46_tonew_012 | basic | the linking verb, fully toned. |
| ig_v46_tonew_013 | intermediate | the word after 'know' against the word after 'the man', which the linguists say differ in tone alone. |
| ig_v46_tonew_014 | basic | a yes or no question, fully toned. |

### homog (12 prompts, bucket grammar_tone, gap: Homographs)

- **Measured failure.** No tone pair is marked in production (0 rows), so the tone test in the Listen tab has nothing to ask. The rule files hold the pairs (tasks/igala-grammar-deduced.md R8.2, the tone triple in tasks/grammar-evidence-scholarship.md section 2.1) but the bank holds no sentence for them.
- **What the answers teach.** Each member of a look-alike set in a sentence of its own, fully marked, so the mark that carries the meaning is on record.
- **Note shown beside the prompt.** No rule is assumed. Words that look alike are put in sentences that tell them apart. Write every tone mark and every dot.

| Prompt | Level | What it isolates |
|---|---|---|
| ig_v46_homog_001 | intermediate | the look-alike words for canoe and money. |
| ig_v46_homog_002 | advanced | three look-alike words in one sentence. |
| ig_v46_homog_003 | intermediate | one word for moon and month, or two. |
| ig_v46_homog_004 | intermediate | the three verbs the scholars give as one spelling with three tones. |
| ig_v46_homog_005 | intermediate | the many-people verb for sit against the verb for be glad. |
| ig_v46_homog_006 | intermediate | build against refuse. |
| ig_v46_homog_007 | advanced | the speaker's own tone pair. |
| ig_v46_homog_008 | advanced | the speaker's own dot pair. |
| ig_v46_homog_009 | advanced | the speaker's own final nasal pair. |
| ig_v46_homog_010 | intermediate | two more members of the money and canoe set. |
| ig_v46_homog_011 | intermediate | say against shout, which differ in one consonant. |
| ig_v46_homog_012 | intermediate | the word for they beside the word for but. |

### formu (22 prompts, bucket authenticity, gap: Fixed formulas and speech acts)

- **Measured failure.** 10 of 23 judged sides on the v4.5 formula prompts are 'both inadequate' and none is a loss: both versions fail together. Authenticity has the highest 'both inadequate' share of any bucket, 11 of 50.
- **What the answers teach.** One speech act per prompt, in a scene the bank has not used, with who speaks to whom and how many lines.
- **Note shown beside the prompt.** No rule is assumed. Write the words people in your town say at this moment, not a translation of the English.

| Prompt | Level | What it isolates |
|---|---|---|
| ig_v46_formu_001 | basic | greeting someone at work. |
| ig_v46_formu_002 | intermediate | the invitation to a meal and the polite refusal. |
| ig_v46_formu_003 | basic | congratulation on a birth, to the father. |
| ig_v46_formu_004 | basic | sympathy for illness. |
| ig_v46_formu_005 | basic | an apology to an elder for a small hurt. |
| ig_v46_formu_006 | basic | congratulation on success. |
| ig_v46_formu_007 | intermediate | the new year greeting and its reply. |
| ig_v46_formu_008 | basic | asking leave to pass. |
| ig_v46_formu_009 | basic | thanks between equals. |
| ig_v46_formu_010 | intermediate | thanks and dismissal to a group. |
| ig_v46_formu_011 | basic | a wish for success. |
| ig_v46_formu_012 | intermediate | an apology and the reply that waves it away. |
| ig_v46_formu_013 | intermediate | a kind refusal to a seller. |
| ig_v46_formu_014 | intermediate | greeting after a long absence. |
| ig_v46_formu_015 | basic | parting until tomorrow. |
| ig_v46_formu_016 | basic | praise to a child. |
| ig_v46_formu_017 | intermediate | sympathy for a loss that is not a death. |
| ig_v46_formu_018 | intermediate | the reply to advice. |
| ig_v46_formu_019 | basic | greeting a seated group, with a word for lateness. |
| ig_v46_formu_020 | intermediate | greeting several people who are carrying loads. |
| ig_v46_formu_021 | intermediate | sending greetings through someone. |
| ig_v46_formu_022 | basic | the answer to one's name. |

### spell (12 prompts, bucket orthography, gap: Spelling and word choice)

- **Measured failure.** 38 of 352 corrected spans touch the word for 'in', 61 the final nasal and 63 an apostrophe at a word joint; 21 change only a dot or the nasal letter. Speakers disagree with each other on the dots, so the count per speaker is the data.
- **What the answers teach.** The dotted vowels, the final nasal and the word joints in sentences built to contain them.
- **Note shown beside the prompt.** No rule is assumed. Write the sentence as you spell it, with every dot under e and o where you say one.

| Prompt | Level | What it isolates |
|---|---|---|
| ig_v46_spell_001 | basic | the word for 'in' before a town. |
| ig_v46_spell_002 | basic | the word for 'inside' before a common noun. |
| ig_v46_spell_003 | basic | the final nasal after a short clause. |
| ig_v46_spell_004 | intermediate | the joints of a four word sentence, contracted and in full. |
| ig_v46_spell_005 | basic | the final nasal in a statement and in a question. |
| ig_v46_spell_006 | basic | the word for something, which is spelled two ways. |
| ig_v46_spell_007 | basic | the word for what. |
| ig_v46_spell_008 | intermediate | the ending for his and for mine. |
| ig_v46_spell_009 | basic | an owner phrase and the word for 'in'. |
| ig_v46_spell_010 | intermediate | the short subject word before three verbs. |
| ig_v46_spell_011 | intermediate | two verbs in a row and a clause after 'see'. |
| ig_v46_spell_012 | intermediate | the final nasal next to an owner word. |

### lexi (16 prompts, bucket lexicon_disambig, gap: Spelling and word choice)

- **Measured failure.** 90 of 352 corrected spans replace exactly one word (41 near spellings, 49 different words); 4 of 18 judged sides on the v4.5 word prompts are 'both inadequate'. The words corrected since October are household ones.
- **What the answers teach.** Everyday nouns and verbs of the house, the body, the farm and the weather, one or two per sentence.
- **Note shown beside the prompt.** There is no reference answer for this question. Write the everyday word your town uses.

| Prompt | Level | What it isolates |
|---|---|---|
| ig_v46_lexi_001 | basic | generator, fuel, light. |
| ig_v46_lexi_002 | basic | grandfather, sleep, wake. |
| ig_v46_lexi_003 | basic | stream, school, dry up. |
| ig_v46_lexi_004 | basic | basin, well, carry on the head. |
| ig_v46_lexi_005 | basic | tooth, ache, fever as people say it. |
| ig_v46_lexi_006 | basic | thunder, frighten. |
| ig_v46_lexi_007 | basic | cutlass, sharpen. |
| ig_v46_lexi_008 | basic | roof, leak. |
| ig_v46_lexi_009 | basic | pound, mortar. |
| ig_v46_lexi_010 | basic | lamp, light as a verb, dark. |
| ig_v46_lexi_011 | basic | measure, arm, neck. |
| ig_v46_lexi_012 | intermediate | borrow, ladder. |
| ig_v46_lexi_013 | intermediate | lend against borrow, give back. |
| ig_v46_lexi_014 | basic | smell, spoiled. |
| ig_v46_lexi_015 | basic | crawl, learn. |
| ig_v46_lexi_016 | basic | forget, key. |

### inten (20 prompts, bucket register_honorifics, gap: Word strength and meaning)

- **Measured failure.** Speakers said on the Nov 10 call that the model's words are too strong or too weak for the sentence. The data cannot size it: no tag, and 0 of 543 notes name it. These ladders make it countable.
- **What the answers teach.** The same message at two or three strengths with the addressee held fixed, so the strength word is the only thing that changes.
- **Note shown beside the prompt.** No rule is assumed. The lines say the same thing at different strengths. Write each as you would really say it.

| Prompt | Level | What it isolates |
|---|---|---|
| ig_v46_inten_001 | basic | tiredness at three strengths. |
| ig_v46_inten_002 | intermediate | a scolding at three strengths. |
| ig_v46_inten_003 | basic | hunger at three strengths. |
| ig_v46_inten_004 | basic | dislike at three strengths. |
| ig_v46_inten_005 | intermediate | a request at three strengths, addressee fixed. |
| ig_v46_inten_006 | basic | heat at three strengths. |
| ig_v46_inten_007 | basic | pain at three strengths. |
| ig_v46_inten_008 | basic | praise at three strengths. |
| ig_v46_inten_009 | intermediate | fear at three strengths. |
| ig_v46_inten_010 | intermediate | refusal at three strengths. |
| ig_v46_inten_011 | basic | joy at three strengths. |
| ig_v46_inten_012 | basic | size at three strengths. |
| ig_v46_inten_013 | basic | urgency at three strengths. |
| ig_v46_inten_014 | intermediate | certainty at three strengths. |
| ig_v46_inten_015 | advanced | blame between friends at three strengths. |
| ig_v46_inten_016 | advanced | one request pitched at the right weight for an adult speaking to an elder. |
| ig_v46_inten_017 | basic | thanks at three strengths. |
| ig_v46_inten_018 | advanced | disagreement, fitting and too strong. |
| ig_v46_inten_019 | basic | rain at three strengths. |
| ig_v46_inten_020 | advanced | one fact in a respectful word and in a blunt one. |

### engl (14 prompts, bucket lexicon_disambig, gap: English kept where speakers use Igala, and the reverse)

- **Measured failure.** 9 corrected spans replace an English common noun with Igala and 1 goes the other way; 12 of 14 judgments on the v4.5 loan prompts are ties, so those prompts taught no rule. Speakers have said that school subjects and institution names stay in English.
- **What the answers teach.** Which words stay English, counted per word class: school subjects, institutions, devices, illnesses, months and days, offices.
- **Note shown beside the prompt.** There is no fixed rule. Some speakers keep the English word, some respell it with Igala letters, some use an Igala word. Write what you say.

| Prompt | Level | What it isolates |
|---|---|---|
| ig_v46_engl_001 | intermediate | a school subject and a university name. |
| ig_v46_engl_002 | intermediate | a subject with no everyday Igala word, and an institution. |
| ig_v46_engl_003 | basic | a medical device beside an everyday body word. |
| ig_v46_engl_004 | basic | an app name and a common loan noun. |
| ig_v46_engl_005 | basic | a day name, a month name and an ordinal. |
| ig_v46_engl_006 | intermediate | a national scheme and a month. |
| ig_v46_engl_007 | basic | three everyday loan nouns. |
| ig_v46_engl_008 | intermediate | an office and an institution. |
| ig_v46_engl_009 | basic | device names. |
| ig_v46_engl_010 | intermediate | a profession with no Igala word beside one with an Igala word. |
| ig_v46_engl_011 | basic | illness names. |
| ig_v46_engl_012 | intermediate | civic terms and a month. |
| ig_v46_engl_013 | basic | church terms. |
| ig_v46_engl_014 | basic | sport terms with numbers. |

### neigh (6 prompts, bucket lexicon_disambig, gap: Yoruba and Igbo words)

- **Measured failure.** The wrong-language tags are down to 5 of 484 v4.x sides, so this is a guard, not a gap: a few everyday words (water bodies, the market, asking a favour, peace) still surface as single-word corrections.
- **What the answers teach.** A small probe on the everyday words where a Yoruba or Igbo word is closest.
- **Note shown beside the prompt.** There is no reference answer for this question. Write the Igala words, not the words of a neighbouring language.

| Prompt | Level | What it isolates |
|---|---|---|
| ig_v46_neigh_001 | basic | market, river, buy. |
| ig_v46_neigh_002 | basic | peace, household. |
| ig_v46_neigh_003 | intermediate | the word for asking a favour. |
| ig_v46_neigh_004 | basic | work, finish, thanks to God. |
| ig_v46_neigh_005 | basic | king, messenger, news. |
| ig_v46_neigh_006 | basic | kin terms and a trade. |

### names (6 prompts, bucket orthography, gap: Proper names)

- **Measured failure.** 11 of 352 corrected spans change a capitalised word: a personal name given dots, a name swapped, an institution reordered.
- **What the answers teach.** Personal names, towns, rivers, schools and states inside an Igala sentence.
- **Note shown beside the prompt.** No rule is assumed. Spell each name as its owner or the signboard spells it.

| Prompt | Level | What it isolates |
|---|---|---|
| ig_v46_names_001 | intermediate | English and Igala personal names and a church name. |
| ig_v46_names_002 | intermediate | three towns, two of them outside Igala land. |
| ig_v46_names_003 | basic | a surname with a title, and a school name. |
| ig_v46_names_004 | basic | a river name and two towns. |
| ig_v46_names_005 | basic | three names of different origin and a street name. |
| ig_v46_names_006 | basic | four state names. |

### vari (6 prompts, bucket dialectal_fidelity, gap: Dialect)

- **Measured failure.** 11 of 22 judgments on the v4.5 variety prompts are ties and 4 of 28 sides 'both inadequate'. The dialect field is filled on 60 to 85% of the two most active speakers' answers, so a line tied to a named town is usable.
- **What the answers teach.** One short everyday line per prompt, tied to the speaker's named town.
- **Note shown beside the prompt.** No rule is assumed. Name your town first, then write the line as your town says it.

| Prompt | Level | What it isolates |
|---|---|---|
| ig_v46_vari_001 | basic | the what question and the word for there. |
| ig_v46_vari_002 | basic | here against there. |
| ig_v46_vari_003 | basic | the let us form. |
| ig_v46_vari_004 | basic | understand, and slowly. |
| ig_v46_vari_005 | basic | whose. |
| ig_v46_vari_006 | basic | sit for one person, and rest. |

### numb (10 prompts, bucket grammar_tone, gap: Numbers)

- **Measured failure.** 8 of 11 judgments on the v4.5 money prompts are ties, and two speakers corrected the same composed number on a v4.5 answer. The earlier prompts cover prices and 11 to 20; nothing covers dates, clock time, ordinals or sharing out.
- **What the answers teach.** Numbers in the uses the bank lacks: counts above twenty, dates, clock time, ordinals, sharing out, the year.
- **Note shown beside the prompt.** No rule is assumed. Write every number as a word, not as a figure.

| Prompt | Level | What it isolates |
|---|---|---|
| ig_v46_numb_001 | basic | a count between twenty and thirty. |
| ig_v46_numb_002 | intermediate | a date as an ordinal. |
| ig_v46_numb_003 | basic | one number with two nouns. |
| ig_v46_numb_004 | intermediate | thirty plus a unit. |
| ig_v46_numb_005 | intermediate | sharing out, with 'each'. |
| ig_v46_numb_006 | intermediate | clock time with a half. |
| ig_v46_numb_007 | intermediate | two ordinals. |
| ig_v46_numb_008 | intermediate | sixty and a teen in one sentence. |
| ig_v46_numb_009 | advanced | the year said aloud. |
| ig_v46_numb_010 | intermediate | a hundred plus a unit. |

### idiom (8 prompts, bucket idioms_metaphor, gap: Idioms and cultural values, untested on the current model)

- **Measured failure.** Only 7 idiom prompts have been judged with a v4.x answer (20 sides, 4 'both inadequate'), against 80 train prompts in the bucket.
- **What the answers teach.** A saying called up by a concrete situation, one line, with its meaning in one English line.
- **Note shown beside the prompt.** There is no reference answer for this question. Give the saying your town uses, and say so if your town has none for this.

| Prompt | Level | What it isolates |
|---|---|---|
| ig_v46_idiom_001 | intermediate | a saying on needing others. |
| ig_v46_idiom_002 | intermediate | a saying on blaming others. |
| ig_v46_idiom_003 | intermediate | a saying on doing things in their order. |
| ig_v46_idiom_004 | intermediate | a saying on cheating a partner. |
| ig_v46_idiom_005 | intermediate | a saying on outstaying a welcome. |
| ig_v46_idiom_006 | basic | a saying of praise. |
| ig_v46_idiom_007 | intermediate | a saying on waiting for the right time. |
| ig_v46_idiom_008 | intermediate | a body-part idiom, which a word-for-word reading gets wrong. |

### cult (6 prompts, bucket cultural_values, gap: Idioms and cultural values, untested on the current model)

- **Measured failure.** Only 4 cultural prompts have been judged with a v4.x answer (16 sides), against 61 train prompts in the bucket.
- **What the answers teach.** One custom per prompt, answered for the speaker's own town in at most two sentences.
- **Note shown beside the prompt.** There is no reference answer for this question. Answer for your own town, and say so if your town has no such custom.

| Prompt | Level | What it isolates |
|---|---|---|
| ig_v46_cult_001 | intermediate | a rule of respect, with its reason. |
| ig_v46_cult_002 | intermediate | a custom that may or may not hold, with room to deny it. |
| ig_v46_cult_003 | intermediate | the first marriage visit. |
| ig_v46_cult_004 | intermediate | an installation day. |
| ig_v46_cult_005 | basic | order of serving. |
| ig_v46_cult_006 | intermediate | how a death is announced. |

## Speech families

### spnum (20 prompts, bucket grammar_tone, gap: Speech coverage)

- **Measured failure.** The 72 recorded texts write numbers as digits 6 times and never as words. The number words are the best verified toned forms the project holds and cover high, mid and low tone on six of the seven vowels.
- **What the answers teach.** A number word in a three to eight word sentence.
- **Note shown beside the prompt.** Write the sentence with every tone mark and every number as a word, then record it. The English to record is the sentence in quotes.

| Prompt | English to record | Expected sound cells |
|---|---|---|
| ig_v46_spnum_001 | I have one brown dog at home. | H-o, L-a, H-a, pal |
| ig_v46_spnum_002 | She bought two fat hens at Ejule. | L-e, L-i, j, L-a |
| ig_v46_spnum_003 | Three tall men came to our gate. | L-ed, M-a |
| ig_v46_spnum_004 | The goat hurt one of its four legs. | L-ed |
| ig_v46_spnum_005 | He counted five big yams in the barn. | L-ed, H-u |
| ig_v46_spnum_006 | Six eggs are lying under the hen. | L-ed, L-a, f |
| ig_v46_spnum_007 | One week has seven days and seven nights. | L-e, M-e, pal |
| ig_v46_spnum_008 | Eight women are singing in the square. | L-ed, M-od, j |
| ig_v46_spnum_009 | Nine small birds flew over the river. | L-ed, H-a |
| ig_v46_spnum_010 | Ten children are playing in the sand. | L-ed, H-a, gw |
| ig_v46_spnum_011 | Eleven thatched houses burned last night. | L-ed, H-a, L-a, gw |
| ig_v46_spnum_012 | She is twelve years old this month. | L-ed, H-e, L-i, gw, j |
| ig_v46_spnum_013 | Fifteen people are waiting for the bus. | L-ed, H-ed, M-u, gw |
| ig_v46_spnum_014 | Nineteen goats were sold at Ankpa market. | L-ed, H-ed, M-a, gw |
| ig_v46_spnum_015 | There are twenty ripe mangoes in the basket. | H-o, H-u, gw |
| ig_v46_spnum_016 | My brother turned twenty-one last week. | H-o, H-u, H-od, M-e, ny, gw |
| ig_v46_spnum_017 | Thirty soldiers passed through the town. | H-o, H-ed, M-a, gw |
| ig_v46_spnum_018 | Forty days have gone since the funeral. | L-od, H-ed, L-i, gb, j |
| ig_v46_spnum_019 | The old chief is seventy this year. | L-ed, H-a, gw |
| ig_v46_spnum_020 | One hundred people ate at the wedding. | H-o, H-u, H-ed, M-u, gw |

### spcar (30 prompts, bucket orthography, gap: Speech coverage)

- **Measured failure.** The recorded texts hold kp 19 times, ny 10, the velar nasal 10, kw 9 and p 3 in 733 words. Each sentence here is built on words whose toned forms are published.
- **What the answers teach.** A three to eight word sentence around words with a known tone pattern and a target consonant.
- **Note shown beside the prompt.** Write the sentence with every tone mark, then record it. The English to record is the sentence in quotes.

| Prompt | English to record | Expected sound cells |
|---|---|---|
| ig_v46_spcar_001 | The thirsty dog drank water from the pot. | H-a, pal, H-o, M-i |
| ig_v46_spcar_002 | The tortoise is hiding under the tall grass. | H-a, H-ed, M-e, j, H-e, gb |
| ig_v46_spcar_003 | A clever bat bought a ripe banana. | L-o, L-u, L-e, L-a |
| ig_v46_spcar_004 | Somebody dropped sand into my soup. | H-ed, L-ed, H-o |
| ig_v46_spcar_005 | The jar of honey is here on the shelf. | H-i, H-o, velar-nasal, L-e |
| ig_v46_spcar_006 | Morning dew wets the grass by the path. | H-i, M-ed, pal, H-e, gb |
| ig_v46_spcar_007 | Jealousy between brothers is not good. | L-u, H-ed, M-a, pal, final-nasal |
| ig_v46_spcar_008 | This medicine is bitter, but it heals. | H-od, L-u, gw |
| ig_v46_spcar_009 | A hungry dog found a bone behind the kitchen. | H-a, H-i, L-u, ch, pal |
| ig_v46_spcar_010 | Wash this cloth for me before evening. | L-e, gw, H-u, L-o, kp |
| ig_v46_spcar_011 | Pour all the dirty water away. | L-a, H-o, M-i |
| ig_v46_spcar_012 | Scoop some sand into the bucket for the builder. | L-a, H-ed, L-ed |
| ig_v46_spcar_013 | Go and fetch water from the stream. | H-a, gb, H-o, M-e, ch |
| ig_v46_spcar_014 | The labourer is clearing grass around the school. | H-o, gw, H-e, gb |
| ig_v46_spcar_015 | The barber will cut the child's hair tomorrow. | H-a, j |
| ig_v46_spcar_016 | She arranged the yams neatly on the ground. | H-e, H-a, L-ed |
| ig_v46_spcar_017 | Pour drinking water into one bottle only. | H-u, ny, L-u, H-o, L-o, j |
| ig_v46_spcar_018 | The chief's pot is made of brass. | L-u, L-a, ch, H-a |
| ig_v46_spcar_019 | The scent of honey fills the room. | L-u, kw, H-i, H-od |
| ig_v46_spcar_020 | He forgot his cap at the mosque. | H-e, gb, L-od, ny |
| ig_v46_spcar_021 | My one silver coin is lost. | H-o, kp, H-i, L-od, ny |
| ig_v46_spcar_022 | All the trader's coins went missing on the road. | H-o, kp, r, H-i, L-od, ny |
| ig_v46_spcar_023 | Throw that bad egg far away. | M-u, H-i, L-od, ny |
| ig_v46_spcar_024 | A hornbill is calling from the iroko tree. | H-a, H-ed, p, pal, falling |
| ig_v46_spcar_025 | Come and sit here beside me. | L-u, H-u, gw, L-e, H-i |
| ig_v46_spcar_026 | The visitors all sat on the bare ground. | M-od, j, H-a, L-ed |
| ig_v46_spcar_027 | I can see the child from my window. | M-i |
| ig_v46_spcar_028 | Twenty and ten make thirty. | H-o, H-u, L-ed, H-a, gw, downstep |
| ig_v46_spcar_029 | Bring the child something to eat. | nw, M-u |
| ig_v46_spcar_030 | In the old story the tortoise killed the leopard. | H-a, H-ed, M-e, j, kp |

### sppair (16 prompts, bucket grammar_tone, gap: Speech coverage)

- **Measured failure.** No tone pair exists in production (0 rows), so the Listen tab cannot ask 'which word did you hear'. Each member of a pair needs a clip of its own.
- **What the answers teach.** One member of a tone or consonant pair per clip, in a sentence that fixes its meaning.
- **Note shown beside the prompt.** Write the sentence with every tone mark, then record it. If the English is in quotes, that is the English to record.

| Prompt | English to record | Expected sound cells |
|---|---|---|
| ig_v46_sppair_001 | Close the door of the room. | H-ed, r, pair:close-pick-drum |
| ig_v46_sppair_002 | Pick the ripe mango. | M-e, r, pair:close-pick-drum |
| ig_v46_sppair_003 | He makes drums for the chief. | L-e, r, pair:close-pick-drum |
| ig_v46_sppair_004 | The elders sat down together. | M-od, j, pair:sit-rejoice |
| ig_v46_sppair_005 | The elders rejoiced together. | L-od, j, pair:sit-rejoice |
| ig_v46_sppair_006 | She said my name. | M-a, pair:say-shout |
| ig_v46_sppair_007 | She shouted my name. | kw, pair:say-shout |
| ig_v46_sppair_008 | I know that Ladi came. | H-i, pair:that-who |
| ig_v46_sppair_009 | I know the man who came. | L-i, pair:that-who |
| ig_v46_sppair_010 | the speaker's own sentence and her own translation | pair:own-1 |
| ig_v46_sppair_011 | the speaker's own sentence and her own translation | pair:own-2 |
| ig_v46_sppair_012 | the speaker's own sentence and her own translation | pair:own-3 |
| ig_v46_sppair_013 | the speaker's own sentence and her own translation | pair:own-4 |
| ig_v46_sppair_014 | the speaker's own sentence and her own translation | pair:own-5 |
| ig_v46_sppair_015 | the speaker's own sentence and her own translation | pair:own-dot, ed, od |
| ig_v46_sppair_016 | the speaker's own sentence and her own translation | pair:own-nasal, final-nasal |

### spdig (14 prompts, bucket orthography, gap: Speech coverage)

- **Measured failure.** The two-letter sounds and the nasals are the thinnest cells in the 733 recorded words (kp 19, ny 10, the velar nasal 10, kw 9, p 3), and we hold too few verified words to write a sentence for each.
- **What the answers teach.** The speaker's own sentence with a named sound at least twice.
- **Note shown beside the prompt.** Make your own sentence, write it with every tone mark, then record it. For the English, say the same thing in the same few words.

| Prompt | English to record | Expected sound cells |
|---|---|---|
| ig_v46_spdig_001 | the speaker's own sentence and her own translation | kp |
| ig_v46_spdig_002 | the speaker's own sentence and her own translation | gb |
| ig_v46_spdig_003 | the speaker's own sentence and her own translation | ny |
| ig_v46_spdig_004 | the speaker's own sentence and her own translation | velar-nasal |
| ig_v46_spdig_005 | the speaker's own sentence and her own translation | nw |
| ig_v46_spdig_006 | the speaker's own sentence and her own translation | gw |
| ig_v46_spdig_007 | the speaker's own sentence and her own translation | kw |
| ig_v46_spdig_008 | the speaker's own sentence and her own translation | ch |
| ig_v46_spdig_009 | the speaker's own sentence and her own translation | j |
| ig_v46_spdig_010 | the speaker's own sentence and her own translation | pal |
| ig_v46_spdig_011 | the speaker's own sentence and her own translation | r |
| ig_v46_spdig_012 | the speaker's own sentence and her own translation | f, h |
| ig_v46_spdig_013 | the speaker's own sentence and her own translation | p |
| ig_v46_spdig_014 | the speaker's own sentence and her own translation | final-nasal |

### spvow (7 prompts, bucket orthography, gap: Speech coverage)

- **Measured failure.** The verified words reach 20 of the 21 tone and vowel cells; a mid tone on plain o is missing, and every cell is thin.
- **What the answers teach.** The speaker's own sentence built around one vowel.
- **Note shown beside the prompt.** Make your own sentence, write it with every tone mark, then record it. For the English, say the same thing in the same few words.

| Prompt | English to record | Expected sound cells |
|---|---|---|
| ig_v46_spvow_001 | the speaker's own sentence and her own translation | H-a, M-a, L-a |
| ig_v46_spvow_002 | the speaker's own sentence and her own translation | H-e, M-e, L-e |
| ig_v46_spvow_003 | the speaker's own sentence and her own translation | H-ed, M-ed, L-ed |
| ig_v46_spvow_004 | the speaker's own sentence and her own translation | H-i, M-i, L-i |
| ig_v46_spvow_005 | the speaker's own sentence and her own translation | H-o, M-o, L-o |
| ig_v46_spvow_006 | the speaker's own sentence and her own translation | H-od, M-od, L-od |
| ig_v46_spvow_007 | the speaker's own sentence and her own translation | H-u, M-u, L-u |

### spname (10 prompts, bucket orthography, gap: Speech coverage)

- **Measured failure.** Names of people and towns are the words a voice model reads most often and has heard least; the 63 prompts recorded so far all come from three buckets (grammar, word choice, spelling).
- **What the answers teach.** Igala personal names and town names in a short sentence.
- **Note shown beside the prompt.** Write the sentence with every tone mark, names included, then record it. The English to record is the sentence in quotes.

| Prompt | English to record | Expected sound cells |
|---|---|---|
| ig_v46_spname_001 | Ojochide and Ilemona are going to Idah. | name, town |
| ig_v46_spname_002 | Unekwuojo lives in Anyigba. | name, town, kw, ny |
| ig_v46_spname_003 | Ocholi came from Ankpa yesterday. | name, town, ch, kp |
| ig_v46_spname_004 | Achenyo and Ojoma sell cloth in Dekina. | name, town, ch, ny |
| ig_v46_spname_005 | Omachonu is the head of our village. | name, ch |
| ig_v46_spname_006 | The king lives in the palace at Idah. | town |
| ig_v46_spname_007 | Ugbede crossed the river at Ibaji. | name, town, gb, j |
| ig_v46_spname_008 | Ojonugwa, Eleojo and Enemona are sisters. | name, gw, j |
| ig_v46_spname_009 | Idoko built a house in Ejule. | name, town, j |
| ig_v46_spname_010 | Akoji and Ameh are farmers from Ogugu. | name, town, j |

### speng (10 prompts, bucket lexicon_disambig, gap: Speech coverage)

- **Measured failure.** Speakers keep some English words inside Igala speech and say them with Igala intonation; none of the 63 prompts recorded so far was chosen to hold one.
- **What the answers teach.** An English term inside an Igala sentence, said as the speaker says it.
- **Note shown beside the prompt.** There is no fixed rule on which words stay English. Write and record the sentence as you say it. The English to record is the sentence in quotes.

| Prompt | English to record | Expected sound cells |
|---|---|---|
| ig_v46_speng_001 | The new teacher wrote the date on the blackboard. | english-term |
| ig_v46_speng_002 | Charge my phone, the battery is low. | english-term |
| ig_v46_speng_003 | She is studying biology at the university. | english-term |
| ig_v46_speng_004 | The bus to Abuja leaves at six o'clock. | english-term, town |
| ig_v46_speng_005 | I heard the news on the radio this morning. | english-term |
| ig_v46_speng_006 | The nurse gave the child an injection. | english-term |
| ig_v46_speng_007 | Turn off the television and go to sleep. | english-term |
| ig_v46_speng_008 | Send the money to my bank account. | english-term |
| ig_v46_speng_009 | Our church choir has a new keyboard. | english-term |
| ig_v46_speng_010 | He is reading philosophy in Lokoja. | english-term, town |

### splong (13 prompts, bucket grammar_tone, gap: Speech coverage)

- **Measured failure.** 18 of 63 recorded clips are under three words, the floor for the voice script, and 3 run over twenty. The set needs connected speech at the upper bound.
- **What the answers teach.** A sentence of twelve to twenty Igala words with two or three clauses.
- **Note shown beside the prompt.** Write the sentence with every tone mark, then record it in one breath group per clause. The English to record is the sentence in quotes.

| Prompt | English to record | Expected sound cells |
|---|---|---|
| ig_v46_splong_001 | When the rain stopped, the children ran out to play in the water behind the house. | connected |
| ig_v46_splong_002 | My mother went to the market early, bought fish and pepper, and came back before noon. | connected |
| ig_v46_splong_003 | The old man sat under the tree and told the children a story about the tortoise and the dog. | connected, H-a, pal |
| ig_v46_splong_004 | If you see my brother on the road, tell him that our father is looking for him. | connected, H-i |
| ig_v46_splong_005 | We planted maize and beans this year because the rain came early and the soil was soft. | connected |
| ig_v46_splong_006 | The woman who sells oil at the market gave me this bottle and said I should pay tomorrow. | connected, L-i, M-a |
| ig_v46_splong_007 | Before the sun rose, the hunters had already crossed the river and entered the forest. | connected |
| ig_v46_splong_008 | The child was hungry, so his sister cooked rice, and they ate together and slept. | connected |
| ig_v46_splong_009 | Take this letter to the chief, greet him for me, and wait there until he answers. | connected, M-u |
| ig_v46_splong_010 | Yesterday the wind blew the roof off our kitchen, and today the men are mending it. | connected |
| ig_v46_splong_011 | She does not eat meat, but she likes fish, eggs and every kind of soup. | connected, final-nasal, H-o |
| ig_v46_splong_012 | The teacher asked who had broken the window, and nobody in the class said a word. | connected, final-nasal, M-a |
| ig_v46_splong_013 | I am going to the farm now, and when I come back this evening we will greet your uncle. | connected |

## Speech set: expected coverage

120 prompts, 240 clips (one Igala, one English each), about 15.1 minutes of Igala and 30.2 minutes in all. The minutes are estimated from the measured pace of 0.9 seconds a word.

Prompts that target each tone on each vowel (expected from published word forms, not yet heard):

| Tone | a | e | dotted e | i | o | dotted o | u |
|---|---|---|---|---|---|---|---|
| high | 18 | 7 | 13 | 11 | 17 | 4 | 9 |
| mid | 8 | 7 | 2 | 4 | 1 | 4 | 6 |
| low | 9 | 8 | 18 | 6 | 4 | 7 | 9 |

Prompts that target each consonant cell: kp 6, gb 8, ny 9, gw 17, kw 4, ch 7, j 16, pal 9, r 5, f 2, h 1, p 2, velar-nasal 2, nw 2, final-nasal 5. Here pal is a palatalized consonant (a consonant written with i before another vowel).

The thinnest cells are mid tone on plain o (1 prompt), mid tone on dotted e (2), h (1), p (2), the velar nasal (2) and nw (2). The open prompts in families spdig and spvow exist to fill them with the speaker's own words, because the project holds too few verified words to write a sentence for each.

## Sources of the word forms

- Numbers: Omachonu 2012, as recorded in `tasks/grammar-evidence-scholarship.md` section 3.
- Tone and the three-tone verb set: Adeniyi 2017, same file, section 2.
- Agreement verbs and mass nouns: Ejeba 2023, same file, section 1, and `tasks/jwal-ejeba-2023-rule-inventory.md`.
- The say and shout pair and the syllable rules: `tasks/salem-lydia-writeup-2026-09-25-inventory.md` rows W-1-16 to W-1-20.
- Look-alike word sets: `tasks/igala-grammar-deduced.md` R8.2.

The forms stay in those files. This bank quotes none of them, so a prompt cannot hand a speaker the answer.

## Guards the seed runs before writing

1. promptId namespace `ig_v46_<family>_NNN`, unique, no collision with rows the script did not write.
2. Text length 25 to 420 characters, no dash.
3. Near-duplicates by Jaccard over content words: 0.55 against every existing train prompt and inside the bank, 0.45 against the 43 frozen prompts. On 2026-11-13 the maxima were 0.48 against train, 0.36 against frozen and 0.47 inside the bank, over 697 existing prompts. The members of a declared minimal pair are exempt from the inside check only.
4. Scope A: the prompt text and the note are checked against the 139 protected frozen strings, with a spiked negative control. The first run caught one word (a royal title) in two prompts; both were reworded and the check passes.
5. `--check` runs all of the above and writes nothing.
