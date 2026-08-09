# Automatic evaluation for Igala

What each metric in this directory can tell us, what it cannot, and why it
exists at all.

> **Numbers in this README are a DATED SNAPSHOT (2026-08-09), not live figures.**
> The gold corpus, the candidate set and the human labels all grow while
> annotators and other agents work, so treat every figure below as an
> illustration of what the harness reports and read the current values from
> `/admin/arena/eval` or `scripts/run-eval.ts`. Where a number is a one-off
> measurement of a bug or a design decision, it is labelled as such and does not
> go stale. Nothing in this file is read at runtime.

## Why this exists

Human blind judgment is the ground truth for Igala quality, and it is the only
thing that settles whether a model is good. It is also slow: of 781 blind
comparisons collected so far, 775 came back "both inadequate", 1 was a tie and
5 named a winner. The tuned model has appeared in a couple of comparisons. We
cannot wait for statistical power on that channel alone before deciding whether
a fine-tune helped.

This directory gives a fast automatic signal _and_ measures how much that signal
is worth against the human labels we already hold. Every number it produces
ships with an `n`, a 95% interval, and a ceiling.

## The one sentence that governs everything here

**No automatic metric in this directory can assess Igala fluency the way a
speaker can.** They measure surface overlap with what a handful of speakers
happened to write, and the identity of the language being written. A fluent,
idiomatic, culturally correct answer that uses different words than the gold
scores _low_. A nonsense string assembled from the gold's characters scores
_high_. Treat every number here as triage: it is good at telling you that
something is badly wrong, and poor at telling you that something is right.

## Files

| File            | What it is                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| `normalize.ts`  | Unicode handling for Igala's two kinds of diacritic (segmental ẹ/ọ vs tonal). Tokenisation, folding, char sequences. |
| `chrf.ts`       | chrF and chrF++ (Popović 2015, 2017), following sacrebleu's documented algorithm.                                    |
| `similarity.ts` | Diacritic-exact match, tone-insensitive match, fully folded match, token edit similarity.                            |
| `reference.ts`  | Multi-gold scoring (best and mean over references) and the **inter-gold ceiling**.                                   |
| `langid.ts`     | The language-identity gate: Igala / Yoruba / Igbo / English / Pidgin, plus its own cross-validation.                 |
| `stats.ts`      | Bootstrap intervals, paired bootstrap deltas, Wilson intervals, Pearson.                                             |
| `runner.ts`     | The composite report: per-candidate, per-category, head-to-head. Pure.                                               |
| `autorater.ts`  | Turns the metrics into a verdict, and validates that verdict against human labels.                                   |
| `collect.ts`    | The only impure file. Reads Prisma, hands plain objects to everything above.                                         |

Everything except `collect.ts` is pure and unit-tested (`*.test.ts`, run with
`pnpm test`).

## chrF / chrF++

**Definition.** Popović, Maja. "chrF: character n-gram F-score for automatic MT
evaluation", WMT 2015. chrF++ adds word n-grams: Popović, WMT 2017.

    chrF_beta = (1 + beta^2) * chrP * chrR / (beta^2 * chrP + chrR)

with character n-gram orders 1..6, beta = 2 (recall weighted twice as heavily as
precision), whitespace removed before extracting character n-grams, clipped
match counts, an F-score computed per order and averaged over the orders where
both sides have n-grams, and the max taken over multiple references. chrF++ adds
word n-gram orders 1..2 to the same average. This module returns `[0, 1]`;
multiply by 100 for the conventional score.

**What is and is not verified.** The implementation is checked against values
computed by hand in `chrf.test.ts` (both the beta=1 and beta=2 cases are worked
through digit by digit), plus identity, disjoint and symmetry properties. It has
**not** been diffed against an actual sacrebleu run — this repo has no Python
toolchain. So the honest claim is "implements the documented sacrebleu
algorithm", not "verified byte-identical to sacrebleu". Before putting a chrF
figure in a paper next to numbers from other systems, run sacrebleu over the same
pairs, diff, and record the sacrebleu version: the effective-order convention is
a property of that tool's implementation, not of the 2015 paper.

**Why chrF and not BLEU.** Gold answers in this bank have a median length of
around 5 characters. Word-level BLEU with 4-grams scores 0 almost everywhere, and
any word-level metric treats "ẹ́gẹ" against "ẹgẹ" (the same word with different
tone marking) as a complete miss. Character n-grams degrade gracefully on both
counts, which is why chrF is the standard for low-resource MT.

**What chrF CAN tell us**

- That a model has stopped producing Igala-shaped strings at all (chrF collapses).
- That one model is systematically closer to community orthography than another,
  _when_ the paired interval excludes zero.
- Which prompt categories a model is furthest from gold on.

**What chrF CANNOT tell us**

- Whether the Igala is grammatical, natural, or means the right thing.
- Whether a low score is a wrong answer or a legitimate variant. On open prompts
  ("write a blessing"), two native speakers can share almost no characters.
