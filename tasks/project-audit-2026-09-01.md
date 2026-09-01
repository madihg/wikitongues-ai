# Project audit, 2026-09-01: what is wrong, what holds, what to do next

Written for the project lead. Five adversarial reviews (claims, data, decisions, engineering, statistics) were run against the live production database, the live public endpoint (computedAt 2026-09-01T21:32Z), the Vercel runtime log, Gmail, Drive and the code in this worktree. A sixth pass re-derived every CRITICAL and HIGH finding from scratch and spot-checked 13 of 16 MEDIUM findings. Nothing below comes from memory. No code was changed.

Counts: 4 CRITICAL, 9 HIGH, 14 MEDIUM, 4 LOW confirmed. 3 reviewer severities were adjusted (two down, one up). 3 findings the reviewers missed were added. Full evidence with query results lives in the scratchpad reports (audit-verified.md and the five audit-*.md files).

The one-paragraph version. The method is not broken. Speakers do prefer the v3 system to bare Gemini, Claude v3 was a real regression that v4.1 undid, and the measurement machinery reproduces to the decimal. What is broken is the story told about the method. The headline blind-preference number belongs to a system nobody is shipping, the headline exam score is past 100 because the model gets more answer keys than the speaker it is compared to, the biggest corpus is served under a permission that does not exist in writing, and the v4 to v4.1 "gain" is mostly the model writing fewer tone marks. Each of these has already reached Daniel and Lydia by email, and one has reached Google Research on a slide. The next public number should wait until the first group below is fixed.

---

## 1. Confirmed findings, ranked

Each finding is three lines: what is wrong, the evidence, the fix. "Public" means it is live on the marketing site, the in-app page, the endpoint, or was sent by email.

### Group A. Must fix before anyone repeats a number

**1. CRITICAL. The "speakers prefer our system 4 times out of 5" result is attached to systems no speaker has ever judged.**
Evidence: all 193 real pool comparisons are one pairing, Gemini 3.1 Pro + RAG v3 against bare Gemini 3.1 Pro (v3 54 wins, bare 14, ties 21, both inadequate 104). Comparisons touching any v4 or v4.1 arm: 0. The email sent 2026-08-31 puts "54 out of 67" and "our newest system scores 102" under one "our system"; the chat default is v4.1, never judged. Public howItWorks.ts line 370 says speakers judge "three systems"; claude-opus-5-rag is in the pool with 0 comparisons and a dead API key.
Fix: in every channel name the arm and the pairing ("Gemini with our v3 package against the same Gemini with nothing added"), quote the full 54/14/21/104 split, and say v4 and v4.1 are unjudged. Do not send the funder draft with "vs other models" or "surpasses any existing models".

**2. CRITICAL. "Past the 100 line" is built in, not measured. The model is scored against more references than the speaker it is compared to.**
Evidence (method-metrics.ts): a model output takes its best chrF over all 238 consented golds (mean 5.56 references per clean prompt, same-speaker repeats included) on 27 prompts; the 100 line is each speaker against k-1 deduplicated peers (mean 3.11 peers) on 25 prompts. Re-scoring every arm exactly as the ceiling scores a speaker: Gemini v4.1 102.6 [77, 133], v4 89.4, v3 90.3, bare 83.2, Claude v4.1 85.4, Claude v1 79.6. About 17 of the 20 points above 100 are construction.
Fix: score models against the same deduplicated k-1 references, averaged over hold-outs, on the same 25 prompts, and re-anchor 100 (option (c) below). Remove "beats a human" and rewrite the public footnote at howItWorks.ts line 290.

**3. CRITICAL. The Bible corpus is served under a "BSN permission" that no record contains.**
Evidence: all 30,907 ParallelPair rows and 1,262 LexEntry rows (60% of the lexicon) carry a source string saying permission was granted 2026-08-12. Gmail holds only two outbound messages to BSN (Halim 2026-08-12, Lydia 2026-08-18) and no reply; the ingest is dated the same day the ask was sent. The project's own ledger (tasks/igala-corpus-sources.md rows 75 and 229, section 4.1) says "Do not use". The public changelog says "ingested under BSN permission" in both repos; the Aug 18 slides shown to Google Research say BSN "licensed us the Igala Bible".
Fix: correct the changelog entry in both repos the way the Aug 29 entry corrected the others, mark every arm from v2 up as consuming an unlicensed source, and either obtain a written grant or plan the removal. This is a legal and reputational exposure, not a metric.

