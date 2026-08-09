# Serving retrieval to models generating Igala - the design

**Date:** 2026-08-09. **Status:** design, not built. A later agent implements.
**Scope:** how retrieval should work for every path that asks a model to produce Igala - the arena eval runs, the learner chat, and the annotator reference panel.

Every number in Part 1 and Part 2 was measured against the live database or the live OpenAI API on 2026-08-09. Where a claim comes from the literature it carries a link. Where the evidence is thin it says so in Part 8.

---

## 0. The recommendation, in one paragraph

**Build a small curated static Igala pack (~6k tokens, prompt-cached) plus a tight per-query hybrid retrieval layer (~4k tokens), and do not build semantic RAG over Igala Wikipedia prose, and do not put the corpus in a long context window.** The hybrid has a measured division of labour: dense embeddings over the **English** face of every chunk (topic, gloss, definition), because our queries are English and `text-embedding-3-small` handles English fine; and a **folded-headword lexical index** over the **Igala** face, because the same embedder has literally zero Igala lexical knowledge - measured at exactly chance below, and confirmed by the fact that Igala appears in the language list of no production embedding model that exists. Retrieval injects three things and only three: dictionary entries for the words in the query, community-gold exemplars for the bucket, and an orthography contract. Encyclopedic prose is retrieved only for the two cultural buckets and only above a confidence threshold. The 1854 Koelle wordlist, which currently supplies **49% of all top-1 retrievals on our frozen benchmark**, gets demoted out of the default path because its orthography is 172 years old and the literature says the model will copy the format it is shown. A real grammatical description of Igala now exists under an open licence, which makes the MTOB "grammar in context" option concrete for the first time - so we cost it, run it as an eval arm for $2.26, and still do not adopt it, because 74% of that bundle is the component every published ablation ranks last. **Lexical coverage, not context length, is the binding constraint: we hold 317 glossed headwords against a corpus of 1,617 distinct word forms.**

---

## Part 1 - What we actually hold, measured today

| Asset                                                 | Count     | Size                       | Notes                          |
| ----------------------------------------------------- | --------- | -------------------------- | ------------------------------ |
| `ColdAuthorAnswer`, non-demo                          | **937**   | 29,648 chars / 6,030 words | native-authored, source-free   |
| ... of which on non-held-out prompts (retrievable)    | **699**   | 24,747 chars               | the exemplar pool              |
| ... of which on the frozen 43 (**never retrievable**) | **238**   | -                          | contamination set              |
| ... with an English gloss                             | 338 (36%) | 16,195 chars               | the English face for embedding |
| ... with a dialect recorded                           | 39 (4%)   | -                          | 7 Glottolog dialects exist     |
| ... with `instructionIg`                              | 1         | -                          | effectively unused             |
| Distinct Igala word forms across all gold             | **1,617** | -                          | our whole implicit lexicon     |
| `Prompt` rows                                         | **465**   | 49,129 chars               | 421 train / 43 test / 1 dev    |
| Prompts with >= 1 gold                                | 177       | max 24, median 6           |                                |
| `RagEntry`, language=igala                            | **60**    | 39,171 chars               | 43 new + 17 legacy             |
| ... with an embedding                                 | **47**    | -                          | **13 have NULL embedding**     |
| Distinct glossed headwords across all RagEntry        | **317**   | 325 gloss lines            | 97 Wiktionary + 224 Koelle     |

**Token budgets, counted with `o200k_base`:**

| Bundle                                                                                                                         | Tokens (o200k) | Tokens (cl100k)  |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------- | ---------------- |
| All 699 retrievable gold pairs, formatted `Q: ... / A: ...`                                                                    | **27,653**     | 30,804           |
| All 60 `RagEntry` rows, topic + content                                                                                        | **13,148**     | 14,458           |
| All 465 prompt texts                                                                                                           | 11,002         | 11,083           |
| **Everything above, one bundle**                                                                                               | **~41,000**    | ~45,000          |
| Openly-licensed data not yet ingested (OPUS wikimedia 1,110 pairs, translatewiki 1,370 pairs, Wikidata 217 lexemes), estimated | ~125,000       | -                |
| Openly-licensed **linguistic literature**, newly located (Part 1.1), estimated                                                 | ~100,000       | -                |
| **Full open pack excluding Wikipedia**                                                                                         | **~270,000**   | -                |
| Igala Wikipedia, usable after English-contamination filtering ([corpus audit](./igala-corpus-sources.md))                      | ~780,000       | ~850,000-900,000 |

**A measurement nobody has written down yet: tone marks roughly double the token cost of Igala.** The same 17-word Igala sentence, toned and untoned:

|                                             | chars | words | o200k tokens          | cl100k tokens |
| ------------------------------------------- | ----- | ----- | --------------------- | ------------- |
| `Ọ̀gà ọ́ma lẹ a jẹ ñwu odudu ẹ́kọ̀ ...` (toned) | 86    | 17    | **53** (3.1 tok/word) | **73**        |
| same, diacritics folded                     | 77    | 17    | **28** (1.6 tok/word) | **33**        |
| English, for reference                      | 70    | 11    | 14 (1.3 tok/word)     | 14            |

Toned Igala is **1.9x** the token cost under `o200k_base` and **2.2x** under `cl100k_base`. Independently corroborated at corpus scale on 1,616 words of real `igl.wikipedia.org` text, tokens per word:

| Treatment                                   | cl100k   | o200k    | XLM-R (BGE-M3, mE5, jina-v3, mGTE) |
| ------------------------------------------- | -------- | -------- | ---------------------------------- |
| English, for reference                      | 1.44     | 1.41     | 1.46                               |
| Igala, diacritics stripped                  | 1.82     | 1.68     | 1.73                               |
| Igala as written on Wikipedia (sparse tone) | 2.16     | 1.87     | 1.97                               |
| **Igala, fully tone-marked**                | **3.53** | **2.97** | **2.85**                           |
| Yoruba, for comparison                      | 3.12     | 2.35     | 2.63                               |

The failure is not merely token count. The combining mark is split into **its own token, detached from its vowel**: `ọ̀jọ́` tokenises under `o200k_base` as `[' ọ', '̀', 'jọ', '́']`. In a language where tone is lexically contrastive, the tokenizer severs the contrastive feature from its carrier. XLM-R fragments Igala least of the Latin-script options (1.35x English), which is a point in BGE-M3's favour if we ever move the dense leg. One place Yoruba-relatedness demonstrably helps: `ọmọ` is 1 token under `o200k_base` (inherited Yoruba merges) versus 4 under `cl100k_base`.

Every context-budget estimate for Igala must therefore be done on toned text, not on word counts.

### 1.1 New since the corpus audit: an openly-licensed grammatical literature exists

A parallel scan completed on 2026-08-09 located open-access Igala linguistics that the corpus audit did not have. This changes what a grammar-in-context option would even contain, so it is recorded here as an asset class.

| Work                                                                             | Venue                               | Licence                 | Why it matters here                                                                                                     |
| -------------------------------------------------------------------------------- | ----------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Ejeba, **Ígálâ Concord System**, 19pp                                            | J. West African Languages 50 (2023) | **CC BY-NC 4.0**        | Most substantial free grammatical description found. **Carries a full Igala-language abstract** - genuine parallel text |
| Adeniyi, **Downstep in Igala and Yala**                                          | JWAL 43(1) 2016                     | **CC BY-NC 4.0**        | Tone system. Directly addresses our tone-marking problem (Part 4.4)                                                     |
| Momoh, **Vowels and the Igala Language Resources**                               | RAIL @ EACL 2023                    | **CC BY 4.0**           | https://aclanthology.org/2023.rail-1.12.pdf                                                                             |
| Momoh, **Constituency Parsing and Annotation of the Igala Syntax**               | RAIL @ LREC-COLING 2024             | **CC BY 4.0**           | https://aclanthology.org/2024.rail-1.17.pdf - likely contains glossed examples                                          |
| Ilori, **Interrogative Projections in Yoruboid Languages**                       | JWAL 44(1) 2017                     | CC BY-NC 4.0            | Comparative; handle the Yoruba content carefully (Part 2.7)                                                             |
| Omachonu, several: compounding, numerals, vowel sequences                        | various                             | mixed / unstated        | Resolve licence per item before use                                                                                     |
| Sule et al. 2020 (OGIRISI); Egbunu 2014 (CC BY-NC); Akogwu & Kadiri 2026 (CC BY) | various                             | mixed                   | Proverbs and oral literature - the only source for the empty `idioms_metaphor` bucket                                   |
| Armstrong, **Comparative wordlists of two dialects of Yoruba with Igala**        | JWAL 2(2) 1965                      | **unknown**             | **Scan, no text layer.** Pre-2015 JWAL is unlicensed. Permission ask + rekey, not OCR                                   |
| Ejeba, **A Grammar of Igala** (M&J Grand Orbit, 2016)                            | book                                | **all rights reserved** | The definitive reference grammar. Paywalled on JSTOR/MUSE. **Add to the permission shortlist**                          |

Estimated total for the openly-licensed items: **~100,000 tokens**, which lands between MTOB's 50k "medium book" and 100k "long book" conditions. Part 3.5 costs this out and Part 5 says what to do with it, and the answer is not "put it in the prompt".

Two constraints to carry forward, flagged not resolved:

- **Most of the grammatical material is CC BY-NC.** That is fine for a nonprofit research pipeline and for prompt-time reference, and it is the same constraint the corpus audit already flagged on PanLex. It becomes live the moment anything downstream is a released model artifact or a served endpoint that could be called commercial. The practical route is that **linguistic facts are not copyrightable, their expression is**: have a human distil the concord and downstep findings into our own prose for the static pack, and cite the source, rather than pasting paragraphs. See Part 8, flag 13.
- **Armstrong 1965 has no text layer**, and a 1965 Africanist scan with phonetic notation is a poor OCR target. Budget a human rekey of the Igala column, not an OCR pass, and only after the licence question is settled.

### 1.2 Three defects in the current retrieval path, found while measuring

**(a) 13 of 60 `RagEntry` rows have no embedding, and they are exactly the wrong 13.** The rows missing embeddings are `vocabulary` (4), `cultural_note` (3), `grammar_rule` (3), `example_dialogue` (2), `translation_pair` (1) - which is precisely the 17-row legacy seed set minus the 4 that were re-seeded. Those are the rows the corpus audit found to contain **Yoruba, not Igala** (`Okpa` for 1, `Eje` for 7, `Egbon`/`Aburo`, `Ma binu`, `Ejoo`). They are invisible to `searchRagVector` today, but `searchRagKeyword` - the fallback - has no such filter and will happily serve them. Any code path that loses the vector query (a transient pgvector error, a pooled connection without `extensions` on the search path) starts serving Yoruba to a model we are trying to stop from producing Yoruba.

