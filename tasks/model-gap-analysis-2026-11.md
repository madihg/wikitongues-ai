# What the Igala model still gets wrong (2026-11-13)

The current model is Gemini 3.1 Pro with the Igala retrieval prompt, versions 4.4 and 4.5. This file sizes its remaining errors on production data, ranks them, and says what kind of prompt closes each one. Prompt bank v4.6 (`web/src/lib/prompt-bank-v46.ts`) is built from this ranking. The evidence per prompt family is in `tasks/prompt-bank-v46-evidence-2026-11.md`.

Every figure is marked **measured** (counted on production data on 2026-11-13, read-only) or **estimated**. No Igala text from a speaker and no frozen answer is quoted in this file.

## The answer in one table

| Rank | Gap | Size (measured unless marked) | What closes it |
|---|---|---|---|
| 1 | Sentence construction | 182 of 352 corrected spans (52%) rewrite two or more words. The grammar tag is on 85 of 484 judged sides (17.6%), more than all other tags together. | Short English to Igala translations with one construction each, in pairs where one thing changes. 48 prompts. |
| 2 | Tone marks | Tone restoration puts the wrong tone on 1,380 of 5,870 letters (23.5%) and gets 3 of 153 sentences fully right. 123 of 1,758 train answers (7%) are densely toned. | Short sentences written with every tone mark, text and speech together. 14 text prompts and the 120 speech prompts. |
| 3 | Fixed formulas | 10 of 23 judged sides on the v4.5 formula prompts are "both inadequate" (43%), with no losses: both versions fail together. | One speech act per prompt in a fixed scene. 22 prompts. |
| 4 | Spelling and word choice | 121 of 352 corrected spans (34%) change one word, one dot, one nasal letter or one word joint. | Sentences built to contain the dotted vowels, the final nasal and everyday household words. 28 prompts. |
| 5 | Word strength | Not measurable today. 0 of 543 notes name it and no tag exists. Raised by speakers on the Nov 10 call. | Ladders: the same message at three strengths to one addressee. 20 prompts. Plus a new tag. |

Then, in order: English kept inside Igala sentences (rank 6), homographs (7), numbers (8), Yoruba and Igbo words (9, nearly closed), proper names (10), dialect (11), and two buckets the current model has hardly been judged on (12).

## 1. The evidence base

All counts come from the production database (Supabase project `smytgqkgomsfyurskpcl`, schema `wikitongues`), queried read-only on 2026-11-13. Demo rows are excluded everywhere. **Measured.**

| What | Count | Since Oct 9 |
|---|---|---|
| Pairwise judgments | 2,183 | 490 |
| Speaker corrections of a model answer | 463 | 245 |
| Speaker-authored answers | 1,996 (1,758 on train prompts) | 312 |
| Rubric axis scores | 1,862 | |
| Prompt flags | 39 | 27 (all skips) |
| Speech recordings | 131 | all |
| Igala prompts | 697 (654 train, 43 frozen) | |

The analysis reads the two current versions only, because the older arms no longer describe the model:

- **484 judged sides** of v4.4 (315) and v4.5 (169), Oct 8 to Nov 13. A side is one version's answer in one judgment.
- **136 corrections** of v4.4 (85) and v4.5 (51) answers, by 4 speakers, on 112 prompts. Each correction stores the spans the speaker changed, with a reason tag per span: **352 spans**.
- **1,758 train answers** written by speakers, for the tone and spelling counts.
- **The tone restoration test** (`~/wt-clones/speech-doc/build/tone-eval-50.log` and `tone-eval-290.log`, script `web/scripts/speech/eval-tone-restore.ts` on branch `speech/tts`).
- **113 clips** recorded by the one speech annotator, and the texts they read.

How each span was classed (all in SQL, on the decomposed text): the two sides are compared after removing tone marks, then after removing the dot and the tilde, then after removing spaces and punctuation, then by word count. A one-word change counts as a near spelling when the two words differ in length by two letters or fewer and share their first two or last two letters. That last rule is a proxy, not an edit distance.

