# Annotation pivot decision: pairwise + corrections on the top arms, with a cold-gold spine

Decision record, 2026-08-20. Every number below was recomputed today from the live
production database (Supabase `smytgqkgomsfyurskpcl`, schema `wikitongues`) or from a
fresh run of `web/scripts/leak-audit.ts` against it. Where a number differs from an
earlier document, this one is current.

---

## The decision

**Pivot, hybrid, staged.** The majority of annotator time moves to blind pairwise +
corrections over the strongest model arms, because the July premise ("model output is
rejectable noise, only source-free authoring produces signal") no longer describes the
top of the table - but the premise's replacement ("top output is now correctable") has
itself never been tested by a native speaker on this platform, so the pivot ships with a
measured kill-switch, not as a leap of faith. A cold-gold lane is preserved permanently
for (a) prompts with zero gold, (b) all long-form prompts, and (c) benchmark integrity -
the frozen bank's references and any held-out expansion stay cold-authored only. Edited
text keeps its provenance everywhere: the schema already guarantees it, the export layer
currently does not, and closing that export gap is a hard precondition of the pivot.

---

## Evidence

### 1. Why cold gold was chosen (and why that reasoning still stands)

Toral 2019 ("Post-editese: an Exacerbated Translationese", MT Summit XVII): post-edited
MT output is measurably simpler, more normalized, and shows more source-language
interference than from-scratch translation, **even when quality metrics call them
equivalent**. Castilho & Resende (EAMT 2022) replicate the effect across domains. The
July episode design followed this directly: the annotator's own answer is authored
source-free and locked **before** any model output is revealed
(`ColdAuthorAnswer.provenance = "speaker_authored_sourcefree"`), because an edit
inherits the distribution of the text it edits. Nothing in this decision overturns
Toral. What changes is the claim about what edits are **for**: corrections are DPO fuel
and diagnostic evidence, not a substitute for cold gold as the anti-translationese SFT
core or as benchmark reference material.

### 2. What the pairwise arm produced under the old arms (live counts, today)

| Outcome         | n     | share      |
| --------------- | ----- | ---------- |
| both_inadequate | 1,040 | **99.33%** |
| a               | 3     |            |
| b               | 3     |            |
| tie             | 1     |            |
| total           | 1,047 |            |

Zero preference signal, zero DPO rows, rubric nearly never fires, and `OutputEdit` has
**2 rows total** - the edit step structurally requires a winner, and there almost never
was one. The decisive fact for this decision: a join of all 1,047 comparisons against
their outputs' candidates shows **zero comparisons involve any `gemini-3-1-pro*` or
`claude-opus-5*` arm**. The 99.3% wall is a verdict on GPT-4.1-class baselines and the
tuned mini (strLF 8-16), not on the current leaders. The wall is real; it was measured
on the wrong models.

### 3. What changed (leak-audit rerun today, strLF = stripped chrF on the 27 leak-free frozen prompts)

| Arm                          | strLF    | 95% CI      |
| ---------------------------- | -------- | ----------- |
| Gemini 3.1 Pro + RAG v3      | **39.2** | [29.3-49.8] |
| Gemini 3.1 Pro (bare)        | **37.2** | [27.1-48.3] |
| Gemini 3.1 Pro + RAG v2      | 33.4     | [23.7-44.3] |
| Claude Opus 5 + RAG (v1)     | **32.9** | [25.3-41.9] |
| Gemini 3.1 Pro + RAG v1      | 32.2     | [25.8-39.8] |
| ...                          |          |             |
| GPT-4.1 + RAG (July's best)  | 22.9     | [18.4-27.7] |
| GPT-4.1 mini SFT (cold-gold) | 15.8     | [11.3-20.9] |
| GPT-4.1 plain                | 9.2      | [6.8-12.5]  |

Honest inter-speaker ceiling: **~46** (one answer per speaker; 39.7 fully deduplicated).
The leaders now sit at **72-85% of the ceiling** where July's arms sat at 20-50%. That
is exactly the zone where "both inadequate" should give way to winners, ties, and
fixable errors - consistent with Agnes's informal "the current best models look good".
Caveats that must travel with this: chrF measures resemblance to this community's
writing, not quality; the frozen 43 is 88% single-word lookup; all top-arm CIs overlap;
and one native speaker's informal read is not a measurement. Hence the kill-switch.

Family quirk that changes the arm selection: retrieval versions are **not** monotonic
per family. Gemini's best is v3 (39.2 > bare 37.2 > v2 33.4 > v1 32.2); Claude's best is
**v1** (32.9 > v2 24.5 > v3 21.6 > bare 10.8). Pick each family's best arm, not one
prompt version across families.

### 4. The constraint (annotator hours)

- **233 of 465 prompts (50.1%) have zero gold today** (was 288/465 = 62% at the 08-09
  census - real progress, still half the bank). All 233 sit in `train`.
- Worst buckets: authenticity **100/101** zero-gold (the long-form wave 2 lives here),
  idioms 37/74, lexicon 26/54, cultural 22/57, dialect 19/19.
- Gold total 1,265 (426 = 33.7% salvage provenance). Long-form is nearly absent
  (~1 multi-sentence answer in the 08-09 audit of 937).
- Budget is ~105 annotator-hours at ~6 min/episode. Cold authoring is the slow step;
  a correction of a near-good output is minutes cheaper and yields three artifacts at
  once: a preference (DPO), a corrected text (gold-adjacent SFT row), and failure tags
  (grammar evidence). The capture already shipped (Aug 7-12): 8 failure-tag keys on
  both sides of both_inadequate and on the losing side of decided picks, required
  English gloss, dialect field, `OutputEdit.rationale`, two-box design.

### 5. Provenance: what is already safe, and the one gap

Safe by construction today:

- `OutputEdit` and `ColdAuthorAnswer` are **separate tables**; the submit route writes
  edits only to `OutputEdit` (`provenance = "model_correction"`) and fresh rewrites only
  to `ColdAuthorAnswer` (`"corrected_from_inadequate"` on the salvage path).
- Benchmark references are read **only** from `ColdAuthorAnswer` with
  `consentBenchmark: true` in the query (`src/lib/eval/collect.ts`,
  `scripts/leak-audit.ts`). An `OutputEdit` cannot reach the frozen benchmark's gold
  through any existing code path.
- DPO export (`buildDpoExamples`) drops held-out prompts.

**The gap:** `SftSourceRow` (`src/lib/arena/training-export.ts`) has no provenance
field. `coldAnswersToSftRows` and `editsToSftRows` emit **indistinguishable rows**, and
the sourcefree-vs-salvage distinction inside `ColdAuthorAnswer` is dropped too. With 2
edits in the DB this is moot today; under the pivot it becomes exactly the forbidden
conflation. This must be closed before the first export that includes edits.

---

## Risks and mitigations

| Risk                                                                                                                                                  | Mitigation                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Post-editese contaminates the SFT corpus** (Toral: edits inherit the machine's distribution even when they read fine)                               | Add `provenance: "cold_sourcefree" \| "cold_salvage" \| "edit"` to `SftSourceRow`, carried from both loaders. Default SFT export = cold only; edits enter only behind an explicit flag and capped (recommend <= 30% of rows in any set that includes them). Cold lane keeps minting the uncontaminated core.                                                               |
| **Edited text enters the frozen benchmark's gold**                                                                                                    | Already structurally impossible (benchmark reads `ColdAuthorAnswer` only). Lock it: extend the `collect.test.ts` recorder pattern with an assertion that no eval collector ever queries `OutputEdit`, so the invariant fails loudly instead of silently if a future reader appears. Held-out expansion stays community cold-authored, never edited, never Igala-Wikipedia. |
| **The pivot premise is wrong** - the top arms are still "both inadequate" to native speakers ("looks good" is one informal read; chrF is not quality) | Staged rollout with a kill-switch: after the first ~100 episodes on strong-pair comparisons, compute the decided+tie rate from the DB. If both_inadequate is still > 90% on strong pairs, the premise fails - revert queue weighting to cold-primary and record the negative result (it is publishable either way).                                                        |
| **Long-form post-editese** - the corpus's biggest gap is paragraphs, and that is where edits drift most toward the machine                            | Long-form prompts (the authenticity wave, 100/101 zero-gold) keep **mandatory cold-first** even after they gain model outputs. Corrections there are collected as diagnostics, not as gold-adjacent SFT rows.                                                                                                                                                              |
| **Salvage answers are already post-exposure** (426 rows authored after seeing rejected outputs)                                                       | Already provenance-tagged in the DB; the `SftSourceRow` fix (above) makes them separately weightable in exports. No retroactive change needed.                                                                                                                                                                                                                             |
| **Budget blowout: `gemini-3.1-pro-preview` is not in `pricing.ts`** and bills at the $1/$3 default, documented as a floor                             | Hard cap enforced operationally, not by estimate: generate in slices, recompute measured spend from stored `tokenCountIn/Out` after each slice, continue only while measured + worst-case(next slice) <= $15 (rule below).                                                                                                                                                 |
| **Consent**                                                                                                                                           | Unchanged: the per-episode consent block covers edits; `editsToSftRows` already honours `consentTraining`; benchmark never reads edits.                                                                                                                                                                                                                                    |

---

## Concrete rollout

### Arms that feed the pairwise queue (per-family leaders from today's leak audit)

1. `gemini-3-1-pro-rag-v3` - table leader, 39.2.
2. `gemini-3-1-pro` (bare) - 37.2. Kept deliberately: the v3-vs-bare pair is the direct
   human test of whether the deduced-grammar METHOD prompt changes native preference -
   the platform's most publishable open question, currently answered only by chrF.
3. `claude-opus-5-rag` (v1) - 32.9, Claude's best arm and the cross-family contrast.
   Not `claude-opus-5-rag-v3` (21.6) - v3 helps Gemini and hurts Claude.

Pairing pool = these three arms for the checkpoint phase (3 pairs per prompt, all
strong-strong). Add the tuned SFT model to the pool only after the checkpoint passes,
to keep the premise test clean. Implement pool membership as a DB flag on
`CandidateModel` (e.g. additive `inPairingPool`), never a hardcoded list - and filter
pairing-eligible outputs in `/api/annotations/next` + `/summary` through the shared
`computeQueueState` input so the two routes cannot drift. Without the filter,
`assignedPair` would dilute strong pairs across C(n,2) combinations that include the
old weak outputs.

**Anthropic key state:** all four `claude-opus-5*` rows already hold 43/43 frozen
outputs (the 404 was fixed 2026-08-13, commit 366a3cd). The scratchpad env file this
plan was told to source the key from
(`/private/tmp/claude-501/.../scratchpad/anthropic.env`) **does not exist at decision
time** - the scratchpad directory is empty. `web/.env.local` carries an
`ANTHROPIC_API_KEY` entry; whether it is currently live must be established by
`frontier-fill`'s built-in 1-token probe, which refuses to spend on a dead provider and
skips only that family. If the probe fails, source a fresh key before tranche 1 or run
the two Gemini arms alone (1 pair per prompt) until it lands.

### Generation plan and budget (hard cap $15)

Measured per-prompt token means (frozen-43 runs, from `ModelOutput`):

| Arm                   | in    | out   | $/prompt at `pricing.ts` rates    |
| --------------------- | ----- | ----- | --------------------------------- |
| gemini-3-1-pro-rag-v3 | 1,631 | 1,099 | $0.0049 (default $1/$3 - a floor) |
| gemini-3-1-pro        | 182   | 1,155 | $0.0036 (default $1/$3 - a floor) |
| claude-opus-5-rag     | 2,631 | 168   | $0.0174 ($5/$25)                  |
| all three             |       |       | **$0.0259 / prompt**              |

- **Tranche 1: the 233 zero-gold train prompts x 3 arms ~= $6.04** at `pricing.ts`
  rates. Zero-gold first because every episode there mints first gold (cold) AND a
  strong-pair preference AND a correction - the maximum-yield episode.
- **Tranche 2: the remaining 188 train prompts x 3 arms ~= $4.87**, cumulative
  **~$10.91 for all 421 train prompts** - the target, if measured spend tracks the
  estimates.
- Stress case: if Gemini's true price is ~$2/$12 and Claude's outputs run long on
  long-form prompts, tranche 1 alone lands ~$12-13. Therefore the cap is enforced by
  rule, not estimate: extend `frontier-fill` with a train-prompt mode (it currently
  targets `isHoldout: true` only - keep the own-gold retrieval refusal so no model
  parrots the prompt's existing gold back at its own author), set `maxTokens` 1024 for
  train generation (3-10-sentence answers fit; bounds Claude's worst case at
  $0.039/prompt), generate in slices of ~60 prompts, and after each slice recompute
  measured spend (`estimateGenerationCostUsd` over stored token counts, logged to
  `CostEntry` - the ledger that currently has zero rows). **Continue only while
  measured-so-far + worst-case(next slice, ~$4.20) <= $15.** Worst case the run halts
  between 233 and 421 prompts; it can never cross $15.

### Queue weighting (what annotator time becomes)

- **Strong-pair lane (target ~60-70% of episodes):** train prompts, pairs drawn only
  from the 3-arm pool. On prompts that already have >= 2 gold answers, cold-first
  becomes **optional** (skip straight to the comparison) - the corpus already covers
  them, and the reclaimed minutes go to the edit step. Every decided winner gets the
  rubric + an inline `OutputEdit`; every loser and every both_inadequate side gets
  failure tags, as today.
- **Cold lane (target ~30-40%, mandatory, never below):** (a) zero-gold prompts keep
  gold-first mandatory - served first, since tranche-1 generation targets them, one
  episode there feeds both lanes; (b) **all long-form prompts keep gold-first mandatory
  regardless of coverage** (post-editese bites hardest exactly where the corpus gap
  is); (c) the frozen 43 and any community-authored held-out expansion stay
  cold-only forever.
- **Checkpoint (the prior, tested):** after ~100 strong-pair episodes, one SQL:
  outcome distribution on comparisons whose both sides are pool arms. Decided+tie
  > = 10% -> pivot confirmed, keep weighting, add the SFT model to the pool.
  > Both_inadequate > 90% -> premise failed, revert to cold-primary, publish the
  > negative result. Either way the platform learns something the chrF table cannot say.

### Preconditions (ship before the first pivot episode)

1. `SftSourceRow.provenance` + export filter (default cold-only; edits behind a flag,
   capped). This closes the only conflation path found.
2. Regression test: no eval collector reads `OutputEdit` (recorder pattern).
3. Pairing-pool flag + queue filter, computed from the DB per request (house rule - no
   hardcoded arm lists in UI or routes).
4. `frontier-fill` train-prompt mode with the slice-and-measure stop rule, writing
   `CostEntry` rows.

### What must NEVER happen (restated as invariants, all now enforced or gated)

- Edited text (`OutputEdit.correctedText`) entering the frozen benchmark's references -
  structurally impossible today, regression-tested after precondition 2.
- Edited text entering a training export indistinguishable from cold gold - impossible
  after precondition 1.
- A generation run exceeding $15 - impossible under the slice stop rule.