- Anything reliable at short lengths. A single combining tone mark on a
  three-letter word costs roughly half the chrF, because the mark is its own
  character unit. This is pinned in `chrf.test.ts` so nobody rediscovers it as a
  surprise. It is also why the match-rate metrics are reported alongside chrF and
  not instead of it.

## Diacritic-aware match rates

Three strictness levels, deliberately not collapsed into one:

- **Exact match** — identical after NFC, whitespace and case folding. Tone marks
  and dotted vowels must match.
- **Match ignoring tone** — identical once tone marks are removed but ẹ/ọ are
  kept. This is "the right word, different tone practice", and it is the
  dominant near-miss class in this corpus: community gold is systematically
  under-tone-marked relative to frontier models (0.770 tone-share for gold
  against 1.000 for the baselines, per `tasks/rung-a-results.json` and
  `Context.md`).
- **Match ignoring all diacritics** — folds ẹ/e together. This throws away a real
  phonemic contrast and therefore **overstates** correctness. Reported only as an
  upper bound.

## The inter-gold ceiling (read this before reading any score)

Most frozen prompts carry several gold answers written independently by different
speakers. Those speakers _disagree with each other_. The ceiling is what happens
when you hold out one gold answer, score it against the rest exactly as a model
is scored, and average over all the golds.

On the current corpus the overall ceiling is chrF ≈ 63%, and per category it
ranges from ~15% (figurative language: five speakers, five different proverbs) to
~90% (register: near-unanimous). **A model scoring 25% chrF where the ceiling is
63% is at 40% of achievable, not 25% of perfect.** A model scoring above the
ceiling is not superhuman; it is closer to the centroid of the reference set than
a typical individual speaker, which on short lexical prompts is easy and
meaningless.

The ceiling is a slight _under_-estimate by construction: the held-out human is
scored against k−1 references while a model gets k. We prefer a ceiling nobody
can accuse us of inflating.

Prompts with fewer than two golds have **no** ceiling and are excluded from it.
The report says how many.

## Consent

`ColdAuthorAnswer.consentBenchmark` is a per-answer permission an annotator sets
when authoring gold: _you may use my answer to benchmark models_. It is separate
from `consentTraining`, which is what `sft-source.ts` and `gold-retrieval.ts`
honour. This harness is a benchmark, so it is the consumer that flag was written
for — and until this module existed, **nothing in the codebase read it**.

`collect.ts` enforces it in the query, so no code path here can reach a
non-consented answer, and it applies to _both_ uses of gold: as a scoring
reference and as training text for the Igala language profile. The profile is a
component of the benchmark, so a speaker who withheld benchmark consent should
not be inside it either.

Excluded answers are counted and reported
(`corpus.goldExcludedNoBenchmarkConsent`, shown in the CLI and in the page's stat
strip) rather than silently dropped. As of 2026-08-09 that is 8 answers, all on
non-holdout prompts — so no scoring reference changes today, and the guard exists
because a frozen prompt could gain a non-consented answer at any time while
annotators are working.

## The language-identity gate

Character n-gram Naive Bayes over orders 1–3 with word-boundary padding
(Cavnar & Trenkle 1994; Dunning 1994), plus bounded orthographic-signature
adjustments.

**Where each profile comes from — this determines what a verdict is worth:**

| Profile | Source                                             | Trust                                     |
| ------- | -------------------------------------------------- | ----------------------------------------- |
| Igala   | 937 community gold answers                         | Real data                                 |
| English | Frozen prompt texts + English glosses              | Real data                                 |
| Yoruba  | ~120-word hardcoded seed lexicon + the ṣ signature | Weak proxy                                |
| Igbo    | ~110-word hardcoded seed lexicon + ị/ụ/ṅ           | Weak proxy                                |
| Pidgin  | ~70 hardcoded markers                              | Weakest; overlaps English almost entirely |

**Measured reliability.** 5-fold cross-validation, held-out text never seen by
the profile that classifies it: **81.4% on Igala vs English (n=1318)**, and
**81.9% on the binary "is this Igala?" question (n=1318)**. Per class: Igala
79.5% of 937, English 86.1% of 381. There is **no validation data at all** for
Yoruba, Igbo or Pidgin, so those verdicts are flags for a human to look at and
never findings. English and Pidgin are not separable by this method; use
`isEnglishLike`, which treats them as one class.

Against human labels: the corpus contains only **7** outputs tagged `not_igala`
or `wrong_language`. The gate caught 7 of 7 — which sounds perfect and means
nothing at n=7. Roughly 97 tagged outputs would be needed for a ±10-point
interval.

**Empty outputs are not Igala.** A candidate in the registry returns empty
strings on some frozen prompts. Before the `noEvidence` guard, the softmax
tie-break on a zero-evidence input reported them as Igala, and that candidate's
apparent Igala share was 84.6%; with the guard it is 24.0%. An output with no
letters is neither Igala nor English, and is counted as neither.

