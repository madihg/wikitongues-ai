# Experiment 1: can community data produce a better Igala model?

Status: 2026-07-31. Design executed end to end; the real LoRA is blocked on ONE step: Together AI account credit (needs >= $4, ~$5-10 recommended). Everything else is proven working.

## Design (three rungs)

1. Freeze the exam: 43 held-out benchmark prompts (40 newly frozen + 3 original test), split=test + isHoldout=true, invariant verified, stratified: orthography 15, grammar_tone 15, lexicon_disambig 8, one each in the other five buckets. Every frozen prompt has >= 1 gold answer and stored baseline outputs. Their 188 gold answers are excluded from all training forever. The three high-gold "mega seed" prompts (ig_orth_001 g16, ig_gram_001 g24, ig_lex_001 g12) were deliberately kept IN training. Frozen list: tasks/eval-freeze-v1.json.
2. Rung A (automated few-shot probe): gpt-4.1 zero-shot vs 8-exemplar few-shot on the frozen 43, scored on English-function-word purity and tone-mark presence. Finding: the Igala-forcing system prompt already saturates both proxies at zero-shot (0.000 English share, 1.000 tone share). Few-shot only compresses length (~66 vs ~87 chars). Conclusion: cheap automated proxies are non-discriminative at this level; the decisive signal is native human judgment on the held-out bank. Results: tasks/rung-a-results.json. Caveat: native gold is often UNDER-tone-marked relative to models (Omi, Ọwọ), so toneShare measures presence, not correctness.
3. Rung C (the real test): LoRA SFT on 254 clean native gold rows (after freeze exclusion; orthography 139, grammar_tone 87, lexicon_disambig 28) on Qwen/Qwen3-14B via Together; auto-registers as an arena CandidateModel; generates outputs on the frozen 43; annotators then judge blind tuned-vs-frontier pairs in their normal queue (with n=3 outputs per prompt, ~2/3 of annotators per prompt get a tuned-vs-baseline pair). Primary metric: both-inadequate rate vs the 99% baseline. Secondary: blind win rate, rubric axes.

## What was proven / fixed on the way

- CRITICAL FIX: the SFT dataset builder trained only on OutputEdit.correctedText, of which exactly 1 row existed - it could never have trained on the community's 480+ cold-authored answers. New shared loadSftSourceRows (src/lib/arena/sft-source.ts) sources cold answers + edits, drops demo and non-consent rows, keeps English glosses/rationales OUT of completions. Held-out exclusion verified against live DB (224 held-out gold rows contribute 0 training examples).
- Together adapter schema bug fixed (training_method string -> object). Auth + file upload verified working against the live Together API.
- Full pipeline validated with the mock provider: build -> launch -> poll -> auto-registered CandidateModel (archived) -> auto-queued EvalRun on the 43 held-out prompts.
- Gitignore bug: a broad build/ rule had silently kept src/app/api/arena/jobs/[id]/build/route.ts out of git entirely (prod never had the endpoint). Narrowed to /build/ and committed (PR #12).
- Data hygiene: two junk gold rows from test accounts deleted (one literal "test" that had landed in the benchmark; one English-framed answerText).

## Blockers for the funded run (exact)

1. Add ~$5-10 Together credit (error was 402 insufficient_balance, requires >= $4.00 combined balance/credit).
2. After training: set the auto-registered candidate's apiEndpoint to https://api.together.xyz/v1 and provide OPENAI_COMPATIBLE_API_KEY (the Together key) so generateForCandidate reaches Together instead of defaulting to OpenAI; Qwen3-14B LoRA inference may need a dedicated Together endpoint.
3. Then: generate the frozen-43 outputs into ModelOutput, rerun purity metrics, and let the blind arena run for a few days of annotator judgment.

## Expectation setting (from the literature review)

With ~254 examples, expect gains in language selection, orthography, and register consistency, not fluency. Against a 99% both-inadequate baseline, "sometimes produces real Igala" is a decisive, statistically easy-to-detect win, and the October Wikimedia Ghana demo story if it lands.
