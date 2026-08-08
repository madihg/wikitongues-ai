# Igala Corpus Coverage Audit v1

Date: 2026-07-29. Source: Supabase `smytgqkgomsfyurskpcl`, schema `wikitongues`, read-only queries against `Prompt` (300 rows) and `ColdAuthorAnswer` (547 rows, `isDemo=false` for all of them - there is no demo contamination to filter). Cross-referenced against `tasks/eval-freeze-v1.json` (the 43-prompt frozen benchmark, frozen 2026-07-28).

## Methodology (read this before the numbers)

The platform already classifies every prompt by **EvalBucket** (the 8-axis linguistic/pragmatic taxonomy: orthography, grammar_tone, lexicon_disambig, dialectal_fidelity, register_honorifics, idioms_metaphor, cultural_values, authenticity). That taxonomy answers "what linguistic skill does this test." It says nothing about "what is this prompt actually about," which is what the requested 9-domain matrix needs. So this audit adds a second, independent classification on top:

- **Domain** (9 buckets: household/daily life, farm+food, market+trade, kinship+ceremony, faith+proverbs+stories, body+health, weather+nature, civic+news, modern life+tech). Assigned by reading each of the 300 prompt texts and applying a priority-ordered keyword rule set (kinship/ceremony terms checked first, then faith/proverb/story terms, then market terms, then modern/tech terms, then farm/food terms, then body terms, then civic/governance terms, then nature terms, defaulting to household/daily life). This is a judgment call, not an authoritative label - a handful of prompts are genuinely two-domain (e.g. "the man who farms yam is my uncle" reads as both farm_food and kinship; it was filed under kinship because the elicited vocabulary target is the kinship term). Full per-prompt assignments are reproducible from the rule set; spot-checked by hand after finding and fixing one keyword-collision bug (an early pass matched "ate " inside the word "Translate" and mis-tagged ~15 grammar prompts as farm_food).
- **Length band** of each gold answer: word = 1-3 whitespace-delimited tokens; sentence = more than 3 tokens with at most one terminal-punctuation-delimited clause; passage = 2 or more sentences. Mechanical, not judged.
- **Token** = whitespace-delimited word, for both English and Igala text. There is no Igala-aware tokenizer in the pipeline (nor a widely-available BPE vocabulary tuned to Igala orthography), so this is a proxy, not a subword count. Treat the token totals below as "word count," not "model tokens."
- **Register** (neutral / respectful-elder / casual): tagged only where the prompt text makes it inferable. `register_honorifics`-bucket prompts and any prompt mentioning elder/respect/honorific/chief/Attah/council/titled -> respectful_elder. Any prompt mentioning friend/casual/joking/teasing/neighbour/peer -> casual. Everything else -> neutral. This is a lighter-touch pass than domain/length; treat it as directional, not a rigorous label.

## (a) The matrix

### Prompts per domain (all 300, train+dev+test)

| Domain                 | Prompts | Gold rows | Gold/prompt | Prompts w/ >=1 gold | Prompts w/ 0 gold |
| ---------------------- | ------: | --------: | ----------: | ------------------: | ----------------: |
| household_daily_life   |     118 |       257 |        2.18 |                  46 |                72 |
| faith_proverbs_stories |      55 |        37 |        0.67 |                   7 |                48 |
| farm_food              |      47 |       143 |        3.04 |                  26 |                21 |
| kinship_ceremony       |      33 |        28 |        0.85 |                   7 |                26 |
| market_trade           |      16 |        26 |        1.62 |                   6 |                10 |
| civic_news             |      12 |        12 |        1.00 |                   2 |                10 |
| weather_nature         |       9 |        25 |        2.78 |                   8 |                 1 |
| modern_life_tech       |       5 |        12 |        2.40 |                   1 |                 4 |
| body_health            |       5 |         7 |        1.40 |                   5 |                 0 |
| **Total**              | **300** |   **547** |    **1.82** |             **108** |           **192** |

108 of 300 prompts (36%) have any gold at all; 192 (64%) have zero. Corpus-wide average is 1.82 gold rows/prompt, but that average is propped up almost entirely by two domains (farm_food, household_daily_life) that inherit the "mega-seed" prompts from the orthography and grammar_tone buckets.

### Gold per domain x length band

