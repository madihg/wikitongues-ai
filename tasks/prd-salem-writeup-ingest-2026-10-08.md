# PRD: Ingest the Salem and Lydia grammar write-up, ship v4.4 into the blind pool, start the dual-layer orthography experiment

Written 2026-10-08 from Halim's answers (orthography: dual layer; dialect: Central/Idah default; audio: later; pooling: go with a new round boundary; gates: full project gates; reference form: second model pass; v4.5: build, exam, report; review blockers: fix all before merging).

## Overview

Salem Ejeba and Lydia Wiernik sent "Igala grammar writeup: Patching the holes in the model" on 2026-09-25 (thread "Salem & I's writeup", attachment identical to ~/Downloads/Igala Grammar Writeup.docx). It states phonology facts, an orthography standard (tone marks always, expanded forms), restricted number agreement, the complementiser kí (COMP) versus relativiser kì (REL), a one-variety-per-answer rule, and two asks (audio recording of gold answers; register strength). Nothing of it is in the model yet.

Before it can go in, the verified Sep 28 branch (`pool-v44-quoted-source-fix`: v4.4 into the pool, the repair-round quoted-source fix, label and headline fixes) must ship, and the adversarial review of that branch (2026-10-08, 23 agents) found two blockers and nine should-fix items in the checker and the row-repair scripts that must close first, because the checker runs in live chat for every v4.1+ arm.

Measured facts the plan rests on: gold answers carry tone marks on 27.4% (annotator-driven: Austine 78%, Sarah 25%, Blessing 20%, Agnes 7%, Charity 2%, Ibrahim 5%); contractions on 32%; a standalone ki/kí in 15.5% of gold answers against 31% of v4.4's and 44% of bare Gemini's; the gold dialect field is unset on 923 of 1,684 answers, general_idah 479, ankpa 172, other 107, Ibaji 1, Ogugu 2; v4.4 still writes tone marks on 69% of its train answers despite the served rule.

## Goals

- Every v4.1+ arm's repair round stops manufacturing errors on quoted and English-request questions, with the review's failing inputs as tests.
- v4.4 judged blind against bare Gemini and v3 from today, with the chart's rows still readable (a third round boundary at the flip).
- Every rule in the write-up inventoried with an evidence grade and a status against what we serve; the servable ones seeded; the complementiser and one-variety rules in a v4.5 prompt, examined against v4.4.
- A working dual-layer rendering (community form plus an expanded, fully toned reference form from a second model pass) on the chat path only, with samples and a feasibility note for Halim and Salem.
- A draft reply to Lydia, never sent without Halim.

## Quality Gates

These commands must pass for every user story (from `web/` unless noted):

- `pnpm typecheck` - tsc --noEmit, app
- `pnpm lint` - eslint, app
- `pnpm test` - vitest, app (1,253 tests today; run with `--pool=forks --poolOptions.forks.singleFork --no-file-parallelism` under `caffeinate -i`)
- `npx tsx --env-file=.env.local scripts/static-leak-check-<version>.ts` - for any story that changes a served prompt (Scope A: no frozen gold in any prompt line)
- The seed script's own draft lint and Scope-A gate - for any story that seeds RAG rows (refuses the whole insert on a hit)
- `npx tsx --env-file=.env.local scripts/check-queue-servable.ts` - for any story that changes pool membership or ALLOWED_PAIRINGS
- Site (`../wikitongues-ai-web`): `./node_modules/.bin/tsc --noEmit` and `npx vitest run`
- House style on every file: no em or en dashes, no emojis; the site test pins this for its content.

Before the first gate run in a session: warm node_modules from iCloud (`brctl download` then cat the package files), or tsc and eslint stall at 0% CPU.

## User Stories

### Phase 0: close the review, ship the Sep 28 work, flip the pool

### US-001: English-request exemption scoped to the English

**Description:** As the serving path, I want check (a) to exempt only the English prose a question asked for, so that the model's own s-respellings (shọpu, yuñivasítí) are still caught on those questions.

**Acceptance Criteria:**

