# The Editing Ground - correction interface spec

**Date:** 2026-08-26. **Owner:** Halim. **Commitment:** made on the 2026-08-25 call with Agnes and Lydia (anarlog meeting `e1309ff5-2572-4c11-9bc7-f5fcaa20b334`, "Igala Translation Model Review and Annotation Workflow"): a Google-Docs-style editing interface, "suggesting mode" (Lydia's phrase), a two-field system per change (corrected sentence + reason for change), launched within one to two days, then walked through with Agnes's team on a real example.

**Why now:** the models in the pairing pool produce near-Igala, not gibberish. The bottleneck moved from "pick the less bad one" to "show me exactly what you changed and why". Agnes's live review on the call was exactly this: "the" should be "n", the Igbo word "nwu" removed, an unnecessary "ki" deleted - three surgical span-level fixes, each with a reason. Nothing in the current UI captures that structure: edits save as one opaque before/after string and the reason field has never been used once (see numbers).

Scope: implementable in one day. Every decision below is justified against the actual code and the live DB, with the guard inventory that must NOT be weakened at the end.

---

## 0. Evidence (live DB, measured 2026-08-26)

All non-demo rows, `wikitongues` schema, project `smytgqkgomsfyurskpcl`:

| fact                                                    | value                                             |
| ------------------------------------------------------- | ------------------------------------------------- |
| Pairwise comparisons, all time                          | 1,170 (21 a, 30 b, 10 tie, 1,109 both_inadequate) |
| Confidence distribution, all time                       | 1,166 at 4, 3 at 1, 1 null                        |
| Comparisons since the pivot (2026-08-20)                | 127 - every single one confidence 4               |
| OutputEdit rows, all time                               | 11                                                |
| OutputEdit rows with a rationale                        | **0**                                             |
| Pool arms (`inPairingPool`, unarchived)                 | 3                                                 |
| Distinct pool-arm outputs carrying a post-pivot verdict | 110                                               |
| ...of which still have no edit from anyone              | **101** (the standalone lane's backlog)           |

(The task brief said "191 comparisons stuck at 4"; the live count at a different window is 127/127 and 1,166/1,170 - the window does not matter, the conclusion is identical: the widget has produced zero information, ever.)

The two rows that anchor the worked example (section 8) are real:

- `ig_bank_auth_012` ("say 'thank God' on hearing good news"): model wrote `Àgbá Ọ́jọ́`, Charity Ogali corrected to `Agba ọjọ` (2026-08-25). Rationale: null.
- `ig_bank_auth_001` (short natural blessing): model wrote `Ọjọ ki chẹnyọ ñwu wẹ`, corrected to `Ọjọ ki d'ẹnyọ ñwu wẹ` - a single-token fix. Rationale: null.

Eleven corrections, zero reasons. The editing ground exists to turn that null column into the highest-density signal we collect.

---

## 1. Decision: storage - extend `OutputEdit`, do not add a table

**Add one nullable jsonb column to `OutputEdit`. Keep `correctedText` as the applied result and the only training-facing text. Segments are enrichment.**

```prisma
model OutputEdit {
  // ...existing fields unchanged...
  // Span-level suggestions (the editing ground). Versioned envelope:
  //   { v: 1, segments: [{ start, end, original, replacement, reason, reasonTags }] }
  // Offsets are UTF-16 code units into NFC(originalText). correctedText remains
  // the single source of truth for training; segments are ENRICHMENT - the
  // server validates that applying them to originalText reproduces correctedText
  // exactly and DROPS them (never the edit) if they do not. Reason tag keys are
  // CONFIG (EDIT_REASON_TAGS in src/lib/failure-tags.ts), not schema.
  segments Json?
}
```

Migration (additive, nullable - matches the codebase's "prod may lag the client" discipline; apply via Supabase MCP `apply_migration` and mirror in `prisma/migrations/20260826120000_output_edit_segments/`):

```sql
ALTER TABLE wikitongues."OutputEdit" ADD COLUMN IF NOT EXISTS segments jsonb;
```

**Why extend rather than a new table:**

1. Every provenance guard in the platform keys off `OutputEdit` already: `exportEdits` (src/lib/exports.ts), `editsToSftRows` -> provenance `"edit"` (src/lib/arena/sft-source.ts), `buildSftExamples` with `includeEdits` defaulting FALSE and `maxEditShare` capped at 0.3 (src/lib/arena/training-export.ts), the benchmark collector reading ColdAuthorAnswer only and never OutputEdit (src/lib/eval/collect.ts), admin review, history, time-spent, public stats. A new table would need every one of those re-audited and partially re-implemented in a day. Extending means they all keep working untouched - the risk budget goes to the UI where the actual novelty is.
2. Reason vocabulary stays config-not-schema, the same move failure tags made (schema comment on `PairwiseComparison.failureTagsA` says exactly why). Tags can change without a migration.
3. Volume is trivial (11 rows today, hundreds later). There is no query-performance case for a child table; per-tag aggregation reads the jsonb in JS (annotations-query pattern) or with `jsonb_array_elements` when a researcher wants SQL.

**Segment shape** (TypeScript, in the new `src/lib/edit-segments.ts`):

```ts
export interface EditSegment {
  start: number; // inclusive, UTF-16 code units into NFC(originalText)
  end: number; // exclusive; start === end means pure insertion
  original: string; // exact NFC(originalText).slice(start, end) - validation anchor
  replacement: string; // inserted text, NFC ("" means pure deletion)
  reason?: string; // free text, English or Igala
  reasonTags?: string[]; // subset of EDIT_REASON_TAGS keys
}
```

**Normalization contract:** from now on `OutputEdit.originalText` stores `NFC(modelOutput.outputText)` - it is documented as "model output as shown", and NFC IS what the UI shows (the answer-variants module documents why: production text arrives in both Unicode shapes and NFD/NFC pairs render identically but compare unequal). `ModelOutput.outputText` keeps the raw provider bytes, so provider provenance is untouched. With that, `applySegments(originalText, segments) === correctedText` holds on the stored row itself, no re-normalization needed by any consumer.

**Provenance values:** in-episode winner/tie corrections keep `"model_correction"` (unchanged). Corrections of a both_inadequate output (new, both in-episode and in the lane) write `"salvage_both_inadequate"` - the value the schema comment on `OutputEdit.provenance` already reserved. `editsToSftRows` maps every OutputEdit to SFT provenance `"edit"` regardless, so nothing downstream changes; the finer value is there for future weighting.

---

## 2. Decision: where in the flow - both places, one component

One new client component, `src/components/suggesting-editor.tsx` (`SuggestingEditor`), mounted in two places.

### 2a. Inside the existing episode (replaces the three plain edit textareas)

In `src/components/annotation-interface.tsx`, score step:

- **winner = a|b:** the "Correct this response / Fix a small error in the winner" textarea + static diff becomes `SuggestingEditor` seeded with the winner's text. Semantics unchanged (edit only sent when text differs; the hasColdGold collapse behavior stays).
- **winner = tie:** the tie-side textarea becomes `SuggestingEditor` on the chosen side. Unchanged semantics.
- **winner = both_inadequate:** the salvage box (fresh answer -> `ColdAuthorAnswer`, provenance `corrected_from_inadequate`) STAYS PRIMARY - source-free-ish authorship is the anti-translationese core and must not be demoted. Below it, a collapsed disclosure: "Or mark up one of the AI answers instead" -> pick A or B (same toggle pattern as tieTarget) -> `SuggestingEditor` on that side. Submitting sends it as `edit: { modelOutputId, correctedText, segments }`; the submit route already resolves an explicit `modelOutputId` against either side (the tie path does this today), so the only server change on this path is: when `winner === "both_inadequate"`, write provenance `"salvage_both_inadequate"` instead of `"model_correction"`. Doing both (fresh answer AND a markup) is allowed - they are different artifacts.

This satisfies "follow the verdict: correct the winner, or either on both_inadequate".

### 2b. The standalone lane: Corrections

A new annotator surface for the 101-output backlog and everything verdicts produce from now on.

- **Page:** `/annotator/corrections` (new dir under `src/app/(app)/annotator/corrections/`), nav entry "Corrections" added in `navForRole` (src/lib/personas.ts) for both annotator and researcher lists, between "Annotate" and "My Work".
- **What it serves (v1 rule):** one OUTPUT at a time. An output is servable to annotator U iff ALL of:
  1. it belongs to a pool arm (`inPairingPool`, unarchived) - editing dead weak-arm text is wasted budget, same reasoning as the pivot;
  2. its prompt is not `isHoldout` - an edit there could never be used anywhere (holdout blocks training, and edits never enter the benchmark), so serving it manufactures zero-value work;
  3. U has a non-demo `PairwiseComparison` involving it in a qualifying role: the output WON (winner a/b and it is that side), or the verdict was `tie`, or `both_inadequate` (either side). Pure losers of an a/b verdict are not served - the winner from the same comparison is the better target, and the loser's diagnosis already lives in its failure tags;
  4. no non-demo `OutputEdit` exists for it yet, from anyone - v1 optimizes breadth over depth across the 101; multi-annotator verification passes are a later phase;
  5. U has not edit-skipped its prompt.

  **Own-verdicts-only is deliberate** (v1): the annotator already judged this output and already wrote an English explanation for the comparison - the lane shows them that context and asks them to apply it. No cold re-reading of unfamiliar pairs, and (see skip mechanics below) it makes the skip storage free.

- **Task screen (mobile-first):** prompt text; the output; a context strip quoting U's own verdict ("You judged this: Both inadequate" + their explanation + the failure tags they gave THIS side - all fetched from the comparison row); then `SuggestingEditor`; then the consent checkboxes (same copy as the episode, shown once text differs); Save + Skip. No model names anywhere - the lane inherits pairwise blindness.
- **Serving order (deterministic):** U's comparisons by `createdAt` asc; within a comparison, winner side first, else A before B. Oldest judgments get corrected first, and refreshing never shuffles.
- **Skip:** POST `/api/edits/skip` writes a `PromptFlag { annotatorId, reason: "edit_skip" }`. Zero migration. Safe side effect check: `/api/annotations/next` excludes ANY-flagged prompts from the pairwise queue, but every lane prompt is by construction already in U's `donePromptIds` (own-verdict rule), so the flag changes nothing there. Documented tradeoff: these rows appear among prompt flags in admin with the literal reason `edit_skip`; acceptable for v1, and the reason string keeps them filterable. If v2 opens the lane to others' verdicts, that is the moment a real `EditSkip` table is required - flag-based skip would then eat prompts out of the pairwise queue.

### 2c. `computeQueueState` changes (src/lib/pairing.ts) - exact

Corrections stay a separate surface (never interleaved into `/api/annotations/next` - a mid-flow context switch between "compare two answers" and "fix one answer" is exactly the cognitive whiplash the lane ordering was built to avoid), but the STATE derivation lives in the same pure function so `/api/edits/next`, `/api/annotator/summary`, and the all-caught-up screen can never drift - the same discipline that already binds `/next` and `/summary`.

```ts
export interface CorrectionInputs {
  /** promptId -> count of still-servable correction targets for THIS annotator
   *  (servability rules 1-4 above, resolved by the loader). */
  editableByPromptId: ReadonlyMap<string, number>;
  /** Prompts this annotator edit-skipped (PromptFlag reason "edit_skip"). */
  editSkippedPromptIds: ReadonlySet<string>;
}

export interface QueueState {
  total: number;
  completed: number;
  remaining: QueuePrompt[];
  /** NEW - prompts with servable correction targets for this annotator, in
   *  input (verdict-age) order. Empty when CorrectionInputs is not supplied,
   *  so existing callers are untouched. */
  corrections: QueuePrompt[];
}

export function computeQueueState(
  prompts: QueuePrompt[],
  donePromptIds: ReadonlySet<string>,
  skippedPromptIds: ReadonlySet<string>,
  correctionInputs?: CorrectionInputs,
): QueueState;
```

Rule: `corrections` = prompts where `editableByPromptId.get(promptId)! > 0` AND `!isHoldout` AND `!editSkippedPromptIds.has(promptId)`. (Own-verdict servability implies `donePromptIds.has(promptId)`, so `corrections` and `remaining` are disjoint by construction - asserted in tests.) Input order preserved; the loader supplies verdict-age order.

New loader `loadCorrectionInputs(annotatorId)` in `src/lib/queue-input.ts` (beside `loadQueueInputs`, same "THE ONE loader" contract): queries U's non-demo comparisons joined to outputs' `candidateModel.inPairingPool/archived` + prompt `isHoldout`, all non-demo `OutputEdit.modelOutputId`s for those outputs, and U's `edit_skip` flags; returns `CorrectionInputs` plus a `servableByPromptId: Map<string, ServableTarget[]>` detail map (`{ modelOutputId, outputTextNfc, comparisonId, role: "winner"|"tie"|"both_inadequate", explanation, failureTagsForThisSide }`) that `/api/edits/next` walks. `/api/annotator/summary` calls the same loader and shows a "Corrections waiting" card (count from `corrections.length` - live, never hardcoded); the annotate screen's "All caught up" state links to `/annotator/corrections` when that count is > 0.

---

## 3. Decision: diff UX on a phone - textarea + live suggestion preview

**Primary interaction: edit in a plain textarea; below it, a live "suggesting mode" preview plus one reason card per change. Not tap-a-word. Not contenteditable.**

Why this wins, against this codebase:

1. **It is the shipped, proven pattern.** The score step already renders textarea + `wordDiff` preview, and all 11 real corrections (Charity, Agnes, Abdulraheem) came through textareas this month. The team's typing behavior does not change at all; the upgrade is that their changes become visible suggestions with reason slots. Lowest possible retraining cost for Agnes's onboarding.
2. **ToneKeyboard requires it.** `ToneKeyboard` (src/components/tone-keyboard.tsx) drives a `targetRef` textarea. A contenteditable surface orphans the one input aid built specifically for Igala diacritics.
3. **contenteditable + Igala + mobile IMEs is the highest-risk surface available.** Combining marks, Gboard composition events, Android Chrome caret bugs - a one-day build cannot absorb that. Annotators work on phones (house rule); the textarea is the only editing primitive that is boring everywhere.
4. **Tap-a-word forces the wrong granularity.** Real corrections in the DB span phrases (`Àgbá Ọ́jọ́` -> `Agba ọjọ` is a joint two-word respell) and whole paragraphs (Agnes's `ig_bank_reg_033` rewrite). Free typing keeps arbitrary granularity; the diff recovers the spans afterwards.
5. **Draft persistence is free.** The `EpisodeDraft` sessionStorage autosave serializes plain strings; textarea state slots in unchanged. The lane gets the same draft pattern (`wt-edit-<modelOutputId>`).

**Grapheme safety rules** (Igala diacritics must never split mid-grapheme):

- NFC-normalize BOTH texts before diffing and before storing (`.normalize("NFC")` - precedent and rationale documented in `normaliseSpacing`, src/lib/answer-variants.ts). This kills phantom diffs where an NFD `Ọ` (O + combining dot) meets an NFC `Ọ` typed on another keyboard.
- Tokenize by whitespace runs only - the existing `tokenize` in src/lib/diff.ts (`/\s+|\S+/g`). Combining marks are non-whitespace, so they always travel with their base letter inside a token; a whitespace-boundary diff CANNOT split a grapheme. This is the actual guarantee, and it is why **no character-level diffing exists anywhere in this feature**.
- `Intl.Segmenter` is deliberately NOT used: word granularity is locale-driven and there is no Igala locale, so its boundaries are whatever the `und` rules guess - less predictable than whitespace tokens, for zero benefit given the rule above. (If sub-word diffing is ever wanted, segment by GRAPHEME clusters, never code units - out of scope now.)
- Defensive test: no segment's `original` or `replacement` begins with `\p{M}` (a dangling combining mark) - see tests.

**The suggestion rendering** (the "Google Docs suggesting" feel):

Under the textarea, a panel titled "Your suggestions" shows the full text with `same` runs plain, removed runs struck through in danger colors, inserted runs in success colors - the exact rendering the score step has today. Under the panel, **one card per changed region**:

```
  [ Àgbá Ọ́jọ́ ]  ->  [ Agba ọjọ ]
  Why? (highly encouraged)
  [Tone marks or spelling wrong] [Wrong word] [Grammar] [Not Igala] [More...]
  [ free text - English or Igala ................................. ]
```

Cards stack vertically on mobile; chips reuse the failure-tag chip component sizing (the pairwise chips are the touch-target precedent annotators already know). Long outputs: textarea autogrows; the preview wraps (no horizontal scroll - overflow container house rule).

**Segment derivation and reason survival:** segments recompute from `(NFC original, current textarea value)` on every change via the new pure `diffToSegments` (section 5). Reason state lives beside, keyed by `original-slice text + occurrence index` so reasons survive offset shifts caused by edits elsewhere in the text; a reason whose segment disappears is dropped at submit (documented, acceptable). A full rewrite collapses to ONE segment covering everything (LCS emits one merged run when nothing matches) - one card, one reason, which is exactly right for Agnes's paragraph-scale rewrites.

**The nudge, not the gate** (Lydia: "highly suggested, not forced"): the save button is never disabled by missing reasons. Label logic:

- every changed segment has a tag or text -> `Save suggestions`
- some but not all -> `Save - N of M reasons given`
- none -> `Save without reasons` (secondary/outline styling, with the helper line: "Reasons teach the AI the rule, not just the fix - even two words help, English or Igala.")

---

## 4. Decision: the confidence widget - remove it

**Remove the 1-4 confidence widget from the pairwise step entirely.** Evidence: 1,166 of 1,170 all-time comparisons at 4, and 127 of 127 since the pivot - including days AFTER the worktree change that made it start unselected and gate Continue. Required-interaction was already tried; fluent speakers are simply certain, tap 4, and move on. The widget costs one tap per episode against a 105-hour budget and has never produced a bit of information. Nothing consumes it: not method-metrics, not the eval harness, not pairing - only the CSV export column.

Mechanics:

- UI: delete the confidence block and drop `confidence === null` from the Continue gate in `annotation-interface.tsx`; remove it from `EpisodeDraft`.
- API: `/api/annotations/submit` KEEPS accepting and validating `confidence` (stale clients must not 400 - the codebase's standing rule); the client just stops sending it. Column stays; historical rows stay; `exportPairwise` keeps the `confidence_1_to_4` column (a recipient can see exactly when collection stopped - honest data history).
- **Where uncertainty goes instead - the same stroke as reason capture:** `EDIT_REASON_TAGS` includes `unsure` ("Not sure - please check"). Uncertainty attached to a SPAN ("I changed this word but want Salem/Agnes to confirm") is actionable review-queue signal; a 1-4 on a whole verdict was not. This is the trade: one dead global widget out, one live per-span signal in.

Reason tag config (added to `src/lib/failure-tags.ts` so the taxonomy lives in one file):

```ts
/** Quick-pick reasons for edit segments: the failure taxonomy the team already
 *  knows from pairwise chips, plus edit-only entries. CONFIG, not schema. */
export const EDIT_REASON_TAGS: FailureTagDef[] = [
  ...FAILURE_TAGS, // same 8 keys/labels - one vocabulary across the platform
  {
    key: "unsure",
    label: "Not sure - please check",
    hint: "Flag this change for a linguist or the team to confirm.",
  },
  {
    key: "other",
    label: "Other reason",
    hint: "Use the text box to say what it is.",
  },
];
export function sanitizeEditReasonTags(raw: unknown): string[]; // mirrors sanitizeFailureTags
```

---

## 5. API shape, validation, pure core

### 5a. Pure core - `src/lib/edit-segments.ts` (new)

```ts
export function nfc(s: string): string; // s.normalize("NFC")
export function diffToSegments(
  original: string,
  corrected: string,
): EditSegment[];
//   NFC both -> wordDiff (src/lib/diff.ts) -> walk DiffSegs tracking the
//   original-offset cursor -> merge each maximal run of non-"same" segs into one
//   EditSegment { start, end, original: <removed concat>, replacement: <added concat> }.
export function applySegments(
  original: string,
  segments: EditSegment[],
): string;
//   Walk ascending; copy original[cursor..start), append replacement, cursor = end;
//   append the tail. Throws on overlap/out-of-order/out-of-bounds (callers sanitize first).
export function sanitizeSegments(
  raw: unknown,
  originalNfc: string,
  correctedNfc: string,
): EditSegment[] | null;
//   Shape-check every entry; verify ascending, non-overlapping, in-bounds,
//   original === originalNfc.slice(start, end); drop unknown reasonTags and
//   oversize reasons (cap 2000 chars); FINALLY verify
//   applySegments(originalNfc, segments) === correctedNfc.
//   Any failure -> null. Callers store the edit WITHOUT segments and log -
//   enrichment must never cost an annotator their episode (sanitizeFailureTags rule).
```

### 5b. `/api/annotations/submit` (POST, extended - no breaking changes)

`edit` gains `segments?: unknown`. Server behavior:

1. `corrected = nfc(e.correctedText.trim())`; `originalNfc = nfc(target.outputText)`; save only when `corrected !== originalNfc.trim()` (NFC on both sides also fixes today's latent false-positive where an NFD model output "differs" from identical NFC typing).
2. `segs = sanitizeSegments(e.segments, originalNfc, corrected)`; **if the client sent none or sanitize failed, derive them server-side: `segs = diffToSegments(originalNfc, corrected)`** (reasons absent, spans still recorded - stale clients and the lane's API both produce structured edits by construction).
3. Create `OutputEdit` with `originalText: originalNfc`, `correctedText: corrected`, `segments: { v: 1, segments: segs }`, provenance `"salvage_both_inadequate"` when `winner === "both_inadequate"`, else `"model_correction"` (tie and winner paths unchanged).
4. `confidence` stays accepted-optional exactly as today.

### 5c. `/api/edits/next` (GET, new)

Auth: any signed-in annotator. Calls `loadQueueInputs()` + `loadCorrectionInputs(annotatorId)` + `computeQueueState(...)`; walks `corrections`, resolves the first servable target from `servableByPromptId`.

```ts
// 200 response
{ complete: false,
  progress: { waiting: number },            // corrections lane size, live
  task: {
    prompt: { id, promptId, bucket, text, targetCulture },
    output: { id: string, text: string },   // text = NFC; NO model name (lane stays blind)
    verdict: { role: "winner" | "tie" | "both_inadequate",
               explanation: string,          // the annotator's own words, replayed
               failureTags: string[] },      // the tags they gave THIS side
  } }
// or { complete: true, progress: { waiting: 0 } }
```

### 5d. `/api/edits/submit` (POST, new)

```ts
{ modelOutputId: string, correctedText: string, segments?: unknown,
  rationale?: string, consentBenchmark?: boolean, consentTraining?: boolean }
```

Validation order: 401 no session; 400 missing fields / empty corrected; 404 output not found; **403 not servable** (re-derive servability rules 1-3 server-side - never trust the client's claim that a verdict exists); **409 when this annotator already has a non-demo edit on this output** ("You have already corrected this one") - a race where two annotators edit the same output both succeed (more signal, and the queue stops serving it either way); 400 when `nfc(corrected).trim() === nfc(outputText).trim()` ("No change made - use Skip if nothing needs fixing"). Then identical to 5b steps 2-3, provenance from the verdict role (`winner`/`tie` -> `model_correction`, `both_inadequate` -> `salvage_both_inadequate`), `verificationStatus: single_annotator`, consent defaults true. Response `{ success: true }` -> client clears draft, fetches next.

### 5e. `/api/edits/skip` (POST, new)

`{ promptId }` -> 400 short/missing; 404 unknown prompt; creates `PromptFlag { reason: "edit_skip" }` (idempotent: skip if an identical flag exists); 200.

---

## 6. Tests - exactly what proves it

Vitest, colocated `.test.ts`, fixed fixtures only (pairing.test.ts convention: "never a statistical gamble"). Gates before ship: `tsc` 0, `eslint` 0, `vitest` green.

**`src/lib/edit-segments.test.ts`** (new) - the reconstruction proof:

1. **Round-trip on real corpus pairs** - for each fixture, `applySegments(nfc(o), diffToSegments(o, c)) === nfc(c)`:
   - `Àgbá Ọ́jọ́` -> `Agba ọjọ` (the worked example, diacritic-heavy)
   - `Ọjọ ki chẹnyọ ñwu wẹ` -> `Ọjọ ki d'ẹnyọ ñwu wẹ` (single-token, elision apostrophe)
   - the `ig_bank_reg_033` full-paragraph rewrite pair (collapses to one segment - assert `segments.length === 1`)
   - multi-line pair with `\n` preserved; pure insertion; pure deletion; `o === c` -> `[]`.
2. **NFD/NFC phantom-diff kill:** same visible string in NFD vs NFC -> `diffToSegments` returns `[]`.
3. **Grapheme integrity:** for every fixture segment, neither `original` nor `replacement` matches `/^\p{M}/u`, and each `start`/`end` falls on a whitespace boundary or string edge of the NFC original.
4. **`sanitizeSegments` rejects** overlapping spans, descending order, out-of-bounds, `original` not matching the slice, reconstruction mismatch -> `null`; **drops** unknown `reasonTags`, keeps free-text `reason`, and never throws on garbage (`"x"`, `[{}]`, `[null]`, deep junk).
5. **Server-derivation parity:** `sanitizeSegments(diffToSegments(o, c), nfc(o), nfc(c))` is non-null (what the server derives, the server accepts).

**`src/lib/pairing.test.ts`** (extend) - the queue proof:

6. `computeQueueState` without `CorrectionInputs` -> `corrections: []` and every existing assertion untouched (no-regression).
7. With inputs: only prompts with `editableByPromptId > 0` appear; `isHoldout` never appears even with editable count > 0; edit-skipped never appear; input order preserved; **`corrections` and `remaining` are disjoint** on a mixed catalogue.
8. **Never re-serves:** drop a prompt's editable count to 0 (simulating the edit landing) -> it leaves `corrections`; add it to `editSkippedPromptIds` -> same; both are pure re-computations, same inputs same outputs.

**`src/lib/arena/sft-source.test.ts`** (extend) - the no-benchmark-gold proof:

9. `editsToSftRows` on a row carrying `segments` and provenance `salvage_both_inadequate` still emits provenance `"edit"` and ONLY `correctedText` as the target - segments and reasons can never leak into a completion (mirrors the existing rationale/gloss exclusion).
10. `buildSftExamples` default (`includeEdits` unset) emits zero `"edit"` rows even when segment-bearing edits are supplied (locks the FALSE default against regression).
11. Grep-level invariant stated for review, verified by reading, not runtime: `src/lib/eval/collect.ts` reads `ColdAuthorAnswer` for benchmark references and never `OutputEdit` - this feature adds no import of edit tables into `src/lib/eval/`. (Keep it that way; see guard inventory.)

**`src/lib/queue-input`**: `loadCorrectionInputs` is impure (Prisma); its derivation logic (role qualification: winner/tie/both_inadequate servable, pure loser not; any-edit exclusion) is extracted as a pure `qualifyCorrectionTargets(comparisons, editedOutputIds)` helper in pairing.ts and tested there (fixture: one annotator, four comparisons covering all four winner values -> expect exactly the servable set and roles).

---

## 7. Worked-example onboarding (Agnes's team)

First open of `/annotator/corrections` (guard: `localStorage["wt-corrections-onboarded"]` absent) shows a three-card intro, then a practice round. Mobile cards, one thumb-tap each, skippable via "I've done this before".

- **Card 1 - what this is:** "You will see one AI answer you already judged. Fix it the way you would actually say it - like marking a student's homework. Your changes show up as suggestions: what you removed is struck through, what you added is highlighted. Nothing is overwritten silently."
- **Card 2 - the real example** (rendered with the live SuggestingEditor in read-only mode, using the actual DB correction, credited): prompt "Write how an Igala speaker would naturally say 'thank God' on hearing good news." AI answer `Àgbá Ọ́jọ́`; correction shown as ~~Àgbá Ọ́jọ́~~ -> `Agba ọjọ`; reason card filled: chip `Tone marks or spelling wrong` + text `[REVIEW WITH AGNES on the walkthrough call - one sentence in her words on why the marks come off, e.g. how the team writes it in practice]`. The code ships the strings as an `ONBOARDING_EXAMPLE` constant in a lib file with a comment citing the source row (`OutputEdit` on `ig_bank_auth_012`, Charity Ogali, 2026-08-25) - content-as-config, not a hardcoded count, and one edit away when Agnes rewrites the reason line. **Do not invent the linguistic rationale: the placeholder ships only after Agnes words it.**
- **Card 3 - the two fields:** "Every change has two parts: the correct Igala (you just type it), and the reason why (tap a chip or write a few words - English or Igala both fine). The reason is highly encouraged, not required - it is the part that teaches the AI the rule and not just the fix."
- **Practice round** (not saved anywhere - no API call, a local-only render): the real pair from `ig_bank_auth_001` seeds the editor with `Ọjọ ki chẹnyọ ñwu wẹ` and invites "Try fixing one word - watch it become a suggestion." Any edit lights the suggestion card; a "Start correcting" button sets the localStorage flag and loads the real queue. (Demo-session isolation is not needed because nothing submits.)

The researcher demo path (`?demo=`) hides the lane in v1 - the walkthrough happens on the onboarding cards themselves.

---

## 8. Rollout note (WhatsApp group)

Send after deploy + after Agnes has previewed the example wording. Draft:

> Hello everyone! The annotation tool has a new screen: **Corrections**. It shows one AI answer you already judged, and you fix it directly - like marking homework. Your changes appear as suggestions (crossed out and highlighted), the way Google Docs shows edits.
>
> Two parts to every fix: the correct Igala, and a short reason why. The reason can be one tap (the same chips you know from comparing) or a few words typed in English or Igala. Reasons are the part that teaches the AI the rule, so please add them when you can - but you can always save without.
>
> The first time you open it there is a one-minute example using a real correction from the team. The edit box inside Annotate now works the same way too.
>
> Link: [app URL] -> Corrections. Questions here in the group - voice notes welcome.

Follow-up call with Agnes's team within two days of launch: watch one annotator complete three corrections live, note where reasons get skipped, and bring 2-3 segment-level corrections to Lydia's WALS session with Salem (per the 2026-08-25 next steps - the segments with reasons ARE the "2-3 annotated examples" Lydia wants).

---

## 9. One-day build order

| #   | step                                                                                                         | files                                                                | gate                                         |
| --- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------- |
| 1   | Migration `output_edit_segments` (Supabase MCP `apply_migration` + prisma/migrations mirror + schema.prisma) | prisma/                                                              | column exists; `prisma generate` clean       |
| 2   | `edit-segments.ts` + full test file                                                                          | src/lib/edit-segments.{ts,test.ts}                                   | vitest green                                 |
| 3   | `EDIT_REASON_TAGS` + sanitizer                                                                               | src/lib/failure-tags.{ts,test.ts}                                    | vitest green                                 |
| 4   | `computeQueueState` corrections + `qualifyCorrectionTargets` + tests; `loadCorrectionInputs`                 | src/lib/pairing.{ts,test.ts}, src/lib/queue-input.ts                 | vitest green                                 |
| 5   | `SuggestingEditor` (textarea + preview + reason cards + ToneKeyboard)                                        | src/components/suggesting-editor.tsx                                 | renders at 390px width, no horizontal scroll |
| 6   | Wire into episode (3 spots), remove confidence widget, extend submit payload                                 | annotation-interface.tsx, api/annotations/submit                     | tsc 0; manual episode run                    |
| 7   | Lane: 3 routes + page + nav + summary card + all-caught-up link                                              | api/edits/*, (app)/annotator/corrections, personas.ts, summary route | serves, saves, 409s, skips                   |
| 8   | Onboarding cards + practice + `ONBOARDING_EXAMPLE`                                                           | corrections page                                                     | first-run flow on a phone                    |
| 9   | Full gates: `tsc` 0, `eslint` 0, `vitest` green; sft-source test additions                                   | -                                                                    | all green                                    |

If the day runs short, cut in this order: summary card + all-caught-up link (7, partial) -> practice round (8, keep the three cards). Never cut: tests, onboarding cards, the reason nudge.

---

## 10. Guard inventory - do not weaken

These hold today and must hold identically after this ships. Each is verified by an existing or new test, or by review of the named file:

1. **Edited text never enters benchmark gold.** `src/lib/eval/collect.ts` reads `ColdAuthorAnswer` (with `consentBenchmark`) for references; it never reads `OutputEdit`. This feature adds no such read. (Test 11.)
2. **Edits never silently enter SFT.** `buildSftExamples`: `includeEdits` defaults FALSE, `maxEditShare` caps at 0.3, provenance `"edit"` marks every row. Unchanged; new provenance values still map to `"edit"`. (Tests 9-10.)
3. **Held-out prompts are never trained on** (`isHoldout` guard in buildSftExamples) and now also never served for correction (lane rule 2).
4. **Segments/reasons/rationale/gloss never become completions.** Only `correctedText`/`answerText` are targets. (Test 9.)
5. **Exports flag provenance and consent** beside every community text row; `exportEdits` gains nothing mandatory (optionally add a `segments_json` column later - not day-one).
6. **Demo isolation:** every new write path sets/inherits `isDemo` correctly; the lane is hidden in demo mode v1.
7. **Consent is per-artifact and defaults true**; the lane collects the same two checkboxes when text differs.
8. **A stale client never loses an episode:** unknown reason tags dropped, malformed segments dropped (edit kept), confidence still accepted server-side.
9. **No hardcoded counts in UI:** backlog size, lane counts, progress all computed live (the 101/110/127 figures in this spec are dated evidence, not UI copy).
