# In the Linguistic Interstice - paper brief (AgentWorld / Antikythera)

Status: 2026-07-31. Venue: Agentworld special issue, Antikythera: Journal for the Philosophy of Planetary Computation (MIT Press), Fall 2026. Proposals accepted at initial stage since June 25. Xenolinguistics is one of Bratton's named Agentworld themes (raised with Halim at the March 2026 SF salon; prior emails to Bratton and Nicolay Boyadjiev establish continuity).

## Adversarial literature verdict (2026-07-24 review)

Ground exists, but only reframed. The naive claim "LLMs have an interlingua" is 80% published and would be desk-rejected:

TAKEN (cite as prior art, never claim):

- Latent-English pivot: Wendler, Veselovsky, Monea, West, "Do Llamas Work in English?" ACL 2024 (arXiv 2402.10588) - logit-lens three-phase trajectory through an English-aligned concept space.
- "Do Multilingual LLMs Think In English?" Schut et al., ICLR 2025 (arXiv 2502.15603) - steering vectors more effective computed in English.
- Semantic Hub Hypothesis, Wu et al., ICLR 2025 (arXiv 2411.04986) - shared hub across languages and modalities; does NOT test figurative content in unseen languages.
- Anthropic, "On the Biology of a Large Language Model" (Transformer Circuits, 2025) - circuit-level shared multilingual features, the strongest existing shared-space claim.
- Language-specific neurons: Tang et al., ACL 2024 (2024.acl-long.309) - output-language steering.
- Non-English-centric pivots already answered: Zhong et al. (arXiv 2408.10811) - Japanese-centric models pivot through dual latent languages.
- The word "interlingua" in NMT: Johnson et al. 2017 (TACL Q17-1024) zero-shot translation.
- Idiom mechanics: figurative-vs-literal tug-of-war heads (arXiv 2506.01723).
- Closest prior to our leakage story: Translation Barrier Hypothesis (arXiv 2506.22724) - implicit translation failure worst for low-resource; must differentiate hard.
- Benjamin-as-machine-translation metaphor: already published (Translation Review 2025; Open Humanities Press "Pure Language 2.0").

OWNABLE (verified unpublished):

1. Substrate behavior at effectively ZERO resource, with leakage as a layer-localizable, native-labeled failure mode (models land in Yoruba/Igbo/Pidgin when reaching for Igala - documented live by native annotators).
2. Paired human traces: cold-authored native gold + English rationales set against the model's internal trace; bilingual introspective phenomenology as a comparative axis absent from all interpretability work.
3. Bounding the Semantic Hub with figurative/floating-motif content in an unseen language.
4. SFT-vs-RAG read by WHERE the repair lands in the stack (late-layer manifold vs surface re-skin), not BLEU.

Kill risks to disclose: leakage-as-signature is a hypothesis until E1 traces it; logit/tuned lens may be uninformative if Igala tokens are byte-fallback (pre-register the concept-space fallback); n=1 language demands a second near-zero-resource control.

"Xenolinguistics" is safe as the Antikythera frame (their word) but reads as alien-language studies in ML venues.

## The quote (verified verbatim, Zohn translation)

Walter Benjamin, The Task of the Translator (1923): "Languages are not strangers to one another, but are, a priori and apart from all historical relationships, interrelated in what they want to express." And: "...an intention, however, which no single language can attain by itself but which is realized only by the totality of their intentions supplementing each other: pure language."

Markov ruled out (conflation: Markov chains as LLM ancestor). Wittgenstein Tractatus 5.6 is adjacent (limits of a single language), not the interlingua claim. Steiner's After Babel supports stakes, not substrate.

## Thesis

The language-agnostic substrate in LLMs is real but bounded: for a language absent from pretraining, the model resolves meaning in the shared interlingua yet, lacking a target output manifold, collapses onto the nearest attested neighbor. This substrate leakage is layer-traceable, native-verifiable, and repaired differently by fine-tuning (installs a late-layer manifold) than by retrieval (re-skins the surface).

## Experiments

- E1 (carries the paper): logit/tuned lens per layer on open models (Llama-3, Aya-23, Qwen) over the 300-prompt bank; concept peak location; detokenization language; native-labeled leakage taxonomy. Control: Yoruba (seen) vs Igala (unseen) through the identical pipeline.
- E2: SFT vs RAG on the same community gold; compare where representations move in the stack, not adequacy scores.
- E3: motif probe on idioms/proverbs; steer with English-computed concept vectors; human English rationales as ground truth for the motif.

## Abstract (current draft)

Interpretability research has established that multilingual language models resolve meaning in a shared conceptual space biased toward their dominant language. Every study of this substrate probes languages the model already knows. We ask what the substrate does at the edge: when the target language is effectively absent. Working with Igala speakers in Nigeria (~2 million speakers), we built an annotation platform where native annotators author their own answers before seeing model output, judge blind comparisons, and explain failures in English. Speakers rejected 99% of frontier-model Igala and documented a consistent signature: models reach for Igala and land in Yoruba, Igbo, or Pidgin, the nearest attested neighbors. We treat this substrate leakage as a mechanistic object: layer-resolved tracing on open models tests whether concepts resolve in the shared interlingua and collapse at detokenization. Idioms and floating motifs probe whether figurative structure crosses the gap. Fine-tuning on community gold versus retrieval asks where each repair lands in the stack. And paired human traces, bilingual annotators' rationales and the felt phenomenology of moving a concept between one's own languages, give the machine trace a human comparison it has not had. The platform itself is the argument: a small centaur institution where a speech community and a model negotiate what a language is.

## Outreach state (2026-07-24)

Gmail drafts prepared (not sent): (1) Google group - Andy Smart, Erin van Liemt, Isaac Caswell, cc Emily Black, Sonja Schmer-Galunder, Daniel, Lydia - modeled on Andy's Jul 1 Berezkin email, brief included; (2) Nicolay Boyadjiev (Antikythera) - route question for the proposal; (3) Darren Zhu - thank-you + abstract (needs email address, only LinkedIn on file).