### Where the versions stand

**Measured**, judgments since Oct 8:

| Pair | Judgments | Newer wins | Older wins | Tie | Both inadequate |
|---|---|---|---|---|---|
| v4.5 against v4.4 | 77 | 22 | 12 | 33 | 10 |
| v4.5 against the plain model | 92 | 49 | 9 | 19 | 15 |
| v4.4 against the plain model | 124 | 70 | 7 | 23 | 24 |
| v4.4 against v3 | 114 | 45 | 14 | 43 | 12 |

Failure tags per 100 judged sides:

| Tag | Plain model (944 sides) | v4.4 (315) | v4.5 (169) |
|---|---|---|---|
| grammar | 34.9 | 18.4 | 16.0 |
| cultural | 8.4 | 8.6 | 7.7 |
| tone_marks | 12.7 | 8.3 | 4.1 |
| wrong_word | 10.1 | 3.8 | 4.1 |
| invented, wrong_language, not_igala | 7.9 | 1.0 | 1.2 |
| english_mixed | 0.1 | 0.6 | 1.8 |

Reading: retrieval halved the grammar tag and nearly removed the foreign and invented words. Grammar is still the largest tag by a factor of two. The cultural tag has not moved at all. English mixing is the only tag that rose.

## 2. Each error type, sized

The brief listed nine types to verify. Here is what the data says about each, then the types the list misses.

### Sentence construction: the largest, confirmed

**Measured.** Of 352 corrected spans, 115 replace a phrase of two or three words and 67 rewrite four words or more: 182 spans, 52%. The grammar tag sits on 85 of 484 judged sides. Syntax is the lowest rubric axis of v4.5 (mean 4.20, n 25). The linguist who joined in October wrote the only notes that name a rule, and both are about construction: where the word for "but" sits, and word breaks.

Which constructions, from the v4.5 prompt families (judged sides of v4.4 and v4.5, share that are "both inadequate"):

| Family | Sides | Both inadequate | Losses | Reading |
|---|---|---|---|---|
| aspect (finished, ongoing, future) | 13 | 5 | 3 | open |
| negation and questions | 20 | 6 | 4 | open |
| agreement (one against many) | 19 | 3 | 4 | open |
| linker (that, who) | 30 | 2 | 4 | nearly closed |
| location (in a town, to a town) | 11 | 0 | 2 | closed |

So the v4.5 work closed the linker and the location slots, and left aspect, negation and agreement open. No prompt has yet asked for because, before, after, until, although, unless or than, nor for word order inside the noun phrase.

### Spelling: confirmed, and mostly three things

**Measured.** 121 of 352 spans (34%) are at word level: 41 near spellings, 49 different words, 21 that change only a dot or the nasal letter, 10 that change only spacing or an apostrophe. Across all spans, 61 touch the final nasal, 63 add or remove an apostrophe at a word joint (38 add, 25 remove) and 38 touch the word for "in". "Wrong spelling" is the most common thing speakers write in a correction note (31 of 136).

Speakers disagree with each other on the dots. Two of them remove dots from the same word that the grammar rows give with dots. So a spelling prompt has to count per speaker, not look for one answer.

### Meaning or intensity off: real, and invisible in the data

**Measured.** 0 of 136 correction notes and 0 of 407 judgment notes name word strength. One judgment note names meaning. There is no tag for either. The nearest tag, cultural, is on 40 of 484 sides (8.3%) and is the one tag retrieval did not move. The semantics axis of v4.5 is its second lowest (4.36, n 50).

The evidence is the Nov 10 call, where the speakers named "word strength too intense or too weak for the sentence" as a quality gap, and the September write-up by the two linguists ("words too strong or too childish for the context", `tasks/salem-lydia-writeup-2026-09-25-inventory.md`). The size is unknown because the instrument cannot see it. The bank makes it countable (the ladders), and section 6 proposes the tag.

