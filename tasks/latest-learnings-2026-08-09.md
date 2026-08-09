# Latest learnings - Igala / Wikitongues AI

**Date: 9 August 2026.**

Every figure below was recomputed from the live database or from the code that produced it, by five independent verifiers plus an adversarial critic, on the day of writing. Where a number could not be reproduced, it says so. Where an earlier note in this notebook is contradicted, believe this one.

Several previously circulated numbers did not survive that check. They are corrected here rather than quietly dropped, because the corrections are more instructive than the original claims.

---

## 1. The headline, stated so it survives scrutiny

We fine-tuned a model on community-authored Igala. It beats untuned frontier models by a wide margin on character-overlap with community gold. It does **not** beat retrieval over the same gold, and it has never once been preferred by a native speaker in a blind comparison.

Live harness output, frozen 43-prompt benchmark, run 2026-08-09:

| Candidate                              | n   | chrF [95% CI]        |
| -------------------------------------- | --- | -------------------- |
| GPT-4.1 + Igala RAG                    | 43  | **26.8** [22.5-31.2] |
| GPT-4.1 mini SFT (community cold-gold) | 43  | **25.4** [18.0-34.4] |
| Gemma 4 31B + RAG                      | 41  | 25.0 [19.7-31.0]     |
| Llama 3.3 70B + RAG                    | 43  | 20.7 [16.3-25.4]     |
| Gemma 4 31B IT                         | 35  | 15.6                 |
| Gemini 2.5 Flash                       | 22  | 12.7                 |
| GPT-4.1                                | 43  | 10.4                 |
| GPT-4.1 mini                           | 43  | 9.0                  |
| Llama 3.3 70B Instruct                 | 43  | 8.1                  |

**Three corrections to what was previously circulated:**

1. The margin over untuned models is **+10.3 to +17.3**, not "+15 to +17". The low end is Gemini 2.5 Flash at +10.3 [0.9, 20.8], and that is on n=22, not 43, because the Google key hit a free-tier quota mid-run. All intervals do clear zero, but Gemini's clears it by 0.9 points.
2. "Beats every untuned frontier model" is true only if the RAG arms are excluded. Against those, the tuned model **loses** to Gemma+RAG (-2.8 [-9.2, 3.2]) and ties Llama 70B+RAG (+4.7 [-3.0, 12.8]). Both are statistically indistinguishable, so neither is a real defeat, but "beats everything" is not what the data says.
3. The Igala-identification figures were reported as "88.4% versus 9-16% for baselines". The 88.4% [75.5-94.9] is exact. The baseline range is **0.0% to 41.9%**, not 9-16%: Gemma 4 31B IT reaches 41.9% [28.4-56.7] on its own. Two GPT models happen to sit in the 9-16 band; the others do not.

### The ceiling was wrong, and fixing it matters more than any of the above

The inter-gold ceiling - how well two Igala speakers agree with each other, and therefore the practical maximum any model can score - was reported as **63.2 [58.0-68.1]**. That is what the harness prints, and it reproduces exactly.

It is also inflated, and the reason is a real methodological defect rather than a rounding issue.

The ceiling is computed leave-one-out: hold out one gold answer, score it against the remaining references, take the best match. On the 37 prompts that have two or more gold answers, **109 of 232 leave-one-out draws have an exact duplicate among the remaining references, and 58 of those duplicates were written by the same annotator.** Thirty-nine annotator-by-prompt pairs submitted the same prompt more than once. An exact duplicate scores 1.0 by construction.

So the "agreement between two speakers" number is partly one speaker agreeing with themselves. Re-running the repo's own function with duplicates handled:

