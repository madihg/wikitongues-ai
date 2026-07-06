# Igala buckets & prompt categories — recommendation

_Prepared 2026-07-06, ahead of the Tuesday Agnes call. Reviews Lydia's Jul-6
revision, challenges three points, and states what is now implemented in the
platform. The axis set is deliberately mutable (config, version-stamped), so
none of this is a one-way door._

## TL;DR

Lydia's direction is right and a clear improvement. Adopt it, with three changes:

1. **Keep "Is it Igala?" (cross-linguistic contamination) as its own scored axis.** Do not fold it into authenticity. It is the single most measurable, most trainable, most fundable failure mode (the Yoruba/Idoma bleed Agnes keeps hitting). Burying it loses the headline number.
2. **Scope axes by prompt category** instead of showing all axes and hoping people mark most N/A. Each category declares the 3-4 axes that matter; the rest collapse. This is Erin's N/A point turned into positive design: denser data per axis, less annotator fatigue, cleaner agreement.
3. **Drop "dialect" as a scored quality axis; park it as a future code-switching benchmark.** Igala dialects are largely mutually intelligible (Unubi & Atadosa 2019), so "dialectal fidelity" is cultural perception, not correctness — a bad fit for a 0-5 quality score.

Everything else in Lydia's revision (the prompt-category / rubric-axis split, splitting diacritics from spelling, splitting pragmatics into cultural-fit vs authenticity, 0-5 + N/A) is adopted as-is.

## The core idea we're adopting from Lydia: two different lists

- **Prompt categories** = what a prompt is _for_ (what we ask the model to do).
- **Rubric axes** = what an answer is _scored on_.

They are not the same list. One greeting prompt can be scored on syntax, authenticity, and cultural fit at once. Conflating the two (the old "8 buckets that are each three things") was the real weakness. Lydia is right to separate them; we go one step further and **map each category to its in-scope axes**, so the platform only asks for the scores that make sense.

## Rubric axes (what an answer is scored on) — 8 axes, 0-5 + N/A

Scored in two passes. Scale: **0 = completely wrong … 5 = I'd say it exactly like this**, or **N/A** when the axis isn't relevant to the prompt.

**Pass 1 — the language itself**

| Axis (key)   | Annotator label      | What it asks                                                                     |
| ------------ | -------------------- | -------------------------------------------------------------------------------- |
| `syntax`     | Grammar & word order | Word order, tense, agreement right?                                              |
| `lexicon`    | Word choice          | Real, correct Igala words — nothing invented or borrowed?                        |
| `spelling`   | Spelling             | The letters themselves spelled right?                                            |
| `diacritics` | Tone marks           | Tone marks / dotted vowels present and correct? _(where Igala models fail most)_ |
| `semantics`  | Meaning              | Did the intended meaning come across, even if wording is imperfect?              |

**Pass 2 — thinking about the answer as a whole (Lydia's reflective pass)**

| Axis (key)           | Annotator label | What it asks                                                                               |
| -------------------- | --------------- | ------------------------------------------------------------------------------------------ |
| `cultural_relevance` | Cultural fit    | Content matches Igala culture/practice (not a Western-centric assumption)?                 |
| `authenticity`       | Authenticity    | Would a real speaker actually say it this way — natural register/tone, not translationese? |
| `contamination`      | Is it Igala?    | Free of bleed from Yoruba / Idoma / Igbo / English? 5 = fully Igala, 0 = another language. |

Labels are written for non-linguist community annotators (Sonja's concern): "Word choice" not "lexical item," "Tone marks" not "diacritics," "Is it Igala?" not "cross-linguistic contamination."

## Prompt categories (what a prompt tests) — 7 active + 1 experimental

Each category declares the axes that are **in-scope**; other axes default to N/A (collapsed in the UI, still available if the annotator wants them).

| Category                                                             | In-scope axes                                              |
| -------------------------------------------------------------------- | ---------------------------------------------------------- |
| Spelling & tone marks                                                | spelling, diacritics, lexicon                              |
| Grammar & sentence structure                                         | syntax, semantics, lexicon                                 |
| Vocabulary & word meaning                                            | lexicon, contamination, semantics, diacritics              |
| Register, tone & honorifics                                          | authenticity, cultural_relevance, semantics                |
| Figurative language _(idioms + metaphor + motifs, merged per Jul-6)_ | semantics, cultural_relevance, authenticity, contamination |
| Cultural knowledge & values                                          | cultural_relevance, contamination, authenticity, semantics |
| Authenticity & naturalness                                           | authenticity, cultural_relevance, contamination            |
| _Dialect & code-switching (experimental, parked)_                    | contamination, authenticity                                |

## Where we push back on Lydia, in full

- **Contamination as its own axis (disagree with the Jul-6 fold).** On Jul 6 Lydia folded cross-linguistic contamination + dialect + "blind spots" into a single "linguistic authenticity" catch-all. A catch-all for genuinely diffuse stuff is fine, but contamination is not diffuse — it's concrete, it's the demonstrated failure (Agnes's "morning" = Yoruba), and it's exactly what a DPO/filtering pipeline needs a clean label for. We keep authenticity as the catch-all _and_ contamination as a first-class axis.
- **Scope, don't spray.** "Score every axis on every prompt, most N/A" (the naive matrix) is high-fatigue and yields sparse per-axis data. Category-scoped axes fix both.
- **Dialect isn't a quality score.** Agree with Lydia's instinct; make it concrete: it becomes a separate code-switching benchmark (does the model collapse to a prestige dialect / mix dialects oddly?), resolved with Agnes.
- **Semantics defined to stay orthogonal to syntax.** "Did the meaning come across even if the form is off," so annotators can separate "grammar wrong" from "meaning lost" (otherwise the two correlate and agreement suffers).
- **Defer rater POS-tagging.** Lydia's "tag lexical items by grammatical category, first pass raters / second pass linguists" is research-grade; it will wreck throughput and agreement with 5 part-time annotators. Not in the pilot.
- **Lock the scale at 0-5 + N/A** (resolves the 0-5-vs-1-4 discrepancy between Lydia's doc and the Jun-30 recap). Already implemented.

## What actually determines data quality (spend energy here, not on more taxonomy)

The taxonomy is ~right. The thing that will make or break inter-annotator agreement is **per-axis anchors with real Igala examples** — what is a 2 vs a 4 on `syntax`, with a concrete Igala pair. Lydia owns writing these; the platform stores 0-5 + N/A regardless of how the anchors are worded, and every score is stamped with the rubric version, so we can tighten anchors mid-pilot without corrupting the dataset.

## Implementation status (in the platform now)

- Rubric axes above live in `web/src/lib/buckets.ts` (`RUBRIC_V2`, `RUBRIC_VERSION = "v3"`). Axes are config, not schema — rename/add/drop needs a one-line edit, no migration.
- Prompt categories + their in-scope axes live in the same file (`BUCKETS`, `axes[]`), surfaced to the annotation UI via `/api/annotations/next` (`applicableAxes`).
- The annotation screen shows in-scope axes prominently and collapses the rest.
- Scores are stored per-axis (`RubricAxisScore`, 0-5 or null=N/A) and stamped with the rubric version, so the mutable-for-two-weeks plan never mixes data.