### Yoruba and Igbo leakage: nearly closed

**Measured.** The tags wrong_language, not_igala and invented together are on 5 of 484 sides of v4.4 and v4.5 (1.0%), against 75 of 944 (7.9%) on the plain model. No note mentions Yoruba, Igbo or Hausa since Oct 8. What remains shows up as single words inside corrections (water bodies, the market, asking a favour). It is counted inside the 49 one-word changes and was not separated. A six prompt guard is enough.

### Proper nouns: small

**Measured.** 11 of 352 spans (3%) change a capitalised word on both sides: a personal name given dots, one name swapped for another, an institution name reordered.

### Words with no Igala equivalent: the direction is the opposite of what we assumed for common nouns

**Measured.** In 9 corrected spans the model kept an English common noun (a school, a weekday, a kin term, a device) and the speaker replaced it with an Igala word or a respelled loan. In 1 span the speaker put English in. So for everyday nouns the model keeps too much English, not too little. english_mixed is the only tag that rose from the plain model (1 of 944 sides) to v4.5 (3 of 169).

For school subjects, institutions and offices, speakers have said they keep English and say it with Igala intonation. The v4.5 loan prompts could not settle it: 12 of 14 judgments were ties. The rule is per word class, and no data yet says where the line runs.

### Tone: the widest gap between what is asked and what exists

**Measured.**

- The model cannot restore tone. Given 240 toned speaker sentences with the marks removed, it restored 153 without changing a letter, got 3 fully right, and put the wrong tone on 1,380 of 5,870 letters (23.5%). In 83 of the 240 it changed letters as well. On the first 50 the figures were 46 restored, 4 fully right, 22.9% of letters wrong.
- There is little to learn from. 32% of train answers carry any tone mark and 7% (123 of 1,758) mark half their vowels or more. Since Oct 9 the share with any mark rose to 48%, the densely marked share to 9%.
- It depends on who writes. One speaker marks densely in 78% of answers (9 answers). The most active speaker carries some mark in 81% of answers and marks densely in 12%. The one speech annotator carries a mark in 8% and marks densely in 1%. Only 5 of the 63 texts she has recorded have a tone mark.
- Speakers still remove marks from the model: 60 spans strip every mark, 11 add marks.
- v4.5 writes a mark in 32% of answers and marks densely in 1%.

The linguists hold that tone marks are not optional (Nov 10 call). The data that would teach them is 123 answers. This is the gap where new data moves the model most per prompt.

### Homographs: not measured, and nothing exists to measure them with

**Measured.** There are 0 tone pairs in production (`SpeechMinimalPair` is empty), so the Listen tab cannot ask "which word did you hear". No judged prompt isolates a homograph. The rule files list the sets (`tasks/igala-grammar-deduced.md` R8.2: the farm, money, canoe and husband set, moon and month, build and refuse; `tasks/grammar-evidence-scholarship.md` section 2.1: one spelling with three tones), and note that speakers do not agree on which mark goes with which meaning.

### Dialect: small in the corrections, uninformative in the judgments

**Measured.** 3 of 352 spans are an l or r swap alone. On the v4.5 variety prompts, 11 of 22 judgments are ties and 4 of 28 sides are "both inadequate". The dialect field is filled on 60% and 85% of the two most active speakers' answers, so a line tied to a named town is usable data.

### Types the list misses

