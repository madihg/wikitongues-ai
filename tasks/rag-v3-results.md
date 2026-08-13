# rag-v3: the deduced grammar, enshrined in the serving path (2026-08-13)

Full findings for the rag-v3 build - IGALA_SYSTEM_V3, the serving-path wiring,
the Scope-A leak story, generation on the frozen 43, and the v2-vs-v3 scores.
Written by the build agent; scores sections are filled from the final runs at
the bottom of this file's history.

## What was built

1. **`web/src/lib/generation-prompt-v3.ts`** - `IGALA_SYSTEM_V3`: v2's METHOD
   skeleton (identity, 4-step method, ORTHOGRAPHY, NEVER WRITE, OUTPUT -
   lightly compressed, content preserved) plus two new sections:
   - **CLOSED-CLASS GRAMMAR** - 10 structured, trigger-shaped lines: word
     order (R1.1/R1.2, A), pronoun table with the preverbal/postverbal-u rule
     (R3.1/R3.2, B-to-A), TAM particles with meanings (R2.1/R2.2/R2.6, B),
     clause-final nasal negation + prohibitive frame (R7.1/R7.2, B),
     postnominal lẹ + relative closure + never-yí + kì/ku split
     (R4.1/R4.2/R10.1, B), elision with its trigger condition (R6.1, A),
     numerals/plural-animacy/du-kó concord (R5.1/R5.2/R5.3/R5.5/R5.6, A/B),
     connectives (R10.2/R10.3, B), and the greeting frame + honorific
     vocative (R9.1-R9.3, C _community-only by necessity_ - the deduced doc's
     grading key says C for greetings means "single possible source", and its
     section 12 ranks them #5-6 of 15; included on that written basis, the one
     deviation from the A/B-only rule).
   - **REGISTER** - "write like the community, not scripture": ~7-word
     sentences, dotted vowels, apostrophized elision, sparse tone,
     first/second person, attached negative nasal, no Jihofa/taku
     (section 13 table + R8.1/R8.3, grade A).
   - Every line carries an inline comment citing its rule IDs. Size: 2,793
     chars = ~698 tokens by the repo's chars/4 convention (enforced by test).
   - Why grammar now when v2 refused it: v2's ablation warning covers grammar
     PROSE; Pei et al.'s +11.89 chrF result is for STRUCTURED,
     procedural, trigger-shaped rules - which is the only shape this section
     uses. The file header documents the distinction.
2. **Assembly unchanged**: rag-v3 reuses `buildRetrievalV2` and
   `buildUserTurnV2` (no `buildUserTurnV3` needed - the task allowed reuse
   when assembly does not change). A v2/v3 delta therefore isolates the system
   prompt, nothing else.
3. **Wiring** (v2 pattern copied exactly):
   - `src/app/api/arena/chat/route.ts` - rag-v3 candidates share the one v2
     retrieval build per request and swap in IGALA_SYSTEM_V3; v1 retrieval no
     longer runs for v3 candidates (needsRetrieval excludes both labels).
   - `src/app/api/arena/eval-runs/[id]/generate/route.ts` - same branch,
     version-selected system prompt.
   - `scripts/frontier-fill.ts` - mode "rag-v3" mirrors "rag-v2" with the v3
     system prompt; the retrieval cache is shared across v2/v3 arms.
   - `src/lib/arena/frontier-targets.ts` - ServingMode gains "rag-v3";
     `servingModeFor` puts the label above ragEnabled, same precedence as the
     chat route.
   - `src/lib/method-metrics.ts` - approachLabel maps rag-v3 to
     "retrieval v3" so the scoreboard cannot mislabel v3 as v1.
4. **Registration** - `scripts/register-rag-v3.ts` (pattern of
   register-rag-v2.ts, deriving from the v2 siblings): three new rows,
   `gpt-4-1-rag-v3`, `claude-opus-5-rag-v3`, `gemini-3-1-pro-rag-v3`, each
   parented to its v2 sibling (lineage v1 -> v2 -> v3), provider/model/color/
   decoding copied verbatim. Claude Opus 5 carries **temperature null** - the
   sanctioned opt-out because that model rejects the parameter; the script
   asserts null for anthropic and 0 for everyone else, so a drifted v2 row
   fails loudly instead of registering a miscomparable arm.