**4. CRITICAL. The live public sentence "the grammar that lifts Gemini measurably hurts Claude" is not supported.**
Evidence (paired bootstrap on the clean 27): Gemini v3 minus bare = +1.95 chrF [-9.12, +12.94], 13 prompt wins to 11. Not measurable. The Claude half is real (v3 minus v1 clears zero), but the current board has Claude v4.1 at 93.2 above Claude v1 at 83.3, so "Claude does best when shown real community answers instead" is stale too. The per-family pool design was drawn on this reading.
Fix: replace the sentence at howItWorks.ts line 370 with what the paired tests support: rules hurt Claude at v3, v4.1 undid that, and no Gemini delta before v4.1 clears its interval.

**5. HIGH. The v4 to v4.1 gain (102 to 120) is tone-mark density, not grammar.**
Evidence: gold on the frozen 43 has tone density 0.141 and 180 of 238 golds carry no tone mark. Output tone density falls v1 0.53, v4 0.28, v4.1 0.16. With tone stripped from both sides and the ceiling recomputed, v4 scores 94.8 and v4.1 94.2 (paired delta -0.36 [-4.85, +4.63]); a regex that strips tone from v4's stored outputs scores 138.4, above v4.1. The repair round fired 7/43 on Gemini, all for tone saturation.
Fix: publish a tone-insensitive column beside the raw one, treat the repair round as a post-processor and evaluate it as one, and stop describing v4.1 as "the first version that helps both families" until a tone-insensitive paired delta says so.

**6. HIGH. "We are beating the frontier labs on grammar" is contradicted by the tags.**
Evidence: grammar is the top loser tag on both sides (bare Gemini lost 54 times, grammar tagged 11; v3 lost 14 times, grammar tagged 4). Both-inadequate tags since Aug 20: grammar 37 on bare Gemini, grammar 37 on v3. Only 26 of 74 decided comparisons carry any loser tag. The email's bullet 3 says grammar is what the community taught the system; its own caveat 3 says the system fails on grammar too.
Fix: restate as "grammar is the top complaint against both systems and is where we are iterating".

**7. HIGH. 55% of the benchmark gold was written after seeing rejected model output; the public page calls all of it pre-exposure.**
Evidence: benchmark gold provenance is corrected_from_inadequate 131, speaker_authored_sourcefree 107 of 238. Six frozen prompts (ig_bank_lex_002 to 007) have only salvage gold. howItWorks.ts line 95 says "Cold answers, written before seeing any model".
Fix: disclose the split on the page, and publish a sourcefree-only sensitivity score beside the main one so a reader can see whether post-exposure gold moves the ranking.

**8. HIGH. Only one link of the headline chain (v4.1 > v4 > v3 > bare) survives a paired test, and quoting the best of five arms carries a selection premium.**
Evidence: v4.1 minus v3 = +8.27 [+1.30, +15.82] is the only Gemini link that clears zero; v4.1 minus v4, v4 minus v3, v3 minus bare and v4.1 minus bare do not. Permutation null for best-of-five: observed 7.80 chrF above the grand mean, null mean 3.41, p = 0.010. The best arm is real but its quoted number is inflated by roughly 9 agreement points. The published CIs also hold the ceiling fixed; resampling jointly gives v4.1 [89, 160] with P(below 100) = 0.11.
Fix: any arm-versus-arm claim uses the repo's own pairedBootstrapDelta; the board says "best of N arms examined"; Context.md's "suggestive, not established" wording becomes the public wording.

**9. HIGH. The "99% to about half" both-inadequate trend is a base-model swap, not progress.**
Evidence: weeks Jul 13 to Aug 10 are 99 to 100% both inadequate on GPT-4o and GPT-4.1 pairs; Aug 24 and 31 are 53% and 42% on Gemini 3.1 Pro pairs only. Bare GPT-4.1 scores 23.4 on the proxy, bare Gemini 3.1 Pro 94.2. The email's "(down from 99% a month ago)" and the InadequacyStrip's "Progress here means the bars falling" both frame the swap as a trajectory.
Fix: split the strip by pairing regime and label the Aug 20 pivot; drop the "down from 99%" sentence.