1. **The explanation signal has collapsed.** Judgment notes average 15 characters and correction notes 38 (**measured**). The typical note is "output needed correction". Only the linguist's notes name a rule. Everything in this file had to be read from tags and from the changed spans.
2. **The blind test is saturating.** Between v4.5 and v4.4, 43 of 77 judgments are a tie or "both inadequate" (56%). More pairs of the same kind teach little.
3. **The rubric is at its ceiling.** 10 of 622 axis scores on v4.4 and v4.5 are 2 or lower; the means run from 4.09 to 4.75. It cannot rank gaps.
4. **Fixed formulas are still the least solved prompts.** 10 of 23 sides "both inadequate" on the formula family, and authenticity is the worst bucket at 11 of 50 (22%).
5. **Numbers.** 8 of 11 judgments on the money prompts are ties. Two speakers corrected the same composed number on a v4.5 answer. The recorded texts write numbers as digits 6 times and never as words.
6. **Address terms.** The changed spans show the model's kin and address words replaced several times. This was seen while reading the v4.5 spans and was not counted.
7. **An unserved stock.** 165 long-form prompts seeded in July have no pooled answer and no speaker answer. Long text is where the earlier tuned model failed (`web/Context.md`, the note on the one English answer).
8. **Speech is thin and not shaped for a voice model.** See section 4.

## 3. Coverage: what the bank holds against where the errors are

**Measured.** Judged sides are of v4.4 and v4.5 since Oct 8.

| Bucket | Train prompts | Prompts judged with a v4.x answer | Sides | Both inadequate | Corrections of v4.x | Speaker answers |
|---|---|---|---|---|---|---|
| grammar_tone | 126 | 70 | 161 | 22 (14%) | 47 | 350 |
| lexicon_disambig | 102 | 36 | 87 | 13 (15%) | 24 | 311 |
| dialectal_fidelity | 34 | 20 | 59 | 5 (8%) | 20 | 90 |
| authenticity | 127 | 23 | 50 | 11 (22%) | 11 | 252 |
| orthography | 51 | 22 | 49 | 7 (14%) | 13 | 226 |
| register_honorifics | 73 | 21 | 42 | 7 (17%) | 12 | 293 |
| idioms_metaphor | 80 | 7 | 20 | 4 (20%) | 5 | 152 |
| cultural_values | 61 | 4 | 16 | 2 (13%) | 4 | 84 |

The thinnest buckets relative to their failure rate:

- **authenticity**: the highest failure share, and only 23 of 127 prompts have ever met the current model.
- **idioms_metaphor** and **cultural_values**: 7 and 4 prompts judged. The model is untested there, not good there.
- **register_honorifics**: 17% failure on 21 prompts, and it is the bucket where word strength lives.
- **orthography**: 51 train prompts in all, the smallest stock, against the tone gap.

Of the 654 train prompts, 299 can be served today (two pooled answers that form an allowed pair). Counted with `web/scripts/check-queue-servable.ts`, read-only: the speaker who also records speech has 0 left and has had none since her last judgment on Oct 28, the most active speaker has 3, the other two active speakers 61 and 126. Four speakers judged anything since Oct 9. So new text prompts are the urgent part of this bank, and the speech set is for sound coverage, not for volume.

## 4. Speech: what the queue holds and what the clips cover

How the Record queue picks a prompt (`web/src/app/api/lab/speech/next/route.ts` on `main`; the same file on branch `speech/annotators` adds a ranking by `web/src/lib/speech/coverage.ts`):

1. the speaker's own written answers that she has not recorded, oldest first;
2. then any train prompt she has not answered, in promptId order.

Frozen prompts never appear. On the `speech/annotators` branch each step is reordered so that a prompt nobody has recorded comes first. The voice script (`web/src/lib/speech/tts-script.ts` on `speech/tts`) keeps sentences of 3 to 20 words and reads at 130 words a minute.

**Measured** on 2026-11-13:

- By this logic the speech annotator's queue is not empty: 310 of her own answers are unrecorded, and 281 more train prompts wait behind them (165 of those are the long-form prompts). She reported having none left because she did not find Speech under Lab. That is a navigation fault, not a missing stock.
- What she has recorded: 63 prompts, 113 clips (63 Igala, 50 English), 11.9 minutes in all, 6.5 minutes of Igala, 437 Igala words, 6.2 seconds a clip.
- 18 of the 63 Igala clips are under three words, below the voice script's floor. 3 are over twenty.
- 5 of the 63 texts carry a tone mark.
- All 63 come from three buckets (grammar, word choice, spelling), because the queue runs oldest first.
- Sound counts in the 72 recorded texts of both speakers (733 words): kp 19, gb 34, ny 10, the velar nasal 10, kw 9, gw 12, p 3. Numbers appear as digits 6 times.
- The English clip reads the written gloss, which averages 52 characters on recorded prompts and is often an explanation.

So the stock is large and the wrong shape. A voice model needs sentences of three to twenty words, written with their tones, spread over the sounds, with an English line that is a translation. The v4.6 speech set is 120 such sentences. It is expected to yield 240 clips and about 15 minutes of Igala, 30 minutes in all (**estimated** from the measured pace of 0.9 seconds a word).

One thing the bank cannot fix: the new speech prompts sort last in step 2 and behind all 310 of step 1. Without a change to the queue order the speaker will not reach them for weeks. See section 6.

## 5. The outside evidence

