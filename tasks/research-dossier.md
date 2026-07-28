# Igala Research Dossier — Wikitongues AI

_Compiled 2026-07-27. Consolidates the project's living memory (`Context.md`), the taxonomy
recommendation (`tasks/taxonomy-recommendation.md`), the method recommendation
(`tasks/research-recommendation.md`), and an annotated bibliography of the papers/resources
cited in the project's data-research review. This is a reference document, not a decision
record — decisions still live in `Context.md`; this file exists so the whole research trail
can be handed to a person or a tool (e.g. NotebookLM) in one place._

---

## 1. Project summary and method

### What this is

Teaching AI to speak underserved languages, community by community, starting with **Igala**
(~2M speakers, tonal Volta-Niger / Yoruboid, Kogi State, Nigeria). The headline deliverable is
a **public benchmark/leaderboard** that holds every model (Claude, GPT, Gemini, ...)
accountable for how well it speaks Igala. Community-led by design. Public launch target:
Wikimedia Foundation conference, Ghana, ~Oct 4-5 2026.

Two surfaces, kept distinct: **the platform** (this repo — learner/annotator/researcher roles,
pairwise + rubric scoring, model leaderboard — where the rubric and benchmark actually run) and
a **marketing mini-site** within wikitongues.org (separate spec).

