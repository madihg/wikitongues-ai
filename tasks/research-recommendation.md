# How to Actually Improve an LLM on a Low-Resource Language (Igala)

### Methods recommendation + platform direction. Wikitongues AI. 2026-06-22.

> Synthesized from a 14-agent research pass (7 method families, base-model landscape, eval
> methodology) and two adversarial verification passes (computational-linguist + ML-engineer).
> Every confident claim below survived an attempt to refute it. Numbers from other languages are
> labeled _directional_, never as Igala measurements.

---

## TL;DR for the advisory council

1. **There is no single method. It is a staged ladder, and the order is the insight:**
   **CPT → SFT-on-edits → DPO/KTO**, with RAG kept _permanently_ as a parallel grounding layer.
   The team's instinct to lead with DPO is the one thing to correct: **DPO re-ranks, it does not
   teach.** On a base that cannot spell Igala, DPO just ranks two wrong answers.
2. **Weights for FORM, retrieval for FACTS - never either/or.** Orthography, morphology, register,
   authentic generation must enter the weights. Cultural/taboo facts, idiom glosses, dialect
   corpora, lexical disambiguation stay in RAG (fine-tuning facts in _raises_ hallucination).
3. **This forces an open-weights base.** You cannot CPT/DPO Claude or Gemini. Use them as strong
   prompting/RAG baselines and as throughput judges - never as the thing you improve.
4. **For the October pilot, the buildable deliverable is the INSTRUMENT, not a trained model.**
   The honest in-window scope is: closed-API variants ± RAG, a bucket-aligned rubric, a
   contamination-safe held-out bank, and a model **arena** that can register and rank variants -
   _architected_ so open-weights fine-tuned variants slot in later without a rebuild. CPT/DPO are
   **post-pilot**, gated on a corpus census, annotator recruitment, and GPU budget.
5. **The platform's annotation data is the training data** (the flywheel): pairwise → DPO pairs,
   edits → SFT targets, rubric → reward/eval signal. Build the platform as a preference-data
   factory whose output is both a public benchmark and a training set.

---

## The method ladder (staged, honest about the pilot)

| Rung | Method                                                          | Pilot?                | What it actually does                                                                                                     | Consumes                                                                                    |
| ---- | --------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 0    | **Prompting/ICL + RAG over closed APIs**                        | ✅ now                | Lexical retrieval + surface imitation. Establishes the baseline and _is_ the data harness. Collapses out of distribution. | Tone-marked glossary, idiom/honorific/taboo rule lists, cleaned Wikipedia chunks, retriever |
| 1    | **SFT on annotator EDITS (LoRA), scoped to FORM**               | ⚠️ maybe (small)      | Teaches surface form, register, authentic phrasing. The substrate DPO sits on.                                            | 500-2000 (instruction, Igala-response) pairs from edits + pairwise winners                  |
| 2    | **Preference opt: KTO default, DPO (filtered) for clean pairs** | ❌ post-pilot         | Turns "can speak Igala" into "speaks it the way the community prefers." Alignment finisher.                               | Pairwise → triples; thresholded rubric/edits → KTO binary labels                            |
| 3    | **Continued pretraining (CPT) on open base**                    | ❌ post-pilot (gated) | The _only_ lever that puts Igala into the weights (orthography, representational separation).                             | Tens of millions of clean, community-written tokens - **which do not exist yet**            |
| 4    | **Reward model as evaluator**                                   | ❌ later              | Cheap automatic regression screen between human rounds. Triage, never adjudication.                                       | Collected preference data                                                                   |
| 5    | **Full RLHF / RLCF (GRPO)**                                     | ❌ long-horizon       | Best theoretical fit for subjective buckets; depends on a trustworthy RM that can't be built yet.                         | Reward model + community feedback                                                           |