**(b) `searchRag` swallows every error into a keyword fallback that is worse than nothing.** `searchRagKeyword` OR-matches every query word over 2 characters against `content` and `topic`, ordered by `updatedAt DESC`. For a query containing "Igala" that matches nearly every row, so the fallback returns the most recently updated rows regardless of relevance. Silent degradation from "semantic search" to "most recent rows" is worse than a thrown error, because it produces a plausible-looking `ragContextIds` array that then gets recorded on the `ModelOutput` as if retrieval had happened.

**(c) The vocabulary chunks are 25-headword blobs.** `Igala lexicon - Wild animals` is one row containing 28 headwords. Retrieving it for "how do you say elephant" injects 27 irrelevant entries to deliver 1 relevant one. That is the opposite of what the dictionary-prompting literature does (Part 4.2), and it is why a per-entry lexicon store is the single largest structural change recommended here.

---

## Part 2 - The embedding problem, measured rather than assumed

This is the crux the brief names, so it gets tested rather than argued.

### 2.1 `text-embedding-3-small` has exactly zero Igala lexical knowledge

**Test.** Take 20 Igala headwords with Wiktionary-attested English glosses. Embed the 20 Igala words and the 20 English glosses separately. For each Igala word, rank the 20 English glosses by cosine. If the embedder had any Igala lexical knowledge, precision@1 would be well above chance (5%).

**Result:**

```
p@1 = 1/20 (5%)    p@3 = 2/20    mean rank = 9.6 / 20
```

Chance p@1 is 5%. Expected mean rank under a uniformly random ranking is 10.5; we measured 9.6. **This is indistinguishable from random.** Per-word ranks: `àdagbá`->elephant 13, `ómi`->water 14, `ìlẹ̀`->earth 19, `ìlàwò`->star 19, `ìgbí`->snail 16. The single top-1 hit (`éjú`->eye) is what you expect from 20 draws at 5%.

Folding the diacritics off first does not help: untoned p@1 = 1/20.

### 2.2 The same embedder cannot tell Igala from Yoruba

Our documented headline failure mode is models substituting Yoruba. Test whether the embedder offers any defence: for 10 concepts, is the Igala word closer to the English gloss than the Yoruba word is?

| Concept  | Igala  | cos   | Yoruba | cos   | closer |
| -------- | ------ | ----- | ------ | ----- | ------ |
| elephant | àdagbá | 0.197 | erin   | 0.272 | Yoruba |
| leopard  | ẹ́kọ̀    | 0.263 | ẹkùn   | 0.252 | Igala  |
| water    | ómi    | 0.249 | omi    | 0.305 | Yoruba |
| moon     | óchù   | 0.274 | òṣùpá  | 0.198 | Igala  |
| child    | ọ́ma    | 0.215 | ọmọ    | 0.194 | Igala  |
| father   | áta    | 0.226 | bàbá   | 0.372 | Yoruba |
| wife     | ọ́yà    | 0.232 | aya    | 0.375 | Yoruba |
| eye      | éjú    | 0.408 | ojú    | 0.355 | Igala  |
| nose     | ímọ́    | 0.236 | imú    | 0.246 | Yoruba |
| blood    | ẹ̀bìẹ̀   | 0.199 | ẹ̀jẹ̀    | 0.172 | Igala  |

**5 of 10 - a coin flip.** The embedding space provides zero protection against Yoruba substitution. Note also that the Yoruba words that win are the ones with real web presence (`erin`, `bàbá`, `aya`, `omi`); the embedder is doing English-adjacent surface memory, not Yoruboid semantics.

### 2.3 But English-side retrieval works, because our queries are English

Our query distribution is **English**: all 465 prompts are English instructions, and the benchmark is English-in / Igala-out. Every `RagEntry` carries an English `topic` and English glosses inside `content`. So the dense leg never has to embed Igala at all.

Measured on the live table (top-3, cosine distance in parentheses):

| Query                                                | Top hit                                   | dist      |
| ---------------------------------------------------- | ----------------------------------------- | --------- |
| How do you say elephant in Igala?                    | Igala lexicon - Wild animals              | **0.307** |
| What is the Igala word for water?                    | Igala lexicon - Nature, sky and landscape | **0.340** |
| Give the Igala numbers from one to ten.              | Igala 1854 wordlist - numerals 1-20       | **0.298** |
| How do you greet an elder respectfully in Igala?     | Igala lexicon - Greetings and address     | **0.352** |
| Which dialect of Igala is spoken in Ibaji?           | Igala dialects                            | **0.222** |
| What does the Igala proverb about the tortoise mean? | Igala 1854 wordlist - animals             | 0.617     |

