# Data licensing audit (Phase 1), 2026-10-19

Scope: platform repo madihg/wikitongues-ai (PUBLIC) at main 74197f4, marketing site repo madihg/wikitongues-web-ai (PUBLIC) at 8381d8e, the Supabase project (schema wikitongues), the live app at app.wikitongues.org, and wikitongues.org/resources/ai. Read-only: nothing was deleted, moved or rewritten. Frozen items are named by id only; no Igala text appears in this file.

Method: keyword sweep (licence, CC, ownership, consent, opt-out, export, benchmark, held-out, gold, Waxal, Gates, exclusive, royalty, Hugging Face, publish); inventory of every tracked data-like file; an Igala-text heuristic (dotted vowels) over every tracked file; the repo's own leak checker (scripts/leak-check-files.ts, 139 protected frozen strings plus a 14-entry allow-list) run on every candidate; route-by-route auth check of web/src/app/api; RLS, grants and bucket state read from the database; marketing copy read from source.

Severity: BLOCKER = test-set or community data exposed, or a rule of the decision violated in production. HIGH = personal data or a licensing promise that is wrong. MEDIUM = must change before any licensing. LOW = hygiene.

## A. The test set and community data in the public repo

| # | Where | What it is now | What it must become | Severity |
|---|---|---|---|---|
| A1 | tasks/eval-freeze-v1.json | The frozen benchmark definition: 43 held-out prompt ids with their full question text, per-prompt gold counts and 40 sets of baseline model outputs. Public. Leak check: 1 frozen gold hit (ig_bank_gram_001). | Test-set questions and anything derived from them live only in private storage. Remove from the repo and from history (Halim decision), keep a hash manifest only. | BLOCKER |
| A2 | tasks/rung-a-results.json | Zero-shot and few-shot model outputs on all 43 frozen prompts, plus 8 few-shot exemplars with question and answer text. Leak check: 9 frozen gold items (ig_bank_gram_001, lex_001, lex_003, orth_001, 002, 008, 009, 010, 013). | Same as A1. | BLOCKER |
| A3 | tasks/rung-c-results.json | Fine-tune run record with 5 sample prompts carrying a gold field; leak check 8 frozen items (ig_auth_001, ig_dial_001 and six bank items). | Same as A1. | BLOCKER |
| A4 | tasks/backups/v44-train-cleared-2026-09-28.json, v44-train-regenerated-2026-09-28.json, v44-train-regenerated-2026-10-08.json | Database row backups (model outputs with repair fields) committed as files; leak check 6 and 3 frozen items (lex_003, lex_008, orth_003, 005, 006, 010). | Backups never enter the repo. Move to private storage; gitignore tasks/backups. | BLOCKER |
| A5 | tasks/grammar-evidence-corrections.md, tasks/grammar-evidence-community.md, tasks/igala-grammar-deduced.md | Evidence documents quoting speakers' corrections and cold answers (community data, collected before any licence consent) with annotator attributions; leak check 17, 14 and 15 frozen items. The headers say holdout rows were excluded, yet frozen gold strings still match. | Community-only data never sits in a public repo. Move to private docs; keep English-only, schematised summaries if needed. | BLOCKER |
| A6 | web/prisma/seed-rag-igala.ts | 1,000-plus lines of retrieval rows seeded from code. Header says openly licensed external sources (Igala Wikipedia CC BY-SA, Wiktionary, Koelle 1854). Leak check: 21 frozen items match, almost all one-word answers (ig_bank_lex_001 to 008, orth_001 to 014, ig_dial_001). | Likely false positives on common words, but the file is the "RAG layer as files" described at the Ghana panel. Verify each hit, then decide: keep (external CC BY-SA data, attribution required and currently absent per row) or move to private storage and load at seed time. Add SA-compatible attribution either way. | HIGH |
| A7 | tasks/jwal-ejeba-2023-rule-inventory.md | Rule inventory quoting Ejeba 2023 (a scholarly paper); 7 frozen items match. | Quotes of a copyrighted paper in a public repo are fair-use scale, but the frozen matches must be verified and schematised. | MEDIUM |
| A8 | tasks/salem-lydia-writeup-2026-09-25-inventory.md | Line-by-line inventory of Salem Ejeba and Lydia Wiernik's unpublished write-up. 0 frozen hits. Their copyright; no written permission to republish is recorded. | Ask the authors, or move to private docs. | HIGH |
| A9 | web/Context.md | 1 frozen item (ig_bank_orth_010) in prose. | Schematise the line. | MEDIUM |
| A10 | Git history | Every file above has been in public history since first commit; the reference-form samples were kept out, but the Sep 28 and Oct 8 backups and the rung files have been public for weeks. | Halim decision: rewrite history (BFG or filter-repo, forces every clone to re-pull) or accept exposure and rotate the test set. Not done, not recommended without a decision. | BLOCKER (decision) |