- [ ] On a question where `requestsEnglish` is true, `checkIgalaOutput` still runs `findAllowlistViolations` and keeps every hit that is not plain ASCII (contains ẹ, ọ, ñ, a tone accent or any combining mark); plain-ASCII hits are exempt.
- [ ] `requestsEnglish` is false when the English phrase is negated (not, never, do not, don't, without, only in Igala) or sits inside a quoted passage; true for "explain in English", "note in English", "one line of English".
- [ ] Tests reproduce the review's inputs: idiom_002, lex_005 and lex_027 first passes flag shọpu, yuñivasítí, yunifásítì; "Adsa ki wẹ." is flagged on "Do not answer in English" and on the quoted-phrase translation; "This blessing wishes her success" passes on idiom_001.

### US-002: Names from the sentence that is actually translated

**Description:** As the serving path, I want the name check to read names from the right span of the question, so that quoted titles, direct speech, plural possessives, possessive names and elided names no longer produce false hits or misses.

**Acceptance Criteria:**

- [ ] `nameSourceText` uses the quoted passage only when the quote is the translation object: it directly follows a form of "translate" (optionally "this", "into Igala", a colon) or "reads:"; otherwise the whole question, with edge quotes stripped, is the source.
- [ ] `quotedPassages` pairs each opener with its matching closer (' with ' or ’, " with " or ”), never closes on a letter-apostrophe-space plural possessive or an elision apostrophe, and prefers the longest match before the end of the sentence.
- [ ] A possessive proper noun (Amina's, Amina’s) yields the name Amina.
- [ ] A name present in the answer behind an Igala elision prefix (t'Ankpa, ef'Abuja, efẹw'Abuja) counts as present.
- [ ] The first word of a quoted translation sentence is name-checked when it is capitalised and not an English function word (a stoplist of determiners, pronouns, prepositions, conjunctions, auxiliaries and common imperatives: The, A, He, She, I, My, Our, When, In, Write, Give, Say ...).
- [ ] Tests: the review's inputs (Okafor/Onitsha/Abuja with 'University of Lagos'; Makeba with "Mama Africa"; the farmers' union with Governor Ododo in Lokoja; Musa told Ada 'come here'); the bank prompts gram_001 to gram_006 and gram_011 with a correct answer (no violation) and with a respelled first name (Jainab, Fifian: name-not-preserved); t'Ankpa and ef'Abuja pass.

### US-003: Row-repair scripts hardened and the three rows regenerated

**Description:** As the operator, I want the replay and regenerate scripts to be safe to rerun and honest about spend, so that a repeat invocation cannot destroy a backup or overwrite a judged row.

**Acceptance Criteria:**

- [ ] Both scripts refuse to run when `--backup` names an existing file (open with flag `wx`).
- [ ] `regenerate-train-outputs.ts` re-queries `pairwiseComparison` for the row immediately before each update and skips a row judged in the meantime.
- [ ] On regenerate, `tokenCountIn`/`tokenCountOut` are set to old plus new (the replaced call was paid for) with a comment naming `measuredTrainSpendUsd` as the consumer; the replay keeps counts unchanged as documented.
- [ ] `trainMaxTokensFor(provider)` lives in `src/lib/arena/v4-family-train.ts` and both the fill and the regenerator use it.
- [ ] The three rows the review named (cmuldnpvp003ur9fy1widcqxo idiom_002, cmuldpa1z0044r9fyz7h9fat1 lex_005, cmuldtest0058r9fy8ohoobsg lex_027) are regenerated through the fixed checker with a new backup file under `tasks/backups/`.
- [ ] A read-only replay afterwards reports v4.4 train CLEARED = 0 and CHANGED = 0; frozen rows unchanged.

### US-004: A third round boundary at the pool flip

**Description:** As a reader of the how-it-works chart, I want judgments made after v4.4 joined the pool shown as their own round, so that the rows before and after the pool change are not mixed.

**Acceptance Criteria:**

- [ ] `POOL_ROUNDS` in `web/src/lib/arena/era.ts` gains `round-3` starting at the flip timestamp (set when the flag flips), labelled "v4.4 in the pool, since Oct 8"; `round-2` ends there.
- [ ] `human-rounds.test.ts` covers three rounds reconciling to the all-time count.
- [ ] The site chart renders three rows with no copy change needed (its parser is tolerant; verified by its tests).

### US-005: Ship the branch, flip the pool, merge the site

**Description:** As Halim, I want the verified work live, so that speakers judge v4.4 from today.

**Acceptance Criteria:**

- [ ] App PR from `pool-v44-quoted-source-fix` (plus US-001 to US-004) squash-merged to main; production deploy verified (`/api/public/method-metrics` lists approach "retrieval v4.4", not "retrieval v1").
- [ ] `scripts/enable-v44-pool.ts` run after the deploy; its dry run draws both v4.4 pairs; `check-queue-servable.ts` reports every remaining prompt servable and three pooled arms.
- [ ] Site PR from `verdicts-every-pair` merged after the flip; the live page shows the panels and the Sep 28 changelog entry; the entry's text matches the app's constant (hash test).
- [ ] Context.md records the flip time, the PR numbers and the spend.

### Phase 1: the write-up into the model

### US-006: Line-by-line inventory of the write-up

**Description:** As the project record, I want every claim in the write-up extracted, graded and placed against what we serve, so that nothing is lost and every seeded row cites its source.

**Acceptance Criteria:**

- [ ] `tasks/salem-lydia-writeup-2026-09-25-inventory.md` lists every rule with an id (W-<section>-<n>), section, category, evidence grade (scholarship / corpus / community; Salem's write-up and his 2023 paper are one class), status against the v4.4 prompt and the grammar_rule rows (served_in_prompt, in_ragentry, missing, contradicts_served), and the action taken.
- [ ] Contradictions are listed, not resolved: tone marks always vs REGISTER; expanded forms vs Elision; gwùgwú (0 corpus hits in 30,907 verses) vs the write-up's examples; presentative yì vs the served "never yí for the"; hyphenated àma- vs the no-hyphen rule; complementiser over-use vs the served "kì/ki starts a new clause".
- [ ] The audio and register-strength asks are logged as product and prompt items with owners.
- [ ] No prose from the write-up is reproduced; rules are restated, Igala forms cited as data.

### US-007: Seed the write-up's rows

**Description:** As the retrieval layer, I want the write-up's servable rules as grammar_rule rows, so that the grammar block can serve them for the questions they match.

**Acceptance Criteria:**

- [ ] `web/prisma/seed-rag-v4-5-grammar.ts` follows `seed-rag-v4-3-grammar.ts` (draft lint, real Scope-A gate, embeddings, create-only, idempotent) and seeds: complementiser kí (COMP) vs relativiser kì (REL) with the write-up's example frames; restricted agreement (gwùgwú/tẹ́ one, jọ many; tẹ́ yì / jọ yì presentative) with its corpus caveat stated in the row; dialect alternations (Ibaji VC forms, Ogwugwu r for l; one variety per answer; Central/Idah default); phonology note (s becomes ch in Igala words only, never in names; kw and gw are letters) as a note row.
- [ ] Rows with one evidence class carry `verificationStatus: scholarship_note` (not served in the block); rows with corpus or community support are served.
- [ ] Any frozen gold word is bracketed in English, never spelled; the gate passes on the first clean run and a rerun creates 0 rows.
- [ ] Source string names the write-up, its date and authors.

### US-008: v4.5 prompt

**Description:** As the model, I want the rules that belong in the prompt stated there, so that complementisers, dialect consistency and register weight are governed on every answer.

**Acceptance Criteria:**

- [ ] `web/src/lib/generation-prompt-v4-5.ts` is v4.4 plus named line edits: (a) complementiser: "kí (high) opens a that-clause, kì (low) opens a relative clause; a clause-linker is never dropped and never inserted where no clause follows"; (b) variety: "write one variety of Igala per answer: Central (Idah) unless the question names another; never mix forms from two areas"; (c) register weight: "match the weight of words to the occasion: no children's phrases in a serious context, no heavy words for a light one"; the Joining line amended to name kí.
- [ ] Test pins the edit count, each phrase, the token ceiling (raise to 1,600 only if needed, pinned), no dashes.
- [ ] Wired through `frozen-exam.ts` (V4_FAMILY_VERSION_LABELS, systemPromptForVersion, servesGrammarBlock true, checksNames true), `repair-round.ts` labels, `approachLabel` "retrieval v4.5" with the label-walk test, `scripts/register-rag-v4-5.ts`, `scripts/static-leak-check-v4-5.ts` (PASS required).

### US-009: Exam v4.5 and report

**Description:** As Halim, I want v4.5 measured against v4.4 on the same exam, so that the write-up's effect is a number.

**Acceptance Criteria:**

- [ ] `exam-frozen-arm.ts gemini-3-1-pro-rag-v4-5 --budget 4` completes 43/43 (resume loop on pooler blips).
- [ ] Context.md and the app CHANGELOG constant (copied verbatim to the site, hash re-pinned) report v4.5 vs v4.4 on agreement, tone-insensitive, source-free and speakerRank, with CIs, and say which prompt families moved.
- [ ] v4.5 is registered and NOT pooled.

### Phase 2: the dual-layer experiment

### US-010: Reference-form second pass on the chat path

**Description:** As a reviewer in the chat UI, I want to see the expanded, fully toned reference form beneath the community-form answer, so that Salem's standard and the community's writing can be read side by side.

**Acceptance Criteria:**

- [ ] `web/src/lib/generation-prompt-reference.ts`: a prompt that rewrites a given Igala answer into the reference form (every contraction expanded with the elision rules reversed, tone on every syllable, one variety, no change of words or meaning), carrying the write-up's own examples (ki ọla for k'ọla) and NO frozen gold; `static-leak-check-reference.ts` PASS.
- [ ] `buildReferenceForm(answer, question, candidate)` in `web/src/lib/arena/reference-form.ts`: one call, temperature 0, returns text and tokens; deterministic unit tests with a mocked provider.
- [ ] Prisma migration adds `referenceFormText String?` and `referenceFormModelId String?` to `ModelOutput`; the annotation queue, the exam scorer and method-metrics read `outputText` only (tests assert they ignore the new column).
- [ ] The chat route runs the pass only for v4.5 columns when `?reference=1` (or a UI toggle) is set; streams the answer first, then the reference form as a separate labelled block; a provider failure on the second pass leaves the answer unchanged.
- [ ] The admin chat UI renders the reference form under the answer with the label "reference form (expanded, toned), experimental".

### US-011: Samples and feasibility note

**Description:** As Halim, I want to see what the reference form looks like on real answers and what it would cost to make it standard, so that I can decide with Salem.

**Acceptance Criteria:**

- [ ] `scripts/reference-form-samples.ts` runs the pass on 20 stored v4.4 train answers (varied prompt families, cap $1) and writes `tasks/reference-form-samples-2026-10-08.md` with question, community form, reference form, tokens.
- [ ] `tasks/dual-layer-feasibility-2026-10-08.md` states: serving (one extra call, latency, cost per answer), storage, UI, the annotation form change that would let speakers write reference forms, and the benchmark impact (reference forms score lower against community gold on chrF; the tone-insensitive column; what a reference-form gold would require), with numbers from the samples; ends with the three options and a recommendation.
- [ ] Neither file contains frozen gold.

### Phase 3: the reply

### US-012: Draft reply to Lydia

**Description:** As Halim, I want a reply ready in my voice, so that I can send it after reading the samples.

**Acceptance Criteria:**

- [ ] The existing Gmail draft in Lydia's thread is updated: what was ingested, that the dual-layer rendering exists as an experiment with samples attached or linked, audio later, the four open questions; 90-word ceiling, count printed, style-guide self-check run; not sent.

## Functional Requirements

- FR-1: `checkIgalaOutput` must never skip check (a) wholesale; exemptions are per word.
- FR-2: `requestsEnglish` must ignore negated and quoted phrasing.
- FR-3: The name check must take names from the translated sentence when the question quotes it as the object of translate/reads, else from the whole question.
- FR-4: Names behind an elision apostrophe in the answer count as present; possessive 's is not part of a name.
- FR-5: Backup files are never overwritten; judged rows are never rewritten.
- FR-6: Token counts on a regenerated row must not lower measured spend.
- FR-7: The pool flip happens only after the whitelist that names the v4.4 pairs is deployed.
- FR-8: Every seeded row passes the Scope-A gate; grade-C rows are notes.
- FR-9: v4.5 keeps every v4.4 line except the named edits; retrieval and the grammar block are v4.3's.
- FR-10: The reference-form pass changes no served answer, no exam score, no queue; it is additive and off by default.
- FR-11: The reply draft is created or updated, never sent.

## Non-Goals (Out of Scope)

- Audio recording of gold answers (separate PRD).
- Pooling v4.5, or replacing v4.4 in the pool.
- Adopting tone-marks-always or expanded forms in the served community-form answer.
- Passing the annotator's recorded variety into serving.
- Changing the exam's gold, scoring or the chrF variants.
- Sending or sharing anything (emails, the Google Doc).
- Moving the repos out of iCloud (Halim runs the script).

## Technical Considerations

- The checker is shared by chat (streamWithRepairRound), eval-runs, the exam and the fill; one change, four paths; the replay script is the audit of its effect on stored rows.
- Frozen-exam rows are never rewritten by scripts; the Sep 28 replay showed all 16 repaired frozen rows unchanged, which must still hold after US-001/002 (re-run read-only and record).
- The grammar block serves rows by keyword overlap; row topics must carry the English trigger words (that, because, which, who, said; dialect, variety, Ibaji, Ogugu; sit, seated, here is).
- The reference-form prompt is the first prompt that asks for tone marks everywhere; its static leak check must cover the examples it carries.
- iCloud: warm packages before gates; check `git status` for formatter rewrites of untouched files before every commit.

## Success Metrics

- Pool: three arms, every remaining prompt servable, v4.4 judgments accumulating (chart row 3 non-empty within a week).
- Checker: 0 CLEARED and 0 CHANGED on a read-only replay over v4.4 train rows after the fixes; the review's 11 confirmed findings each have a test.
- Write-up: 100% of its rules in the inventory with a status; every servable rule seeded; v4.5 examined with numbers in Context.md and the changelog.
- Dual layer: 20 samples and a feasibility note delivered; a decision meeting with Salem can be held on them.

## Open Questions

- gwùgwú 'sit': Salem's examples versus 0 hits in the Bible corpus. Seed as a note until the community confirms?
- Does "the model over-predicts complementisers" mean kí where kì belongs, or ki inserted where no clause follows? The prompt line covers both; the inventory flags it for Salem.
- Is yì (presentative FACT particle) attested in community answers? If not, the row is a note.
- Which 20 answers should carry Salem's review of the reference form, and who sends them (Lydia)?
