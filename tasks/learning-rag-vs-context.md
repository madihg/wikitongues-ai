# Learning: why retrieval design is the pivotal question for Igala

Logged 2026-08-09. Status: strategic insight driving current work, not yet a settled conclusion.

## The shift that created the question

Until this week the working assumption was that Igala has essentially no text. That assumption is now out of date. The corpus audit found the Igala Wikipedia, live since April 2024, holding roughly 484,000 words (about 390,000 genuinely Igala once partly-untranslated articles are discounted) under CC BY-SA 4.0 with monthly machine-readable dumps. The community's own annotation effort has produced about 6,000 words in three weeks. The Wikipedia is roughly 65 times larger.

That puts the project in an unusual regime. Not "no data", which would force pure elicitation. Not "abundant data", which would justify continued pre-training. Something in between, where roughly 390,000 words is simultaneously too little to pre-train a model on and small enough that it could, in principle, be shown to a model all at once.

## The fork: retrieval or whole-corpus context

The landmark reference point is MTOB (Machine Translation from One Book, Tanzer et al., ICLR 2024), in which a model learned to translate Kalamang, a language with almost no web presence, from a single grammar book placed in its context window. No fine-tuning. The knowledge arrived as context.

At our corpus size this stops being a thought experiment. A curated subset of Igala material - a grammar sketch, a lexicon, a set of parallel sentences, a sample of community gold - plausibly fits inside a frontier long-context window (Gemini's million-plus tokens, Claude's 200k). If that works, it could outperform chunked retrieval outright, because the model sees the whole system of the language rather than a handful of fragments selected by a similarity score that was never trained on Igala.

The competing approach, conventional RAG, retrieves a few relevant chunks per query. Cheaper per call, scales past the context window, but only as good as the retrieval.

Which wins is an empirical question we can now actually run, because we hold a frozen 43-prompt benchmark whose community gold never enters training.

## The hard part: nothing can embed Igala

This is the crux, and it is easy to miss.

Retrieval by semantic similarity depends on an embedding model that understands the language being embedded. No commercial embedding model covers Igala. Embedding Igala text and searching it by vector similarity is close to meaningless: the vectors encode almost nothing about what the Igala actually says.

There are workarounds, and they shape what data is valuable:

1. Retrieve on the English side. Where we hold parallel data - roughly 1,110 English-Igala sentence pairs from OPUS, 122 tone-marked Igala lemmas in English Wiktionary, and the English glosses our annotators write alongside their gold answers - the English can be embedded reliably and the Igala served as the payload. This makes the English gloss field far more valuable than it looks: it is not documentation, it is the retrieval index.
2. Lexical and character-level matching on the Igala side, which needs no model at all and is robust to tone-mark variation if the comparison folds diacritics.
3. Multilingual embedders claiming African coverage. Worth testing, with a specific hazard below.

## The Yoruba hazard

Embedders that "cover" African languages typically cover Yoruba, Igala's nearest well-resourced relative. Relying on Yoruba proximity for retrieval risks amplifying the exact failure this project exists to document: models reaching for Igala and returning Yoruba. A retrieval layer tuned on Yoruba similarity could systematically surface Yoruba-flavoured material and reinforce the substitution.

Yoruba adjacency is therefore double-edged. It is the reason a Yoruba-exposed base model (Lugha-Llama, trained on WURA) is the most promising open-weights bet for transfer, and simultaneously the reason retrieval built on Yoruba similarity could poison the output. The same relatedness that helps the model generalise helps it fail in a way native speakers immediately recognise and metrics do not.

## What this implies for the work

- The English gloss is infrastructure, not paperwork. Making it required was the right call for a reason we had not fully articulated: it is what makes the community's corpus retrievable at all.
- Parallel data is disproportionately valuable per word, because it is the only material that is both semantically searchable and in-language.
- The long-context option should be tested seriously and early, not assumed inferior to RAG because RAG is the fashionable architecture.
- Any retrieval evaluation must guard contamination absolutely: on the frozen benchmark, retrieval must never surface that prompt's own gold answer or any other held-out prompt's gold, or the comparison measures nothing.

## Open questions

- Does whole-corpus context actually beat retrieval at this scale, and at what cost per call?
- Do multilingual embedders help or actively harm through Yoruba drift?
- How many in-context examples before a model starts copying rather than composing?
- Does showing the model our annotators' inconsistent tone marking teach it inconsistency?