**10. HIGH. The public method page describes v3 as "today" and publishes only v2 and v3 prompts, while v4.1 tops the board, serves chat and is examined; the repair round appears nowhere and its first pass is unrecoverable.**
Evidence: how-it-works/page.tsx imports only IGALA_SYSTEM_V2 and V3; both CHANGELOGs end Aug 29; the marketing page's "How one answer is built today" describes v3. exam-rag-v4-1.ts persists only the second answer, ModelOutput has no repair field, so the v4.1 bar is best-of-two against one-shot bars with no disclosure. The marketing repo has an uncommitted igalaPrompts.ts edit whose comments say "Scored 120" and "eight rules each verified against two independent sources"; committing it publishes findings 5 and 13.
Fix: add v4, v4.1, the repair round and the Claude ladder to both changelogs; label v4.1 "best of two" on the board; store first-pass text and a repaired flag on ModelOutput before the next exam; do not commit the marketing snapshot as written.

**11. MEDIUM (missed by all five reviewers). Ten empty outputs are stored as exam answers on live arms and scored as chrF 0.**
Evidence: bare Claude has two zero-length outputs (ig_cult_001, ig_reg_001, 4,096 output tokens consumed, no text); claude-opus-5-rag-v2 three, rag-v3 one, gemma-4-31b-rag-v2 four (provider errors persisted as results). The Claude ladder in the email (bare 27.2, v2 62.1, v3 54.6) and the funder draft's "a top model alone scores 25" count provider failures as language failures; Claude v3 without its empty row is 56.7.
Fix: never persist an empty answer as a result; store the provider error, exclude or regenerate these rows, and re-quote the ladder.

### Group B. Fix before v4.2

**12. HIGH. The v4.2 plan (wire the 9 grammar entries, re-exam, decide from the score) rests on six untested assumptions.**
Evidence: v4.1 as base is untested (finding 5); rules beating exemplars is contradicted tone-insensitively on both families; the exam has 2 or 3 prompts of the kind the entries target so chrF cannot register them; the repair round's quality effect is unmeasured; the entries are grade C and never shown to a speaker; the prompt sits at 1,148 of 1,150 tokens so a block displaces something. Zero v4.x outputs have a blind judgment.
Fix: see section 3. Do not spend on v4.2 retrieval before the tone-insensitive scoreboard and one human read on v4.1 exist.

**13. HIGH. "Two independent sources" is vacuous for orthographic rules because the Bible corpus cannot express the feature.**
Evidence: ParallelPair 30,907 rows contain 0 hyphens, 0 tone marks, 6 rows with ẹ or ọ. E4 (no hyphen prefixes), the tone clause and the allowlist take their "corpus leg" from this. E1, E2, E3 and E7 are genuine syntactic checks and hold.
Fix: relabel E4, E5, E6 and the tone clause as community-only register choices; change the public "Only rules confirmed by two independent sources ship" to name the four that are.

**14. HIGH. The chat turn budget gives up 20 seconds on every turn because the platform ceiling was inferred wrong.**
Evidence: Vercel runtime log (7-day window) has exactly one error, "Task timed out after 120 seconds" on /api/arena/chat at 2026-09-01T15:24:56Z. turn-budget.ts lines 38-54 conclude the ceiling is below 120 and set PLATFORM_MAX_DURATION_S = 100; the module's test compares the constant to itself. The repair re-ask gate refuses a rewrite past t=57s where t=77s was available.
Fix: set the ceiling to 120, cite the log line in the rationale, keep the 8s margin.

**15. MEDIUM. The 9 grammar_rule entries were seeded for a reader that does not exist, and they do reach a pool arm whose exam never saw them.**
Evidence: retrieval-v4.ts has 0 RagEntry references; seed-rag-v4-1-grammar.ts's own header says so. The v1 path (searchRag) does read them, and claude-opus-5-rag (v1, inPairingPool=true, exam 83.3) now serves from a store 9 rows larger than the one it was examined on.
Fix: before any v4.2 seeding, write the five-line test "for prompt P the assembled v4.2 context contains row R"; either snapshot the v1 store per exam date or re-exam and relabel.

**16. MEDIUM. Six live Claude arms route through the dead direct Anthropic key; one is in the pairing pool.**
Evidence: provider=anthropic on claude-sonnet-4-5-baseline, -rag, claude-opus-5, -rag, -rag-v2, -rag-v3; all appear in the chat picker and close with a 401. claude-opus-5-rag is inPairingPool=true with 43 outputs (all frozen) and 0 comparisons; it can neither generate on train prompts nor be paired.
Fix: extend register-claude-openrouter.ts to these slugs or archive them; remove claude-opus-5-rag from the pool until re-filled.