| Domain                 |          word |      sentence |      passage |   total |
| ---------------------- | ------------: | ------------: | -----------: | ------: |
| household_daily_life   |     152 (59%) |     105 (41%) |       0 (0%) |     257 |
| farm_food              |      63 (44%) |      80 (56%) |       0 (0%) |     143 |
| faith_proverbs_stories |      13 (35%) |      24 (65%) |       0 (0%) |      37 |
| kinship_ceremony       |      11 (39%) |      17 (61%) |       0 (0%) |      28 |
| market_trade           |       6 (23%) |      19 (73%) |       1 (4%) |      26 |
| weather_nature         |      21 (84%) |       4 (16%) |       0 (0%) |      25 |
| modern_life_tech       |      10 (83%) |       2 (17%) |       0 (0%) |      12 |
| civic_news             |       9 (75%) |       3 (25%) |       0 (0%) |      12 |
| body_health            |       4 (57%) |       3 (43%) |       0 (0%) |       7 |
| **Total**              | **289 (53%)** | **257 (47%)** | **1 (0.2%)** | **547** |

Passage-length gold is not merely thin, it is functionally absent: 1 row out of 547, and that one row (a list of the four market-week day names, each with a one-clause gloss) is a borderline case, not a genuine multi-sentence composition.

### Supplementary: gold per EvalBucket x length band

| Bucket              | word | sentence | passage | total |
| ------------------- | ---: | -------: | ------: | ----: |
| orthography         |  190 |       59 |       1 |   250 |
| grammar_tone        |   49 |      148 |       0 |   197 |
| lexicon_disambig    |   28 |       15 |       0 |    43 |
| register_honorifics |   11 |        9 |       0 |    20 |
| dialectal_fidelity  |   11 |        4 |       0 |    15 |
| idioms_metaphor     |    0 |        8 |       0 |     8 |
| authenticity        |    0 |        7 |       0 |     7 |
| cultural_values     |    0 |        7 |       0 |     7 |

orthography + grammar_tone alone = 447 of 547 gold rows (81.7% of the entire corpus). authenticity + cultural_values + idioms_metaphor together = 22 gold rows (4.0% of the corpus) despite being 120 of 300 prompts (40% of the prompt bank). Those three buckets are also the only ones with **zero word-length gold at all** - every gold row in them happens to land at exactly "sentence" length, with no short-form and no long-form variation.

## (b) Top 5 gaps, ranked

1. **Passage-length gold is corpus-wide absent (1/547, 0.2%).** Every domain, every bucket, is essentially zero. This is not a domain problem, it's a length-band problem sitting on top of everything else: the corpus currently cannot train or evaluate multi-sentence Igala generation (a folktale opening, a full proverb-plus-situation explanation, a festival description) because no gold example of that shape exists to imitate or score against. This is the single highest-leverage fix available.

2. **authenticity + cultural_values + idioms_metaphor (120 prompts, 40% of the bank) return only 22 gold rows (4.0% of gold), and all 22 are sentence-length.** These are exactly the buckets meant to carry the corpus's hardest, most distinctively Igala content (proverbs, festivals, masquerades, natural voice) and they are the most gold-starved. faith_proverbs_stories domain overall sits at 0.67 gold/prompt, the lowest of any domain, worse than kinship_ceremony (0.85).

3. **civic_news and modern_life_tech have essentially no footprint and zero benchmark presence.** civic_news: 12 prompts, only 2 have any gold, 0 of them in the 43-prompt frozen exam. modern_life_tech: 5 prompts total (smallest domain in the corpus), only 1 with gold, 0 in the exam. Whatever the model can or can't do on governance/chieftaincy topics or on modern/urban/code-switched Igala is currently untested and untrained-for.

4. **Casual register is nearly nonexistent and concentrated in 2 of 9 domains.** Only 11 of 300 prompts (3.7%) read as casual/peer register; 9 of those 11 are household_daily_life and 1 is farm_food. Seven of nine domains (market_trade has 1) have literally zero casual-register prompts: kinship_ceremony, faith_proverbs_stories, body_health, weather_nature, civic_news, and modern_life_tech all default to neutral or respectful-elder framing. If the goal is a model that can also speak Igala the way peers actually talk to each other (as opposed to elder-facing or textbook-neutral registers), this is a blind spot across most of the topic space.

5. **body_health is a domain in name only.** All 5 prompts in it are single-word body-part lookups (head, hand, arm, "carry on the head," medicine). There is no illness, symptom, pain-description, or care-register content anywhere in 300 prompts. It has the best gold/prompt ratio of any domain (1.40, and 5/5 prompts have gold) purely because it is so small - a ratio that will collapse the moment the domain is actually built out.

## (c) Token-yield stats

- Total tokens (whitespace-word count) across all 547 gold answers: **2,500**.
- Mean tokens/answer: **4.57**.
- Passage-length answers: 1 of 547 (0.2% of answers), contributing 30 tokens (**1.2% of all tokens**).
- Practical read: essentially the entire token yield of the corpus today (98.8%) comes from single words and single sentences. There is no meaningful long-form signal to train or evaluate against yet - "more passage-length gold" is not a nice-to-have, it's the only way this corpus acquires any long-form Igala at all.

## (d) 10 observations for authoring