| Basis                                                | Ceiling  |
| ---------------------------------------------------- | -------- |
| As shipped                                           | 63.2     |
| One answer per speaker (keep each annotator's first) | **46.0** |
| Full string deduplication                            | 39.7     |

This changes the story in both directions and neither is flattering. The honest ceiling is around **46**, which means 25.4 chrF is roughly 55 percent of human agreement rather than 40 percent - the model looks _better_. But the project's flagship methodological contribution, the thing most worth publishing, was measuring something other than what it claimed. **A ceiling that counts a repeat submission as a second speaker is not a measure of inter-speaker agreement.**

That the error makes our results look worse when corrected is precisely why it needed to be caught by someone trying to break it, not by someone confirming it.

### What chrF measures, and the circularity in it

chrF is character n-gram overlap with a human answer, 0 to 100. It is not fluency and not correctness. It measures resemblance to _this_ community's writing: their tone-marking habits, their spelling, their dialect.

Supervised fine-tuning on their gold teaches exactly those habits. A chrF gain from SFT is therefore partly circular - we trained on proximity to the thing we then measured proximity to. The gain is still real (going from "produces Yoruba" to "overlaps community Igala" is genuine), but "higher chrF" means "writes more like these six speakers", not "speaks Igala well".

One more scale caveat: the **median gold answer is 18 characters**, and **409 of 937 (43.7%) are under 15 characters**. Every chrF number in this record is character overlap on strings about the length of a single word.

---

## 2. The finding that should reorder the roadmap: retrieval ties fine-tuning

Difference between GPT-4.1+RAG and the tuned model: **+1.4 [-6.8, 9.0], n=43. Not distinguishable.**

And retrieval helps every base model it is applied to, paired against that model's own untuned self:

| Base model    | plain → +RAG           |
| ------------- | ---------------------- |
| GPT-4.1       | **+16.4** [11.7, 21.1] |
| Llama 3.3 70B | **+12.6** [7.6, 17.7]  |
| Gemma 4 31B   | **+10.4** [2.4, 17.8]  |

All three exclude zero.

Both methods do the same underlying thing: put real Igala in front of the model. Fine-tuning puts ~900 examples in the weights, once, expensively. Retrieval puts three or four in the prompt at question time. The tie says that for a language the base knows essentially nothing about, seeing a few real examples _now_ is about as good as having been trained on all of them.

The implication is uncomfortable and worth stating: **the model has not learned Igala. It is copying** - orthography, vocabulary, sentence shape - from whatever real Igala is nearest to hand. Fine-tuning does not change that behaviour, it relocates the examples.

The cost asymmetry makes the point sharper. The retrieval arm cost **$0.48** in inference. The fine-tuning arm cost **$9.85** in training jobs. Same measured quality, roughly 20x cheaper, and instantly updatable when the corpus grows instead of requiring a retrain.

### Two things that complicate the tie

**Retrieval and fine-tuning win different things.** On the language gate, the fine-tune identifies as Igala 90.7% of the time against GPT-4.1+RAG's 39.5%. RAG makes a model _match gold characters_; SFT makes it _stay in the language_. chrF conflates these. A model that combines both is the obvious untried experiment.

**Split design flatters RAG.** Frozen prompt `ig_bank_orth_013` ("morning" and "night") has a near-duplicate in train (`ig_orth_001`, "morning"). Retrieval legitimately finds it, and no held-out gold leaked, but part of the RAG gain reflects how the split was drawn rather than retrieval generality. The frozen prompts are template instances - `ig_bank_gram_003` is "Translate 'I drink water' into Igala", `ig_bank_lex_003` is "Give the Igala word for 'hand'" - so the training set teaches the answer key by construction, not by ID leakage.

**Open weights are closer than the plain scores suggest.** Llama 3.3 70B is _last_ untuned at 8.1, but Llama+RAG at 20.7 beats GPT-4.1 plain at 10.4, and Gemma 31B+RAG at 25.0 is level with the fine-tune. Retrieval closes the open/closed gap more than model scale does.

### A concrete example, which is more persuasive than the table

Prompt: the Igala word for water. Gold: **Omi**.

- Every plain model: _ámẹ́_, _amá_, _màíí_ - Yoruba-flavoured, wrong.
- Every RAG variant: **Ómi**.
- The fine-tune: **Omi**.

Same pattern for "husband" (gold _Oji_; plain models give _úchu_, _Ǹdá_, _Àgbá_). On one register prompt GPT-4.1 plain answered in English; with RAG it produced _"Wọla ọdudu"_ exactly. On a dialect prompt, GPT-4.1 plain answered **in Igbo**.

---

## 3. The metric and the speakers disagree, and the speakers are the ones who count

Of **781 blind pairwise comparisons: 775 (99.23%) were "both inadequate".** Five picked a side (three chose position b, two chose position a) and one was an explicit tie. Zero nulls.

Five decisions splitting 3-2 across positions at n=5 is indistinguishable from a coin flip. There is **no preference signal in this dataset at all** - which also means there is currently no DPO training data, despite that being the method the collection was designed for. The value of those 781 rows is in the failure tags and in the negative finding itself.

So: automatic chrF says the adapted models improved enormously; native speakers say none of the output is acceptable. Both are true. We moved the models from **not speaking the language to speaking it badly**, and only the first half of that is measurable with the tools we have.

This is why the arena UI now reports "absence of signal" rather than a sorted table. A ranking implies decisions that were never made.

### The autorater does not work, and that is a publishable result

Raw agreement with human verdicts: **90.5% on n=781**. That looks like validation.

A rater that blindly says "both inadequate" every time scores **99.2%**. Cohen's kappa is **-0.014**, marginally worse than chance once class imbalance is accounted for. Of the five human-decided comparisons, only two had gold, and the autorater matched neither.

The generalisable lesson: **for a very low-resource language, an LLM autorater measures the same ignorance it is meant to evaluate.** The judge does not know Igala either. Report raw agreement without a majority baseline and you publish a number that looks like validation and is worthless. Ours is retained as a regression alarm, not a ranker.

---

## 4. Consent: the most consequential finding, and it was ours

`consentBenchmark` is a per-answer permission annotators set. It had one writer and, for benchmark purposes, no reader. **Eight answers whose authors declined benchmark use were being included anyway.**

Verified detail matters here in both directions:

- The harm was narrower than first reported. All 8 sit on train-split prompts, so they never entered the scoring references. The actual exposure was the Igala language-identification profile, which trains on all non-demo gold.
- The problem was **wider** than first reported. The claim that `collect.ts` was the only benchmark consumer of gold was **false**. An exhaustive sweep of 14 read sites found three more benchmark readers with no consent filter, including `igala-rag-run.ts`, which reads gold and feeds it to _both_ the chrF references and the language profile - the exact pair of uses the original fix addressed, in a file written after that fix landed. All four are now filtered in the query.
- `consentTraining` is separately withheld on **10** answers. The two sets are **disjoint**: nobody withheld both, 919 granted both. Real annotators are exercising the two permissions independently, which is the strongest argument that treating them as interchangeable would be a substantive wrong rather than a technicality.

The rule this produced, now standing: **community consent is enforced in code, not in comments.** Pick the right permission for the use, enforce it in the query rather than downstream, count and surface what was excluded, and document any carve-out. A permission nothing reads is worse than none, because it looks like it works.

### The larger gap, which is not a code problem

**Nothing in this project records what the six contributors were told, or what they were paid.** There is no consent-form text, no data-use agreement, and no licence under which the 937 answers may be released. Project notes variously mention a "modest volunteer budget", a "$105-per-reviewer-hour" figure, and a compensation mechanism being built.

For a project whose loudest ethical finding is that a consent checkbox had no reader, the absence of a written agreement with the people who produced the corpus is the more serious version of the same failure. This should be resolved before any public release of the data.

---

## 5. The corpus, which is the actual bottleneck

### Verified

- **Igala Wikipedia is CC BY-SA 4.0** - confirmed directly from the MediaWiki API (`rightsinfo`), not inferred.
- **It went live 23 April 2024** - confirmed from log entry 1 on the wiki itself.
- **Wikitongues helped create it.** The Igala Wikimedia Community's own post says: "We express our deepest gratitude to the Wikitongues team for selecting Igala as one of the languages for the Language Accelerator Program in 2023." (Note: _Accelerator_, not _Acceleration_, which our documents get wrong in two places.)
- **Igala is absent from FLORES-200/NLLB, MADLAD-400, Glot500, all four Masakhane benchmarks, Common Voice and Tatoeba** - all six re-verified with positive controls passing. Two of these had previously been asserted without checking; they hold.

### Not verified

The headline **484,446-word** Wikipedia figure **did not reproduce**. An independent re-parse of the identical dump gives **555,472 alphabetic words across 1,866 pages**, 15-20% higher. The magnitude (half a million words) holds; the precise figure does not, and the derived "~390,000 usable" inherits the unreproduced base. The stripping code was never published, so the discrepancy cannot be adjudicated. Treat all corpus-size figures as order-of-magnitude.

### The first-of-kind claim is false

Previously recorded: "There is no Igala model on HuggingFace and no purpose-built Igala dataset. This appears to be the first."

Both halves are wrong:

- `jtl-ayo/dala-igala-mbart50` - an Igala translation model, created 29 April 2026.
- `dalaone/eng_igl_bible` - 31,085 English-Igala parallel rows, created 13 March 2026.

Both predate our first fine-tune. The cause is a method flaw, not bad luck: the entire absence audit keyed on the ISO code `igl`, and the Bible dataset is tagged `iga` while the model carries no language tag at all. Neither surfaces in an `igl` sweep.

We already knew the Bible dataset existed - it appears in our own contamination warnings - while the notebook simultaneously claimed no such dataset existed. Two parts of the record contradicting each other is the failure mode to watch for.

A useful corollary: our corpus notes treat the Igala Bible as a permission target of _estimated_ size. 31,085 aligned verse pairs are already public. Whether that upload is a licensed use of the Bible Society text is the real question, and a sharper one.

### Lexical coverage is the binding constraint, and it is worse than assumed

The lexicon grew 2.6x today (a chikhapo import added 494 gloss lines, taking distinct headwords from 301 to **779**). Nobody had measured the thing that actually matters, so we did:

- Exact-match coverage of community gold word forms by the lexicon: **40 of 1,554 = 2.6%**.
- After folding tone diacritics and mapping phonemic characters: **134 of 1,144 = 11.7%**.

The dictionary-prompting literature (DiPMT) puts the threshold where a lexicon starts beating baseline at 5-20% word-type coverage. We are at the bottom of that band at best. **This is why acquiring the Idakwoji lexicon (5,000+ headwords, roughly 6x our current total) outranks any further training run.**

### Nothing can embed Igala

No commercial embedding model covers Igala, so vector search over Igala text is close to meaningless. The workaround shapes what data is valuable: retrieve on the **English** side, using the glosses annotators write beside their answers.

That retroactively justifies requiring an English gloss - it is the retrieval index, not documentation hygiene. **But the gloss exists on only 338 of 937 answers (36.1%).** Two-thirds of the corpus is not semantically searchable. The dialect field, added for the same reason, is populated on 39 answers (4.2%) across three values, which is far too thin to support any dialect claim - in a project whose stated explanation for the low ceiling is dialect variation.

### The Yoruba double-edge, and a live example

Yoruba is Igala's nearest well-resourced relative. It is why a Yoruba-exposed base is the best transfer bet, and why the models fail as they do: asked for Igala, they produce Yoruba.

We hit this in our own data. Thirteen seed reference entries shown to annotators as authoritative Igala were **Yoruba** (`Okpa` for 1, `Eje` for 7, `Egbon`/`Aburo` for siblings). They were quarantined.

Two caveats on that quarantine, both found today:

1. **It exists only in production Postgres.** A repo-wide search finds no migration, no script, no changelog entry. If the database is rebuilt from the repo, all thirteen Yoruba rows return as `language='igala'` and re-enter the annotator reference set.
2. It was applied by **raw SQL with no audit trail** - `updatedAt` is identical to `createdAt` to the millisecond, so Prisma never touched it and nothing records when the change happened.

---

## 6. What the collected data actually looks like

| Measure                                         | Value                                                     |
| ----------------------------------------------- | --------------------------------------------------------- |
| Community gold answers                          | 937 (933 from 6 real contributors, 4 from a seed account) |
| Prompts                                         | 465 (421 train, 43 test, 1 dev)                           |
| Prompts with any gold                           | 177 of 465 (38.1%)                                        |
| Prompts with zero gold                          | 288 (62%)                                                 |
| Pairwise comparisons                            | 781                                                       |
| Rubric scores recorded                          | 13 axis rows, 2 score rows (both from a seed account)     |
| Exact-duplicate gold answers on the same prompt | 328 of 937 (35%), 157 of them across different annotators |
| Prompts authored by an LLM                      | 457 of 465 (98%); 38 of the 43 frozen benchmark prompts   |

Three things in that table deserve attention:

**The benchmark is 88% written by Claude.** A language-preservation organisation's Igala benchmark - the artifact defining what is worth asking an Igala speaker - was overwhelmingly written by the class of system it evaluates. The 165 long-form community-relevant prompts added in wave 2 are _entirely_ in train, so the frozen benchmark is 100% short-form.

**Elicitation ran out before the benchmark did.** 62% of prompts have no gold at all. The binding constraint was not corpus design; it was that six volunteers' time ran out around prompt 177.

**The rubric arm has essentially no data.** Two real rubric scores exist in the entire database. That part of the eval design is unexercised.

One good finding: the work is **evenly distributed**, not concentrated in one person - 230, 190, 141, 136, 127 and 109 gold answers across the six contributors.

---

## 7. Engineering and cost

**Real recorded spend is $9.87**, not the ~$14 previously stated: two Together fine-tunes at $4.00 each, one OpenAI SFT at $1.85, and $0.02 of eval. Zero GPU endpoints are running on either tier.

But that total is a **floor, not the bill**. A purpose-built `CostEntry` table exists with a complete schema and **zero rows**; nothing writes to it. Cost lives ad hoc on two models, and neither arena generation nor LLM-judge calls have a cost column at all. Every inference dollar spent is invisible to the books. That is very likely how a ~$14 figure came to circulate.

**Vendor lessons, now encoded rather than remembered:**

- A Together fine-tune is servable only if **one** registry entry carries both `PRODUCT_FINE_TUNING` and `PRODUCT_DEDICATED` with a certified config. The trainable and deployable objects for the "same" model are different registry entries. $8.00 was spent on two models that trained successfully and could not be served before this was understood.
- Together bills `total_price` in **nano-USD**. A $4.00 job returns 4000000000, which once displayed as $4,000,000,000.
- The servable id comes back as `model_output_name`, not `output_name`. Reading the wrong field registered synthetic ids no inference host would accept.

**Neither of the two most expensive lessons has a regression test.** The nano-USD divisor appears exactly once in the codebase and nothing asserts it; nothing asserts the `model_output_name` preference order. Both are one-line behaviours that have already cost real money.

**Silent fallbacks hide broken systems.** Semantic retrieval had been degrading to near-arbitrary keyword matching because pgvector lives in the `extensions` schema while `search_path` was `wikitongues` only, and the error was caught and swallowed. The fix qualifies both the cast and the operator: `ORDER BY embedding OPERATOR(extensions.<=>) $2::extensions.vector`. An earlier note claiming the `<=>` operator "cannot be schema-qualified" is **wrong** - `OPERATOR(extensions.<=>)` works, bare `<=>` raises 42883 - and its recommended alternative of widening `search_path` is unsafe under Supabase connection pooling.

**A real bug that had been silently zeroing the open-weights arm:** the model resolver sent OpenAI-_compatible_ providers to the Responses API, which only OpenAI implements. Together rejected every call. Open weights were unreachable until this was fixed, which means earlier open-model comparisons were measuring nothing.

**Key state:** the Anthropic key is out of credit, so Claude Opus 4.8 could not be measured at all. The Google key is valid but free-tier at roughly 20 requests/day, which is why Gemini 2.5 Flash has n=22 and Gemini 2.5 Pro has none.

---

## 8. Method lessons worth carrying to other projects

**A permission nothing reads is worse than no permission at all.** It manufactures the appearance of consent management.

**A guard nobody has watched fail is not a guard.** Multiple tests here passed while asserting things that were false or about to become false. The consent test was verified failing by deliberately removing the filter. By contrast, the shared-vocabulary language-ID fix - which raised cross-validated accuracy from 49.5% to ~81% - has **no** regression test: reverting it leaves the suite passing 19/19, because the assertions are loose thresholds against a fixture too small to exercise the bug.

**Verify the claim, not the vibe.** An early "the model shows first signs of Igala" read was eight cherry-picked samples, not an evaluation. The harness exists because that was challenged.

**Check that your check checks something.** A clean `git status` proves nothing about an untracked file.

**Adversarial verification finds what confirmation cannot.** Five verifiers confirmed the 63.2 ceiling to the decimal. Not one asked what it was made of. A sixth agent, tasked only with attacking, found the duplicate-inflation in minutes. Confirmation and refutation are different jobs and need different instructions.

**Beware corrections that flatter you.** Three of the four fixes to our headline paragraph make the model look _better_ on paper - a lower ceiling raises the percentage-of-human figure. That is exactly why a writer optimising for a good headline would leave the inflated ceiling in place.

---

## 9. Open questions

- Does whole-corpus long-context beat chunked retrieval at ~half a million words? MTOB suggests it might. Untested.
- Does a model that combines SFT (stays in language) with RAG (matches gold) beat either alone? This is the obvious next experiment and nothing blocks it.
- Is cross-annotator duplication on single-word prompts convergence evidence, or an artifact of an interface that shows annotators each other's answers? 157 cases; currently unmeasured, and measurable.
- What is the minimum lexical coverage at which output stops being word-salad? We are at 2.6-11.7% against a literature threshold of 5-20%.
- Do multilingual embedders help, or do they inject Yoruba drift?
- Does showing the model inconsistent community tone-marking teach it inconsistency?
- Can DPO be attempted at all, given that 775 of 781 comparisons produced no preference?

---

## 10. What should happen next, in order

1. **Write the consent form and data-use agreement**, retroactively if necessary, and record what contributors were told and paid. Nothing else on this list matters as much.
2. **Fix the inter-gold ceiling** to deduplicate by annotator, and restate every result against ~46 rather than 63.2.
3. **Persist the Yoruba quarantine into a migration** before the database is ever rebuilt.
4. **Pursue the Idakwoji lexicon** (5,000+ headwords). Lexical coverage, not model architecture, is the binding constraint.
5. **Get more prompts answered** - 62% have no gold, and elicitation capacity, not prompt supply, is the limit.
6. **Add regression tests** for the nano-USD conversion, the `model_output_name` ordering, and the language-ID smoothing fix.
7. **Run the SFT+RAG combination** on the frozen benchmark.
8. Correct the first-of-kind claim wherever it has been repeated, and re-run the absence audit keyed on `iga` and `igala` as well as `igl`.