**Only half of each orthographic-signature claim is measured.** "This character
is near-absent from Igala gold" is counted against our own corpus, so a hit is
solid evidence of _not Igala_. "This character belongs to Yoruba / Igbo" is
background knowledge — we hold no Yoruba or Igbo corpus and no speaker of either
has checked it. So a hit is trustworthy as _not Igala_ and merely suggestive as
_therefore Yoruba_. Same asymmetry as the profiles, and the reason a hit is a
bounded nudge rather than an override.

**Orthographic signatures**, measured against the 937 gold answers rather than
assumed: ṣ appears 0/937 (Yoruba), ị 0/937 and ṅ 0/937 and ụ 1/937 (Igbo), and ñ
226/937 (Igala's velar nasal, the one _positive_ signature we have). They are
applied as a bounded log-odds nudge, never an override, precisely because ụ
turned up once.

**A note on smoothing.** Profiles are trained on wildly unequal corpora (937 Igala
answers against a 120-word Yoruba seed list). With per-profile add-alpha
smoothing, the tiny profile gets a small denominator and wins comparisons it has
no right to win: measured on production data, that configuration classified only
488/937 Igala gold answers as Igala even with the Igala profile trained on those
very answers. `logProb` therefore uses a **shared vocabulary** across all
profiles, which makes a data-poor profile produce weak, diffuse evidence. That
change took self-classification from 488/937 to 847/937 and cross-validated
accuracy from 49.5% to 81.4%.

## Intervals and "not distinguishable"

- Aggregates use a percentile bootstrap over items (Efron 1979; Koehn 2004 for
  MT). Fewer than 5 items and we refuse to produce an interval at all, flagging
  `underpowered` instead of printing a tight-looking number.
- Head-to-head comparisons use a **paired** bootstrap: resample prompts, not
  scores, and recompute both systems on the same resample. Prompt difficulty
  dominates the variance here, so pairing is far more powerful than comparing two
  independent intervals.
- Proportions use Wilson intervals, not the normal approximation, because at n=5
  the normal interval leaves [0, 1] and is nonsense.
- Whenever a delta's interval contains zero, the report prints **"not
  distinguishable"**. That is the finding. Do not replace it with a rank.
- The candidate table is **sorted** by chrF for readability, and a sorted table
  reads as a ranking whether or not the intervals support one. So every row
  carries its own `vsLeader` verdict against the top row — `top row`, `tied at
this n`, `separated`, or `too few shared prompts` — rather than leaving that
  answer
  in a head-to-head section further down the page that a reader may never reach.
  Today the tuned SFT model reads **"tied at this n"** against the RAG leader.

## The autorater and what its agreement number is worth

The autorater is a rule, not a model: both sides below the inadequacy threshold →
"both inadequate"; a gap inside the tie margin → tie; otherwise the higher score
wins. Both constants are fixed **a priori** from the inter-gold ceiling (the 10th
percentile of the human-vs-human chrF distribution, and 5 chrF points), never
tuned against the labels being predicted.

On the current corpus it agrees with the human label on **90.5% of 781
comparisons**. That number is close to worthless on its own, and the report says
so in the same breath, because:

- always guessing "both inadequate" scores **99.2%** on this label set;
- Cohen's kappa on the inadequate/not contrast is **−0.014**, i.e. the autorater
  is reproducing the base rate and demonstrating no judgment;
- only **5** comparisons name a winner, and the autorater matched **0** of them
  — but only **2** of those 5 sit on a prompt that has community gold, so on
  three of them the autorater was guessing with no reference at all. The report
  breaks this out as `decidedScorable` rather than letting 0/5 read as a clean
  failure. Around **97** decided comparisons would be needed for a ±10-point
  accuracy interval.
- none of the 5 decided comparisons involve the tuned model. Every one is
  GPT-4.1 against GPT-4.1 mini.

The honest summary is: _the autorater's ability to rank two models is currently
untested, and the one direct probe we have (5 human-decided comparisons) went
against it._ That is why the eval page shows the ranking table and the autorater
validation as separate blocks, and why the ranking table is presented as
"distance from community gold", not as "quality".

## Running it

```bash
# printed table
npx tsx --env-file=.env.local scripts/run-eval.ts

# machine-readable
npx tsx --env-file=.env.local scripts/run-eval.ts --json

# durable snapshot at tasks/eval-auto-v1.json
npx tsx --env-file=.env.local scripts/run-eval.ts --write
```

Or `/admin/arena/eval` in the app, which calls the same `collectEvalBundle()`
through `GET /api/arena/eval`.

## What would make this better

1. **More decided comparisons.** The single highest-value thing. Everything about
   ranking is blocked on annotators picking winners rather than rejecting both.
2. **More multi-annotator gold**, especially on the 6 frozen prompts that
   currently have a single gold answer and therefore no ceiling.
3. **Real Yoruba and Igbo corpora** to replace the seed lexicons, which would
   turn the substrate-leakage detector from triage into evidence.
4. **More failure tags.** 15 tagged outputs out of 781 comparisons is not enough
   to validate anything.