**Why CPT is demoted (adversarial finding):** realistic digitized Igala text is low single-digit
millions of tokens, much of it Bible-register translationese. The "tens of millions of clean tokens"
prerequisite is a 6-18 month field-linguistics effort and will not unlock by October. LoRA-CPT on a
tiny corpus mostly memorizes. CPT is the right _eventual_ answer and the council's "must be in
pretraining" point is correct - but it is a Phase-3 conditional, not a pilot deliverable. **Skip
vocabulary extension** (only pays off at tens of billions of tokens).

## Per-bucket matrix (which method moves which dimension)

| #   | Bucket                         | Best lever                                                   | Note                                                                                                                          |
| --- | ------------------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | orthography/spelling           | CPT (post-pilot); glossary-RAG patches in-glossary words now | Only weights teach letterforms                                                                                                |
| 2   | grammar/morphology/**tone**    | **data creation, not a method**                              | Igala orthography often omits tone marks; weights learn to omit tone unless a tone-annotated corpus is built. Hardest bucket. |
| 3   | lexicon/disambiguation         | RAG lexicon now; CPT later                                   | **Confound is Yoruba/Igbo, not Idoma** - see linguistics note                                                                 |
| 4   | dialectal fidelity             | RAG over dialect-tagged corpus (must be built)               | CPT + a single small corpus _entrench_ prestige collapse                                                                      |
| 5   | register/honorifics            | DPO/KTO; SFT on honorific edits                              | Rule-like, preference-shaped - strongest FT bucket                                                                            |
| 6   | idioms/metaphor                | RAG (idiom→meaning)                                          | Novel idioms read literally regardless of method                                                                              |
| 7   | cultural knowledge/values      | RAG over vetted corpus                                       | Keep facts OUT of weights (fabrication risk)                                                                                  |
| 8   | authenticity vs translationese | DPO on pairwise picks + source-free native elicitation       | Edits inherit the translationese of the edited output - need monolingual native elicitation too                               |

## Critical linguistics correction (flag for Lydia/Agnes)

The Source-of-Truth doc names **Idoma** as the language Igala gets confused with. Genetically that is
imprecise: **Igala is Yoruboid - a close sister of Yoruba** (large cognate overlap, parallel tone),
while Idoma is a more distant Idomoid branch. Two distinct things, both real:

- **Observed model behavior** (what Agnes sees): outputs bleed toward _Idoma_ and other neighbors,
  from haphazard web scraping. Keep this in the bucket description.
- **Training-time interference risk**: the dangerous attractor is **Yoruba/Igbo**. Upweighting Yoruba
  in CPT for "transfer" risks _entrenching_ the bleed (transfer and interference are one mechanism).
  Do not treat Lugha-Llama's Yoruba transfer as unambiguously good.

## Decisive answers

- **"Fine-tuning vs DPO vs something else?"** A fixed sequence, not a competition:
  **SFT-on-edits → DPO/KTO**, on an open base, with CPT later. DPO is the _finisher_, not the teacher.
  Flag likelihood-displacement on tonal minimal pairs / Yoruba near-homographs as a named, mitigated
  hazard (similarity-filter the pairs; never bootstrap from machine-translated preference data).
- **"Update weights vs RAG?"** **Both, permanently, by a principled split:** weights own form
  (orthography, morphology, register, authentic generation); RAG owns facts (taboo, idioms, dialect,
  disambiguation). RAG is not a phase you graduate from. The arena makes this an experiment, not a
  debate: register `Open+RAG` and `Open+DPO` as siblings on the same held-out bank, compare per bucket.

## Base model (when fine-tuning starts, post-pilot)

- **Primary: Lugha-Llama-8B** (Llama-3.1-8B continued-pretrained on the WURA African corpus) - the
  only candidate that already ran the exact CPT-on-Volta-Niger pipeline, with measured Igbo/Yoruba
  gains. Igala is in _no_ model's pretraining, so the question is "best substrate," not "who knows Igala."
- **Fallback: Gemma 3 (4B/12B)** - better diacritic tokenizer + Google-council alignment.
- **Before committing:** run a one-afternoon **tokenizer fertility test** on held-out Igala across
  Lugha-Llama / Gemma 3 / Qwen3; due-diligence the license (Wikimedia-aligned public launch), a
  maintained instruct variant, and a serving story.

## Evaluation methodology (this is what makes a claim defensible)

- **Rank by human pairwise → Bradley-Terry per bucket** (LMArena standard; order-invariant, tighter
  CIs than online Elo). Rubric 1-5 (ordinal) = the diagnostic "why". Edit-rate (normalized
  Levenshtein/chrF vs the corrected version) = objective repair signal _and_ training data.
  **Require pairwise + rubric + edit-rate to agree before declaring a bucket winner.**
- **LLM-as-judge is NOT trustworthy for Igala.** Multilingual judges sit at ~0.3 kappa, worst on
  low-resource languages, and the same models that "get everything wrong" reward translationese.
  Restrict the judge to throughput: triage, language/script ID (Igala vs Yoruba/Idoma/English),
  regression screening. **Always log position-swap agreement** (run each judgment twice, A/B swapped;
  count only swap-consistent verdicts). Publish a per-bucket judge-vs-human calibration; forbid the
  judge as a reporting instrument on any bucket where it underperforms human alpha.
- **Contamination discipline:** private, rotating, community-authored held-out bank; **never source
  held-out items from Igala Wikipedia** (already crawled); RAG index kept disjoint from gold answers;
  canary GUIDs + perturbed-twin probes for closed baselines.
- **Statistical honesty:** cluster-bootstrap CIs over items _and_ annotators; pre-register buckets,
  weights, and decision rules. **With ~2 annotators today and epoch_1 agreement already low
  (creative 0.08, factual 0.17), expect most rung-deltas to read "not distinguishable."** The pilot's
  output is the _instrument_ + a few directional signals, not statistically resolved rankings. Raise
  agreement with collective calibration sessions (Sonja's finding).

## Infrastructure reality (the biggest unstated hole, now stated)

Open-weights training/serving does **not** run on Vercel/Neon or provider fine-tune APIs:

- Training = rented A100/H100 (Modal/RunPod/Lambda) + an offline harness (TRL/axolotl/Unsloth).
- Serving = a persistent GPU endpoint per variant (vLLM, or Together/Fireworks/Baseten). 8 warm
  arena endpoints can run into thousands of $/month; learner chat eats cold-start latency.
- Therefore the platform integrates training/serving behind a **provider adapter interface** and
  treats fine-tuned variants as external endpoints registered as candidates - it does not host them.

## What this means for the build (scope honesty)

This recommendation **reverses the v1 PRD's explicit Non-Goals** ("no fine-tuning", "no RLHF",
"prompting/RAG only"). That reversal should be made deliberately, with its budget and self-hosting
implications. The platform work that _is_ in-window and high-leverage:

**MUST-HAVE (closes the loop on paper, runs on closed APIs today)**

1. Candidate-model registry + model-swapping threaded through the pipeline (today it is hard-coded to
   `claude-sonnet-4-5`).
2. Model arena: register N variants, generate on a held-out bank, serve blind pairwise, rank per bucket.
3. Bucket-aligned rubric (rename `creativeDepth → culturalNormAdherence`; expand `GapCategory` 4 → 8
   buckets) + Agnes's direct-edit field as a first-class object on every output.
4. Contamination-safe held-out split (`Prompt.isHoldout` / `split`), locked out of all export endpoints.
5. Training-set export: emit clean DPO (pairwise) + SFT (edits) JSONL behind a provider adapter.

**SHOULD-HAVE (makes it defensible)** 6. Epoch trajectory / trending. 7. LLM-judge as calibrated pre-screen with swap logging. 8. Annotator collective-session / adjudication workflow. 9. Consent-flagged pretraining-corpus surface.

**NICE-TO-HAVE (post-October)** 10. One-click fine-tune launch + auto-register. 11. RAG-vs-weights ablation preset. 12. Tone-mark-aware diff viewer.

Plus the **Wikitongues rebrand** (warm ochre-on-ink humanist system replacing the Oulipo brutalist
tokens; full token set + dark mode in the design section of the PRD).