5. **Leak-guard**:
   - Unit test `src/lib/generation-prompt-v3.test.ts` - Scope-A checkStatic
     over the representative protected set (same pattern as
     retrieval-v2.test.ts), skeleton/section assertions, per-line
     structured-not-prose cap, token budget.
   - **`scripts/static-leak-check-v3.ts`** - the REAL check: builds the
     protected set from actual frozen gold (consentBenchmark, isHoldout - the
     loadLeakAudit query) and runs checkStatic over the whole prompt AND each
     line separately, reporting locations only, never content.
6. **`scripts/qual-v2-v3.ts`** - the three sniff-test free-form prompts
   (farmer story / elder greeting / children-eating translation) generated
   fresh under v2 and v3 side by side, per family, sharing one retrieval
   build per prompt. Unscored, unstored.

## The Scope-A story (why the guard earned its keep today)

The first draft of the grammar section, written straight from the deduced
doc's attested examples, FAILED the real Scope-A check with 6 hits across 3
lines: the elision examples, the numeral example, and one greeting slot noun
each contained a whole frozen gold answer (4 distinct protected strings on 4
frozen orthography prompts). This is precisely the v2 design warning ("several
obvious replacement forms are themselves frozen-benchmark answers") coming
true for grammar examples. Fixes, chosen mechanically by per-line bisection
without ever reading gold content:

- elision examples swapped to the attested subset that passes (w'ọla, k'ọla,
  aj'ẹñwu);
- the numeral example cites bare numeral forms with no example noun;
- the colliding greeting slot noun was dropped from the static list -
  retrieval supplies it per-prompt under the leak guard.

Final state: **SCOPE A: PASS** against all 139 protected strings (238 gold
answers, 43 frozen prompts). Per leak-guard information hygiene, neither the
colliding strings nor their prompt mappings are recorded here or in code
comments - the script re-derives them on demand for whoever has DB access.

## Gates

- `npx tsc --noEmit` - clean.
- `npx eslint .` - clean.
- `npx vitest run` - 562/562 green (9 new v3 tests; frontier-targets and
  method-metrics tests extended for rag-v3).
- `scripts/static-leak-check-v3.ts` - SCOPE A: PASS.
- NO git commit (per task instruction).

## Generation on the frozen 43

- `gpt-4-1-rag-v3` - 43/43 generated (temperature 0; stored ragContextIds
  carry the full lex:/pp:/gold: audit trail; ~1.9k tokens in per prompt).
- `claude-opus-5-rag-v3` - **SKIPPED: provider probe failed, "API key is
  invalid"**. The .env.local ANTHROPIC_API_KEY is rejected by Anthropic (an
  auth error, not the ANTHROPIC_BASE_URL 404 documented in providers.ts - the
  pinned baseURL is working). No key in any shell profile either. The v2
  sibling's 43 outputs predate the revocation. The candidate row is
  registered and idempotent: once a valid key lands in web/.env.local, run
  `npx tsx --env-file=.env.local scripts/frontier-fill.ts generate claude-opus-5-rag-v3`
  and it fills exactly the missing 43.
- `gemini-3-1-pro-rag-v3` - see final summary below.

## Scores

(Filled after the final runs - see the leak-audit table and qualitative
outputs in the sections below.)

### Leak-audit rescore table (all arms incl. v3)

PENDING - inserted after generation completes.

### Qualitative v2-vs-v3 (3 free-form prompts)

PENDING - inserted after generation completes.

## Open questions / cautions

- The frozen 43 is 88% single-word lookup (the v2 sniff lesson): stripped
  chrF on it cannot measure sentence structure, which is what the grammar
  section exists for. Read the qualitative outputs as the primary signal for
  structure; the table is the guard against regression on lookup.
- The greeting-frame and honorific lines are C-grade community-only (by
  necessity); if Agnes's team contradicts them, they come out of the static
  prompt first.
- Any future edit to IGALA_SYSTEM_V3 must re-run
  `scripts/static-leak-check-v3.ts` - the unit test's representative set
  cannot see real collisions.