People: Agnes (Igala community lead, Ikala Wikimedians, Abuja — the person who said "everything
is wrong" about ChatGPT's Igala); Lydia Wiernik (linguistics lead, owns the rubric); Daniel
Bögre Udell (Wikitongues co-founder); Emily Black (NYU, advisory council); Sonja Schmer-Galunder
(annotation methodology); Google Research advisors (Erin van Liemt, Andrew Smart, Isaac Caswell,
Ben Hutchinson, Jimmy Tobin).

### The core insight: the platform IS the training-data factory

The annotation data the platform collects doubles as the training data:

- pairwise (A beats B + explanation) → DPO preference pairs
- annotator edits / cold-authored answers → SFT gold targets
- rubric scores → reward signal / eval ground truth

Loop: collect preferences + corrections → build training sets → fine-tune/DPO candidate models
→ evaluate in the arena against baselines → promote winners → repeat (epochs). This is why the
platform was rebuilt around an **annotation episode** rather than a simple two-step
pairwise-then-rubric form (see below).

### Taxonomy: two different lists (locked 2026-07-06, config not schema)

The project separates **prompt categories** (what a prompt is _for_) from **rubric axes** (what
an answer is _scored on_) — conflating the two into "8 buckets that are each three things" was
the original design's weakness.

**Prompt categories — 7 active + 1 experimental**, each declaring its own in-scope axes so the
UI only asks for scores that make sense (denser data per axis, less annotator fatigue):

| Category                                                 | In-scope axes                                              |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| Spelling & tone marks                                    | spelling, diacritics, lexicon                              |
| Grammar & sentence structure                             | syntax, semantics, lexicon                                 |
| Vocabulary & word meaning                                | lexicon, contamination, semantics, diacritics              |
| Register, tone & honorifics                              | authenticity, cultural_relevance, semantics                |
| Figurative language (idioms + metaphor + motifs, merged) | semantics, cultural_relevance, authenticity, contamination |
| Cultural knowledge & values                              | cultural_relevance, contamination, authenticity, semantics |
| Authenticity & naturalness                               | authenticity, cultural_relevance, contamination            |
| _Dialect & code-switching (experimental, parked)_        | contamination, authenticity                                |

**Rubric axes — 8 axes, 0-5 + N/A, two scoring passes** (`RUBRIC_V2`, `RUBRIC_VERSION="v3"` in
`web/src/lib/buckets.ts`, config not schema — a one-line edit changes them, no migration):

- Pass 1 (the language itself): `syntax` (grammar & word order), `lexicon` (word choice — real,
  correct Igala words, nothing invented/borrowed), `spelling`, `diacritics` (tone marks — "where
  Igala models fail most"), `semantics` (did the meaning come across even if the form is off —
  kept orthogonal to syntax on purpose, so "grammar wrong" and "meaning lost" don't correlate and
  wreck agreement).
- Pass 2 (Lydia's reflective pass, "thinking about the answer you just scored…"):
  `cultural_relevance` (cultural fit, not a Western-centric assumption), `authenticity` (would a
  real speaker actually say it this way), `contamination` ("Is it Igala?" — 5 = fully Igala, 0 =
  another language).

Three deliberate departures from Lydia's Jul-6 draft, argued and kept: (1) **contamination stays
its own scored axis** rather than folding into authenticity — it is the single most measurable,
most trainable, most fundable failure mode (the Yoruba/Idoma bleed Agnes keeps hitting); burying
it loses the headline number. (2) **axes are scoped per category** instead of shown-all/mostly-
N/A. (3) **dialect is dropped as a quality axis** and parked as a future code-switching benchmark
— Igala dialects are largely mutually intelligible, so "dialectal fidelity" is cultural
perception, not a correctness score.

### Annotation method: the episode

Replaced a two-step pairwise+rubric flow with a guided episode producing up to four independent
artifacts, each elicited separately so "the three signals agree" stays meaningful:

1. **Cold authoring (gold-first)**: the annotator writes their _own_ Igala answer first — with a
   tone keyboard, source-free — before the models are revealed. This is the anti-translationese
   move: an edit inherits the translationese of the text it edits; a cold answer does not
   (directly informed by the post-editese literature, §3). Auto-applies on `register_honorifics`
   and `grammar_tone`; optional elsewhere; stored as `ColdAuthorAnswer` with explicit provenance
   (`speaker_authored_sourcefree` vs `corrected_from_inadequate`).
2. **Blind pairwise**: A/B hidden and randomized, confidence 1-4 (never pre-selected, to fight
   habit-pinning), plus two distinct outcomes beyond winner: `tie` and `both_inadequate`.
3. **Score the winner only** (not both outputs — least annotator work, cleanest training target).
   Subjective buckets are blind; a low score forces a rationale. Factual buckets
   (`lexicon_disambig`, `idioms_metaphor`, `cultural_values`) show a RAG reference panel so
   fluency can't rescue an invented fact.
4. **Inline edit of the winner** with a tone-aware word diff that never strips diacritics.
   `both_inadequate` swaps this for "write the correct version" (salvage gold). `tie` allows an
   optional correction without faking a winner.
5. **One consent block per episode** (may-enter-benchmark / may-train), not per-artifact.

A prompt-flag path lets annotators cull malformed/untranslatable prompts. A skip path
(`PromptFlag reason="skip"`) removes a prompt from an annotator's queue without counting it
completed. Queue assignment (`assignedPair()`, FNV-1a hash) guarantees every annotator sees each
prompt once, different annotators get different pairs, and every model appears in every queue —
full pairwise coverage across the team without central bookkeeping.

### The method ladder (staged, not a competition)

The team's instinct was to lead with DPO; the corrected sequence is **CPT → SFT-on-edits →
DPO/KTO**, with RAG kept _permanently_ as a parallel grounding layer (not a phase you graduate
from) — weights own **form** (orthography, morphology, register, authentic generation), RAG owns
**facts** (taboo, idioms, dialect corpora, disambiguation; fine-tuning facts in raises
hallucination). **DPO is the finisher, not the teacher** — on a base that cannot spell Igala, DPO
just ranks two wrong answers.

| Rung | Method                                                      | Pilot?            | What it does                                                                          | Consumes                                                                    |
| ---- | ----------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 0    | Prompting/ICL + RAG over closed APIs                        | now               | Lexical retrieval + surface imitation; establishes baseline and _is_ the data harness | Tone-marked glossary, idiom/honorific/taboo rules, cleaned Wikipedia chunks |
| 1    | SFT on annotator edits (LoRA), scoped to form               | maybe (small)     | Teaches surface form, register, authentic phrasing — the substrate DPO sits on        | 500-2,000 (instruction, Igala-response) pairs                               |
| 2    | Preference opt: KTO default, DPO (filtered) for clean pairs | post-pilot        | Turns "can speak Igala" into "speaks it as the community prefers"                     | Pairwise → triples; thresholded rubric/edits                                |
| 3    | Continued pretraining (CPT) on open base                    | post-pilot, gated | The only lever that puts Igala into the weights                                       | Tens of millions of clean tokens — **do not exist yet**                     |
| 4    | Reward model as evaluator                                   | later             | Cheap automatic regression screen between human rounds (triage, never adjudication)   | Collected preference data                                                   |
| 5    | Full RLHF/RLCF (GRPO)                                       | long-horizon      | Best fit for subjective buckets; needs a trustworthy RM that can't be built yet       | Reward model + community feedback                                           |

CPT is demoted deliberately: realistic digitized Igala text is low single-digit millions of
tokens, much of it Bible-register translationese; "tens of millions of clean tokens" is a
6-18-month field-linguistics effort, not an October deliverable. LoRA-CPT on a tiny corpus mostly
memorizes. Vocabulary extension is skipped (only pays off at tens of billions of tokens).

Per-bucket levers: orthography → CPT eventually, glossary-RAG patches known words now;
grammar/tone → data creation is the method, not a training trick (Igala orthography often omits
tone marks; without a tone-annotated corpus weights learn to omit tone — the hardest bucket);
lexicon/disambiguation → RAG lexicon now, CPT later (**confound is Yoruba/Igbo, not Idoma** — see
below); dialect → RAG over a dialect-tagged corpus that must be built (CPT + one small corpus
entrenches prestige collapse); register/honorifics → DPO/KTO + SFT on honorific edits (rule-like,
preference-shaped, the strongest FT bucket); idioms/metaphor → RAG (novel idioms read literally
regardless of method); cultural knowledge/values → RAG over a vetted corpus (keep facts out of
weights); authenticity vs translationese → DPO on pairwise picks _and_ source-free native
elicitation (edits inherit the translationese of what they edit).

**Critical linguistics correction (flagged for Lydia/Agnes):** the Source-of-Truth doc names
Idoma as the language Igala gets confused with. Genetically that's imprecise — Igala is Yoruboid,
a close sister of Yoruba (large cognate overlap, parallel tone), while Idoma is a more distant
Idomoid branch. Two distinct, both-real things: the _observed_ model behavior (outputs bleed
toward Idoma and other neighbors from haphazard web scraping — keep this in the bucket
description) versus the _training-time interference risk_ (the dangerous attractor is
Yoruba/Igbo; upweighting Yoruba in CPT for "transfer" risks entrenching the bleed, since transfer
and interference are one mechanism — do not assume a Yoruba-adjacent base model's Yoruba transfer
is unambiguously good for Igala).

### Contamination and diacritics gates (hard filters, not soft signals)

Per the Jul-22 data-quality overhaul: mixed-language training targets teach code-switching and
are excluded; contamination and diacritics are hard filters at export time, not soft rubric
signals to average over; English rationale/explanation text goes in metadata, never into SFT
completions (else the model learns to emit English commentary); one annotation episode can yield
two SFT rows via Igala instruction paraphrasing. `IGALA_FORCING_INSTRUCTION` in
`src/lib/generation-prompt.ts` explicitly tells generation models not to fall back to Yoruba,
Igbo, or Pidgin, and to use English only if the prompt asks for it — this alone moved measured
output purity from 41% to 3.1% non-Igala content (see §2).

### Base model direction (for when fine-tuning starts, post-pilot)

Primary candidate: **Lugha-Llama-8B** (Llama-3.1-8B continued-pretrained on the WURA African
corpus) — the only candidate that already ran a CPT pipeline on Volta-Niger languages with
measured Igbo/Yoruba gains (Igala itself is in no model's pretraining, so the question is "best
substrate," not "who already knows Igala"). Fallback: **Gemma 3** (4B/12B) for its diacritic
tokenizer and Google-council alignment. The Jul-22 research verdict adds: **base-model choice
(Aya-101 / African-lineage models) dominates the outcome — probe tokenizer fertility and
generation quality before committing to fine-tune**, rather than assuming Lugha-Llama is settled.
Before committing: a one-afternoon tokenizer-fertility test on held-out Igala across
Lugha-Llama/Gemma 3/Qwen3, plus license and serving-story due diligence.

### Evaluation methodology

Rank by **human pairwise → Bradley-Terry per bucket** (LMArena-standard; order-invariant,
tighter CIs than online Elo). Rubric 1-5 (ordinal) is the diagnostic "why." Edit-rate
(normalized edit distance vs. the corrected version) is both an objective repair signal and
training data. Require pairwise + rubric + edit-rate to agree before declaring a bucket winner.
**LLM-as-judge is not trustworthy for Igala** — multilingual judges sit around ~0.3 kappa, worst
on low-resource languages, and the same models that "get everything wrong" reward translationese;
the judge is restricted to throughput (triage, language/script ID, regression screening), always
logging position-swap agreement (judge each pair twice, A/B swapped, count only swap-consistent
verdicts). Contamination discipline: a private, rotating, community-authored held-out bank;
**never source held-out items from Igala Wikipedia** (already crawled); RAG index kept disjoint
from gold answers; `Prompt.isHoldout`/`split` enforced at every export endpoint. Statistical
honesty: cluster-bootstrap CIs over items _and_ annotators; with few annotators and historically
low agreement (0.08 creative-depth, 0.17 factual at epoch_1), most rung-deltas should be expected
to read "not distinguishable" — the pilot's real output is the _instrument_ plus a few
directional signals, not a statistically resolved ranking.

---

## 2. Empirical findings to date

- **Prompt bank grew 8 → 300.** 292 Claude-authored prompts (40/category core, 20
  dialectal_fidelity experimental), content-reviewed independently with zero cultural-fact
  violations found; ~24 prompts revised post-review (de-templated idioms, rewritten orthography
  strays, concretized metalinguistic asks). Held-out/test expansion is intentionally kept
  community-authored (Agnes's team), never Claude-authored, and never sourced from Igala
  Wikipedia.
- **~140 native pairwise judgments, ~99% `both_inadequate` at confidence 4.** This is the
  project's headline empirical finding so far: frontier models (Claude, GPT) fail Igala
  essentially always, with high annotator confidence in that failure — only one comparison in the
  live sample produced a decided winner, meaning no defensible model ranking exists yet from this
  data alone.
- **Observed Yoruba/Igbo/Pidgin substrate leakage**, live and repeatedly. Agnes's own example on a
  July call: both model outputs for "morning" were wrong, and her diagnosis was "it's not an Igala
  word… maybe it's coming from Yoruba" — an unprompted community confirmation of the
  contamination axis's importance, and of the Yoruba-not-Idoma linguistic correction above.
- **Output purity: 41% → 3.1% non-Igala content after Igala-forcing.** Adding an explicit
  generation-time instruction (`IGALA_FORCING_INSTRUCTION`) that names and forbids Yoruba/Igbo/
  Pidgin substitution, and restricts English to when the prompt asks for it, cut measured
  contamination by roughly an order of magnitude — a cheap, high-leverage prompt-engineering
  fix ahead of any fine-tuning.
- **~140 gold answers collected** (cold-authored + salvage-from-`both_inadequate`), ~100
  deduplicated — roughly 10-20% of a 500-1,000-row SFT target reached in about four days of
  annotation, suggesting the target is reachable within the pilot's ~105 annotator-hours.
- **Near-perfect lexical agreement, divergent orthographic conventions across annotators.** A
  free calibration finding: independent annotators unanimously agreed on the correct _word_
  ("odudu") while writing it in visibly different spelling conventions (Ọdudu / Òdúdú / ódùdù;
  spacing/elision variants of "Ọma lẹ a jẹ ñwu"). This reframes what week-1 calibration needs to
  fix — it's spelling/diacritic conventions, not vocabulary or meaning, that need aligning first.
- **Confidence habit-pinning.** Early live data showed ~95% of pairwise confidence scores pinned
  at 4 (a UI/behavior artifact, not a genuine confidence distribution); the annotation UI now
  never pre-selects a confidence value and nudges annotators that "an honest 1 or 2 is just as
  useful as a 4."
- **Historically low inter-annotator agreement** (epoch_1: creative-depth 0.08, factual 0.17
  Krippendorff-alpha-style), motivating both the rubric redesign (per-axis, scoped, anchored) and
  planned collective calibration sessions.
- **Data-size math (binding constraint = prompts, not people).** 5 annotators × ~105 hours ≈
  1,000-1,050 total episodes at ~6 min/episode. Distinguishing a 65/35 model-pair gap needs ~85
  pairwise comparisons (one-sided α=.05, power .8); a 60/40 gap needs ~190. Full per-bucket
  resolution across 3 candidates × 8 categories would need ~2,000 comparisons — over budget. The
  honest pilot framing: the data resolves large per-bucket gaps and supports a solid pooled
  overall ranking, not fine-grained per-bucket rankings for close calls. SFT's 500-1,000
  verified-gold target is reachable at this budget; DPO's 2-5K clean-pair target and CPT's
  10M+-token target are post-pilot by construction (the corpus doesn't exist yet).
- **"Wrong output" copy-paste explanations ~80%** of early rationale text — a data-quality gap
  that motivated requiring ≥10 characters of real rationale on `both_inadequate` outcomes, plus a
  concrete worked example (Sarah's "odudu" case) shown in-flow.

---

## 3. Annotated bibliography

Grouped by what each source contributed to the project's actual decisions. Titles/authors/venues
below were verified against arXiv/ACL Anthology abstracts (or, where noted, corroborated by
search) rather than assumed from the citation shorthand alone; two items below turned out not to
be quite what their working label implied, and that mismatch is flagged rather than papered over.

### Multilingual instruction-data collection at scale

- **Aya Dataset** — Singh, Vargus, D'souza et al., "Aya Dataset: An Open-Access Collection for
  Multilingual Instruction Tuning," arXiv:2402.06619 (ACL 2024). A 513M-instance
  multilingual instruction resource built via human curation (65 languages) plus
  templating/translation (114 languages), from contributors in 119 countries. Contribution:
  the working precedent for "human-curated, participatory instruction data closes multilingual
  gaps" — the model this project is implicitly arguing against defaulting to (scraped/MT'd data)
  and the model the cold-authoring episode is trying to be, for one language, at a much smaller
  scale.
- **Aya Model** — Üstün, Aryabumi, Yong et al., "Aya Model: An Instruction Finetuned Open-Access
  Multilingual Language Model," arXiv:2402.07827 (2024). The companion open model instruction-
  tuned on the Aya dataset across 101 languages (over half of them lower-resourced), released with
  99-language eval suites. Contribution: the concrete referent behind "Aya-101/African lineage" as
  a candidate base or comparison point in the Jul-22 research verdict's base-model probe.
- **MURI** — Köksal, Thaler, Imani, Üstün, Korhonen, Schütze, "MURI: High-Quality Instruction
  Tuning Datasets for Low-Resource Languages via Reverse Instructions," arXiv:2409.12958 (2024).
  Generates 2M+ instruction-response pairs across 200 languages from existing native-language
  text via reverse-instruction + translation, without needing human annotators or a pre-existing
  multilingual instruction model. Contribution: the clearest available blueprint for cheaply
  scaling instruction data in a language with almost no annotators — a fallback worth revisiting
  if the 5-annotator, 105-hour budget turns out to be the true bottleneck it's projected to be.
- **AfriInstruct** — Uemura, Chen, Pejovic, Maduabuchi, Sun, Lee, Findings of EMNLP 2024
  (aclanthology.org/2024.findings-emnlp.793). Continual-pretrains + instruction-tunes LLaMA-2-7B
  on a 19-language African instruction set plus the 20-language WURA corpus; the result
  outperforms GPT-3.5-Turbo on multiple African-language tasks. Contribution: direct evidence for
  the project's base-model bet — WURA is the same corpus behind Lugha-Llama, so this is a second,
  independent data point that CPT-on-WURA-family-corpora measurably helps Volta-Niger languages.
- **InkubaLM** — Tonja, Dossou, Ojo, Rajab et al., arXiv:2408.17024 (2024). A 0.4B-parameter small
  language model for African languages, competitive with much larger models on MT, QA, AfriMMLU,
  AfriXNLI, and sentiment. Contribution: evidence that effective African-language modeling doesn't
  require frontier scale — relevant to the eventual open-weights serving-cost problem (§ Reference
  architecture / infrastructure reality), where a small dedicated model may be cheaper to host per
  arena variant than a large general one.

### Translationese, post-editese, and the case for cold authoring

- **Toral, "Post-editese: an Exacerbated Translationese,"** arXiv:1907.00900 (MT Summit XVII,
  2019). Compares post-edited MT output to from-scratch human translation across three datasets
  and five language directions; post-edited text is measurably simpler, more normalized, and shows
  more source-language interference than from-scratch translation, even when automatic quality
  metrics call them equivalent. Contribution: the direct empirical justification for the episode's
  core design choice — an _edit_ of a model's output inherits the model's translationese even when
  it "reads fine," which is why cold, source-free authoring is treated as a categorically different
  (and more valuable) signal than an edited correction.
- **Castilho & Resende, "MT-Pese: Machine Translation and Post-Editese,"** EAMT 2022
  (aclanthology.org/2022.eamt-1.42). A project-announcement-style paper describing an experimental
  program to measure post-editese effects across domains, in backtranslation, and against overall
  translation quality. Contribution: corroborates Toral from a different angle (multi-domain,
  backtranslation-focused) — reinforces that post-editese is a general, replicated phenomenon, not
  a one-paper artifact, strengthening the case for weighting cold answers over edits in SFT data.

### Chain-of-thought and rationale handling

- **Li, Hessel, Yu, Ren, Chang, Choi, "Symbolic Chain-of-Thought Distillation,"** ACL 2023
  (aclanthology.org/2023.acl-long.150). Shows CoT-style reasoning gains, previously assumed to
  need 50B+ parameter models, can be distilled into 125M-1.3B student models by training on a
  larger teacher's sampled rationales. Contribution: background for how an explanation/rationale
  field could, in principle, be repurposed as training signal for a smaller downstream model —
  the reason the project deliberately keeps English rationale text in _metadata_ rather than in
  SFT completions (below) is informed by exactly this kind of distillation mechanism working both
  ways: a model can learn to imitate the _form_ of an explanation, including its language.
- **Son, Yang, Patel et al., "Pushing on Multilingual Reasoning Models with Language-Mixed
  Chain-of-Thought,"** arXiv:2510.04230 (2025, rev. 2026). Proposes reasoning that deliberately
  alternates between English (as an anchor) and a target language to reduce translation errors,
  demonstrated at scale on Korean (a 5.79M-prompt dataset, 9 trained models, consistent gains).
  Contribution: directly informs the Jul-22 research verdict's most counterintuitive-sounding
  rule — "English rationale goes in metadata, never SFT completions, else the model learns to
  emit English commentary." This paper shows _deliberate_ language-mixing can help reasoning
  quality; the project's choice to exclude mixed-language _targets_ from SFT is not a rejection of
  that finding but a scope distinction — mixing is being reserved for internal reasoning
  scaffolding, not for the final Igala-only completion the model is trained to produce.

### Low-resource single-language adaptation recipes (the closest precedents to this project)

- **Kuulmets, Purason, Luhtaru, Fishel, "Teaching Llama a New Language Through Cross-Lingual
  Knowledge Transfer" (Llammas),** arXiv:2404.04042 (Findings of NAACL 2024). Adapts Llama 2 to
  Estonian by combining cross-lingual instruction tuning with a modest amount of additional
  monolingual pretraining, producing the first open-source Estonian instruction-following LLM
  plus a new Estonian instruction dataset (Alpaca-est). Contribution: the single closest published
  analogue to this project's own plan (CPT + SFT on a specific low-resource language, cheaply) —
  supports the CPT-before-SFT ordering and the expectation that a _small_ amount of monolingual
  data, combined with cross-lingual instruction transfer, can move the needle meaningfully.
- **Aravinda, Sirajudeen, Karunathilake, de Silva, Ranathunga, Kaur, "SinLlama — A Large Language
  Model for Sinhala,"** arXiv:2508.09115 (2025). Extends Llama-3-8B's tokenizer with Sinhala
  vocabulary and continually pretrains on a cleaned 10M-item Sinhala corpus. Contribution: a second
  single-language CPT precedent, useful as a comparison point for what "enough" continued-
  pretraining data looks like for one language, and a reminder that tokenizer vocabulary extension
  is part of some successful recipes even though this project's research-recommendation.md
  currently advises skipping it (only pays off at much larger scale) — worth revisiting if a
  Sinhala-scale corpus (~10M items) ever becomes available for Igala.
- **Purason, Kuulmets, Fishel, "LLMs for Extremely Low-Resource Finno-Ugric Languages,"**
  arXiv:2410.18902 (Findings of NAACL 2025). Runs the near-full LLM development cycle (data
  collection, instruction tuning, evaluation, including a new multi-turn benchmark) for three
  extremely low-resource languages: Võro, Livonian, Komi. Contribution: a template for what a
  from-scratch, multi-stage low-resource pipeline looks like end to end, including building
  evaluation benchmarks alongside the model — directly parallel to this project building its own
  benchmark and rubric before any fine-tuning exists.

### Tonal-language handling

- **Olusanya, "Tone in Yoruba ASR: Evaluating the Impact of Tone Recognition on Transformer-Based
  ASR Models,"** LoResLM 2026 (aclanthology.org/2026.loreslm-1.14). Evaluates three pretrained ASR
  models on Yoruba speech under varying tone-diacritic annotation; finds non-tone-marked data
  yields lower error rates and traces the gap to tokenization limits and weak tonal
  representation, recommending tone-aware tokenization for Yoruba and similar tonal languages.
  Note: this is a speech/ASR paper, not text generation or instruction tuning — relevant to Igala
  by linguistic analogy (Igala is also tonal and Yoruboid) but not directly transferable to the
  text-generation pipeline this project runs. Contribution: independent, closely-related-language
  confirmation that tone/diacritic handling is a tokenization-level problem, not just a data-
  volume problem — consistent with why `diacritics` is its own scored rubric axis and why the
  project's tokenizer-fertility test (before committing to a base model) explicitly checks
  diacritic handling.

### Cross-lingual transfer and in-context learning

- **Chirkova & Nikoulina, "Zero-shot Cross-lingual Transfer in Instruction Tuning of Large
  Language Models,"** arXiv:2402.14778 (2024). Finds that LLMs instruction-tuned only on English
  data still produce linguistically appropriate, comprehensive responses in other languages
  zero-shot — with weaker factual accuracy and occasional fluency issues — contingent on careful
  hyperparameters and enough English data. Contribution: the closest existing evidence bearing on
  Emily Black's research question #3 (cross-lingual transfer of cultural reasoning) and on the
  project's own weights-vs-RAG split — it supports putting _form_ in English-instruction-tuned
  weights while being a warning that _facts_ (its stated weak point) should stay in RAG, matching
  the project's existing split rather than contradicting it.
- **Cahyawijaya, Lovenia, Fung, "LLMs Are Few-Shot In-Context Low-Resource Language Learners,"**
  arXiv:2403.16512 (2024). Studies in-context learning across 25 low-resource and 7
  higher-resource languages using only short in-context examples; identifies limits of existing
  label-alignment methods and proposes "query alignment" as a stronger technique. Contribution:
  empirical backing for research-recommendation.md's Rung 0 characterization of prompting/ICL as
  establishing a baseline that "collapses out of distribution" — ICL alone is not expected to be a
  durable solution, consistent with why the ladder moves on to SFT/DPO/CPT rather than stopping at
  better prompting.
- **Ghosal, Pal, Mukherjee, Manocha, "PromptRefine: Enhancing Few-Shot Performance on Low-Resource
  Indic Languages with Example Selection from Related Example Banks,"** arXiv:2412.05710 (NAACL
  2025). An alternating-minimization method for selecting few-shot examples for low-resource Indic
  languages from related higher-resource languages' example banks, with a diversity term against
  bias. Contribution: a directly applicable technique for the project's planned
  `IGALA_FEW_SHOT_EXAMPLES` array once vetted exemplars exist — and a concrete method (borrow
  well-chosen examples from Yoruba, carefully) for the RAG/glossary layer, if ever extended beyond
  Igala-only sources.
- **Chen, Ji, Bogoychev, Kutuzov, Haddow, Heafield, "Monolingual or Multilingual Instruction
  Tuning: Which Makes a Better Alpaca,"** arXiv:2309.08958 (Findings of EACL 2024). Compares
  monolingual vs. multilingual instruction tuning on Alpaca and its machine translations; finds
  multilingual tuning matches or beats per-language tuning, and remains strong even downsampled.
  Contribution: a real tension with the project's locked "Igala only" scope decision — this paper's
  finding suggests a multilingual mix (e.g. including related Yoruboid languages) could plausibly
  outperform Igala-only SFT data, which cuts against the project's contamination concerns about
  Yoruba bleed. Flagged as an open tension rather than resolved (see §4).
- **Chen, Yu, Guo, Haddow, "Is It Good Data for Multilingual Instruction Tuning or Just Bad
  Multilingual Evaluation for Large Language Models?"** arXiv:2406.12822 (EMNLP 2024). Shows that
  translation-reliant evaluation can obscure real multilingual quality gaps; using controlled
  native-vs-translated data, finds native/generative benchmarks reveal meaningful gaps that other
  test types miss. Contribution: methodological backing for treating LLM-judge scores and
  translated benchmarks with suspicion, and for insisting on native-speaker pairwise + rubric
  judgment as the ground truth — exactly the project's existing "LLM-judge is triage only" rule.

### Preference-optimization data quality (DPO)

- **Deng, Zhong, Ai, Feng, Wang, He, "Less is More: Improving LLM Alignment via Preference Data
  Selection,"** arXiv:2502.14560 (2025). Improves DPO through data _selection_ rather than a new
  objective — a margin-maximization principle to filter noisy preference pairs, achieving
  3-8% AlpacaEval2 gains using only 10% of a preference dataset. Contribution: direct support for
  the project's contamination+diacritics hard-gate export design and for keeping DPO's target at a
  small (2-5K), clean pair count rather than maximizing volume — quality-filtered small preference
  sets are shown here to outperform large noisy ones.
- **"An Empirical Study of SFT-DPO Interaction and Parameterization in Small Language Models,"**
  arXiv:2603.20100 (2026) — cited in the project's working list as "DPO low-resource margins."
  **Flag: verified this arXiv ID is real, but its actual subject is not low-resource languages.**
  It compares SFT-only, DPO-only, and staged SFT-then-DPO training (plus full fine-tuning vs.
  LoRA) on a GPT-2-scale model for paraphrase detection and sonnet continuation, concluding that at
  small model scale, full-parameter SFT is the dominant lever and DPO/LoRA add only marginal value.
  Contribution, with the caveat stated: if the paper's actual finding is what was intended by
  "low-resource margins," it's a mild caution against over-relying on DPO's marginal contribution
  at small model scale — consistent with "DPO is the finisher, not the teacher" — but this should
  be re-confirmed against the intended source before it's cited publicly, since the working label
  and the paper's actual scope don't match.

### Multilingual corpora / MT resources (checked specifically for Igala coverage)

- **NLLB Team, "No Language Left Behind: Scaling Human-Centered Machine Translation,"**
  arXiv:2207.04672 (Meta AI, 2022). Massively multilingual MT across ~200 languages plus the
  Flores-200 benchmark. **Confirmed: Igala is not among NLLB's ~200 supported languages** (its
  language list runs directly from Italian to Javanese with no Igala entry).
- **Kudugunta, Caswell, Zhang, Garcia et al., "MADLAD-400,"** arXiv:2309.04662 (Google, 2023). A
  manually audited, 3-trillion-token CommonCrawl-derived corpus spanning 419 languages.
  **Confirmed: Igala is not included** — the only "ig"-prefixed code present is Igbo (54,410
  documents), no Igala-specific code exists.
- **Imani, Lin, Kargaran et al., "Glot500: Scaling Multilingual Corpora and Language Models to 500
  Languages,"** arXiv:2305.12182 (ACL 2023). Continues XLM-R pretraining into 511 mostly
  low-resource languages via the new Glot500-c corpus. **Confirmed: Igala is not included** — codes
  beginning "ig" are only Igede (`ige_Latn`) and a distinct `igo_Latn`, no Igala code exists.

Contribution of all three: independent, direct confirmation of the project's founding premise —
Igala is absent from every major open multilingual MT/corpus effort (NLLB, MADLAD-400, Glot500),
not merely under-represented within them. This is the concrete evidence behind "Igala is in _no_
model's pretraining" (research-recommendation.md) and behind treating corpus-building itself, not
just fine-tuning method choice, as unsolved project infrastructure.

### Folklore/motif source for prompts

- **Berezkin's World Mythology and Folklore Motif Database** (Yuri Berezkin, with Evgeny Duvakin;
  Kunstkamera, Russian Academy of Sciences; ruthenia.ru/folklore/berezkin, English-language
  version with maps at mapsofmyths.com). A searchable database of roughly 70,000 text-abstracts
  covering ~2,564 distinct mythological/folkloric motifs across ~958 ethnolinguistic groups
  worldwide, including African traditions, compiled from 6,000+ sources in 32 languages, updated
  annually. Suggested by Andrew Smart (Google Research) on the project's advisory council.
  Contribution: the proposed prompt source for the `idioms_metaphor` and `cultural_values`
  categories — "floating motifs" (mythological/folkloric elements attested across culturally
  distant societies) are a natural probe for whether a model's cultural-knowledge answers are
  genuinely Igala-grounded or generic/borrowed, and for Emily Black's research question about
  whether more Igala Wikipedia content improves floating-motif handling specifically (see §4).
  Note on sourcing: a direct fetch of the ruthenia.ru URL during this dossier's compilation
  returned unrelated content (apparently a caching/redirect artifact on that domain); the
  description above is reconstructed from independent search results, not a confirmed live page
  read — worth a manual check before treating any specific motif content from the site as verified.

---

## 4. Open research directions

- **The interlingua / linguistic-interstice question.** Is there a shared semantic
  "interlingua" that multilingual models exploit when transferring cultural or linguistic
  competence between related languages — and if so, does Igala's position as Yoruba's close
  sister put it in a favorable or unfavorable interstice (real transfer available, but also the
  dominant contamination risk)? This sits directly on top of the project's own tension: MURI and
  the cross-lingual-transfer literature (§3) suggest related-language data helps; the
  contamination findings (Yoruba/Igbo/Pidgin bleed, output purity 41%→3.1% only after explicit
  forcing) suggest the same relatedness is actively hurting today's outputs. Resolving this
  (empirically, not just by literature reading) is probably the single highest-value open
  research question the project has. _Note: another agent in this working session
  ("interlingua-scout") appears to be actively scoped to this exact question — worth checking in
  with it directly rather than duplicating a literature pass._
- **Fine-tuning vs. RAG, as a measurement rather than a debate.** The method ladder currently
  _asserts_ a permanent split (weights own form, RAG owns facts) rather than measuring it. The
  arena architecture (candidate models registered with/without RAG, with/without DPO, per bucket)
  is explicitly built to turn this into an experiment — register `Open+RAG` and `Open+DPO` as
  sibling candidates on the identical held-out bank and see whether the assumed split actually
  holds bucket by bucket, once an open-weights base is in play.
- **Floating motifs as a cultural-transfer probe.** Concretely: build a small prompt set from
  Berezkin motifs attested in West African traditions, ask whether Igala-specific framing versus
  generic/pan-African framing is distinguishable in model output, and connect the result to Emily
  Black's stated research questions: (1) does more Igala Wikipedia content improve floating-motif
  handling specifically (as opposed to unrelated buckets), (2) does community-authored vs.
  translated training data differ on cultural-motif questions, (3) does cultural reasoning
  transfer cross-lingually independent of linguistic form. All three are currently open questions,
  not yet instrumented in the arena.
- **Base-model probe before any fine-tuning spend.** The Jul-22 research verdict flags that
  base-model choice (Lugha-Llama vs. Gemma 3 vs. an Aya-101/African-lineage model vs. Qwen3)
  "dominates the outcome" — this is asserted, not yet run. The one-afternoon tokenizer-fertility +
  generation-quality test across candidates is still outstanding and gates the entire CPT/SFT/DPO
  post-pilot plan.
- **Monolingual-vs-multilingual instruction data, re-litigated.** The "Igala only" scope decision
  is in tension with the Mono/Multi Alpaca finding that multilingual instruction mixes tend to
  match or beat single-language tuning. Worth an explicit, small ablation once SFT data exists:
  Igala-only vs. Igala+Yoruba(-filtered-for-contamination) instruction mixes, measured on the
  contamination axis specifically, before assuming the current Igala-only stance is optimal rather
  than just risk-averse.
- **Dialect and code-switching as their own benchmark.** Deliberately parked out of the quality
  rubric (mutually-intelligible dialects aren't a correctness axis) but not yet built as the
  separate benchmark it was promised to become — does the model collapse to a prestige dialect,
  or mix dialects oddly, and does that matter to the community the way contamination clearly does?
- **Data governance framework.** DAIR's African data-licensing framework
  (licensingafricandatasets.com) was flagged by the DAIR advisory input as relevant to how
  community-authored Igala data (prompts, cold answers, corpus text) should be licensed and
  consented — not yet reconciled with the project's current per-episode consent block.
  Also flagged, not yet adopted: MQM metrics (themqm.org) as a possible complementary evaluation
  framework, and WALS as a reference for what Yoruba/Idoma "do differently" from Igala at the
  typological level, to sharpen the contamination axis's definition further.
- **Multimodal extension.** Lydia's proposal to record video/audio of correct pronunciation
  (particularly for tone, the hardest bucket) has not been discussed with Agnes yet and is not
  represented anywhere in the current schema or pipeline — a real gap given that Igala's tone
  system is fundamentally a spoken-first phenomenon that text-only diacritic annotation can only
  approximate.
- **Corpus ingestion (W3 track) status is still unresolved.** Whether Igala Wikipedia (~1,000
  articles) and other open texts have actually been ingested into any pipeline remains an open
  question flagged in `Context.md` itself and not answered by anything reviewed for this dossier.

---

## Appendix: source list for this dossier

- `Context.md` (repo root) — full session history through 2026-07-25 (commit 8ca16a4 era).
- `tasks/taxonomy-recommendation.md` — the locked rubric/category taxonomy and its rationale.
- `tasks/research-recommendation.md` — the method-ladder recommendation, per-bucket matrix, base
  model guidance, and evaluation methodology.
- `tasks/reference-arena-and-brand.md` — build spec cross-checked for additional research content
  (mostly implementation detail; a few research-relevant notes on CPT-as-first-class and the
  pretraining-corpus surface are folded into §1 and §4 above).
- The 24-item paper/resource list supplied for this task, verified against primary abstracts
  (arXiv/ACL Anthology) or corroborating search results where a direct fetch was inconclusive
  (flagged inline in §3 where that applies).