**17. MEDIUM. The pivot date that defines "the current era" is derived from a flag that changes with every pool decision.**
Evidence: era.ts derivePivotAt iterates the current inPairingPool flags. Adding v4.1 changes nothing, but un-pooling v3 moves the pivot and drops 194 comparisons from the default window; un-pooling both Gemini arms makes it null and the table prints "No candidate is in the pairing pool yet".
Fix: pin the pivot (a constant citing the decision doc, or a pooledAt timestamp) before the pending pool change.

**18. MEDIUM. The post-hoc leak audit cannot see the corrections block.**
Evidence: splitServedIds recognises gold:, lex:, pp: only; 210 of 215 v4 and v4.1 frozen outputs carry edit: ids that are silently dropped. Re-checked with the served rendering: 0 own-gold hits today, so published numbers stand.
Fix: add edit: to both splitters and resolve to the exact served string.

**19. MEDIUM. The dictionary leak guard checks the raw phonemic headword but serves toOrthography(headword).**
Evidence: 235 of 2,104 LexEntry rows fold differently; 9 rows match a frozen gold only in served form (ig_bank_lex_001 and lex_003 on every v2 to v4.1 arm). Both prompts are already in the leaked 16, so the leak-free 27 and every score are unchanged.
Fix: build the guard piece from the rendered line and add a test for a phonemic headword whose orthographic form equals the gold.

**20. MEDIUM. Every chat column past turn one is conditioned on column 1's answers.**
Evidence: model-chat.tsx uses ex.replies[0] as "mine" for every column and the route passes one history to every branch. The comment beside it promises independence.
Fix: send per-slug histories.

**21. MEDIUM. A retrieval failure still ends as a bodiless 500.**
Evidence: the Promise.race at route.ts line 382 is unwrapped; only req.json() has an outer try. A pooled-connection failure (DATABASE_URL connection_limit still unset) is the likeliest trigger.
Fix: wrap the retrieval stage and reuse cutoffOnlyStream with a retrieval notice.

**22. MEDIUM. The fine-tuned arm is contamination-checked by prompt id while retrieval arms are checked by content.**
Evidence: the SFT arm has 0 ragContextIds so the content audit can never flag it; it reproduces a benchmark gold verbatim on 4 of 43 prompts; leak-guard.ts documents train gold containing a frozen answer for 23 of 43 prompts. Bounded today (the arm scores 40.1).
Fix: state on the method page that fine-tuned arms are id-checked only; add a content check on training targets before any SFT revisit.

### Group C. Hygiene

**23. MEDIUM. gpt-4.1-mini is priced as gpt-4.1; gemma and gemini-2.5-flash fall to the default.** 459 outputs billed at $2/$8 instead of $0.40/$1.60. Add the rows and a registry-completeness test (every non-archived baseModelId has a price row).

**24. MEDIUM. Two seed-account (@test.com) answers sit in the benchmark gold and its ceiling; the endpoint counts 195 pool comparisons where insights counts 193.** Apply REAL_CONTRIBUTOR everywhere or flag the rows isDemo.

**25. MEDIUM. "Dictionary, hand-checked" describes 136 of 2,104 entries.** 1,262 are alignment-induced (confidence 0.52), 482 chikhapo in IPA-style transcription, 224 Koelle 1854. Change the copy to name the four sources.

**26. MEDIUM. Four ship-then-revert incidents in three days share one cause: no observation of the production surface before the merge claim.** Buffered chat (a01755a), non-literal maxDuration (009dda7, whose test pinned the bug), CostEntry double count, and a price row known missing on Aug 20 and added Sep 1. See section 4.

**27. LOW. Two board arms are scored on incomplete exams with no visual label** (gemini-2-0-flash-baseline 17 clean, gemma-4-31b-baseline 21 clean). Mark n on the bar.

**28. LOW. static-leak-check-v4-1.ts dropped the header checks that the v4 script covered.** No exposure today; restore the superset.

**29. LOW. Dead code: unreachable buffered-JSON fallback, three copies of loadGoldPool, providers.ts default branch resolving to the dead key, a "revising" phase overwritten before it renders.**

**30. LOW. Copy hygiene:** "BSN" never expanded, curly quotes in one changelog entry, the arena InfoTip describing a pairing design that is not the one in use, "one in a million" in the email (pair-level p is 0.002, 25 wins to 7 over 55 pairs).

---

## 2. What is solid

These survived all five reviews and the re-derivation. They can be said with confidence, in these words.