The first five are correct. The sixth is the interesting one: we hold no proverb data, and the system returns the nearest animal list at distance 0.617 - **worse than the worst of 47 rows for the elephant query** (that query's spread over all 47 rows was min 0.307 / median 0.446 / max 0.565). Absolute cosine distance is therefore a usable **abstention signal**, and Part 4.2 turns it into a threshold.

### 2.4 A folded headword index solves the Igala side outright

Same 20 words, looked up in a folded-key exact-match index built from the same 60 rows (index size: 313 folded headwords):

```
folded-headword recall = 20/20
```

`ẹ́kọ̀` -> `Igala lexicon - Wild animals`, correctly, instantly. The vector search put that same query's correct chunk **outside the top 3**. A character-4-gram Dice baseline was also tested and failed on single-word queries (0.000 for every one-word query), because Dice normalises by the union of gram sets and a 6,000-character chunk swamps a 5-character query. The right lexical instrument is **exact match on a folded key plus BM25 over folded tokens**, not raw n-gram similarity.

### 2.5 The decision, and the confidence

**Decision: hybrid, with the two legs doing different jobs, fused by Reciprocal Rank Fusion (k=60, [Cormack et al., SIGIR 2009](https://dl.acm.org/doi/10.1145/1571941.1572114)).**

- **Dense leg:** keep `text-embedding-3-small`, applied only to the **English view** of each record (topic + gloss + definition + English side of a parallel pair). Confidence: **high** - measured working, already wired, cheap, and the query distribution is English.
- **Lexical leg:** folded-key exact match plus BM25 over folded Igala tokens, applied to the **Igala view**. Confidence: **high** - measured at 20/20 where dense is at chance.
- **Do not shop for an embedder that "supports" Igala. None does.** Language lists were checked by reading the primary files, not the marketing copy:

| Model                                       | Languages   | `igl`?  | Verified against                                                                                                              |
| ------------------------------------------- | ----------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| LaBSE                                       | 109         | **No**  | model card YAML. Has `ha`, `ig`, `yo`. No other Yoruboid language at all                                                      |
| LASER3                                      | 204         | **No**  | `laser_encoders/language_list.py`. Only `ibo_Latn` matches `ig*`                                                              |
| NLLB-200 / SONAR / FLORES-200               | 202         | **No**  | model card + FLORES README. SONAR inherits NLLB's list exactly                                                                |
| Glot500 / Glot500-c                         | 511 claimed | **No**  | `languages_stats.csv`, 610 codes. Has `ige`, `ign`, not `igl`                                                                 |
| MADLAD-400                                  | 419         | **No**  | dataset README language table                                                                                                 |
| AfriBERTa / AfroXLMR / AfroLM / AfriTeVa V2 | 11-23       | **No**  | model cards                                                                                                                   |
| AfroXLMR-76L                                | 76          | **No**  | model card, full list extracted                                                                                               |
| Cohere embed-multilingual-v3                | 110         | **No**  | `supported-languages.mdx`. African subset: af am ha ig sn so sw wo xh yo zu                                                   |
| multilingual-E5-large                       | 93          | **No**  | model card. Has no Yoruba and no Igbo either                                                                                  |
| mGTE (`gte-multilingual-base`)              | 74          | **No**  | model card. African subset: af so sw yo                                                                                       |
| BGE-M3                                      | "100+"      | **No**  | no published list; parallel supervision is NLLB + CCMatrix, which have no Igala                                               |
| OpenAI `text-embedding-3-*`                 | none stated | **No**  | **no language list exists.** The only multilingual claim is MIRACL, whose 18 languages include one African language (Swahili) |
| jina-embeddings-v3, gemini-embedding-001    | "100+"      | unknown | no authoritative list published for either                                                                                    |
| **SERENGETI** and **Cheetah** (UBC-NLP)     | 517         | **YES** | `supported-languages.txt` line 371: `igl  Igala  Latin`                                                                       |

SERENGETI and Cheetah are the only two systems that have seen Igala, and they are **language models, not sentence embedders** - using either for retrieval means fine-tuning a pooling head. Their shared 517-language corpus is manually curated religious text, news and government documents; the per-language Igala volume is **not published** and is plausibly a few thousand sentences. "In the list" is not "usefully covered".

- **Adopting a Yoruboid-adjacent encoder would be actively counterproductive anyway.** 2.2 shows the failure mode is Yoruba substitution; an encoder whose only Igala signal is Yoruba surface similarity makes that worse, not better. Igala and Yoruba score **66% cognate** (Kay Williamson) and are **mutually unintelligible**, which is far too little overlap for free transfer and quite enough for interference. [Wang et al., EMNLP 2020](https://aclanthology.org/2020.emnlp-main.359/) document negative interference harming the low-resource side specifically, and [work on African cross-lingual transfer](https://arxiv.org/pdf/2409.10965) finds _syntactic_ similarity predicts transfer better than genetic relatedness.
- **The retrieval literature for African languages says the same thing, with numbers.** [CIRAL (SIGIR 2024)](https://cs.uwaterloo.ca/~jimmylin/publications/Adeyemi_etal_SIGIR2024.pdf), nDCG@20 averaged over Hausa, Somali, Swahili, Yoruba: off-the-shelf multilingual dense (mDPR) **0.0858** against BM25's **0.2377** - **2.8x worse**, and on Hausa mDPR scores 0.0150, effectively broken. Even the Africa-pretrained dense retriever (AfriBERTa-DPR, 0.1835) loses to BM25 on average. **Hybrid RRF fusion wins every column at 0.3002.** That is the design in one table.
- [BEIR (Thakur et al., NeurIPS 2021)](https://arxiv.org/abs/2104.08663) generalises it: dense retrievers fall **below BM25** under large domain shift, and a language the encoder has never seen is the maximum-domain-shift case. [Anthropic's contextual retrieval work](https://www.anthropic.com/news/contextual-retrieval) measures the complementary half: adding BM25 to contextual embeddings moved top-20 failure-rate reduction from 35% to **49%**, so lexical matching carries real independent signal even when the dense leg is good.
- MTOB found it too, in the closest published analogue to our situation: retrieving grammar-book chunks by **embedding** cosine scored chrF 18.7, by **longest-common-substring** 26.1, on an unseen language ([Tanzer et al., ICLR 2024](https://arxiv.org/abs/2309.16575), Appendix F). Lexical beat dense by 7.4 chrF for exactly our reason.

**Also verified, and worth stating plainly:** there are **zero HuggingFace datasets** tagged `igl` and **no text-embedding model for Igala exists anywhere**. The 15 models tagged `igl` are speech models (`espnet/xeus`, `ajesujoba/AfriHuBERT`), generative SFT checkpoints (`hypaai/Hypa-Llama3.1-8b-SFT`, `hypaai/Hypa-Gemma4-E2B-v1`), one MT model (`jtl-ayo/dala-igala-mbart50`, from `masakhane/afri-mbart50`), and `wikilangs/igl`, which despite its `sentence-similarity` tag is an n-gram artifact built from Wikipedia snapshots, not a transformer encoder. The two generative Igala checkpoints are worth a look as arena candidates; none of this changes the retrieval design.

### 2.6 The medium-term unlock: fine-tune the dense leg on our own pairs

The single most useful number in the retrieval literature for our situation comes from Amharic, which is the closest analogue to Igala's position ([arXiv 2503.18570](https://arxiv.org/html/2503.18570v1)):

| Condition                                                        | nDCG@10                                     |
| ---------------------------------------------------------------- | ------------------------------------------- |
| ColBERT on an English BERT backbone                              | 0.000 - 0.061                               |
| Amharic-**pretrained** BERT, before any task fine-tuning         | 0.000 - 0.005                               |
| Same model, **after fine-tuning on in-language retrieval pairs** | **0.704** (2AIRTC) / 0.177 (AfriCLIRMatrix) |

Two things fall out. First, **in-language pretraining alone buys nothing** - 0.005 nDCG@10 - which is the final nail in "find an encoder with Igala in the list". Second, the paper's own headline is _"150 training examples are enough"_ to make dense competitive with BM25.

**We hold 699 retrievable English-prompt / Igala-answer pairs and 338 Igala/English gloss pairs.** That is 4x the stated threshold, already collected, already consented. Fine-tuning a small bi-encoder on those pairs is a Phase 3 item rather than a Phase 1 one - the hybrid works now and this is an optimisation - but it is the highest-value use of the retrieval budget after lexical coverage, and it is a far better use of Igala-speaker time than chasing corpus bulk. Put it on the roadmap; do not block Phase 1 on it.

### 2.7 Where the Yoruba-adjacency question actually lands

Yoruba proximity helps in exactly one place and hurts in every other:

- **Helps:** as a _pivot in the dictionary block_. [Chain-of-Dictionary (Lu et al., arXiv 2305.06575)](https://arxiv.org/abs/2305.06575) shows chained entries (source -> target -> auxiliary languages) beating a plain bilingual dictionary by +1.90 chrF++ over 200 FLORES languages. **We should not use this.** CoD's auxiliaries are French/German/Portuguese, chosen because they are high-resource and unrelated; using _Yoruba_ as an auxiliary for Igala would put the interference language directly in the prompt. If we ever want a pivot, use French or Portuguese, never Yoruba.
- **Hurts:** as embedding transfer (2.2), as a base-model prior (the observed failure), and as a retrieval neighbour. Any lexicon entry sourced from a Yoruboid comparative wordlist must be tagged with its language of attestation.

---

## Part 3 - Long context vs RAG, with the numbers

This is a real fork and our corpus is small enough that it deserves arithmetic rather than opinion.

### 3.1 What fits

| Bundle                                                           | Tokens       | Claude 200k | Claude 1M         | Gemini 1M+ |
| ---------------------------------------------------------------- | ------------ | ----------- | ----------------- | ---------- |
| Curated pack (recommended, Part 4)                               | ~6,000       | yes         | yes               | yes        |
| Everything we hold today (gold + RagEntry)                       | **~41,000**  | yes         | yes               | yes        |
| **MTOB-equivalent "one book" bundle** (see 3.3)                  | **~135,000** | yes         | yes               | yes        |
| Full open pack excl. Wikipedia (incl. the linguistic literature) | ~270,000     | **no**      | yes               | yes        |
| + Igala Wikipedia                                                | ~1,050,000   | **no**      | yes (1M is tight) | yes        |

### 3.2 What it costs

Claude Sonnet 5 at $3/M input, $15/M output, 5-min cache write 1.25x, cache read 0.1x ([Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing); an introductory $2/M rate runs through 2026-08-31). Minimum cacheable prefix on Sonnet 5 is 1,024 tokens, so a 6k pack qualifies. Costs below are for one full pass over the frozen 43.

| Configuration                                        | Prefix | Per call, uncached | Per call, cached read | **43 prompts, cached**       |
| ---------------------------------------------------- | ------ | ------------------ | --------------------- | ---------------------------- |
| Curated pack + retrieval (recommended)               | 10k    | $0.030             | $0.014                | **$0.62**                    |
| Full 41k bundle in context                           | 41k    | $0.123             | $0.012                | **$0.68**                    |
| **MTOB-equivalent one-book bundle**                  | 135k   | $0.405             | $0.041                | **$2.26**                    |
| Full 270k open pack (Claude 1M)                      | 270k   | $0.810             | $0.081                | **$4.50**                    |
| + Wikipedia, 1.05M (Claude 1M - exceeds it)          | 1.05M  | $3.15              | $0.315                | **$17.5**, if it fits at all |
| + Wikipedia, 1.05M (Gemini 3.1 Pro, >200k tier $4/M) | 1.05M  | $4.20              | $0.420                | $18.1 **+ $4.73/hour idle**  |

Three things fall out. First, **cost is not the deciding factor at benchmark scale** - $0.62 against $2.26 is noise against a $105-per-reviewer-hour annotation budget. Second, **Gemini's cache economics make a large static prefix untenable for a low-traffic research platform**: Gemini charges $4.50 per MTok per hour to _hold_ a cache, which is $4.73/hour ($113/day) to keep a 1.05M Igala prefix warm between annotation sessions, whereas Anthropic charges nothing to hold. If any long-context arm is run, run it on Claude. Third, **the full corpus no longer fits Claude's 1M window** once the linguistic literature is added to Wikipedia, so the "put everything in" option is not actually on the table at the top end.

### 3.3 The MTOB-equivalent bundle, now that a grammar exists

Part 1.1 changes this question from hypothetical to concrete, so here is the bundle costed exactly.

| Component          | Our version                                                           | Tokens (est.) | MTOB's version                     |
| ------------------ | --------------------------------------------------------------------- | ------------- | ---------------------------------- |
| Reference grammar  | Ejeba Concord System + Adeniyi Downstep + Momoh x2 + Ilori + Omachonu | **~100,000**  | Visser grammar, 217,388 GPT tokens |
| Bilingual wordlist | 317 glossed headwords + 217 Wikidata lexemes                          | **~8,000**    | 2,531 Kalamang entries             |
| Parallel sentences | 1,110 OPUS wikimedia pairs + the Ejeba Igala abstract                 | **~27,000**   | 400 train sentences                |
| Community gold Q/A | 699 retrievable pairs                                                 | **~27,653**   | (MTOB has no equivalent)           |
| **Total**          |                                                                       | **~135,000**  | ~250,000 in the Gemini 1.5 framing |

**It fits in Claude's standard 200k window, and one pass over the frozen 43 costs $2.26 cached.** So the MTOB experiment is genuinely runnable here for the price of a coffee.

And it should not be the architecture, because MTOB's own ablation is a warning about the component we would be adding. Our bundle is ~74% grammar prose by token count, and that is precisely the component the literature scores lowest:

- MTOB: wordlist + sentences got 43.6 chrF; the entire 100k grammar book on top added **+1.1**. Retrieved grammar chunks made it **worse** (42.9).
- Aycock et al.: 81.3k tokens of grammatical prose scored **22.6 / 27.5** chrF++ against 18.3k tokens of the book's parallel examples at **30.8 / 34.7**. Four and a half times the tokens for 7 to 8 points less.
- Elsner & Needle, on Inuktitut: a hand-written grammar description scored 12.46 / 17.30 against dictionary definitions-with-examples at 13.29 / 16.65. Not better.
- LingoLLM's chapter-level ablation found morphology chapters unhelpful and occasionally misleading on word order; syntax chapters helped.

**So the grammar papers are worth acquiring and worth mining, but not worth pasting.** What is disproportionately valuable in them is the part that is _not_ prose:

1. **The Igala-language abstract in Ejeba's Concord System paper is genuine parallel text**, and parallel text is the single component every ablation ranks first. It is one abstract, so it is worth perhaps 300 tokens - but it is 300 tokens of exactly the right kind, and it is a template for what to ask for: any Igala scholar publishing an English paper can be asked for an Igala abstract.
2. **Glossed example sentences.** Momoh's constituency-parsing paper and Ejeba's concord paper will both carry numbered interlinear examples. Those are IGT, and [GrammaMT (arXiv 2410.18702)](https://arxiv.org/abs/2410.18702) measures supplying an accurate gloss of the _test_ sentence at **+12 BLEU / +19.6 chrF++**, while IGT-formatted _demonstrations_ barely beat plain few-shot. Extract the examples as parallel/glossed exemplars; do not ingest the surrounding argument.
3. **Adeniyi's downstep data is the empirical basis for the tone contract in Part 4.4.** Minimal pairs where tone is contrastive are exactly what tells us which words _must_ be marked and which are safely left bare. That is a handful of facts, distilled by Lydia into ~200 tokens of the static pack, not a 12k-token paper in the prompt.
4. **The proverb and oral-literature papers are the only content we have for `idioms_metaphor`**, which is the worst-served bucket in the whole benchmark (top-1 retrieval distance 0.596, i.e. nothing relevant exists). Mine them for proverb texts with glosses.

Distilling rather than pasting also happens to be the clean answer to the CC BY-NC constraint (Part 1.1): linguistic facts are not copyrightable, expression is.

### 3.4 What the evidence says about quality

Cost being a wash, the question is which produces better Igala. Every relevant result points the same way.

- **MTOB's own ablation is the closest analogue we have and it is decisive.** Claude 2 on Kalamang, kgv->eng chrF: wordlist alone 29.7, parallel sentences alone 35.1, **wordlist + sentences 43.6**, and the entire 100k-token curated grammar book on top takes it to only 44.7. Adding _retrieved_ grammar passages actively **hurts**: W+S 43.6 -> W+S+G_s **42.9**. ([Tanzer et al., ICLR 2024](https://arxiv.org/abs/2309.16575), Appendix F.)
- **[Aycock et al., ICLR 2025](https://arxiv.org/abs/2409.19151) closed the case.** They regressed chrF++ on prompt token count across book conditions and got **p = 0.997** (into Kalamang) and **p = 0.78** (into English): more tokens buy nothing. Regressing on _test-set vocabulary type coverage_ gave p < 0.005. The book's apparent advantage is a lexical-coverage effect, not a grammar effect. Their headline number: a **5-shot prompt of 800 tokens scored 38.9 chrF++, beating the entire 99,600-token book at 34.4.**
- **Gemini 1.5's own "near-human from one book" result already shows saturation.** Half book -> full book (an extra ~125k tokens) bought +0.20 human-eval points into English and **lowered** eng->kgv chrF from 58.3 to 56.9 ([Gemini 1.5 report, arXiv 2403.05530](https://arxiv.org/abs/2403.05530), §4.2.2.1).
- **Effective context is far below advertised context.** [NoLiMa (ICML 2025)](https://arxiv.org/abs/2502.05167) measures the longest context retaining >= 85% of base performance under _low lexical overlap_ between question and evidence - which is exactly our case, since an English question about Igala shares almost no surface with an Igala answer. Claude 3.5 Sonnet: **4k**. GPT-4.1: **~16k**. Gemini 1.5 Pro: **2k**. Ten of twelve models tested fall below 50% of their short-context baseline at 32k.
- **Length hurts even when retrieval is perfect.** [Du et al., arXiv 2510.05381](https://arxiv.org/abs/2510.05381) hold the evidence constant and pad with _whitespace_; performance still degrades **13.9% to 85%** across five systems. There is no "just retrieve better" escape from a long prefix.
- **There is a documented optimum, and it is well under 100k.** [NVIDIA's order-preserve RAG](https://arxiv.org/abs/2409.01666) finds an inverted-U: 47.25 F1 at 48k tokens versus **34.26 at the full 117k**, i.e. 2.4x fewer tokens and +13 F1.

### 3.5 The call

**Do not build a long-context system. Build the curated pack.** The corpus is small enough that "put it all in" is technically possible, and every piece of evidence says the marginal tokens of encyclopedic prose, archaic wordlists and grammatical argument would cost accuracy rather than buy it.

But because our corpus is uniquely small, the experiments are nearly free, so **run two long-context arms in the evaluation** (Part 6):

- **Arm E, the 41k bundle of everything we hold today** - $0.68 for a full pass over the frozen 43.
- **Arm G, the 135k MTOB-equivalent one-book bundle** from 3.3 - $2.26 for a full pass, once the papers are collected.

Predictions, stated in advance so they can be wrong. Arm E loses to the curated pack on `orthography` and `grammar_tone` (where the Koelle 1854 material actively misleads) and may win on `cultural_values` (where the encyclopedic chunks carry real facts we otherwise drop). Arm G beats arm E on `grammar_tone` and `idioms_metaphor` and loses to the curated pack overall, because 74% of its tokens are the component every published ablation ranks last. If either wins outright, the simpler system wins and we take it. **This is the one project where the MTOB question can be answered for our own language for under $5, and it would be strange not to.**

---

## Part 4 - The recommended architecture

### 4.1 Three stores, not one

`RagEntry` is currently doing three unrelated jobs badly. Split it.

**Store 1 - `LexEntry` (new table). One row per headword.** This is the biggest structural change and the highest-value one.

```
LexEntry {
  id            String  @id
  language      String  @default("igala")
  headword      String              // "ẹ́kọ̀" - tone-marked, as attested
  foldedKey     String              // "eko" - NFD, all combining marks stripped, lowercased
  toneFoldedKey String              // "ẹkọ" - tone stripped, dot-below KEPT
  gloss         String              // "leopard; big cat"
  ipa           String?             // "/ɛ́.kɔ̀/"
  pos           String?
  dialect       String?             // one of the 7 Glottolog dialects, when known
  register      String?             // "obsolete" | "idiomatic" | "derogatory" | ...
  orthographyEra String @default("modern")   // "modern" | "koelle1854"
  attestedIn    String              // language of attestation - guards Yoruboid bleed
  source        String              // full attribution, licence
  verification  String @default("external_sourced")
  embedding     vector(1536)?       // of the ENGLISH view: "gloss (pos)"
  @@index([language, foldedKey])
  @@index([language, toneFoldedKey])
}
```

Seed it from what we already hold: 96 Wiktionary lemmas, 224 Koelle forms (tagged `koelle1854`), 217 Wikidata lexemes (CC0, not yet ingested). That is **~530 entries** before any new acquisition.

**Store 2 - `ColdAuthorAnswer`, used directly as the exemplar index.** No copying, no duplication. Add one column and one index:

```
+ exemplarEmbedding vector(1536)?   // embedding of prompt.text (English) - the retrieval key
@@index([promptId])                 // exists
```

Contamination is enforced by joining to `Prompt` and requiring `isHoldout = false`, which is the identical invariant the SFT export builder already enforces (`src/lib/arena/training-export.ts`). Reuse it, do not re-derive it.

**Store 3 - `RagEntry`, narrowed to prose.** Keep it for `encyclopedic`, `cultural_note`, `grammar_rule`, `orthography_rule`. Migrate `vocabulary` and `historical_wordlist` rows into `LexEntry` and delete them here. Add:

```
+ bucketScope   EvalBucket[]  @default([])   // empty = all buckets
+ sourcePromptId String?                      // contamination key, if derived from a prompt
+ orthographyEra String @default("modern")
```

### 4.2 Retrieval strategy per chunk type

| Store / type                                       | Retrieval method                                                                                                                                  | Query key                                                               | k                 | Prompt slot                                              | Gate                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `LexEntry`                                         | **folded exact match** on every content word of the query, plus `toneFoldedKey` fallback, plus **dense** on the English gloss for concept queries | Igala tokens in query (learner chat); English content words (benchmark) | up to 20 entries  | dictionary block, user turn, immediately above the query | drop `orthographyEra=koelle1854` unless the bucket is `lexicon_disambig` and the modern index missed |
| `ColdAuthorAnswer`                                 | **dense** on `prompt.text` (English) + bucket filter + optional dialect filter                                                                    | the English prompt                                                      | 5 to 8            | few-shot user/assistant turns                            | **hard exclude `Prompt.isHoldout = true`**; exclude `isDemo`                                         |
| `parallel_sentence` (phase 2, OPUS)                | **dense** on the English side + **BM25** on folded Igala                                                                                          | English prompt / Igala fragment                                         | 3 to 5            | few-shot turns, after gold                               | dedupe against Wikipedia chunks                                                                      |
| `igt_example` (phase 1.5, from the grammar papers) | **dense** on the free-translation line + **BM25** on folded Igala                                                                                 | English prompt                                                          | 2 to 3            | few-shot turns, rendered as source / gloss / translation | bucket `grammar_tone`, `orthography` only                                                            |
| `proverb` (phase 1.5, from the oral-lit papers)    | **dense** on the English gloss                                                                                                                    | English prompt                                                          | 2 to 3            | `<documents>` block                                      | bucket `idioms_metaphor`, `cultural_values` only; `d1 < 0.55`                                        |
| `orthography_rule`                                 | none - always present                                                                                                                             | -                                                                       | all (1 to 2 rows) | static pack, system message                              | -                                                                                                    |
| `grammar_rule`                                     | none - always present, they are 4 rows and ~450 tokens                                                                                            | -                                                                       | all               | static pack, system message                              | -                                                                                                    |
| `cultural_note`                                    | dense                                                                                                                                             | English prompt                                                          | 2                 | `<documents>` block                                      | **only** buckets `cultural_values`, `idioms_metaphor`, `authenticity`; and only if `d1 < 0.55`       |
| `encyclopedic`                                     | dense + named-entity string match on the topic                                                                                                    | English prompt                                                          | 2                 | `<documents>` block                                      | same gate as `cultural_note`                                                                         |
| `historical_wordlist` (Koelle 1854)                | **removed from the default path**                                                                                                                 | -                                                                       | -                 | `<documents>` block, opt-in only                         | researcher-facing attestation view only                                                              |
| `language_metadata`                                | **never retrieved for generation**                                                                                                                | -                                                                       | -                 | -                                                        | annotator reference panel only                                                                       |

Fusion across the two legs: **RRF with k=60**, rank-only so BM25 scores and cosine distances never need calibrating against each other.

**The Koelle demotion is the single most consequential line in that table, and it is measured.** Running all 43 frozen benchmark prompts through the live vector index:

```
top-1 chunkType share: historical_wordlist 21, vocabulary 16, grammar_rule 6
```

**Twenty-one of 43 top-1 hits - 49% - are the 1854 Koelle wordlist.** Every `grammar_tone` prompt but one retrieves `Igala 1854 wordlist - verbs and short sentences` or a sibling. Koelle's orthography predates both the 1931 Philpot Latin orthography and the 1980 National Language Centre revision; the corpus audit is explicit that it is "not modern Igala spelling - valuable as attestation and for tracking change, not as a spelling guide." Feeding it to a model on a bucket whose whole purpose is modern grammar and tone is teaching the wrong answer, and [Min et al. (EMNLP 2022)](https://arxiv.org/abs/2202.12837) is the reason it will stick: what in-context demonstrations transmit most reliably is **format and surface distribution**, not correctness.

**The abstention threshold, calibrated from the same run.** Top-1 distance over the frozen 43: min 0.296, p25 0.346, median 0.391, p75 0.448, max 0.596. Per bucket:

| Bucket              | n   | mean top-1 distance | reading                                                                    |
| ------------------- | --- | ------------------- | -------------------------------------------------------------------------- |
| dialectal_fidelity  | 1   | 0.296               | we hold this                                                               |
| orthography         | 15  | **0.354**           | we hold this                                                               |
| lexicon_disambig    | 8   | **0.370**           | we hold this                                                               |
| register_honorifics | 1   | 0.439               | marginal                                                                   |
| grammar_tone        | 15  | **0.447**           | nearest thing is Koelle - retrieval is finding _something_ and it is wrong |
| authenticity        | 1   | 0.463               | marginal                                                                   |
| cultural_values     | 1   | **0.543**           | we hold nothing relevant                                                   |
| idioms_metaphor     | 1   | **0.596**           | we hold nothing relevant                                                   |

Set the prose gate at **`d1 < 0.55`**. Be honest about what it does: it catches the _total miss_ (idioms, cultural values), not the _wrong-but-near_ case (grammar_tone retrieving Koelle). The wrong-but-near case needs the type-level policy above, not a threshold. Recalibrate the threshold whenever the corpus changes materially - it is a property of this index, not a constant.

Also note that **zero** `encyclopedic`, `cultural_note` or `language_metadata` rows appear as top-1 for any of the 43 benchmark prompts. The 13 Wikipedia encyclopedic chunks are, for this benchmark, dead weight. That is the empirical basis for Part 5's decision not to build prose RAG over the Wikipedia dump.

### 4.3 The exact prompt template and assembly order

Three provider docs agree on the skeleton: long material first, query last. Anthropic: _"Place your long documents and inputs near the top of your prompt, above your query, instructions, and examples"_ and _"Queries at the end can improve response quality by up to 30 percent in tests"_ ([long-context tips](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/long-context-tips)). Google: _"the model's performance will be better if you put your query / question at the end of the prompt"_ ([long-context docs](https://ai.google.dev/gemini-api/docs/long-context)). OpenAI additionally recommends instructions at **both** ends for GPT-4.1 ([prompting guide](https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide)). The providers disagree about sandwiching and the one controlled academic test of it ([Liu et al., TACL 2024](https://arxiv.org/abs/2307.03172), "query-aware contextualization") helped on synthetic key-value retrieval and **not** on real multi-document QA. So: sandwich on OpenAI candidates only, behind a flag, and A/B it rather than assuming it.

The remaining ordering choice is where the _best_ retrieved item goes. [Cuconasu et al., SIGIR 2024](https://arxiv.org/abs/2401.14887) measured gold-document placement directly: adjacent to the query **0.37**, middle 0.23, far from query **0.17**. That is the strongest single number on placement, and it says put the best material last, closest to the question. Agrawal et al. found most-similar-first won by 1.87 BLEU on one domain but their own good/bad ablation put the good example last (31.43 vs 25.54), and [Moslem et al., EAMT 2023](https://aclanthology.org/2023.eamt-1.22/) found reversal made no significant difference. Net: **most-similar-last**, flagged as tunable.

#### SYSTEM MESSAGE

```
[1] IGALA_FORCING_INSTRUCTION  (existing, from src/lib/generation-prompt.ts,
    with the tone clause replaced per Part 4.4)

[2] ORTHOGRAPHY CONTRACT  (~250 tokens, always present, community-verified)

    Igala orthography, as used in this task:
    - The dotted vowels ẹ and ọ are separate LETTERS, not accents. Write them
      wherever they belong. Never substitute e or o.
    - Igala has no ṣ, ị, ụ or ṅ. Those letters belong to Yoruba and Igbo. If you
      are about to write one, you have drifted into the wrong language.
    - ñ, ñm and ñw are the modern spellings of the sounds the 1931 orthography
      wrote ng, nm, nw.
    - Tone is marked with acute (high) and grave (low); mid tone is unmarked.
      Igala writers mark tone SELECTIVELY, not on every syllable. Mark tone where
      a reference entry below marks it, or where leaving it off would create a
      genuine ambiguity. Do not mark every vowel by default.

[3] STATIC GRAMMAR PACK  (~1,200 tokens: the 4 grammar_rule rows + the
    orthography_rule row, verbatim, community-verified only)

[4] CORE LEXICON  (~2,000 tokens: the ~150 highest-frequency forms across the
    699 retrievable gold answers, each as `headword - gloss`, tone-marked as
    attested. This is the always-present floor under per-query retrieval.)

[5] RETRIEVED REFERENCE MATERIAL  (0 to ~1,600 tokens, gated at d1 < 0.55,
    Anthropic's recommended envelope; omitted entirely when the gate fails)

    <documents>
      <document index="1">
        <source>Igala Wikipedia, "Inikpi" - CC BY-SA 4.0 - https://igl.wikipedia.org/...</source>
        <type>encyclopedic</type>
        <document_content>...</document_content>
      </document>
    </documents>
    Ordered LEAST relevant first, so the strongest document sits nearest the turn
    boundary (Cuconasu et al. 2024).

[6] COMPOSITION RULE  (~80 tokens, last in the system message)

    The examples and entries below are references, not templates. Compose a fresh
    answer to the question asked. Do not reuse a whole example sentence unless the
    question is asking for exactly that sentence.
```

**System message total: ~3,500 to 5,200 tokens.** Items [1] through [4] are byte-stable across every call for a given corpus version, so put the `cache_control` breakpoint at the end of [4]. Item [5] varies per query and must sit after the breakpoint.

#### MESSAGE TURNS

```
[7] FEW-SHOT EXEMPLAR TURNS  (5 to 8 pairs, from ColdAuthorAnswer, non-held-out,
    bucket-matched, ordered LEAST similar first so the closest is adjacent to the
    real question)

    user:      <prompt.text, verbatim English>
    assistant: <answerText, verbatim Igala, NOT normalised>
    ...

[8] DICTIONARY BLOCK  (final user turn, immediately above the question -
    DiPMT's position: between the source and the request)

    Igala entries for words in this question:
    "leopard" is ẹ́kọ̀ /ɛ́.kɔ̀/, or ọ́mátāīna.
    "big" is dàgbà.
    (up to 20 entries; at most 3 senses per headword; entries for the 100 most
    frequent English function words are suppressed)

[9] THE QUESTION  (verbatim, last)
```

**Total per call: ~4,500 to 8,000 tokens.** That sits inside every model's genuinely reliable range (NoLiMa effective lengths: Claude 3.5 Sonnet 4k, GPT-4.1 ~16k), which is the whole point.

#### Why the dictionary block is formatted that way

[DiPMT (Ghazvininejad et al., arXiv 2302.07856)](https://arxiv.org/abs/2302.07856) puts the dictionary between the source sentence and the translation request, caps at **3 senses per word**, and **suppresses the 500 most frequent source words** to avoid injecting noise. It uses **exact string match**, having tested Stanza lemmatisation and found "no meaningful difference." Their gains on FLORES low-resource pairs are modest (+0.9 to +1.1 BLEU) - but that is a regime where the model already knows the language. In the regime where it does not, [LingoLLM (Zhang et al., Findings ACL 2024)](https://arxiv.org/abs/2402.18025) measures **dictionary alone taking GPT-4 from 0.5 to 8.2 spBLEU**, with morphology and the whole grammar book together adding only 2.3 more. That is our regime.

Two format facts worth obeying exactly, both from [CoD (Lu et al.)](https://arxiv.org/abs/2305.06575): keep dictionary entries **in order of appearance in the source**, because "shuffling the word order can degrade the results"; and never flatten a chained format into repeated separate statements, which cost them 4.1 chrF++ (35.30 -> 31.20) _below the no-dictionary baseline_ purely from token bloat. A **target-language-only** dictionary also hurt (31.58). Packaging matters more than entry precision - DiPMT's control with a fully shuffled, entirely wrong dictionary produced _almost no change_ from baseline, because wrong entries get ignored.

#### The coverage number to watch

DiPMT's Figure 2 shows dictionary prompting only beats the baseline once source **word-type coverage** exceeds roughly 5 to 20%. DiPMT++ spent its entire method budget raising coverage from 67% to 79% and 47% to 66% ([Zhang et al., arXiv 2402.19167](https://arxiv.org/abs/2402.19167)). **We hold 317 glossed headwords and the community gold contains 1,617 distinct word forms.** Coverage is the binding constraint on this whole design, and Part 5 is organised around raising it.

#### Morphological expansion

We have no Igala morphological analyser and building one is out of scope. Use the DiPMT++ fallback, which was designed for exactly that absence: **forward and backward maximal matching against the folded key, returning the top 2 candidates**. Their ablation puts it at **-3.5 BLEU / -6.4 chrF** when removed, the largest of their three coverage strategies in that direction, and it supplied lexical information for up to 44% of words. Concretely: on a miss, try progressively shorter prefixes and suffixes of the folded token against `foldedKey`, cap at 2 hits, and mark them in the prompt as approximate (`possibly related to ...`).

### 4.4 Tone marks and orthography

The measured mismatch, from the live database:

|                                                   | tone marks present | dot-below present |
| ------------------------------------------------- | ------------------ | ----------------- |
| Community gold, all 937                           | **40.3%**          | 74.0%             |
| Community gold on the frozen 43 (n=238)           | **41.6%**          | -                 |
| Frontier model output (Rung A, gpt-4.1 zero-shot) | **100%**           | -                 |

**Note a correction to the project's own record.** `src/lib/eval/normalize.ts` and the brief both cite 0.770 for the frozen-43 gold tone share. Measured today against the live table with the identical NFD + combining-mark test the repo uses, it is **0.416**. The number moved as gold accumulated - 238 rows now versus far fewer when 0.770 was recorded. Update the comment; the gap between community practice and model behaviour is roughly **2.4x**, not 1.3x.

Per bucket the variation is large: `cultural_values` 0.71, `idioms_metaphor` 0.62, `grammar_tone` 0.61, `orthography` 0.42, `register_honorifics` 0.30, `lexicon_disambig` 0.19, `authenticity` 0.14.

**The design, which turns on the distinction `normalize.ts` already draws correctly:**

- **Dot-below (ẹ, ọ) is segmental.** It is a different letter, not an accent. **Never fold it for matching** beyond a fallback tier, **always require it in output**, and treat the 26% of gold answers lacking it as a data-quality issue to raise with annotators, not as a legitimate variant. `toneFoldedKey` (tone stripped, dot kept) is the primary lexical match key; `foldedKey` (everything stripped) is the fallback tier only.
- **Tone marks are prosodic and community practice is genuinely variable.** Index folded, present marked. Concretely: match on `toneFoldedKey`, but render the **tone-marked attested form** in the dictionary block, because the lexicon's job is to be the reference. Do **not** instruct the model to mark tone everywhere - the current instruction ("with tone marks and dotted vowels where they belong") is what produces the 100%, and it should be split so that dotted vowels are mandated and tone is conditional, as in [2] above.
- **Do not normalise the exemplars.** The few-shot gold answers go in verbatim, at whatever tone density their authors used, because [Min et al.](https://arxiv.org/abs/2202.12837) says format is exactly the channel ICL transmits - so 5 to 8 exemplars at ~40% tone density is the most direct lever we have for pulling model output from 100% toward community practice. This is the one place where "showing inconsistent orthography teaches inconsistency" is a **feature**: community practice _is_ the target.
- **Never let a folded form reach the model.** Fold for matching only. This is the [Turkish deASCIIfication result](https://www.sciencedirect.com/science/article/abs/pii/S0306457315001053) applied to RAG: diacritic _restoration_ proved more effective and more robust than diacritic _removal_, because stripping produces either non-words or legitimate words with different meanings.
- **Fix the normalisation form at ingest.** Igala mixes precomposed codepoints (ẹ = U+1EB9) with base+combining sequences, and toned dotted vowels have no precomposed form at all. Pick NFC, apply it at every write, and re-normalise after any concatenation - [UAX #15](https://unicode.org/reports/tr15/) warns that no normalisation form is closed under concatenation, which is a live hazard for a chunk-prefixing pipeline. chrF is character-level and diacritic-sensitive, so an NFC/NFD mismatch silently penalises identical strings.
- **Do not use Postgres `unaccent` for the folded key.** Its default rules file is built for European diacritics and does not handle dot-below or the Igala tone set correctly. Fold in application code with the existing `foldIgala` / `stripTones` / `toneFold` functions in `src/lib/eval/normalize.ts`, and store the result as a real column so it can be indexed.

**Honest caveat.** Whether 40% tone marking is _correct_ Igala or convenience under-marking on phone keyboards is unresolved. Context.md records that annotators agree near-perfectly on lexicon and **diverge on orthographic convention** (Ọdudu / Òdúdú / ódùdù for one word). That is a standards question for Lydia and Agnes, not one this document should settle. What this design does is stop the platform from _silently_ imposing the 100% convention while calling community practice wrong - and Part 6 makes it measurable either way.

---

## Part 5 - Phased build plan

### Phase 0 - Repair, this week, no new data

The current path has three defects (Part 1.2) and one measured pathology (the Koelle 49%). None need new data.

1. **Quarantine the 13 legacy Yoruba-contaminated rows.** Set `verificationStatus = 'disputed'` and filter `verificationStatus != 'disputed'` in every retrieval query. Do not backfill their embeddings - that would make contaminated content _more_ reachable. Do not delete them; the corpus audit is right that adjudication is the community's call.
2. **Make `searchRag` fail loudly.** Replace the bare `catch` with: log the error, record `ragDegraded: true` on the resulting `ModelOutput`, and return `[]` rather than the keyword fallback. An empty context is honest; a `ragContextIds` array full of most-recently-updated rows is a lie recorded in the eval data.
3. **Demote `historical_wordlist` out of the default retrieval path.** One `WHERE chunkType != 'historical_wordlist'` clause removes 49% of current top-1 hits, all of them archaic.
4. **Add the `d1 < 0.55` prose gate and the bucket scoping** from the table in 4.2.
5. **Split the tone clause** in `IGALA_FORCING_INSTRUCTION` and add the orthography contract.
6. **Fix the 0.770 -> 0.416 comment** in `normalize.ts`.

Expected effect: this alone should move the `grammar_tone`, `cultural_values` and `idioms_metaphor` buckets, and it is a day of work.

### Phase 1 - Build the three stores from what we already hold, ~2 weeks

7. **`LexEntry` table, seeded to ~530 entries.** Migrate the 97 Wiktionary gloss lines and 224 Koelle lines out of the blob chunks into one row each; ingest the 217 Wikidata Igala lexemes (CC0, SPARQL `?l dct:language wd:Q35513`, trivial). Compute `foldedKey` and `toneFoldedKey` at write time.
8. **Mine a lexicon from the community gold.** The 338 answers carrying an English gloss are 338 aligned Igala-English pairs we authored ourselves. They will not yield clean headwords automatically, but they are the right thing to put in front of annotators: surface each of the 1,617 distinct word forms with its contexts and ask for a gloss. **This is the highest-leverage annotation task available**, because lexical coverage is the binding constraint (4.3) and because it produces an asset nobody else has. Budget it against the 105-hour reviewer pool as a distinct task type, not folded into episodes.
9. **Exemplar retrieval over `ColdAuthorAnswer`.** Add `exemplarEmbedding`, backfill for the 421 non-held-out prompts, wire bucket-matched top-k with the `isHoldout` hard exclusion.
10. **Implement hybrid retrieval + RRF + the prompt assembly of 4.3.** Keep it behind a `CandidateModel` flag so the existing `+ Igala RAG` candidates become a _versioned_ variant rather than an in-place mutation - the arena's whole value is that old candidates stay comparable.
11. **Run the 7-arm evaluation** of Part 6 on the frozen 43.

### Phase 1.5 - Mine the linguistic literature, ~1 week, runs parallel to Phase 1

The papers in Part 1.1 are a few hundred pages, most of it argument we do not want in a prompt. Harvest four things and discard the rest.

11a. **Interlinear glossed examples.** Every numbered example in Ejeba's concord paper and Momoh's constituency-parsing paper is an Igala sentence with an English gloss and often a morpheme line. Extract them into the exemplar store as `parallel_sentence` rows with an `igt` flag. This is manual work on the order of a day, and it produces the asset class that MTOB, Aycock and LingoLLM all rank first.
11b. **The Igala-language abstract from the Concord System paper**, as genuine parallel text. ~300 tokens, and a template for a standing ask: any Igala scholar publishing in English can be asked for an Igala abstract, and Wikitongues is well placed to ask.
11c. **Tone minimal pairs from Adeniyi's downstep paper**, distilled by Lydia into the ~200-token tone clause of the static pack (Part 4.4). The question it answers is the one we cannot currently answer: which Igala words _must_ carry a tone mark because tone is contrastive there, and which are safely bare. That is what turns the tone contract from a guess into a rule.
11d. **Proverb texts with glosses** from Sule et al., Egbunu and Akogwu & Kadiri. `idioms_metaphor` is the worst-served bucket in the benchmark (top-1 retrieval distance 0.596, meaning nothing relevant exists) and this is the only open material that addresses it.

Do **not** ingest the surrounding prose as retrievable chunks. Distil the findings into the static grammar pack in our own words with citations, which is both the better prompt design and the clean answer to the CC BY-NC constraint.

### Phase 2 - What the Wikipedia dump actually unlocks, ~3 weeks after Phase 1

The dump is 780k usable tokens and the temptation is to chunk it and embed it. **Do not.** Zero encyclopedic chunks reach top-1 on our benchmark today (4.2), the buckets are about language production rather than fact recall, and both MTOB and Aycock et al. show retrieved prose adding ~1 point or hurting. Extract three things instead:

12. **A bilingual lexicon mined from Content Translation alignments.** OPUS `wikimedia` en-igl is 1,110 sentence pairs produced by the Content Translation tool, so the alignments are real. Word-align them (fast_align or SimAlign) and harvest high-confidence lexical pairs into `LexEntry`. Plus interwiki title pairs: every Igala article with an English counterpart is a free term pair. **This is the single highest-value extraction from the dump**, because it attacks the coverage constraint directly.
13. **A parallel-sentence exemplar bank.** The same 1,110 pairs, plus translatewiki's 1,370 UI-string pairs (low value, MT-only, tag them). This roughly triples the exemplar pool. Watch the low-resource TM inversion: [Hao et al., Findings ACL 2023](https://arxiv.org/abs/2306.06948) measured naive TM concatenation **reducing** BLEU by 1.5 points in the low-resource multi-domain regime (33.51 -> 32.02), with weighted ensembling over retrieved TMs as the documented fix. Gate on a similarity floor and measure.
14. **Entity-anchored encyclopedic chunks, for two buckets only.** Article leads for the ~200 highest-traffic Igala articles, indexed by entity name, retrieved only for `cultural_values` and factual named-entity questions, behind the `d1 < 0.55` gate. Exclude the 123 articles that are >20% English. Chunk at ~250 tokens with no overlap - [Chroma's token-level evaluation](https://research.trychroma.com/evaluating-chunking) found 200-token chunks beating 800 substantially on precision and IoU, and [arXiv 2410.13070](https://arxiv.org/abs/2410.13070) found semantic chunking not worth its compute over fixed-size.

### Phase 3 - What permission unlocks

15. **The Idakwoji lexicon (5,000 headwords) is the single acquisition that changes this design's ceiling.** It would take glossed coverage from ~530 to ~5,500 and push us past the DiPMT coverage threshold with room to spare. Everything in Part 4 is built to absorb it without redesign: it is 5,000 `LexEntry` rows.
16. **Ejeba, _A Grammar of Igala_ (M&J Grand Orbit, 2016)** is now on the permission list. It is the definitive reference grammar, paywalled on JSTOR and Project MUSE, all rights reserved. The ask is small and specific: rights to extract the **glossed example sentences and the tone/orthography rules**, not the whole text. That framing is both cheaper to grant and more useful to us than a full licence, per 3.3.
17. **Armstrong (1965) comparative wordlists** need a licence determination (pre-2015 JWAL is unlicensed) and then a human rekey of the Igala column, not an OCR pass. Low priority: it is a Yoruba-comparative list, so every entry needs an attestation-language tag before it can enter `LexEntry` (Part 2.7).
18. **The BSN Igala Bible** would give a verse-aligned parallel corpus large enough to make Phase 2's exemplar bank a real translation memory, and enough clean text to revisit fine-tuning.
19. **Fine-tune the dense retriever** on our own pairs once the exemplar store is stable (Part 2.6). 699 gold pairs against a stated threshold of 150.
20. Until any of these land, **community generation is the corpus strategy**, and step 8 is how retrieval participates in it.

---

## Part 6 - Evaluation, tied to the frozen 43

### 6.1 The arms

A no-retrieval / random-retrieval / real-retrieval comparison is not optional decoration. [Cuconasu et al.](https://arxiv.org/abs/2401.14887) found that adding **purely random, unrelated documents improves accuracy by up to +0.08 (+36%)**. Any RAG gain measured only against a no-retrieval baseline is confounded with "the prompt got longer."

| Arm   | Configuration                                                     | Answers                                                                                                         |
| ----- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **A** | System prompt only, no retrieval                                  | the floor; the current 99%-both-inadequate baseline                                                             |
| **B** | **Random control**: k chunks sampled uniformly, same token budget | is any gain just prompt length?                                                                                 |
| **C** | The designed retrieval (Part 4)                                   | the system under test                                                                                           |
| **D** | **Hard-negative control**: top-k with the correct entries removed | how much do near-miss distractors cost? Cuconasu measured -0.24 (-25%) from a single related-but-wrong document |
| **E** | **Full 41k bundle in a cached context**                           | the long-context fork, settled empirically for $0.68                                                            |
| **G** | **135k MTOB-equivalent one-book bundle** (Part 3.3)               | does a real grammar in context beat curated retrieval? $2.26 a pass                                             |
| **F** | **Oracle**: a human picks the entries                             | the retrieval ceiling; how much headroom is retrieval vs generation                                             |

**The real gain is C minus B, not C minus A.** State it that way in every report.

### 6.2 Metrics

Everything below already exists in `src/lib/eval/`, which is a considerable advantage.

**Primary - human.** Blind pairwise in the existing arena queue, with `both_inadequate` rate as the headline. This matters: the live data shows ~99% `both_inadequate` at confidence 4, so **pairwise win rate currently cannot discriminate** and the both-inadequate rate is the only human metric with signal. Against a 99% floor, "sometimes produces real Igala" is a decisive and statistically easy win.

**Secondary - automatic, all reference-based against the 238 frozen gold answers.**

- **chrF++ multi-reference plus the human ceiling** (`src/lib/eval/reference.ts` already computes both). Report them together, always - a model chrF of 0.35 means nothing without knowing that the leave-one-out human ceiling on the same prompt might be 0.30. chrF is the right family here: [Popović (WMT 2015/2017)](https://aclanthology.org/W15-3049/) established it for morphologically rich targets, and [AfriCOMET (NAACL 2024)](https://arxiv.org/abs/2311.09828) measured chrF++ at 0.277 Spearman versus BLEU's 0.237 across 13 African languages. Note the ceiling on that table: even the best learned metric reached only 0.441. **No automatic metric is trustworthy here at the level COMET is trustworthy for German.**
- **Language-identity gate** (`src/lib/eval/langid.ts`). Report the Igala-vs-English distinction as a finding and the Yoruba/Igbo verdicts as flags for human review, exactly as that module's own header instructs.
- **Tone and dot-below distribution matching.** Not "has tone" - Rung A already showed that saturates at 1.000 and is non-discriminative. Report **|model tone share - gold tone share|** per bucket against the measured targets (0.42 orthography, 0.61 grammar_tone, 0.19 lexicon_disambig, and so on). A system that moves 1.00 toward 0.42 on orthography has done something real. Dot-below share should move toward 1.00, not toward the gold's 0.74.
- **Copy rate, two ways.** (i) Bouthors et al.'s definition: multi-reference chrF of the output against **the Igala side of the retrieved exemplars**. Their finding is the one to fear - ICL had the _highest_ copy rate on the highest-similarity retrievals and simultaneously the _worst_ translation scores ([arXiv 2404.02835](https://arxiv.org/abs/2404.02835)). (ii) [Grusky et al.'s](https://arxiv.org/abs/1804.11283) extractive-fragment **coverage** and **density** against the concatenated retrieved context. Density is the discriminating signal: coverage near 1.0 with density near 1.0 is composition; coverage near 1.0 with high density is regurgitation.
- **Abstention correctness.** Fraction of queries where `d1 >= 0.55` and the system correctly injected nothing. On today's index that should fire on `idioms_metaphor` and `cultural_values`.
- **Retrieval-side metrics separately from generation-side.** Recall@k against annotated gold chunks for a sample. Do **not** use a reference-free LLM "context relevance" score - [RAGAS's own validation](https://arxiv.org/abs/2309.15217) puts context relevance at 70% human agreement against a ~95% human ceiling, while faithfulness reaches 95%. Trust reference-free faithfulness; do not trust reference-free context relevance.

**Do not use an LLM judge for absolute scores.** [Zhou et al., arXiv 2607.14480](https://arxiv.org/abs/2607.14480) is unambiguous: evaluators score semantically identical content differently by language, **lower-resource languages are scored more generously**, the bias persists in frontier judges, and it is **invisible to pairwise accuracy** - >90% pairwise accuracy alongside up to 43% difference in acceptance rate under a single threshold. If a judge is used at all, use it pairwise within-language only, never against a global threshold, with multiple judges, calibrated against native ratings, and report the calibration. The permutation self-consistency trick ([Tang et al., NAACL 2024](https://arxiv.org/abs/2310.07712), +7-18%) is a cheap de-biasing add-on for the position component.

### 6.3 Contamination, three layers

1. **Hard exclusion by invariant.** Every exemplar query joins `Prompt` and requires `isHoldout = false`. This is the same invariant the SFT builder enforces and the same one the prompts route derives at write time (`isHoldout == (split === 'test')`). Reuse, do not re-derive. 238 gold rows are permanently out of the retrieval pool.
2. **Sibling near-duplicate detection.** The frozen `ig_bank_orth_001..015` have same-template siblings `..016..040` still in training. Retrieving a sibling's gold is legitimate - it is a different question - but it can be functionally equivalent. **Measure it:** for every eval item, compute chrF between each retrieved exemplar's Igala text and the item's own gold. Report the distribution and flag anything above 0.8. If the mass is high, exclude by prompt-template prefix, not just by prompt id.
3. **Parametric-leakage control.** Arm A _is_ the no-context leakage measurement that [arXiv 2605.08838](https://arxiv.org/abs/2605.08838) prescribes. For Igala it will be near zero, which is a point in the benchmark's favour and worth reporting explicitly rather than assuming.

### 6.4 Statistical power - say this out loud

From the project's own data-size math: distinguishing a 65/35 model pair needs ~85 comparisons, 60/40 needs ~190. With 43 prompts and 5 annotators the ceiling is ~215 comparisons per arm pair. **We can resolve a pooled 60/40 difference. We cannot resolve per-bucket differences except very large ones.** Report pooled results as findings and per-bucket results as directional, with the `ns` flag the arena already renders. The per-bucket retrieval-distance table in 4.2 is a _diagnostic_, not a result.

---

## Part 7 - The one recommended path

1. **Phase 0 this week.** Quarantine the 13 Yoruba rows, make `searchRag` fail loudly, drop Koelle 1854 from the default path, add the 0.55 gate, split the tone instruction.
2. **Build `LexEntry` and use `ColdAuthorAnswer` as the exemplar index.** Three stores with three retrieval methods, not one table doing three jobs.
3. **Retrieve with a hybrid: dense on the English face, folded-key lexical on the Igala face, fused by RRF.** Measured: dense is at chance on Igala and works on English; folded-key is 20/20 where dense is at chance.
4. **Assemble a ~6k-token cached static pack plus ~4k tokens of per-query retrieval, in the order of 4.3.** Not a long context. Not chunked prose RAG over Wikipedia.
5. **Mark dotted vowels always, tone selectively, fold only for matching, and let unnormalised community exemplars teach tone practice.**
6. **Run seven arms on the frozen 43, and report C minus B.** Including the two long-context arms, because at $2.94 combined it would be strange not to settle the MTOB question on our own language.
7. **Mine the newly-found grammar papers for glossed examples, the Igala abstract, tone minimal pairs and proverbs. Do not paste their prose.** 74% of that bundle is the component every published ablation ranks last.
8. **Spend the Wikipedia dump on lexicon and parallel sentences, not on prose chunks.**
9. **Chase the Idakwoji lexicon**, because lexical coverage is the binding constraint on everything above and 5,000 headwords is the acquisition that lifts it. Ask Ejeba for the example sentences and tone rules from _A Grammar of Igala_, not for the book.

---

## Part 8 - Where this could be wrong

1. **The one gap in the embedder coverage table is SERENGETI's and Cheetah's actual Igala volume.** Igala is on their 517-language list, verified at line 371 of `supported-languages.txt` in both repos. What is **not** published is how many Igala sentences that represents in a manually curated corpus of religious text, news and government documents - plausibly a few thousand. Both are also LMs rather than sentence embedders, so using either means fine-tuning a pooling head, at which point Part 2.6's finding applies: fine-tuning on our own 699 pairs is likely to matter more than the backbone's Igala exposure. If someone wants to try one, the honest test is 2.1's protocol on a 200-word list, not the model card. jina-embeddings-v3 and gemini-embedding-001 publish no authoritative language list at all, so their status is genuinely unknown rather than negative.
2. **The 20-word probe is 20 words.** p@1 = 1/20 has a wide confidence interval. The _direction_ is not in doubt (mean rank 9.6 against a random expectation of 10.5 is as flat as it gets), but a 200-word version would be worth 20 minutes before anyone builds on it.
3. **The 0.55 abstention threshold is calibrated on 43 queries against 47 embedded rows.** It will drift as the corpus grows. Treat it as a property of the index, recalibrate on every ingest, and store the calibration alongside the corpus version.
4. **Our setting differs from every published one in a way that matters: our task is not translation.** MTOB, DiPMT, CoD, LingoLLM and Aycock et al. all measure sentence-level MT with parallel test sets. Our 8 buckets include register, idiom, cultural knowledge and authenticity, where there is no source sentence to look words up from. **The dictionary-injection evidence transfers cleanly to `lexicon_disambig` and `orthography`, partially to `grammar_tone`, and barely at all to `cultural_values` and `idioms_metaphor`** - which is exactly the pattern the retrieval-distance table in 4.2 already shows. Expect gains to be bucket-shaped, and do not generalise a chrF win on lexicon to the whole benchmark.
5. **Whether 40% tone marking is correct Igala or under-marking is genuinely unresolved**, and this document deliberately does not settle it. The design makes it measurable and routes it to Lydia and Agnes.
6. **"Showing inconsistent orthography teaches inconsistency" has no direct experimental test.** The chain is [Min et al.](https://arxiv.org/abs/2202.12837) (format and input distribution matter more than correctness in ICL) plus [Yan et al.](https://arxiv.org/abs/2310.00297) (token co-occurrence reinforcement as the mechanism). The mechanism is well established; the specific orthographic claim is an inference. It is also **cheap and genuinely novel to test** - two arms, exemplars verbatim versus exemplars normalised to 100% tone, on the frozen 43. Worth doing.
7. **Sandwiching (instructions at both ends) is provider-disputed.** OpenAI recommends it, Anthropic and Google do not, and the one controlled test helped only on synthetic retrieval. Flagged as a flag, not a default.
8. **"Best chunk first and last" is folklore.** It follows intuitively from the U-curve but I found no primary paper isolating it with numbers. The supported alternatives are order-preserving RAG (+6.03 F1, [arXiv 2409.01666](https://arxiv.org/abs/2409.01666)) and gold-adjacent-to-query (0.37 vs 0.17, [arXiv 2401.14887](https://arxiv.org/abs/2401.14887)). This design uses the latter.
9. **No diacritic-folding IR study exists for any Yoruboid language.** The "restore, do not remove" guidance rests on a Turkish result and on the segmental-versus-prosodic distinction, which is a linguistic argument rather than an IR measurement.
10. **No Igala ambiguity statistics exist.** Yoruba's are the best proxy: 85% of words carry diacritics, 32% of undiacritized types have two or more diacritized forms, lexical diffusion 1.47, and **64% of monosyllabic types are ambiguous** ([Orife, Interspeech 2018](https://arxiv.org/abs/1804.00832)). Label it as extrapolation whenever it is cited.
11. **AfriCOMET is not validated on Igala** and Igala is not in AfriMTE's 13 languages. Report chrF++ as primary automatic, AfriCOMET as secondary and caveated, human judgment as ground truth.
12. **Fine-tuning may beat all of this, and the two stack.** [Aycock et al.](https://arxiv.org/abs/2409.19151) fine-tuned NLLB-1.3B-Distilled on the same parallel data for ~1 GPU-hour and got 38.7 chrF++ into Kalamang, beating Gemini-1.5-Flash with the entire 99.6k-token book (34.4). Their LoRA-tuned Llama-3.1-8B beat its instruct sibling in nearly every setting, and **prompting the fine-tuned model with parallel data beat its own zero-shot by up to 10 points** - SFT and retrieval are additive, not alternatives. Nothing in this design competes with Experiment 1's LoRA track; the correct end state is the tuned model _plus_ this retrieval layer, and the arena is already built to measure exactly that.
13. **CC BY-NC on most of the grammatical literature is a real constraint that this document deliberately does not resolve.** Ejeba's concord paper, Adeniyi's downstep paper, Ilori and Egbunu are all NC. Prompt-time reference inside a nonprofit research pipeline is comfortably within the licence. What is murky is anything downstream that becomes a released model artifact or a served endpoint that could be characterised as commercial - the same question the corpus audit already flagged on PanLex, and one Masakhane's JW300 experience shows is not theoretical. The mitigation this design uses is to **distil rather than paste**, on the principle that linguistic facts are not copyrightable and their expression is, but that is a lay reading and Wikitongues should get a real answer before any model trained or prompted on this material is published. Route to Daniel and the DAIR licensing framework (licensingafricandatasets.com) already noted in Context.md.
14. **The token estimates for the linguistic literature are page-count extrapolations, not measurements.** ~100,000 tokens for the open grammatical set assumes roughly 500-700 words per journal page at Igala's measured 2.16 cl100k tokens per word. The papers have not been downloaded and counted. Anyone running arm G should count them first; the estimate could be off by 40% in either direction, which does not change the argument but does change the price.
15. **Nobody has measured Yoruba-for-Igala substitution.** The failure is observed repeatedly in our own annotation (Agnes: "it's not an Igala word... maybe it's coming from Yoruba") but there is no published study, and the [Language Confusion Benchmark](https://aclanthology.org/2024.emnlp-main.380/) covers 15 languages, **none of them African**, so it is suggestive rather than direct evidence. Our arena with its `contamination` rubric axis and the `langid.ts` gate is plausibly the right instrument to produce the first real measurement. That is a paper, not just a metric.

---

## Sources

**In-context language learning from limited resources**
Tanzer, Suzgun, Visser, Jurafsky, Melis. A Benchmark for Learning to Translate a New Language from One Grammar Book. ICLR 2024. https://arxiv.org/abs/2309.16575
Aycock, Stap, Wu, Monz, Sima'an. Can LLMs Really Learn to Translate a Low-Resource Language from One Grammar Book? ICLR 2025. https://arxiv.org/abs/2409.19151
Gemini Team. Gemini 1.5: Unlocking multimodal understanding across millions of tokens of context. https://arxiv.org/abs/2403.05530
Back to School: Translation Using Grammar Books. https://arxiv.org/abs/2410.15263

**Dictionary and lexicon injection**
Ghazvininejad, Gonen, Zettlemoyer. Dictionary-based Phrase-level Prompting of LLMs for MT (DiPMT). https://arxiv.org/abs/2302.07856
Lu et al. Chain-of-Dictionary Prompting Elicits Translation in LLMs. https://arxiv.org/abs/2305.06575
Zhang, Choi, Song, He, Wang, Li. Hire a Linguist! (LingoLLM). Findings of ACL 2024. https://arxiv.org/abs/2402.18025
Zhang et al. Teaching LLMs an Unseen Language on the Fly (DiPMT++, ZhuangBench). ACL Findings 2024. https://arxiv.org/abs/2402.19167
Elsner, Needle. Translating a low-resource language using GPT-3 and a human-readable dictionary. SIGMORPHON 2023. https://aclanthology.org/2023.sigmorphon-1.2/
Ramos et al. GrammaMT: improving MT with interlinear glossed text. https://arxiv.org/abs/2410.18702

**Example selection and translation memory**
Moslem, Haque, Kelleher, Way. Adaptive Machine Translation with LLMs. EAMT 2023. https://aclanthology.org/2023.eamt-1.22/
Agrawal, Zhou, Lewis, Zettlemoyer, Ghazvininejad. In-context Examples Selection for MT. Findings of ACL 2023. https://arxiv.org/abs/2212.02437
Zhang, Haddow, Birch. Prompting Large Language Model for Machine Translation: A Case Study. ICML 2023. https://arxiv.org/abs/2301.07069
Bouthors, Crego, Yvon. Retrieving Examples from Memory for Retrieval-Augmented NMT. Findings of NAACL 2024. https://arxiv.org/abs/2404.02835
Hao et al. Rethinking Translation Memory Augmented NMT. Findings of ACL 2023. https://arxiv.org/abs/2306.06948
Khandelwal, Fan, Jurafsky, Zettlemoyer, Lewis. Nearest Neighbor Machine Translation. ICLR 2021. https://arxiv.org/abs/2010.00710
Liu et al. What Makes Good In-Context Examples for GPT-3? (KATE). https://arxiv.org/abs/2101.06804
Lu, Bartolo, Moore, Riedel, Stenetorp. Fantastically Ordered Prompts and Where to Find Them. ACL 2022. https://arxiv.org/abs/2104.08786
Min et al. Rethinking the Role of Demonstrations. EMNLP 2022. https://arxiv.org/abs/2202.12837

**Context position, length, and chunking**
Liu et al. Lost in the Middle: How Language Models Use Long Contexts. TACL 2024. https://arxiv.org/abs/2307.03172
Modarressi et al. NoLiMa: Long-Context Evaluation Beyond Literal Matching. ICML 2025. https://arxiv.org/abs/2502.05167
Hsieh et al. RULER: What's the Real Context Size of Your Long-Context Language Models? COLM 2024. https://arxiv.org/abs/2404.06654
Levy, Jacoby, Goldberg. Same Task, More Tokens. ACL 2024. https://arxiv.org/abs/2402.14848
Du et al. Context Length Alone Hurts LLM Performance Despite Perfect Retrieval. https://arxiv.org/abs/2510.05381
Cuconasu et al. The Power of Noise: Redefining Retrieval for RAG Systems. SIGIR 2024. https://arxiv.org/abs/2401.14887
Yu, Xu, Akkiraju. In Defense of RAG in the Era of Long-Context Language Models. https://arxiv.org/abs/2409.01666
Li et al. Retrieval Augmented Generation or Long-Context LLMs? EMNLP 2024. https://arxiv.org/abs/2407.16833
Hong, Troynikov, Huber. Context Rot. Chroma, 2025. https://research.trychroma.com/context-rot
Chroma. Evaluating Chunking Strategies for Retrieval. https://research.trychroma.com/evaluating-chunking
Is Semantic Chunking Worth the Computational Cost? Findings of NAACL 2025. https://arxiv.org/abs/2410.13070
Anthropic. Introducing Contextual Retrieval. https://www.anthropic.com/news/contextual-retrieval
Thakur et al. BEIR. NeurIPS 2021 Datasets and Benchmarks. https://arxiv.org/abs/2104.08663
Cormack, Clarke, Buettcher. Reciprocal Rank Fusion. SIGIR 2009. https://dl.acm.org/doi/10.1145/1571941.1572114
Shi et al. Large Language Models Can Be Easily Distracted by Irrelevant Context. ICML 2023. https://arxiv.org/abs/2302.00093

**Retrieval and transfer for African languages**
Adeyemi et al. CIRAL: A Test Collection for Cross-Lingual Information Retrieval in African Languages. SIGIR 2024. https://cs.uwaterloo.ca/~jimmylin/publications/Adeyemi_etal_SIGIR2024.pdf
Dense Retrieval for Low-Resource Languages: the Amharic case. https://arxiv.org/html/2503.18570v1
Ogundepo et al. AfriCLIRMatrix. EMNLP 2022. https://aclanthology.org/2022.emnlp-main.597/
Adebara et al. SERENGETI: Massively Multilingual Language Models for Africa. Findings of ACL 2023. https://aclanthology.org/2023.findings-acl.97/ - language list https://github.com/UBC-NLP/serengeti/blob/main/supported-languages.txt
Adebara et al. Cheetah. ACL 2024. https://aclanthology.org/2024.acl-long.691
Wang et al. On Negative Interference in Multilingual Models. EMNLP 2020. https://aclanthology.org/2020.emnlp-main.359/
Cross-lingual transfer for low-resource African languages. https://arxiv.org/pdf/2409.10965
Marchisio et al. Understanding and Mitigating Language Confusion in LLMs. EMNLP 2024. https://aclanthology.org/2024.emnlp-main.380/
Chen et al. BGE-M3. https://arxiv.org/abs/2402.03216
NaijaNLP: A Survey of Nigerian Low-Resource Languages. https://arxiv.org/pdf/2502.19784

**Igala linguistics, openly licensed (new, 2026-08-09)**
Ejeba. Ígálâ Concord System. Journal of West African Languages 50 (2023). CC BY-NC 4.0. https://journalofwestafricanlanguages.org (Golden Jubilee edition, item 800)
Adeniyi. Downstep in Igala and Yala. JWAL 43(1), 2016. CC BY-NC 4.0.
Momoh. Vowels and the Igala Language Resources. RAIL @ EACL 2023. CC BY 4.0. https://aclanthology.org/2023.rail-1.12.pdf
Momoh. Lateral Inversions, Word Form/Order: Constituency Parsing and Annotation of the Igala Syntax. RAIL @ LREC-COLING 2024. CC BY 4.0. https://aclanthology.org/2024.rail-1.17.pdf
Ilori. Interrogative Projections in Yoruboid Languages. JWAL 44(1), 2017. CC BY-NC 4.0.
Armstrong. Comparative wordlists of two dialects of Yoruba with Igala. JWAL 2(2), 1965. Licence unknown, scanned, no text layer.
Ejeba. A Grammar of Igala. M&J Grand Orbit, 2016. All rights reserved, paywalled - permission target.

**Diacritics and orthography**
Orife. Attentive Sequence-to-Sequence Learning for Diacritic Restoration of Yorùbá. Interspeech 2018. https://arxiv.org/abs/1804.00832
Orife, Adelani et al. Improving Yorùbá Diacritic Restoration. ICLR 2020 AfricaNLP. https://arxiv.org/abs/2003.10564
Lin, Scholman, Saeed, Demberg. Modeling Orthographic Variation Improves NLP Performance for Nigerian Pidgin. LREC-COLING 2024. https://arxiv.org/abs/2404.18264
Unicode Consortium. UAX #15: Unicode Normalization Forms. https://unicode.org/reports/tr15/
DeASCIIfication approach to handle diacritics in Turkish information retrieval. IP&M. https://www.sciencedirect.com/science/article/abs/pii/S0306457315001053

**Evaluation, contamination, and copying**
Es et al. RAGAS: Automated Evaluation of Retrieval Augmented Generation. EACL 2024 demo. https://arxiv.org/abs/2309.15217
Saad-Falcon et al. ARES. NAACL 2024. https://arxiv.org/abs/2311.09476
Joren et al. Sufficient Context: A New Lens on RAG Systems. ICLR 2025. https://arxiv.org/abs/2411.06037
Liu, Zhang, Jin, Neville. Generating Leakage-Free Benchmarks for Robust RAG Evaluation. https://arxiv.org/abs/2605.08838
Grusky, Naaman, Artzi. NEWSROOM (coverage and density). NAACL 2018. https://arxiv.org/abs/1804.11283
Popović. chrF: character n-gram F-score for automatic MT evaluation. WMT 2015. https://aclanthology.org/W15-3049/
Wang et al. AfriMTE and AfriCOMET. NAACL 2024. https://arxiv.org/abs/2311.09828
Zhou, Resck, Hui, Korhonen. Lower-Resource, Higher Scores: Language Bias in LLM Evaluators. https://arxiv.org/abs/2607.14480
Doğruöz et al. Challenges and Recommendations for LLMs-as-a-Judge in Multilingual and Low-Resource Settings. https://arxiv.org/abs/2607.02235
Tang et al. Found in the Middle: Permutation Self-Consistency. NAACL 2024. https://arxiv.org/abs/2310.07712

**Provider documentation**
Anthropic. Long context prompting tips. https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/long-context-tips
Anthropic. Pricing (prompt caching multipliers). https://platform.claude.com/docs/en/about-claude/pricing
OpenAI. GPT-4.1 Prompting Guide. https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide
Google. Gemini API long context. https://ai.google.dev/gemini-api/docs/long-context

**Project documents**
`tasks/igala-corpus-sources.md` - corpus audit, licences, what was ingested
`tasks/experiment-1-report.md` - the three-rung fine-tuning experiment and the frozen benchmark
`tasks/eval-freeze-v1.json` - the frozen 43
`Context.md` - project history, annotator findings, data-size math