- **Direction of synthetic data.** Vamvas et al. 2026, "Translation Asymmetry in LLMs as a Data Augmentation Factor" (https://arxiv.org/abs/2603.25489, Findings of EMNLP 2026): models translate out of a low-resource language well and into it badly, so synthetic pairs should be generated into the high-resource language. That setup was the only one to beat a Gemini 3 Pro baseline, by 23 BLEU on the lowest-resource variety. For us: build synthetic pairs from native Igala text into English (the 30,907 Bible pairs, speaker answers), never from English into Igala. It also says what a speaker's time is for: Igala that a model cannot write.
- **How many pairs.** The Igala few-shot report (Oct 20, internal, not in this repo): text to text is feasible at 400 to 1,000 pairs through many-shot prompting or LoRA plus a lexicon. A free description is not a parallel translation, so each item should be one short sentence with a direct translation, checked by blind back-translation. Every speech prompt in v4.6 is that shape.
- **Parallel sentences beat grammar text.** "Testing the Limits of Machine Translation from One Book" (https://arxiv.org/abs/2508.06665) found parallel sentences the most useful resource for a model translating a low-resource language, ahead of the grammar. Aycock et al. 2024 (https://arxiv.org/abs/2409.19151) found models gain from a grammar book's example sentences, not from its explanations. Both read from search summaries, not in full. They agree with our own result that v4.5's grammar rows moved the exam only through tone marks (`Context.md`, the Oct 9 exam note).
- **Tone needs its own metric.** A 2026 Yoruba diacritics study (https://www.mdpi.com/2076-3417/16/12/6195) reports Gemini 3.1 Pro ahead on chrF and behind on diacritic error rate against a small specialised model, with diacritic error rates near 43%. DiacBench (https://huggingface.co/datasets/olaverse/diacbench) recommends a copy-the-input baseline as the floor. Read from search summaries. Our 23.5% wrong letters is in the same range, and our frozen exam's chrF gain for v4.5 was "leave the marks off".
- **Speech corpora for tonal African languages.** WAXAL (https://arxiv.org/abs/2602.02734) recorded its voice sets from phonetically balanced scripts. An Efik voice study (https://huggingface.co/papers/2607.04515) reached a usable score while tone errors persisted, and asks for tone-aware data. A sentence selection method by sound coverage is in https://arxiv.org/abs/2402.05794. Read from search summaries. Adeniyi 2017 warns that a voice model trained on untoned Igala spelling learns a wrong mid tone (`tasks/grammar-evidence-scholarship.md` section 2.2).
- **In the repo.** `tasks/prompt-bank-v45-evidence-2026-10-08.md` (the method this file follows), `tasks/grammar-failure-analysis-v4-1.md`, `tasks/coverage-audit-v1.md`, `tasks/rag-v3-results.md`, `tasks/fable-review-2026-09-30.md`, `tasks/meetings-and-data-insights.md`.

## 6. What closes each gap

| Gap | Kind of prompt | Direction | Length | Speech or text | How far new data moves it (estimated) |
|---|---|---|---|---|---|
| Sentence construction | one construction, one variable, pairs | English to Igala | one sentence or two lines | text | 48 prompts at three speakers each give about 145 answers. The project's line for a grammar row is three speakers who agree, which v4.5 reached for the linker with 10 prompts. Expect aspect and negation to follow the linker. |
| Tone marks | a short sentence with every mark | English to Igala | 3 to 8 words | both | 134 fully toned lines per speaker. With two speakers that is about 270, against 123 today. With the planned second pass it crosses the 400 floor of the few-shot report. |
| Fixed formulas | one speech act in a scene | scene to Igala | one or two lines | text, later speech | 22 formulas. Formulas are learned one by one, so each agreed answer is one fix. |
| Spelling and words | sentences that contain the slot | English to Igala | one line | text | Gives per-speaker counts on the dots and the nasal, which decides whether one rule can be served at all. |
| Word strength | ladders at three strengths | English to Igala | three lines | text | First measurement. 20 ladders give 60 graded lines per speaker. |
| English kept | sentences with terms to keep or not | English to Igala | one sentence | both | A count per word class from about 14 sentences. Enough to write the rule, not to prove it. |
| Homographs | each member in its own sentence | English to Igala | one line each | both | Fills the empty tone pair table: 4 pairs from the rule files and 7 the speaker supplies. |
| Numbers | counts, dates, clock, ordinals | English to Igala | one sentence | both | 10 text and 20 speech prompts. Number forms are verified by scholarship, so answers can be checked. |
| The rest | guards and first tests | English to Igala | one or two lines | text | Small. |

All prompts are written in English and answered in Igala. That is deliberate: per Vamvas et al. the Igala side must come from speakers, and the English side is free.

### Beyond prompts

1. **Tags (eval change).** Add two failure tags, "too strong or too weak" and "word order", and make one tag compulsory per changed span. The notes are too short to carry this (15 and 38 characters).
2. **A tone metric (eval change).** Report diacritic error rate beside chrF on the frozen exam, with a copy-the-input floor. Use the 9 densely toned answers of the linguist as a first tone test set and grow it with the second pass.
3. **Tone restoration by example (retrieval).** Feed the 123 densely toned train answers, then the v4.6 toned lines, as many-shot examples to the restoration step that builds the voice script. Re-run `eval-tone-restore.ts` after each 100 new lines.
4. **A loan table (lexicon).** After the English-kept answers come in, store one row per word class (subject, institution, device, illness, month, office) with what speakers do. Fix the 9 everyday nouns the model left in English.
5. **Grammar rows (retrieval).** Add a row for aspect, negation and agreement only when three speakers agree on a v4.6 answer, as v4.5 did for the linker.
6. **Fine-tuning data.** About 1,088 of the 1,758 train answers have an English gloss short enough to serve as a translation (**estimated** by a length and wording rule, not checked by hand). That is inside the 400 to 1,000 range. Build pairs in the Igala to English direction.
7. **Stop spending speaker time on ties.** Serve v4.5 against the plain model less, and corrections more: a correction yields spans, a tie yields nothing.
8. **The queue.** Decide what to do with the 165 unserved long-form prompts, and put the v4.6 speech set first in the Record queue.

## 7. What this analysis could not do

- It could not size word strength, address terms or the residual Yoruba and Igbo words. The first has no signal; the other two were seen in the spans and not counted.
- The near-spelling class is a proxy. An edit distance was not available in the database.
- It did not read the audio. Sound coverage is counted on the texts that were read aloud.
- Coverage of the v4.6 speech set is expected, from published word forms. The real coverage is known only after the clips exist.
- The outside sources marked "read from search summaries" were not read in full.