- Native speakers, judging blind, prefer Gemini 3.1 Pro with the v3 package to the same model with nothing added. Every one of the six annotators leans that way. At the pair level it is 25 wins to 7 losses over 55 prompt pairs, exact binomial p = 0.002. The odds are real; "one in a million" is not.
- The v3 grammar rules made Claude worse (v1 to v3 is -11.3 chrF, interval clears zero), and v4.1 undid that regression (v4.1 minus v3 = +15.3, clears zero).
- Gemini v4.1 scores above Gemini v3 on the frozen exam under a paired test (+8.3 chrF [+1.3, +15.8]). It is the only Gemini step that does.
- Under a like-for-like construction the best arm sits at speaker-agreement level: 102.6 with interval [77, 133]. "As consistent as one speaker is with another" is a defensible point estimate.
- The measurement machinery is honest and reproducible: the leak-free 27, the deduplicated ceiling of 39.5, the bootstrap and every published number reproduce to the decimal from the repo's own functions.
- Failure mining for the v4.1 rules used train prompts only; there is no path to run an exam twice and keep the better score; the repair round's tone effect was documented in Context.md as "prompt + repair round alone" rather than credited to the grammar entries.
- Four of the eight enshrined rules (E1 serial verbs, E2 optative, E3 ñwu, E7 muda) have genuine two-source support.
- OpenRouter spend is attributed correctly and the $1.12 double count was fixed the day it was found.

---

## 3. The v4.2 candidate plan, as options

Cost basis used throughout: annotation runs at about 6 minutes per episode (10 per hour); in the current pool 35% of episodes produce a decision; distinguishing a 65/35 preference needs about 85 decided comparisons; the pool checkpoint rule is 100 episodes. Gemini 3.1 Pro v4.1 with repair cost $0.29 for 43 prompts; Claude Opus 5 via OpenRouter cost $1.94 for 86 generations.

### Option 0. Correct the record (not v4.2 work, but it comes before any of it)

What it does: fixes findings 1, 2, 3, 4, 6, 7, 9, 10 and 11 in copy and changelogs, sends a second correction to Daniel and Lydia naming the arm and the pairing, and holds the funder draft. Cost: about one working day of copy and review, $0. Success: no public surface or sent email carries a number the audit could not reproduce or a claim it could not support; the BSN line is corrected in both repos. Depends on nothing; everything else depends on it.

### Option (c). An agreement score that cannot exceed 100 by construction

What it tests: nothing new; it makes the existing number mean what the copy says. Two parts. First, the matched-construction score from finding 2 (model scored against the same deduplicated k-1 references, averaged over hold-outs, same 25 prompts) replaces the current one; this can still pass 100, but only by measurement. Second, a companion "speaker-rank" score: on each prompt, insert the model as one more speaker, compute everyone's leave-one-out chrF the same way, and record the share of real speakers the model ties or beats; average over prompts. It is 0 to 100 by construction, 50 means "a typical speaker", 100 means "beats every speaker on every prompt", and it is immune to reference-count games. Publish both, with a sourcefree-only sensitivity column (finding 7) and empty outputs excluded (finding 11).
Cost: one to two engineering days including tests and the copy change in both repos, $0. Success: the endpoint publishes both scores, no bar is "past 100" by construction, and the public footnote is rewritten. Depends on findings 2, 7, 11 and 24.

### Option (d2). Tone-insensitive scoreboard plus a no-repair control

What it tests: whether v4.1 has any effect beyond tone stripping, and whether the repair round is a quality device or a regex. Publish the tone-insensitive column; re-exam "v4.1 prompt, no repair" on both families; store first-pass text and a repaired flag on ModelOutput from now on; compare against a $0 "v4 output plus tone regex" arm.
Cost: about $0.30 (Gemini) plus about $1 (Claude) for the control exam, half a day of engineering for storage and the column. Annotator hours: 0. Success: a paired tone-insensitive delta of v4.1 over v4 that clears zero would justify v4.1 as the base; a delta near zero (the current reading) means the repair round is a post-processor and v4.2 should build on v4 or v1 with a tone normaliser. Depends on findings 5, 8 and 10.

### Option (a). Human validation of v4.1 through the pairing pool, before any further prompt engineering

