# Wikitongues AI, Igala: the source document, 2026-09-01

This document replaces every earlier context upload. It is written to stand alone for a reader who has never seen the project, and to serve as grounding for question answering. Every number carries its date, the system it describes (the "arm") and, where it is a comparison, the pairing. Where an earlier document said something different, the project audit of 2026-09-01 wins, and section 4 says what changed and why.

Sources, in the order they were trusted: the project audit of 2026-09-01 (tasks/project-audit-2026-09-01.md); the project's living memory (Context.md, session notes from 2026-08-20 onward); the grammar failure analysis of 2026-08-31 (tasks/grammar-failure-analysis-v4-1.md); the annotation pivot decision of 2026-08-20 (tasks/annotation-pivot-decision.md); the corpus and permissions ledger (tasks/igala-corpus-sources.md, verified 2026-08-09, corrected 2026-08-27 and 2026-08-29); and the live public endpoint https://web-three-rho-89.vercel.app/api/public/method-metrics, read on 2026-09-01 at 21:39 UTC.

---

## 1. What the project is

Wikitongues AI is teaching artificial intelligence models to write Igala, a tonal language of about two million people in Kogi State, Nigeria, that no major AI system speaks. Native speakers write answers to questions in Igala, judge model answers blind, and correct the ones they can fix, and every one of those acts becomes knowledge that is packed around the next question a model is asked. A frozen exam of 43 questions, answered by the community (some answers written cold, most written after a speaker had rejected a model's attempt), scores each model on how closely its Igala resembles the community's own writing. The result on 2026-09-01 is that native speakers, judging blind, prefer one commercial model with the community's knowledge packed around it to the same model with nothing added, and that the same packing that helped that model at one version harmed another model until a later version undid the harm. The project is led by Halim Madi (AI lead) with Daniel Bögre Udell (Wikitongues co-founder), Lydia Wiernik (linguistics lead) and Agnes Abah (Igala community lead, Igala Wikimedians), with a public launch planned for the Wikimedia Foundation conference in Ghana in early October 2026.

---

## 2. How it works

### 2.1 The loop in one paragraph

The community writes. A speaker is shown a question ("How would a mother call her children in to eat?") and writes her own Igala answer before seeing anything a model wrote. This is a cold answer. Models answer with community knowledge packed around each question. When a model is asked the same question, the system first gathers relevant community material (earlier cold answers to similar questions, dictionary entries for the words the answer will need, sentence pairs from a parallel corpus, and speaker corrections of earlier model mistakes), checks that none of it is an exam answer, and places it in front of the model together with a written set of instructions about Igala grammar and register. The community judges blind. Two model answers to one question are shown side by side without saying which system wrote which; the speaker picks the better one, says it is a tie, or rejects both as inadequate, tags what went wrong, and may correct the winner. Judgments become new knowledge. The preference, the tags and the correction are stored with their provenance and flow back into the material that is packed around future questions. Nothing that a speaker writes about an exam question ever reaches a model that will be examined on it.

### 2.2 The four layers

The system is drawn as four layers, top to bottom.

Layer 1, the community. Six annotators (native Igala speakers) on the platform as of 2026-09-01. Their work takes three forms: cold answers, blind pairwise comparisons with failure tags, and corrections of model output with an English explanation of each correction. A correction is stored in its own table (OutputEdit) and never in the table that holds cold answers (ColdAuthorAnswer), so a corrected model sentence can never be mistaken for a speaker's own sentence.

Layer 2, the knowledge stores and the deduced grammar. On 2026-09-01 the stores hold 1,481 community gold answers; 2,104 dictionary entries (1,262 induced by aligning the Bible parallel corpus, 482 from the chikhapo lexicon, 224 from Koelle's 1854 word list, 136 from Wiktionary); 30,907 Igala-English sentence pairs, all of them Bible verses from one source family; and 84 reference entries (grammar notes, cultural notes, encyclopedic excerpts, and 9 grammar-rule entries added 2026-08-31). Beside the stores sits a written grammar of Igala deduced from all of this evidence, with each rule graded A, B or C by how many independent kinds of evidence support it. Only A and B rules are placed in the model's instructions.

Layer 3, per-question serving. For each question the retrieval step assembles a context: speaker corrections first (up to 3), then parallel sentence pairs (4, with 2 reserved for non-Bible sources once any exist), then dictionary entries, then earlier gold answers to similar questions. Every piece passes the leak guard before it is used. The assembled context plus the question go to the model under a fixed instruction text called THE METHOD. Version 4.1 of that text (2026-08-31) is 1,148 tokens against a budget of 1,150, and is followed by a repair round.

Layer 4, judgment and measurement. Model answers on training questions go back to the community for blind judgment. Model answers on the 43 frozen exam questions are scored automatically against the community's answers, and those scores are what the public scoreboard shows.

### 2.3 The leak guard

The 43 frozen questions have 238 community answers whose authors consented to benchmark use (count as of 2026-09-01). The leak guard holds every one of those 238 strings. Before any retrieved piece is placed in front of a model, the guard checks whether the piece contains one of those strings; if it does, the piece is dropped. A second, after-the-fact audit re-reads what was actually served to every examined arm and flags any prompt where a model saw its own exam answer. On 2026-08-09 that audit found that 16 of the 43 frozen questions had, at some point, been served their own community answer; those 16 are excluded from every published score, and the remaining 27 are the leak-free subset. The audit of 2026-09-01 found two blind spots in the guard (it does not recognise the identifiers of the corrections block, and it checks a dictionary headword in phonemic form while serving it in orthographic form) and re-checked both against the served text: zero new hits, so no published number moves. Both are on the fix list.

### 2.4 The frozen exam, and what it can and cannot see

The exam is 43 questions, marked as held out, never served to annotators for pairwise judgment, each with at least one consented community answer (43 of 43 on 2026-09-01). A model's answer is scored with chrF, a character-level overlap measure, after stripping tone marks from both sides ("stripped chrF"). The score is reported on the leak-free 27 only.

The exam can see one thing: how closely a model's Igala resembles the way this community writes Igala on these questions. The questions are mostly short: on 2026-08-20 the pivot decision recorded that 88 percent of the frozen 43 are single-word or short-phrase lookups. Only two or three prompts ask for the kind of long-form register (greetings, consolation, dialect attribution, vocatives) that the grammar work targets, so the exam cannot register success or failure on that work.

The exam cannot see quality, meaning or grammaticality as a linguist would judge them. It is not comparable to general-purpose AI benchmarks and claims nothing beyond Igala. Its confidence intervals are wide: every arm at the top of the board overlaps every other arm at the top. And, as the audit of 2026-09-01 established, 131 of its 238 answers (55 percent) were written after the speaker had seen and rejected model output, while 107 were written cold; six frozen prompts have only post-exposure answers. The public page had described all of the gold as cold. Section 4 returns to this.

---

## 3. Where the project stands on 2026-09-01

### 3.1 The corpus counts

From the live endpoint, computed 2026-09-01 at 21:39 UTC:

| Item                                                   | Count on 2026-09-01                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Community gold answers                                 | 1,481                                                                            |
| Blind pairwise comparisons, all time, all arms         | 1,243                                                                            |
| Of which both answers rejected as inadequate           | 1,145                                                                            |
| Parallel sentence pairs (Bible, one source family)     | 30,907                                                                           |
| Dictionary entries                                     | 2,104                                                                            |
| Reference entries                                      | 84 (Context.md, 2026-08-28) plus 9 grammar-rule entries (2026-08-31)             |
| Annotators                                             | 6                                                                                |
| Frozen exam questions                                  | 43, all with gold                                                                |
| Frozen questions excluded as leaked                    | 16                                                                               |
| Leak-free subset                                       | 27                                                                               |
| Speaker agreement ceiling, deduplicated, clean prompts | 39.5 chrF (25 prompts)                                                           |
| Comparisons where both arms are in the pairing pool    | 195 on the endpoint; 193 after removing two seed-account rows (audit finding 24) |
| Of those, both inadequate                              | 105 on the endpoint; 104 real                                                    |
| Of those, decided (a winner picked)                    | 68                                                                               |

The 1,243 all-time comparisons should not be read as one series. Comparisons before 2026-08-20 were on GPT-4o and GPT-4.1 class arms and were rejected as both inadequate 99.3 percent of the time (1,040 of 1,047 on 2026-08-20). Comparisons after 2026-08-20 are on Gemini 3.1 Pro arms only. The drop in the both-inadequate rate from 99 percent to about half is a change of base model, not a trajectory of one system improving; the audit of 2026-09-01 (finding 9) corrected this reading.

### 3.2 The blind-preference result

This is the strongest thing the project can say, and it is stated here exactly as the audit's "what is solid" section states it.

Native speakers, judging blind, prefer Gemini 3.1 Pro with the v3 knowledge package to the same Gemini 3.1 Pro with nothing added. All 193 real pool comparisons, judged between 2026-08-20 and 2026-09-01, are that one pairing. The full split is: v3 package wins 54, bare Gemini wins 14, ties 21, both rejected as inadequate 104. At the question level, where a prompt is counted once, it is 25 wins to 7 losses over 55 prompt pairs, with an exact binomial p of 0.002. Every one of the six annotators leans the same way.

What the result does not cover: no speaker has ever judged a v4 or v4.1 answer. Comparisons touching any v4 or v4.1 arm on 2026-09-01: zero. A third arm, Claude Opus 5 with the v1 package, sits in the pairing pool with 43 outputs on frozen prompts, zero outputs on training prompts and zero comparisons, because its API key is dead. The phrase "speakers prefer our system four times out of five" in the email of 2026-08-31 was attached to a system (v4.1) nobody has judged, and "one in a million" overstated the odds; the pair-level p is 0.002.

### 3.3 The exam ladder

Two constructions of the same scores are shown side by side. The published construction is what the endpoint and the public pages show on 2026-09-01. The like-for-like construction is the audit's re-scoring of every arm exactly as the speaker ceiling is scored (each arm against the same deduplicated set of other speakers' answers, averaged over hold-outs, on the same 25 prompts). All scores are the agreement score: stripped chrF on the leak-free 27, divided by the speaker ceiling of 39.5, times 100.

| Arm (exam date)                                | Published agreement score, 2026-09-01 endpoint | 95 percent interval | Like-for-like score, audit 2026-09-01 |
| ---------------------------------------------- | ---------------------------------------------- | ------------------- | ------------------------------------- |
| Gemini 3.1 Pro + v4.1 package (2026-08-31)     | 120.1                                          | [93.2, 148.9]       | 102.6 [77, 133]                       |
| Gemini 3.1 Pro + v4 package (2026-08-29 to 31) | 102.1                                          | [73.4, 133.4]       | 89.4                                  |
| Gemini 3.1 Pro + v3 package (2026-08-14 to 20) | 99.2                                           | [74.3, 125.9]       | 90.3                                  |
| Gemini 3.1 Pro, bare (2026-08-13)              | 94.2                                           | [68.5, 122.1]       | 83.2                                  |
| Claude Opus 5 + v4.1 package (2026-09-01)      | 93.2                                           | [70.5, 120.4]       | 85.4                                  |
| Gemini 3.1 Pro + v2 package (2026-08-13)       | 84.6                                           | [60.1, 112.2]       | not re-scored                         |
| Claude Opus 5 + v1 package (2026-08-13)        | 83.3                                           | [64.0, 106.1]       | 79.6                                  |
| Gemini 3.1 Pro + v1 package (2026-08-13)       | 81.6                                           | [65.4, 100.8]       | not re-scored                         |
| GPT-4.1 + v1 package (2026-08-09)              | 58.0                                           | [46.4, 70.2]        | not re-scored                         |
| GPT-4.1 mini fine-tuned on cold gold (2026-08) | 40.1                                           | [28.6, 52.8]        | not re-scored                         |
| Claude Opus 5, bare (2026-08-13)               | 27.2                                           | [19.0, 37.7]        | not re-scored                         |
| GPT-4.1, bare (2026-08-09)                     | 23.4                                           | [17.3, 31.6]        | not re-scored                         |

Why the two columns differ. In the published construction a model answer takes its best chrF over all 238 consented answers for that prompt (a mean of 5.56 references per clean prompt, same-speaker repeats included) on 27 prompts, while the 100 line is each speaker scored against her deduplicated peers (a mean of 3.11 references) on 25 prompts. The model is given more chances to match than the speaker it is compared to. About 17 of the 20 points by which Gemini v4.1 sits above 100 come from that difference, not from the model. Under the like-for-like construction the best arm sits at speaker-agreement level, 102.6 with an interval of [77, 133], and "as consistent as one speaker is with another" is a defensible point estimate. "Beats a human" is not.

What survives a paired test. On the clean 27, using the repository's own paired bootstrap on 2026-09-01: Gemini v4.1 minus Gemini v3 is +8.27 chrF with interval [+1.30, +15.82], and it is the only Gemini step on the ladder whose interval clears zero. Gemini v3 minus bare Gemini is +1.95 chrF with interval [-9.12, +12.94], 13 prompt wins to 11, which is not a measurable difference. Gemini v4.1 minus v4, v4 minus v3, and v4.1 minus bare do not clear zero. Quoting the best of five Gemini arms also carries a selection premium: the observed gap of the best arm over the grand mean is 7.80 chrF where a permutation null gives 3.41, p = 0.010, worth roughly 9 agreement points. Resampling the ceiling jointly with the arm gives Gemini v4.1 an interval of [89, 160] and a probability of 0.11 of sitting below 100.

The measurement machinery itself reproduces to the decimal: the leak-free 27, the deduplicated ceiling of 39.5, the bootstrap intervals and every published number were re-derived from the repository's own functions on 2026-09-01 and matched.

### 3.4 The Claude ladder

Claude Opus 5 arms were examined on the frozen 43 on 2026-09-01 through OpenRouter (the direct Anthropic key is dead): 86 generations, $1.94. Agreement scores on the leak-free 27, 2026-09-01:

| Claude Opus 5 arm | Agreement score    | Note                                                   |
| ----------------- | ------------------ | ------------------------------------------------------ |
| bare              | 27.2               | includes two empty outputs scored as zero (finding 11) |
| + v1 package      | 83.3               |                                                        |
| + v2 package      | 62.1               | includes three empty outputs scored as zero            |
| + v3 package      | 54.6               | includes one empty output; 56.7 without it             |
| + v4 package      | 71.5               |                                                        |
| + v4.1 package    | 93.2 [70.5, 120.4] | repair round fired on 9 of 43 prompts                  |

The v3 grammar rules made Claude worse: v1 to v3 is -11.3 chrF (about 29 agreement points), and the paired interval clears zero. The v4.1 package undid that regression: v4.1 minus v3 is +15.3 chrF (about 39 agreement points), and the interval clears zero. Both of these are solid. What is not established: that Claude v4.1 (93.2) is better than Claude v1 (83.3); the intervals overlap heavily. And the public sentence "the grammar that lifts Gemini measurably hurts Claude" is half right: the Claude half is real, the Gemini half is not (section 3.3), and "Claude does best when shown real community answers instead" is stale now that Claude v4.1 sits above Claude v1 on the board.

The empty outputs matter for the bottom of the ladder. Bare Claude has two zero-length answers (prompts ig_cult_001 and ig_reg_001, 4,096 output tokens consumed, no text); Claude v2 has three, Claude v3 one, Gemma 4 31B v2 four. These are provider failures stored as if they were answers and scored as chrF 0. The email figure "bare Claude 27.2" and the funder draft's "a top model alone scores 25" count provider failures as language failures.

### 3.5 The tone-mark finding on v4 to v4.1

Igala writes tone with accents, but the community mostly does not. On the frozen 43, gold tone density (tone marks per character, measured 2026-09-01) is 0.141, and 180 of 238 gold answers carry no tone mark at all. Model output on Gemini arms has been converging toward that: tone density 0.53 for v1, 0.28 for v4, 0.16 for v4.1.

With tone marks stripped from both the model output and the gold, and the ceiling recomputed the same way, Gemini v4 scores 94.8 and Gemini v4.1 scores 94.2; the paired delta is -0.36 chrF with interval [-4.85, +4.63]. A regular expression that strips tone from v4's stored outputs, with no model call, scores 138.4, above v4.1. The reading is that the v4 to v4.1 gain on the published board (102.1 to 120.1) is mostly the model writing fewer tone marks, not better grammar. The repair round fired on 7 of 43 Gemini v4.1 prompts, every one for tone saturation.

### 3.6 The repair round as a second attempt

The v4.1 serving path adds a deterministic checker after the model's first answer: a character allowlist, a ban on hyphenated prefixes, and a tone-saturation check. If any check fails, the model is asked once more with its violations named, and the second answer is kept regardless. On 2026-08-31 and 2026-09-01 only the second answer was stored; there is no first-pass text and no flag on the stored row saying a repair happened. The v4.1 bar on the board is therefore the better of two attempts, set against arms that had one attempt, with no label saying so. The audit treats the repair round as a post-processor to be evaluated as one, and the fix is to store the first pass and a repaired flag before the next exam.

One further attribution fact from Context.md (2026-09-01): the 9 grammar-rule reference entries seeded on 2026-08-31 are not reachable on the v4.1 retrieval path (that path never queries the reference-entry table), so none of the v4.1 score is attributable to them. The 102 to 120 change is the instruction text plus the repair round alone.

---

## 4. What the audit of 2026-09-01 corrected, and why each matters

Five adversarial reviews (claims, data, decisions, engineering, statistics) were run against the live database, the live endpoint, the Vercel runtime log, Gmail, Drive and the code, followed by a sixth pass that re-derived every critical and high finding from scratch. The audit confirmed 4 critical, 9 high, 14 medium and 4 low findings. The critical and high ones, in plain words:

Finding 1, critical: the blind-preference headline named the wrong system. Every one of the 193 real pool comparisons is Gemini 3.1 Pro with the v3 package against bare Gemini 3.1 Pro. The email of 2026-08-31 placed "54 out of 67" beside "our newest system scores 102" under one phrase, "our system", while the system serving chat is v4.1, which no speaker has judged. The public page also said speakers judge "three systems", when the third (Claude v1) has zero comparisons and a dead key. It matters because the one result the project can defend is being attributed to a system it does not describe. The correction is to name the arm and the pairing in every channel, quote the full 54/14/21/104 split, and say v4 and v4.1 are unjudged.

Finding 2, critical: "past the 100 line" is built into the scoring, not measured. Models get more reference answers to match than the speakers they are compared with (section 3.3). About 17 of the 20 points above 100 come from that. It matters because "beats a human" has already gone out by email and on a slide. The correction is a like-for-like construction and a rewritten footnote.

Finding 3, critical: the Bible corpus is served under a permission that no record contains. All 30,907 sentence pairs and 1,262 of the 2,104 dictionary entries carry a source string saying the Bible Society of Nigeria granted permission on 2026-08-12. Gmail holds only two outbound messages to the Society (2026-08-12 and 2026-08-18) and no reply, and the ingest is dated the day the first ask was sent. The project's own ledger says "do not use". The public changelog in both repositories says "ingested under BSN permission", and slides shown to Google Research on 2026-08-18 say the Society "licensed us the Igala Bible". It matters because it is a legal and reputational exposure, and because every arm from v2 upward consumes this corpus. The correction is to fix the changelog entries, mark every affected arm, and either obtain a written grant or plan the removal.

Finding 4, critical: the public sentence "the grammar that lifts Gemini measurably hurts Claude" is not supported. The Gemini half fails a paired test (v3 minus bare +1.95 chrF, interval [-9.12, +12.94]); the Claude half holds. It matters because the whole per-family pool design (Gemini gets rules, Claude gets examples) was drawn from this reading. The correction states what the paired tests support: rules hurt Claude at v3, v4.1 undid that, and no Gemini step before v4.1 clears its interval.

Finding 5, high: the v4 to v4.1 gain is tone-mark density, not grammar (section 3.5). It matters because v4.1 was being described as "the first version that helps both families" and as the base for v4.2. The correction is a tone-insensitive column beside the raw one and an evaluation of the repair round as a post-processor.

Finding 6, high: "beating the frontier labs on grammar" is contradicted by the tags. Grammar is the top complaint against both arms in the pool (bare Gemini lost 54 times with grammar tagged 11 times; v3 lost 14 times with grammar tagged 4 times; both-inadequate grammar tags since 2026-08-20: 37 on each side). It matters because the email's third bullet said grammar is what the community taught the system, and its own caveat said the system fails on grammar. The correction: grammar is the top complaint against both systems and is where the project is iterating.

Finding 7, high: 55 percent of the exam gold was written after seeing rejected model output (131 corrected-from-inadequate, 107 cold, of 238), and six frozen prompts have only post-exposure gold, while the public page called all of it cold. It matters because post-exposure gold can inherit the shape of the model output it replaced, which moves resemblance scores. The correction is to disclose the split and publish a cold-only sensitivity score beside the main one.

Finding 8, high: only one link of the chain v4.1 > v4 > v3 > bare survives a paired test, and quoting the best of five arms carries a selection premium of roughly 9 agreement points (section 3.3). It matters because independent intervals on the same 27 prompts are not a comparison. The correction is paired tests for every arm-versus-arm claim, "best of N arms examined" on the board, and "suggestive, not established" as the public wording.

Finding 9, high: the fall in both-inadequate from 99 percent to about half is a base-model swap, not progress (section 3.1). It matters because the email said "down from 99 percent a month ago" and the in-app strip says "progress here means the bars falling". The correction splits the strip by pairing regime and labels the 2026-08-20 pivot.

Finding 10, high: the public method page describes v3 as "today" and publishes only v2 and v3 instruction texts, while v4.1 tops the board, serves chat and is examined; the repair round appears nowhere; its first pass is unrecoverable; and the marketing repository holds an uncommitted edit whose comments say "Scored 120" and "eight rules each verified against two independent sources". It matters because committing that edit would publish findings 5 and 13. The correction adds v4, v4.1, the repair round and the Claude ladder to both changelogs, labels v4.1 "best of two", stores first-pass text and a repaired flag, and holds the marketing edit.

Finding 11, medium but material to section 3.4: ten empty outputs are stored as exam answers on live arms and scored as zero. The correction is never to persist an empty answer as a result, to store the provider error instead, and to re-quote the Claude ladder.

Finding 12, high: the v4.2 plan (wire the 9 grammar entries into retrieval, re-examine, decide from the score) rests on six untested assumptions: v4.1 as base is untested against tone (finding 5); rules beating examples is contradicted tone-insensitively on both families; the exam has two or three prompts of the kind the entries target; the repair round's quality effect is unmeasured; the entries are grade C and were never shown to a speaker; and the instruction text is at 1,148 of 1,150 tokens, so any block displaces something. Zero v4.x outputs have a blind judgment. It matters because spending on v4.2 retrieval before these are answered buys a number nobody can interpret.

Finding 13, high: "two independent sources" is empty for the orthographic rules, because the Bible corpus cannot express the feature. The 30,907 verses contain zero hyphens, zero tone marks and six rows with ẹ or ọ. Rules E4 (no hyphenated prefixes), E5 (character allowlist), E6 (no word-final -wñ) and the tone clause take their corpus leg from a corpus that cannot show them. Rules E1 (serial verbs), E2 (optative), E3 (dative allomorphy) and E7 (muda) are genuine syntactic checks and hold. The correction relabels the four orthographic items as community-only register choices and changes the public sentence to name the four that are two-source.

Finding 14, high: the chat turn budget gives up 20 seconds on every turn because the platform ceiling was inferred wrong. The Vercel log holds exactly one timeout in seven days, "Task timed out after 120 seconds" on 2026-09-01 at 15:24:56 UTC, while the code assumed a ceiling below 120 and set 100; the module's test compared the constant to itself. It matters because the repair round's re-ask is refused at 57 seconds where 77 were available. The correction sets the ceiling to 120 with the log line cited.

The medium and low findings (empty-output persistence, an unreachable reader for the 9 grammar entries, six Claude arms on a dead key, a pivot date derived from a mutable flag, the leak guard's two blind spots, chat columns conditioned on column one, a bodiless 500 on retrieval failure, id-only contamination checks on the fine-tuned arm, wrong price rows, two seed-account rows in the gold, "hand-checked" describing 136 of 2,104 dictionary entries, and four ship-then-revert incidents in three days) are listed in the audit with their fixes.

---

## 5. The v4.2 options, with cost and success criteria

Cost basis used throughout, from the audit of 2026-09-01: annotation runs at about 6 minutes per episode (10 per hour); in the current pool 35 percent of episodes produce a decision; distinguishing a 65/35 preference needs about 85 decided comparisons; the pool checkpoint rule is 100 episodes; Gemini 3.1 Pro v4.1 with repair cost $0.29 for 43 prompts; Claude Opus 5 via OpenRouter cost $1.94 for 86 generations.

Option 0. Correct the record. Not v4.2 work, but it comes before any of it. Fixes findings 1, 2, 3, 4, 6, 7, 9, 10 and 11 in copy and changelogs, sends a second correction to Daniel and Lydia naming the arm and the pairing, and holds the funder draft. Cost: about one working day of copy and review, $0. Success: no public surface or sent email carries a number the audit could not reproduce or a claim it could not support, and the Bible Society line is corrected in both repositories. Depends on nothing; everything else depends on it.

Option (c). An agreement score that cannot exceed 100 by construction. Two parts. First, the like-for-like score from finding 2 replaces the current one; it can still pass 100, but only by measurement. Second, a companion speaker-rank score: on each prompt, insert the model as one more speaker, compute everyone's leave-one-out chrF the same way, and record the share of real speakers the model ties or beats, averaged over prompts. It runs 0 to 100 by construction, 50 means a typical speaker, 100 means the model beats every speaker on every prompt, and it is immune to reference-count effects. Publish both, with a cold-only sensitivity column (finding 7) and empty outputs excluded (finding 11). Cost: one to two engineering days including tests and the copy change in both repositories, $0. Success: the endpoint publishes both scores, no bar is past 100 by construction, and the public footnote is rewritten. Depends on findings 2, 7, 11 and 24.

Option (d2). A tone-insensitive scoreboard plus a no-repair control. Tests whether v4.1 has any effect beyond tone stripping, and whether the repair round is a quality device or a regular expression. Publish the tone-insensitive column; re-examine "v4.1 instructions, no repair" on both families; store first-pass text and a repaired flag from now on; compare against a $0 arm made of v4's outputs plus a tone-stripping regex. Cost: about $0.30 (Gemini) plus about $1 (Claude) for the control exam, half a day of engineering. Annotator hours: 0. Success: a paired tone-insensitive delta of v4.1 over v4 that clears zero would justify v4.1 as the base; a delta near zero (the current reading) means the repair round is a post-processor and v4.2 should build on v4 or v1 with a tone normaliser. Depends on findings 5, 8 and 10.

Option (a). Human validation of v4.1 through the pairing pool, before any further prompt work. Tests whether the speakers, the stated referee, prefer v4.1 over what they already prefer (v3), and whether v4.1 is separable from a regex over bare Gemini. Two pairings on the same training prompts: v4.1 against v3, and v4.1 against "bare Gemini plus tone strip" (a derived arm built from the 96 existing bare outputs, $0). Before adding any arm: pin the pivot date (finding 17), remove the dead Claude v1 arm from the pool (finding 16), and freeze or relabel the v1 store (finding 15). Cost: v4.1 on 96 training prompts, about $0.65 to $1.00 (Gemini) or about $2.20 (Claude); annotation at the checkpoint of 100 episodes is 10 hours; reaching 85 decided comparisons at the current 35 percent decided rate is about 245 episodes, roughly 25 annotator hours per pairing. With one annotator-week for both pairings the early read is possible; the powered read needs two to three. Success: v4.1 beats v3 at the pair level with exact binomial p below 0.05, its both-inadequate rate is not above v3's, and it is separable from the tone-strip control. If speakers cannot tell v4.1 from the regex, the prompt program is measuring tone and stops. Depends on findings 1, 5, 10, 15, 16 and 17.

Option (b). Wire the 9 grammar entries into a v4.2 retrieval block and re-examine. Tests whether retrieved grammar rules change outputs on the prompts they target. Build the block, write the reachability test first (finding 15), cut tokens elsewhere (the instruction text is at 1,148 of 1,150), re-examine both families. Cost: about $0.30 (Gemini) plus about $1 (Claude), one to two engineering days; annotator hours 0 for the exam. The catch: the frozen exam has two or three prompts of the kind the entries target, so chrF on the 27 cannot register success or failure. The honest success criterion is three-part: the reachability test passes; the tone-insensitive paired delta versus the base is not negative; and a small cold-authored long-form held-out set (option d3) shows a difference the entries can explain. Without d3 this option produces a number that means nothing either way. Depends on findings 5, 12, 13, 15 and option (c).

Option (d3). A cold-authored long-form held-out set. Gives the exam an instrument that can see grammar and register (greetings, consolation, dialect attribution, vocatives), which the current 43 cannot. About 20 prompts, authored cold by two or three speakers, frozen before any prompt work touches them. Cost: 20 prompts times 3 speakers at roughly 10 minutes each is 10 annotator hours, plus gold consent handling; $0 in model spend until used. Success: the set is frozen, provenance is cold only, and it is never shown to prompt authors. Depends on finding 7 and the pivot decision's reserved cold-authoring lane.

Recommended order. Option 0 and option (c) first, because they cost nothing and every later number passes through them. Then option (d2) and option (a) together, because between them they answer the only question that matters for v4.2: whether v4.1 is a better base than v4 or a tone regex. Option (b) after, and only with option (d3) in hand, because the current exam cannot tell whether the grammar entries work, so spending on them now buys a number nobody can interpret.

---

## 6. Permissions and provenance

The project's rule, restated in the audit of 2026-09-01: no ingest without a written grant on file, named in the ledger row. The ledger, not a code header or a verbal report, is the source of truth.

What is on file. One grant: Global Recordings Network. Graydon Colville, GRN Copyright Manager, granted written permission on 2026-08-17 to use the Igala "Words of Life" recording (45 minutes 38 seconds, the only usable Igala speech asset found anywhere) in this project, through a modified copyright and partnership agreement counter-signed by Halim Madi on 2026-08-27, with the final PDF pending from GRN. It is a project-scoped grant under a bilateral agreement, not a change to the recording's public CC BY-NC-SA licence; the signed agreement on the email thread (Lydia Wiernik and Daniel Bögre Udell copied) is the authority. The audio was downloaded on 2026-08-28 with a provenance file and checksum, and is held as a future speech-recognition seed only; nothing from it is in any database or retrieval store.

Also in the stores under open licences, ingested 2026-08-09 and 2026-08-12: Igala Wikipedia lead excerpts (CC BY-SA 4.0), Wiktionary Igala lemmas (CC BY-SA 4.0), Koelle's 1854 Polyglotta Africana word list via Lexibank (CC BY 4.0, source public domain), the chikhapo Igala-English lexicon (MIT), and three African Storybook Igala titles (CC BY 4.0).

What is not on file.

The Bible Society of Nigeria. The 30,907 sentence pairs and 1,262 dictionary entries in the stores are the Society's 1970 Igala Bible (IGL70). Gmail holds two outbound asks (Halim Madi 2026-08-12, Lydia Wiernik 2026-08-18) and no reply. The ingest is dated 2026-08-12, the same day the first ask was sent. The ledger's own rows say "do not use" and route the text through a permission request. The Society's text is copyrighted; it is free to read on Bible.com but not openly licensed.

JWAL and Salem Ochala Ejeba. Ejeba, author of the reference grammar of Igala and of the 2023 concord paper in the Journal of West African Languages, replied warmly on 2026-08-14 and a call was scheduled for 2026-08-31. No written grant exists. Paraphrase with attribution only until one does.

Egbunu (2014 proverbs study) and Arokoyo (2020 phonology study). No contact exists in Gmail or Drive; no outreach has been made. Nothing may be ingested.

PanLex. The permission email of 2026-08-12 to info@panlex.org bounced permanently on 2026-08-16; the escalation to Long Now (services@longnow.org, 2026-08-27) is unanswered. The ask has never reached them.

Crúbadán. Closed for cause on 2026-08-27: Kevin Scannell no longer holds the data, and the crawl metadata shows all 17 Igala documents came from watchtower.org, which places them under the standing rule that Watch Tower content is not used (its terms forbid it, and the JW300 corpus was withdrawn from OPUS after the rights holder refused). Nothing was ingested.

Bible for Children. Six Igala PDF booklets were downloaded on 2026-08-28 as raw assets. Text extraction is defeated: the subdot vowels ẹ and ọ are typeset through a second embedded font whose mapping collapses them to plain e and o, so every extraction silently loses the distinction. Nothing from them may enter any store until that is solved.

On 2026-08-29 the ledger was corrected: an earlier edit had stamped PanLex, JWAL, Egbunu and Arokoyo with "permission granted on a call", and a records check found no corroboration and in three cases direct contradiction. Nothing was ever ingested under those claims; the newest dictionary and parallel rows in the database are dated 2026-08-12 and the newest reference entry 2026-08-09 (before the 9 grammar entries of 2026-08-31).

What this implies. Every arm from v2 upward (v2, v3, v4, v4.1 on every model family) draws on the Bible corpus through the dictionary and the parallel pairs. Until a written grant from the Bible Society is on file, those arms consume an unlicensed source, and the public changelog entry of 2026-08-12 in both repositories, which says "ingested under BSN permission", is wrong and must be corrected the way the 2026-08-29 entry corrected the others. If the grant does not come, the Bible rows are removed and every arm from v2 upward is re-examined without them. The blind-preference result of section 3.2 is affected too, because the v3 package that speakers preferred included Bible-derived pieces. The corpus ledger's honest ceiling stands: about 1.0 to 1.2 million Igala tokens exist under open licences, almost all of it Igala Wikipedia; a 10-million-token corpus is not assemblable legally today, and the corpus has to be built, mostly by the community.

---

## 7. Glossary

Agreement score (Community Agreement Score): a model's stripped chrF on the leak-free subset divided by the speaker ceiling of 39.5 and multiplied by 100, so that 100 means "as close to the community's writing as one speaker is to another"; the audit of 2026-09-01 found the published version gives models more references than speakers, so a like-for-like version is being introduced.

Arm: one specific configuration under test, named by model and package, for example "Gemini 3.1 Pro + v3 package" or "Claude Opus 5, bare".

Bare model: a model asked the question with no community material and no Igala instructions.

Both inadequate: the judgment in which a speaker rejects both answers in a blind pair as unusable, counted separately from wins, losses and ties.

Ceiling (speaker agreement ceiling): how closely one native speaker's answer resembles other speakers' answers to the same question, measured with chrF; the deduplicated, one-answer-per-speaker ceiling on the clean prompts is 39.5 chrF on 2026-09-01, and it is what the agreement score's 100 line means.

chrF: a character-level overlap score between a candidate text and one or more reference texts, from 0 to 100, used here after stripping tone marks; it measures resemblance to the references, not correctness.

Cold answer: a speaker's own answer to a question, written and locked before she sees any model output, stored with the provenance "speaker_authored_sourcefree".

Corrected-from-inadequate: a speaker's answer written after she has seen and rejected model output, stored with that provenance so it can be separated from cold answers; 131 of the 238 exam gold answers on 2026-09-01 are of this kind.

Frozen exam (the frozen 43): 43 questions held out from all training and pairwise serving, each with at least one consented community answer, on which every arm is scored.

Leak-free subset (the leak-free 27): the 27 of the 43 frozen questions that were never served their own community answer to any examined model; every published score is computed on these only.

Leak guard: the filter that drops any retrieved piece containing one of the 238 consented exam answers before the piece reaches a model.

Package (retrieval package, v1 to v4.1): the combination of the retrieval assembly and the instruction text (THE METHOD) placed around a question for a given version.

Paired test (paired bootstrap): a comparison of two arms computed prompt by prompt on the same 27 questions, with an interval; a difference is treated as real only when its interval does not include zero.

Pairing pool: the set of arms whose answers on training questions are eligible to be shown to speakers in blind pairs; on 2026-09-01 it holds Gemini 3.1 Pro + v3 package, bare Gemini 3.1 Pro, and Claude Opus 5 + v1 package (the last with zero comparisons and a dead key).

Pivot date: 2026-08-20, the day annotation moved from cold-authoring first to blind pairs on the strong arms; comparisons before and after it are different regimes.

Provenance: the recorded origin of a stored text (cold, corrected-from-inadequate, model correction, or an external source with its licence).

Repair round: on the v4.1 serving path, a deterministic check of the model's first answer for banned characters, hyphenated prefixes and tone saturation, followed by exactly one re-ask when a check fails, with the second answer kept.

Stripped chrF: chrF computed after removing tone marks from both the candidate and the references.

Tone density: tone marks per character in a text; the exam gold's is 0.141 on 2026-09-01.

Training prompts (train split): the 422 questions on 2026-08-20 that are not in the frozen exam and that feed the pairwise queue.

---

## 8. Dated log of the last four days' shipped changes

2026-08-29. PR #46 opened in the app repository (serving v4 with a meaning-first METHOD, corrections retrieval and register-guarded parallel pairs; in-episode corrections with required failure tags and an English rationale; the public metrics endpoint; the provenance correction). The public method page went live on the marketing site (commits 136f46b and cd0b663), with its changelog byte-pinned to the app's. The corpus ledger was corrected: PanLex, JWAL, Egbunu and Arokoyo carry no grant; GRN is the only one on file.

2026-08-30. No shipped change recorded in either repository.

2026-08-31. PR #46 merged and deployed, lighting the live numbers on the public page. PR #47: the Speakers' Verdict panel, a ranked chat picker, streaming chat, and retrieval made about four times faster. PR #48: METHOD v4.1 (eight failure-mined rules, fabrication denylist, perform-don't-describe, dialect honesty), the repair round, nine grammar-rule reference entries seeded, and the Gemini v4.1 exam at 120.1. The marketing page was rewritten in plain voice with a connected flywheel diagram and collapsible prompts (commit 5a2e70c). The email to Daniel and Lydia that the audit later corrected was sent this day.

2026-09-01. PR #49: the arena overview leads with evidence, v4.1 chat streams, and the cost ledger's $1.12 double count fixed. PR #50: the in-app how-it-works page links out to the public page with an external arrow. PR #51: the chat turn budget (partial answers and plain reasons instead of a bare 504), followed by a fix to the failed production build (route segment config must be a literal). Claude Opus 5 examined on the frozen 43 through OpenRouter for all six package versions (commit bb7eaff): 86 generations, $1.94, Claude v4.1 at 93.2. The project audit was written; no code was changed by it.