1. Orthography and grammar_tone are saturated relative to everything else (81.7% of gold from 2 of 8 buckets); further authoring effort there has sharply diminishing returns compared to the other six buckets.
2. faith_proverbs_stories has 55 prompts but a 0.67 gold/prompt ratio and zero passage-length gold, despite idioms_metaphor being the one bucket in the platform explicitly designed to elicit "proverb + explanation + situation" (naturally 2-3 sentences). The prompt design already asks for it; the gold simply hasn't been authored at that length.
3. cultural_values prompts ask explanatory questions ("describe," "explain") that plainly invite multi-sentence answers, yet 100% of its 7 gold rows are single-sentence. Prompt phrasing alone does not produce length variety - annotators need an explicit length instruction in the prompt itself (e.g. "in 2-3 sentences") or a UI nudge, not just an open-ended "explain."
4. civic_news and modern_life_tech are both real domains for the Igala corpus strategy (governance/Attah institution content; urban code-switched/tech-adjacent Igala) but were never built out as prompt categories the way orthography/grammar/register were. They need net-new prompt authoring, not just net-new gold on existing prompts.
5. body_health needs to be built from near-zero: not just more vocabulary items, but a genuine sub-topic split (illness/symptom description, traditional-remedy discussion, talking to a healer, comforting someone unwell) matching how the other 8 domains actually have topic range.
6. Casual register is a corpus-wide gap, not a domain-specific one: 7 of 9 domains have zero casual-register prompts. This likely under-serves the "authenticity vs translationese" goal (Lydia/Agnes's stated concern) since peer-register speech is one of the places translationese is easiest to hear.
7. kinship_ceremony has 33 prompts (naming ceremonies, funerals, weddings, in-law terms) but only 7 with gold and just 1 in the frozen benchmark - it is both under-gold'd and under-tested relative to its prompt-bank size.
8. dialectal_fidelity is the one bucket deliberately kept at 20 prompts instead of 40 (per the existing taxonomy decision to treat dialect as a smaller/experimental axis), and it maps almost entirely to household_daily_life or modern_life_tech domains (greetings, code-switching) rather than spreading across the other 7 - if dialect variation matters for a domain like farm_food or kinship_ceremony, that is currently untested.
9. weather_nature and market_trade are small (9 and 16 prompts) but comparatively healthy on gold/prompt (2.78 and 1.62) - they need volume more than they need gold-authoring urgency; treat them as lower priority than civic_news/modern_life_tech/body_health for the next wave.
10. The single existing passage-length gold row (the four market-week day names with glosses) shows the shape a real passage answer takes in this format: several short factual clauses concatenated, not free-running prose. Authoring guidance for new passage-length gold should give annotators/cold-authors a concrete model of what "2+ sentences" should look like for Igala (a short structured list, a 2-3 sentence narrative beat, a proverb-plus-explanation-plus-example) rather than leaving the shape undefined - that ambiguity may be part of why passage-length gold never got produced.

## (e) Recommended quota for the next 100 prompts

Ordered by priority (civic_news and modern_life_tech first, since they are both volume-poor AND absent from the frozen benchmark; household_daily_life and farm_food last, since they are already the deepest domains). Length columns are the _target elicitation length_ to write into the new prompt's instruction text (e.g. "in one sentence" vs "describe in 2-3 sentences"), not a hope that annotators self-select length - observation 3 above is the reason to be explicit.

| Domain                 | New prompts |   Word | Sentence | Passage | Register note                                                                                           |
| ---------------------- | ----------: | -----: | -------: | ------: | ------------------------------------------------------------------------------------------------------- |
| civic_news             |          16 |      4 |        6 |       6 | mix neutral/respectful-elder (addressing chiefs); include >=3 casual (peer talk about local governance) |
| modern_life_tech       |          14 |      4 |        6 |       4 | skew casual (urban/youth voice); this is the domain most naturally casual-register                      |
| kinship_ceremony       |          14 |      3 |        6 |       5 | keep respectful-elder for blessings/condolences; add >=3 casual (sibling teasing, peer family gossip)   |
| faith_proverbs_stories |          14 |      2 |        5 |       7 | heaviest passage push - explicitly instruct "proverb + explanation + example situation"; add >=2 casual |
| body_health            |          12 |      3 |        6 |       3 | build real sub-topics (illness, remedy, care-register), not just more vocabulary; add >=3 casual        |
| weather_nature         |          10 |      3 |        5 |       2 | mostly neutral; add >=2 casual (weather small talk)                                                     |
| market_trade           |           8 |      2 |        4 |       2 | already has some casual - maintain it                                                                   |
| household_daily_life   |           6 |      1 |        3 |       2 | do not add more casual here, it is already saturated; use these 6 to seed passage-length only           |
| farm_food              |           6 |      1 |        3 |       2 | same logic as above - passage-length seeding, not volume                                                |
| **Total**              |     **100** | **23** |   **44** |  **33** |                                                                                                         |

This quota deliberately over-indexes passage (33% of new prompts) against its current 0.2% share of gold, and sentence (44%) as the workhorse band, while word-length (23%) gets the smallest share since that band is already well served corpus-wide (289 of 547 existing gold rows, 53%).

## Frozen benchmark (43 prompts) domain spread

| Domain                 | Frozen prompts | Share of 43 |
| ---------------------- | -------------: | ----------: |
| household_daily_life   |             19 |         44% |
| farm_food              |              8 |         19% |
| weather_nature         |              6 |         14% |
| faith_proverbs_stories |              4 |          9% |
| market_trade           |              3 |          7% |
| body_health            |              2 |          5% |
| kinship_ceremony       |              1 |          2% |
| civic_news             |              0 |          0% |
| modern_life_tech       |              0 |          0% |

**The exam does not cover the matrix.** 2 of 9 domains (civic_news, modern_life_tech) have zero presence in the held-out benchmark, and household_daily_life alone accounts for 44% of it. This mirrors the gold-corpus skew almost exactly (household_daily_life and farm_food dominate both the gold pool and the benchmark) because the freeze was built by stratifying the three "mega-seed" bucket families (orth/gram/lex) that happen to fall mostly in those two domains, plus one single-gold prompt each for the thin buckets. The freeze's own rationale doc (`tasks/eval-freeze-v1.json`) is explicit that this was a bucket-coverage freeze, not a domain-coverage freeze - so this finding is not a bug in the freeze, it is a real gap the freeze inherited from the underlying corpus and that the next authoring wave should close before the next benchmark freeze. Practically: any future re-freeze (or a v2 supplementary benchmark) should specifically pull in civic_news and modern_life_tech prompts once they have gold, since right now there is nothing in the exam to catch a regression or measure progress in either domain.

## Appendix: full bucket x domain crosstab (prompts, all 300)

| Domain                 | authenticity | cultural_values | dialectal_fidelity | grammar_tone | idioms_metaphor | lexicon_disambig | orthography | register_honorifics |
| ---------------------- | -----------: | --------------: | -----------------: | -----------: | --------------: | ---------------: | ----------: | ------------------: |
| household_daily_life   |           17 |               8 |                 11 |           15 |               2 |               15 |          23 |                  27 |
| farm_food              |            8 |               7 |                  0 |           17 |               0 |                6 |           6 |                   3 |
| faith_proverbs_stories |            6 |               5 |                  2 |            1 |              36 |                2 |           2 |                   1 |
| kinship_ceremony       |            6 |               9 |                  1 |            2 |               2 |                4 |           3 |                   6 |
| market_trade           |            3 |               4 |                  1 |            3 |               0 |                3 |           2 |                   0 |
| civic_news             |            0 |               7 |                  0 |            0 |               0 |                0 |           2 |                   3 |
| weather_nature         |            0 |               0 |                  1 |            2 |               0 |                4 |           2 |                   0 |
| modern_life_tech       |            0 |               0 |                  4 |            0 |               0 |                1 |           0 |                   0 |
| body_health            |            0 |               0 |                  0 |            0 |               0 |                5 |           0 |                   0 |

## Appendix: register spread (prompts, all 300)

Overall: neutral 222 (74%), respectful_elder 67 (22%), casual 11 (4%).

| Domain                 | neutral | respectful_elder | casual |
| ---------------------- | ------: | ---------------: | -----: |
| household_daily_life   |      74 |               35 |      9 |
| faith_proverbs_stories |      46 |                9 |      0 |
| farm_food              |      41 |                5 |      1 |
| kinship_ceremony       |      24 |                9 |      0 |
| market_trade           |      15 |                0 |      1 |
| civic_news             |       3 |                9 |      0 |
| weather_nature         |       9 |                0 |      0 |
| modern_life_tech       |       5 |                0 |      0 |
| body_health            |       5 |                0 |      0 |

## Caveats

- Domain and register labels are Claude's judgment calls against a documented rule set, not ground truth; they are reproducible but not authoritative, and Lydia/Agnes should spot-check before this drives a large authoring commitment.
- Length band is mechanical (word count + terminal-punctuation count) and does not evaluate quality; a 3-word gold row could be a rich idiom or a throwaway lookup answer, this audit cannot tell those apart.
- Token counts are whitespace-word counts, not subword/model tokens, because there is no production Igala tokenizer in the pipeline; treat the "2,500 tokens" figure as "2,500 words."
- This audit did not weight by `isHoldout`/`split`; a prompt's gold count includes gold on both train and test-split prompts. The eval-freeze document already tracks the train/test split separately and that invariant was not re-checked here.