What it tests: whether the speakers, the stated referee, prefer v4.1 over what they already prefer (v3), and whether v4.1 is separable from a regex over bare Gemini. Two pairings on the same train prompts: v4.1 vs v3, and v4.1 vs "bare Gemini plus tone strip" (a derived arm from the 96 existing bare outputs, $0 to build). Before adding any arm: pin the pivot date (finding 17), remove the dead claude-opus-5-rag from the pool (finding 16), and freeze or relabel the v1 store (finding 15).
Cost: v4.1 on 96 train prompts, about $0.65 to $1.00 (Gemini) or about $2.20 (Claude); annotation at the checkpoint of 100 episodes is 10 hours; reaching 85 decided comparisons at the current 35% decided rate is about 245 episodes, roughly 25 annotator hours per pairing. With one annotator-week for both pairings the early read is possible; the powered read needs two to three.
Success: v4.1 beats v3 at the pair level with exact binomial p below 0.05, its both-inadequate rate is not above v3's, and it is separable from the tone-strip control. If speakers cannot tell v4.1 from the regex, the prompt program is measuring tone and stops. Depends on findings 1, 5, 10, 15, 16 and 17.

### Option (b). Wire the 9 grammar entries into a v4.2 retrieval block and re-examine

What it tests: whether retrieved grammar rules change outputs on the prompts they target. Build the block, write the reachability test first (finding 15), cut tokens elsewhere (the prompt is at 1,148 of 1,150), re-exam both families.
Cost: about $0.30 (Gemini) plus about $1 (Claude), one to two engineering days. Annotator hours: 0 for the exam, but see the catch.
The catch: the frozen exam has two or three prompts of the kind the entries target, so chrF on the 27 cannot register success or failure. The honest success criterion is three-part: the reachability test passes; the tone-insensitive paired delta versus the base is not negative; and a small cold-authored long-form held-out set (option d3) shows a difference the entries can explain. Without d3 this option produces a number that means nothing either way. Depends on findings 5, 12, 13, 15 and option (c).

### Option (d3). A cold-authored long-form held-out set

What it tests: gives the exam an instrument that can see grammar and register (greetings, consolation, dialect attribution, vocatives), which the current 43 cannot. About 20 prompts, authored cold by two or three speakers, frozen before any prompt work touches them.
Cost: cold authoring is the slow step; 20 prompts times 3 speakers at roughly 10 minutes each is 10 annotator hours, plus gold consent handling. $0 in model spend until used. Success: the set is frozen, provenance is sourcefree only, and it is never shown to prompt authors. Depends on finding 7 (provenance discipline) and the pivot document's reserved cold-authoring lane.

### Recommended order and why

Do option 0 and option (c) first because they cost nothing, and every later number passes through them; then option (d2) and option (a) together, because between them they answer the only question that matters for v4.2, which is whether v4.1 is a better base than v4 or a tone regex. Option (b) comes after, and only with option (d3) in hand, because the current exam cannot tell whether the grammar entries work, so spending on them now buys a number nobody can interpret.

---

## 4. Process changes that would have prevented today's class of errors

1. A claims register. Every number that leaves the project (email, slide, public page, funder draft) gets one row: the exact arm, the exact pairing, the query that produced it, the interval, and the date. The August 31 email would have failed this on three of its four bullets before it was sent.
2. Paired tests for arm-versus-arm claims, always. The repo already has pairedBootstrapDelta. Independent intervals on the same 27 prompts are not a comparison; "measurably" is banned until a paired interval clears zero.
3. No ingest without a written grant on file, named in the ledger row. The ledger, not a code header or a verbal report, is the source of truth. The BSN ingest happened the day the ask was sent; this rule makes that impossible.
4. Prove the reader exists before authoring content. Any row destined for a store gets a five-line reachability test against the serving path first. The nine grammar entries were seeded for a path that had been removed and the seed script's own header knew it.
5. Never discard what the pipeline can later be asked about. Store the repair round's first pass and its flag; store provider errors as errors, not as empty answers scored zero.
6. Adversarial review is a separate job from verification, and it runs before any external send. Five verifiers confirmed the 63.2 ceiling to the decimal in August; one attacker found it was made of duplicates in minutes. Today five attackers found four CRITICAL findings that had already gone out by email.
7. Observe the production surface before claiming a merge for anything touching serving, build config or money. One recorded observation: the production bundler, the default chat column timed, the ledger against receipts, the Vercel log for the ceiling. Two of today's four ship-then-revert incidents had tests that compared a constant to itself; a registry-completeness test (every registered model has a price row) would have closed the 12-day price defect on the day it was named.
8. Pin history-derived constants. The pivot date is a fact about the past and belongs in a constant with a citation, not in a derivation over a flag that changes with every pool decision.
9. Caveats belong in the bullet, not below it. The email's caveat 2 correctly said the arms are statistically level; bullet 2 said "as consistently as one native speaker" and is the line that got quoted back.