## B. Personal data of contributors in the public repo

| # | Where | Now | Must become | Severity |
|---|---|---|---|---|
| B1 | web/prisma/seed-rag-igala-concord.ts:21, web/src/lib/rag-clean.test.ts:68 | Salem Ejeba's personal email address in source and a test fixture. | Remove the address; cite the paper only. | HIGH |
| B2 | web/src/lib/corrections-onboarding.ts:9-40, web/src/lib/edit-segments.test.ts:18-22 | A named annotator's real corrections used as the onboarding example and as test fixtures, credited by full name and date. No consent to be named. | Synthetic fixtures; credit only with written consent. | HIGH |
| B3 | web/src/lib/export-csv.test.ts:112 | Full name of an annotator in a test. | Synthetic name. | MEDIUM |
| B4 | Context.md, web/Context.md, tasks/editing-ground-spec.md, tasks/grammar-evidence-scholarship.md, tasks/igala-corpus-sources.md | Annotator full names, and in Context.md per-person behaviour findings (tie rates, correction counts, tone-marking habits) from the Oct 13 analysis. | Pseudonymise contributors in anything public; move per-person findings to private notes. | HIGH |
| B5 | web/prisma/seed.ts, seed-prompt-bank-v42.ts, seed-prompt-bank-v45.ts, web/src/lib/personas.ts | Owner email as the seed and owner account. | Acceptable (Halim's own, operational), move to env if convenient. | LOW |

## C. Licensing and ownership claims that contradict the decision

| # | Where | Now | Must become | Severity |
|---|---|---|---|---|
| C1 | web/src/components/annotation-interface.tsx:342-343, 2541-2553 | Two consent checkboxes, both pre-checked true, shown only when the annotator wrote or edited something, labelled "May appear in the public Igala benchmark" and a training equivalent. Stored as consentBenchmark and consentTraining on ColdAuthorAnswer and OutputEdit. Pre-selected consent, no versioned text, no hash, no withdrawal path, no tier, no commercial or cross-border or cloning consent. | Section 7 consent flow: nothing pre-selected, explicit per-item tier, versioned text with hash, withdrawal explained first; default COMMUNITY-ONLY. | BLOCKER |
| C2 | web/prisma/schema.prisma (ColdAuthorAnswer, OutputEdit, PairwiseComparison, RubricAxisScore) | consentBenchmark and consentTraining default true; no tier, no consent id, no funding source, no community, no opt-out. PairwiseComparison and rubric rows carry no consent at all. | Phase 3 data model; existing rows become community_only with a retrospective-consent flow. | BLOCKER |
| C3 | tasks/speech/prd-igala-speech-tts-first-2026-10-19.md (PR #77, unmerged) | "Wikitongues owns the data and releases it CC-BY-4.0"; consentRelease named "CC-BY-4.0 release"; manifest licence string "CC-BY-4.0"; Waxal cited as the template. | Rewrite per the decision (Phase 2). | HIGH |
| C4 | tasks/speech/research-igala-speech-methodology-2026-10-19.md (PR #77) | Recommends "CC-BY-4.0 with partner-retained ownership as the path of least resistance". | Add a dated note that the recommendation was rejected and why (section 8). | MEDIUM |
| C5 | Context.md (Oct 19 section, PR #77) | Records the decision "Wikitongues owns, CC-BY-4.0". | Supersede with the Oct 19 licensing decision. | MEDIUM |
| C6 | README.md:99 "## License: MIT" (no LICENSE file in either repo) | A one-word MIT statement with no licence file; nothing says it covers code only. | Keep MIT for code (section 9: existing licence kept); add LICENSE (MIT, code only) and DATA_LICENSE.md. Site repo has no licence at all: propose Apache-2.0 or MIT, ask Halim. | MEDIUM |
| C7 | Site: content/en/faq.ts "Who owns the data" (draft): "The community does ... own what we build together"; content/en/site.ts:44 "own what is built" (live); faq "Is the data open source or proprietary?" (draft): "still open". | Ownership language conflicts with speaker copyright; the open question is now decided. | Approved wording: "Speakers keep the rights to what they record and write. They choose whether it stays with their community, is shared openly, or is licensed to AI labs, and they are paid." | HIGH |
| C8 | Site: content/en/research.ts:41-46 | Waxal presented as "the kind of community-rooted resource" to emulate, tagged CC-BY-4.0. | Keep as a reference, drop the endorsement of the licence model. | LOW |
| C9 | Site: content/en/howItWorks.ts:256 and the public How-it-works page | Describes speakers' answers and corrections being packed into the prompt (true, and allowed as the community's own retrieval layer), and the public chat exposes model output built on them to anyone. | Fine under COMMUNITY-ONLY as long as raw rows are never returned; state it in the data page. | LOW |
| C10 | wikitongues.org/resources/ai | 404; the WordPress connector exposes only the Revitalization Resources cards (list and add). No AI claims found there. | Nothing to fix now; any future card uses the approved wording. | LOW |

## D. Access control and exposure

| # | Where | Now | Must become | Severity |
|---|---|---|---|---|
| D1 | web/src/app/api/auth/register/route.ts:5-18 and the /register page | Public self-registration; anyone can create an ANNOTATOR or LEARNER account. An annotator account sees prompts, model outputs and can submit judgments and corrections. | Invite-only or researcher-approved accounts; at minimum no self-assigned ANNOTATOR. | HIGH |
| D2 | web/src/app/api/chat/route.ts | Unauthenticated, IP rate limited (10 per minute). Serves model answers built with community corrections in the prompt. Returns generated text only. | Acceptable; confirm no raw retrieval rows are echoed (reference-form block is model output). | LOW |
| D3 | web/src/app/api/public/stats and method-metrics | Counts and ids only (annotatorId, no names, no text), verified in code and in the live payload keys. | Keep; add to the "scores only" principle. | LOW |
| D4 | web/src/app/api/admin/export/[type], api/arena/export, scripts/export-annotation-review.ts, scripts/_snapshot (local only) | Researcher-gated exports of full text including gold, corrections, judgments with names (export-csv labels annotators by name). No tier check, no consent check beyond consentTraining in sft-source.ts, no access log. | Phase 5: tier, consent, allow-list and is_test_set gates on every export path; per-download logging; pseudonyms by default. | HIGH |
| D5 | Database: all 27 tables in schema wikitongues have RLS off and zero policies. anon and authenticated roles hold no grants on the schema and the PostgREST exposed-schema setting is default (public), so the data is not reachable through the Supabase API today. Access is via the wikitongues_app role from the Next.js server only. | Not exposed, but one misconfiguration away. | Phase 5: RLS on every data table with deny-all policies; keep the service role path. | MEDIUM |
| D6 | Storage buckets | Three public buckets exist in the project (becoming-border-crossings, hatchings_eyes, offerings); none hold Wikitongues data. No speech bucket yet. | New buckets private only; signed URLs. | LOW |
| D7 | Vercel | Preview deployments of every PR branch are public URLs of the full app (login-gated pages, public chat and stats). | Acceptable; preview URLs must not be shared outside the team. | LOW |
| D8 | Hugging Face | No dataset or space is published by this project. tasks/igala-corpus-sources.md lists external HF datasets (dalaone/eng_igl_bible flagged as a licence trap, ec5ug/chikhapo). | Nothing to fix. | LOW |

## E. Existing data (section 7, EXISTING DATA)

All rows collected to date (1,547 judgments, 1,465 cold answers, 249 corrections, 1,181 axis scores on the Oct 13 snapshot) were gathered under the pre-checked "public benchmark" and "training" checkboxes or no consent control at all (judgments and scores). Under the decision they are COMMUNITY-ONLY until each contributor gives retrospective consent. The GRN audio is third-party material under a project-scoped signed agreement (data/audio/grn-igala/PROVENANCE.md): never OPEN, never LICENSED, redistribution not covered.

## F. What exists that the decision can build on

- consentBenchmark and consentTraining fields and the sft-source.ts guards (demo, consent, holdout): the right shape, wrong defaults, too few dimensions.
- The leak checker and the frozen-exam Scope-A gates: the test set is protected in serving; the gap is the repository, not the serving path.
- requireResearcher gating on every export route and researcher-only Corrections lane.
- /api/public routes already return numbers and ids only (evaluation-as-a-service in spirit).

## G. Proposed remediation (needs Halim's yes before anything in A or B moves)

1. Create a private storage location (private GitHub repo or Drive folder plus Supabase bucket) and move A1 to A5, A8 there; replace each with a stub naming where it went.
2. Add .gitignore rules: tasks/backups/, tasks/*-results.json, data/**/*.json (except synthetic samples), web/prisma/*.local.ts.
3. Replace B1 to B3 with synthetic fixtures; pseudonymise B4.
4. Decide on history (A10). Default proposal: rotate the 43-item test set after the public copies are removed, rather than rewrite history, because the benchmark has been public since July and a rewrite still leaves forks and caches.
5. Phase 2 to 7 as planned, all on this branch, PRs only.

## H. Third-party text in the public repo (addendum of 2026-10-19)

Rule from Halim: third-party text sits in private storage only. Permissions (Bible Society of Nigeria via Lydia Wiernik, GRN, authors) were granted to Wikitongues for internal use, not for republication, and the policy treats all third-party text as restricted until cleared. Every row below is a BLOCKER for that reason; none is deleted or rewritten without Halim's yes.

| # | Where | What it is now | What it must become | Severity |
|---|---|---|---|---|
| H1 | web/prisma/seed-rag-igala.ts | About 1,000 lines of retrieval rows seeded from code: Igala Wikipedia prose (CC BY-SA 4.0), Wiktionary, Koelle 1854 via Lexibank (CC BY), ASJP and Glottolog (CC BY), chikhapo lexicon (MIT), three African Storybook titles (CC BY), plus project-written entries. Attribution is in each row's source column. Legal to publish under those licences, but it is third-party text in the public repo and a BY-SA block can never travel inside a LICENSED package. | Move the data to private storage (JSON loaded at seed time); keep only the loader in the repo. Tag every row source_type third_party, rights_status restricted until cleared, source_license as listed. | BLOCKER |
| H2 | web/prisma/seed-rag-igala-concord.ts | Four retrieval rows paraphrasing Ejeba (2023), a CC BY-NC 4.0 JWAL article; header says cited and described, never copied. Also carries the author's personal email (see B1). | Derived from an NC source: source_type derived, inputs restricted; move content to private storage; remove the email. Flag the paraphrase-versus-excerpt line for counsel. | BLOCKER |
| H3 | tasks/jwal-ejeba-2023-rule-inventory.md | Line-by-line inventory of Ejeba (2023) with 305 dotted-vowel characters of Igala example material and 7 frozen-item matches. | Private storage. | BLOCKER |
| H4 | tasks/grammar-evidence-scholarship.md | Deep read of every accessible Igala document (papers, JSTOR-hosted and journal PDFs) with paradigms as tables; says prose is paraphrased with attribution. | Private storage (internal research use only under the sources' terms). | BLOCKER |
| H5 | tasks/salem-lydia-writeup-2026-09-25-inventory.md | Inventory of Salem Ejeba and Lydia Wiernik's unpublished write-up (their copyright, no republication permission recorded). | Private storage, or written permission from both authors. | BLOCKER |
| H6 | web/prisma/seed-rag-v4-3-grammar.ts, seed-rag-v4-5-grammar.ts, web/src/lib/generation-prompt-v4*.ts, web/src/lib/prompt-bank-v45.ts | Derived artifacts: grammar rules and prompt text written in our words from Ejeba (2023), the write-up and community corrections. Public today, hash-pinned on the marketing site. | Per the addendum these are source_type derived and inherit the most restrictive input (restricted). Decision for Halim: the method (rule templates, prompt skeleton) stays open; the Igala-specific rule content moves to private storage and is loaded at build or runtime. The site's verbatim prompt copy (content/en/igalaPrompts.ts) follows the same decision. | HIGH (decision) |
| H7 | tasks/prompt-bank-v45-evidence-2026-10-08.md, tasks/rag-design.md, tasks/igala-corpus-sources.md | Evidence and design documents quoting model Igala and schematised community material; 0 frozen hits after the Oct 8 schematisation, but they are derived from community judgments and name sources under permission. | Private storage, or English-only summaries. | HIGH |
| H8 | Bible sentence pairs | Not in the repo: ingested into ParallelPair (30,907 rows) from the Bible Society of Nigeria's IGL70 text under a permission recorded 2026-08-12 (web/prisma/ingest-bible-parallel.ts header: written terms held by Wikitongues, confirm before any public release). No committed file quotes verses. | Rows tagged third_party, restricted, source_ref IGL70; never exported; permission scope confirmed in writing before any derived artifact built on them leaves the community layer. | HIGH |
| H9 | GRN "Words of Life" audio | Not in the repo (gitignored); provenance file only. Project-scoped signed agreement, non-commercial terms. | third_party, restricted; never OPEN or LICENSED. | MEDIUM |

Scope note (addendum): every finding in sections A to E applies to text contributions as much as to speech: gold answers, prompts, corrections, preferences, confidence ratings, annotations, dialect tags, transcriptions and translations. All existing text is COMMUNITY-ONLY until retrospective consent; the original terms (pre-checked benchmark and training boxes) are recorded on the rows by the Phase 3 backfill.

## Halim's decisions (2026-10-19, after reading this audit)

- A10 history: HIDE it. Rewrite history to purge the files in sections A, B and H; do not rotate the 43-item test set (continuity of the exam matters more); remove the files from the tree now. The force-push itself happens only after Halim says "push" on the exact plan.
- Private storage: Supabase for anything the app loads; a private repository for documents the team reads. Nothing drastic: loaders replace seeds, pages keep working.
- H6: method open, Igala content private. The Igala-specific rules and prompt text leave the public repo and load from private storage; the marketing site shows the method, not the Igala prompt.
- Code licences: MIT on the platform (as the README states), Apache-2.0 on the site. These cover code only, never language data.
- D1 accounts: invite-only; only Halim creates accounts (researchers, Agnes and Salem included, cannot invite).

## Decisions still open

- A10 history: rewrite, or rotate the test set, or accept.
- A6: keep the external-source retrieval seed in the public repo with attribution, or move it.
- A8: ask Salem and Lydia for permission to keep their inventory public, or move it.
- C6: add LICENSE (MIT, code only) to the platform repo; pick a code licence for the site repo.
- D1: how new annotator accounts are created from now on.
- H6: whether the Igala-specific grammar rules and prompt text (today public and hash-pinned on the site) move to private storage, leaving only the method templates public.
- H1 to H5: confirm the move of all third-party text to private storage and name the storage (private repo, Drive, or Supabase bucket).
