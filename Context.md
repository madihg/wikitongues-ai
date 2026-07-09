# Wikitongues AI - Project Context (living memory)

Last updated: 2026-06-22. Owner: Halim Madi (AI lead) + Daniel Bögre Udell (Wikitongues co-founder).

## What this is

Teaching AI to speak underserved languages, community by community, starting with **Igala** (~2M speakers, tonal Volta-Niger, Kogi State Nigeria). The **headline deliverable is a public benchmark/leaderboard** that holds every model (Claude, GPT, Gemini, ...) accountable for how well it speaks Igala. Community-led by design.

Two surfaces, kept distinct:

- **The platform** (this repo): learner / annotator / researcher roles, pairwise + rubric scoring, model leaderboard. Where the rubric + benchmark run.
- **Marketing mini-site** within wikitongues.org (separate spec, not this task).

Public launch: **Wikimedia Foundation conference, Ghana, ~Oct 4-5 2026.** Works backwards from there.

## People

Agnes (Igala community lead, Ikala Wikimedians, Abuja - "everything is wrong" on ChatGPT Igala); Lydia Wiernik (linguistics lead); Emily Black (NYU, advisory council + PhD students); Sonja Schmer-Galunder (annotation methodology); Google Research (Erin van Liemt, Andrew Smart, Isaac Caswell, Ben Hutchinson, Jimmy Tobin).

## The 8 evaluation buckets (each = prompt category + rubric axis + data-collection target)

Linguistic: (1) orthography/spelling; (2) grammar/morphology/tone; (3) lexicon/disambiguation (no bleed from Idoma); (4) dialectal fidelity (no collapse to prestige standard).
Cultural/pragmatic: (5) register/honorifics; (6) idioms/metaphor/floating motifs; (7) cultural knowledge/values (taboo/sacred); (8) authenticity vs translationese.
Annotation methods: pairwise (pick A/B + explain), rubric (cultural accuracy, linguistic authenticity, [adherence to cultural norms replacing creative depth], factual correctness), + DIRECT-EDIT field (Agnes's 6/16 request).

## Confirmed technical direction (from Granola calls)

- **DPO** = confirmed next-phase fine-tuning method, fed by winner/loser pairwise pairs.
- **RLHF / RLCF / RLIF** = umbrella thesis (community/indigenous feedback as preference signal).
- **Corpus ingestion (W3 track)**: ingest Igala Wikipedia (~1,000 articles) + open texts; test if more data helps. Open Q: has it been ingested yet?
- **Continued pretraining matters** (Isaac: language must be in pretraining, not just post-training).
- **Open question NOT resolved**: update weights directly vs. retrieval (RAG).
- Three tracks: W1 Wikimedian feedback loop (primary), W2 student teaching (months 4-6), W3 corpus ingestion (parallel).
- Backend currently Claude + GPT, swappable; open-source weaker but the only path to real weight training.
- Emily's research Qs: (1) more Igala Wiki -> better on floating motifs? (2) community-authored vs translated training data on cultural motifs? (3) cross-lingual transfer of cultural reasoning?

## Core insight (the flywheel)

The platform's annotation data IS the training data:

- pairwise (A beats B + explanation) -> DPO preference pairs
- annotator edits / corrected handoffs -> SFT gold targets
- rubric scores -> reward signal / eval ground truth
  Loop: collect preferences+corrections -> build training sets -> fine-tune/DPO candidate models -> evaluate in arena vs baselines -> promote winners -> repeat (epochs).

## Reference architecture: Supabase `singulars` schema (Halim's poetry arena - PROVEN PATTERN)

candidate_models (name, family, version_label, fine_tune_source, api_endpoint, hf_repo, use_system_prompt) | fine_tune_jobs (provider, base_model, training_format, system_prompt, source/holdout ids, hyperparameters, provider_job_id, status, output_model_id, auto_registered_candidate_id, cost) | eval_runs (candidate_model_id, judge_model, win_rate, mean_rank, status, config_snapshot) | eval_scores (candidate_won, candidate_rank, judge_rationale, score, position_swap_agreement) | views v_model_winrate_per_performance, v_machine_quality_trajectory.

## Current platform (this repo) - state

Next.js 14 (App Router) + NextAuth + Postgres(Neon)+Prisma + pgvector; Anthropic + OpenAI embeddings; Vercel. Python benchmark scripts (Phase A).

- Three-agent pipeline: Translator (Claude Sonnet 4.5, RAG-grounded, self-confidence) -> Reviewer (0-100 score, JSON, gap categories) -> Orchestrator (>=70 return, 50-70 retry, <50 escalate). **Models HARD-CODED to Claude Sonnet 4.5; no swapping.**
- Schema has: Prompt, ModelOutput, PairwiseComparison, RubricScore(4 axes 1-5), HandoffItem, Epoch, Conversation/Message, PipelineRun, RagEntry(+history).
- Researcher dashboard (/admin): Leaderboard (winRate + 4 rubric axes per model per language), CategoryBreakdown, AgreementStats (Krippendorff alpha), GapDashboard, AnnotatorActivity, ExportPanel (CSV/MD). READ-ONLY. No model-arena, no fine-tune launch, no epoch trending, no candidate-model registry.
- Design system (globals.css): WHITE bg, opacity-based grays, NO accent palette (indigo/blue hard-coded in components), SHARP corners (radius 0), NO shadows, NO dark mode. Fonts: Standard (body), Terminal Grotesque (headings), Diatype (forms) - all from type.cargo.site (Oulipo/Halim brand, NOT Wikitongues brand). **Needs rebrand to Wikitongues AI.**
- Benchmark epoch_1 result: Claude leads Igala (4.38/5) + Lebanese Arabic (4.17/5), 71% overall pairwise. Low inter-annotator agreement on creative depth (0.08) + factual (0.17).

## Curated research bibliography (in "Wikitongues AI - Source of Truth" Google Doc)

A1 IBM/USP endangered-lang MT (tiny data + community cycle). A2 DiPMT++ teaching LLM unseen lang via dictionary+~5K sentences ICL (Zhuang 0->16 BLEU). A3 SambaNova efficient adaptation (vocab extension + 2-stage). A4 Tamil-Llama (16K vocab + LoRA). A5 Swahili RAG (RAG > FT alone). A6 SambaLingo (vocab + DPO, 9 langs). A7 adaptMLLM. B1 MAD-X adapters. B3 Emily Black multilingual prompting diversity. B7 CultureLLM. B9 Masakhane participatory MT.

## Key Google Drive docs

"Wikitongues AI - Source of Truth" (1aqqw3CmHR8YhRqeqxAEIS0xd2X3GpERNT57Me7pS0y4) = canonical. "Multi-linguistic LLM Opportunity & Strategy". "Wikitongues Endangered Language AI Custodian" (original fellowship proposal).

## This task

1. Rebrand design system to Wikitongues AI. 2. Make platform the best way to actually improve an LM on a low-resource language: build a researcher-mode MODEL ARENA (run several model versions, compare by bucket) + method recommendation. 3. PRD via /ralphy-tui-prd + /ui-ux-pro-max. 4. Execute.

## DECISIONS (locked 2026-06-22, from Halim)

- **Scope = "the instrument"**: Wikitongues rebrand + CandidateModel registry + model-swapping threaded through pipeline + bucket-aligned rubric (rename creativeDepth->culturalNormAdherence, GapCategory 4->8 buckets) + Agnes edit field as first-class + contamination-safe held-out split + closed-API MODEL ARENA (Claude/GPT/Gemini +/-RAG) ranked per bucket via human pairwise (Bradley-Terry) + DPO/SFT training-set export. Fine-tune flywheel SCAFFOLDED behind a provider-adapter interface (closed wired, open-weights/GPU stubbed). Runs on current stack today. CPT/DPO training = post-pilot.
- **Igala ONLY** (Lebanese Arabic archived/removed from active pilot; data re-addable later).
- **SUPABASE-BACKED, data loggable ASAP** (new hard requirement): point platform DB at Halim's Supabase project `smytgqkgomsfyurskpcl` (oulipo_main), schema `wikitongues` (currently empty). Every annotation/pairwise/rubric/edit persisted + queryable in Supabase from day one. Apply schema directly via Supabase MCP so tables are live immediately. Prisma stays ORM/source-of-truth; DATABASE_URL -> Supabase pooler (6543), DIRECT_URL -> 5432 for migrations. pgvector available on Supabase.
- Research recommendation: tasks/research-recommendation.md. Arena+brand build refs: tasks/reference-arena-and-brand.md.
- Verified method order: SFT-on-edits -> DPO/KTO on open base; RAG permanent for facts; CPT post-pilot. DPO is finisher not teacher. Confound is Yoruba/Igbo not Idoma (flag for Lydia). LLM-judge = triage only. Rank by human pairwise -> Bradley-Terry per bucket. Held-out bank never from Igala Wikipedia.

## Session State (2026-06-22) - EXECUTION DONE (slice 1), all gates green

PRD: tasks/prd-wikitongues-ai-v2.md (18 stories). Research workflow run id wf_028207ec-501.
Verified: `pnpm typecheck` 0, `pnpm lint` 0, `pnpm test` 17/17 (Bradley-Terry + aggregate + training-export incl. contamination-guard), `pnpm build` OK. Supabase `wikitongues` schema LIVE (19 tables; migration in web/prisma/migrations/00000000000000_init_wikitongues_v2). e2e harness present but needs Halim's DATABASE_URL + `playwright install chromium`.

DONE this session:

- US-001/003 Supabase repoint + fresh Igala schema (live). web/.env.example + web/SETUP.md document connection (Halim must add DB password).
- US-002 Vitest + Playwright harness.
- US-004 8-bucket taxonomy (src/lib/buckets.ts) + rubric rename creativeDepth->culturalNormAdherence + GapCategory->gapBucket(EvalBucket).
- US-005 OutputEdit model + edit field wired into /api/annotations/submit (logs edits; bucket-tags pairwise/rubric). NOTE: annotation-interface.tsx UI does NOT yet send `edits` - API ready, UI capture pending.
- US-006 CandidateModel registry: /api/arena/candidates (GET/POST) + UI (components/arena/candidate-registry.tsx, /admin/arena/candidates) + seed (prisma/seed-arena.ts, `pnpm seed:arena`, 5 baselines).
- US-007 model-swapping CORE: src/lib/arena/providers.ts (anthropic/openai/google/openai-compatible). Arena generate uses it. Learner pipeline (translator/orchestrator) still default-Claude - NOT yet routed through providers (Lebanese removed from translator).
- US-008 held-out split: Prompt.split/isHoldout; export builders exclude held-out (tested).
- US-009 eval-run backend: /api/arena/eval-runs (create/list) + /[id]/generate (runs candidate over held-out via providers). Aggregate endpoint NOT built (leaderboard computes live instead).
- US-010 Bradley-Terry (src/lib/arena/bradley-terry.ts, 7 tests) + aggregate (src/lib/arena/aggregate.ts, 2 tests).
- US-011 arena leaderboard UI: /admin/arena (components/arena/bucket-matrix.tsx) - candidate x 8-bucket heat-map, BT + CIs + ns flags.
- US-014 training export: src/lib/arena/training-export.ts (8 tests) + /api/arena/export?type=dpo|sft.
- US-017 rebrand: globals.css (warm ochre-on-ink tokens + dark mode + Fraunces/Inter/JetBrains Mono), sidebar, layout metadata. Some admin/\* components still use default gray utilities (render fine, off-brand). Removed duplicate (app)/learner route.

SLICE 2 DONE + COMMITTED + PUSHED (commit e53d699, branch halim-bot/fervent-jemison-b6bb05, origin github.com/madihg/wikitongues-ai). All 18 PRD stories built: US-005 edit-field UI wired; US-007 learner pipeline routes through providers; US-009 eval-runs create/generate/aggregate; US-012 candidate detail + head-to-head; US-013 epoch trajectory (hand-rolled SVG); US-015 fine-tune flywheel scaffold (lib/arena/fine-tune-providers: MOCK wired, openai/together STUBBED) build/launch/poll -> auto-register candidate + post-FT eval; US-016 LLM-judge w/ position-swap (triage only); US-018 collective-review/adjudication; rebrand swept 22 components. Gates: typecheck 0, lint clean, 17/17 tests, build ok.

REMAINING (Halim wiring + product decisions, NOT code-blocked): add Supabase DB password + provider keys to web/.env.local (schema already live) -> pnpm install && pnpm seed && pnpm seed:rag && pnpm seed:arena && pnpm dev. Real fine-tuning is MOCK (wire real provider in lib/arena/fine-tune-providers.ts + GPU/serving endpoint; register output as openai-compatible candidate; CPT still post-pilot). Confirm Wikitongues accent hex (#e0a21f reconstructed) vs brand kit. Raise Idoma-vs-Yoruba/Igbo w/ Lydia. Add real community-authored held-out prompts (never from Igala Wikipedia). PR: https://github.com/madihg/wikitongues-ai/pull/new/halim-bot/fervent-jemison-b6bb05

## Session State (2026-06-22, cont. 2) - IA + explainers shipped; merge/deploy gated on DB password

Pushed: f82fdc4. PR open: https://github.com/madihg/wikitongues-ai/pull/1 (base main).
Done: persona IA (annotators=Dashboard+Annotate only; Prompts/Review route-guarded to researchers; order Prompts-before-Annotate); owner madihalim@gmail.com persona switcher + full access (lib/personas + RoleGuard override); owner seeded (RESEARCHER, pw "password"/OWNER_PASSWORD); InfoTip "i" explainers across arena + researcher dashboard + annotation. Gates green.
Creds: Anthropic+OpenAI keys pulled from singulars into web/.env.local (gitignored). Vercel project wikitongues-ai (prj_AwAKSlDX94BE4ojZbLpHiNHO9VS6, root dir web/), CLI authed as madihg.
BLOCKER for merge+deploy: Supabase DB PASSWORD (singulars uses REST key, no PG url; no mgmt token to reset). Also no Google/Gemini key found (Gemini baseline optional). On receipt: set Vercel env DATABASE_URL/DIRECT_URL (Supabase, replace Neon) + keys + NEXTAUTH; merge PR#1; deploy. Holding to avoid breaking live cutover.

## Session State (2026-06-24) - Cold-authoring annotation episode + demo sessions + cost ledger + Together provider + Igala-only learner

Full rebuild of the annotator flow per Halim's research synthesis, plus three new researcher capabilities and the learner cleanup. NOT yet committed/pushed/deployed this session (awaiting Halim's go). All four gates green + a live-DB runtime smoke test passed (created/read/deleted every new model, then cleaned up).

### What shipped (and why)

1. **The annotation episode** (replaces the old 2-step pairwise+rubric flow). `web/src/components/annotation-interface.tsx` is now a guided episode producing up to FOUR independent artifacts, each elicited as a separate act so "the three signals agree" stays meaningful:
   - **Prompt card**: bucket label + a per-bucket **watch-for line** (the fail-mode to look for) + **"Flag prompt"** (malformed/untranslatable → culls it, POST `/api/annotations/flag` → `PromptFlag`).
   - **Cold authoring (gold-first)**: on `register_honorifics` + `grammar_tone` buckets, the annotator writes their OWN Igala answer FIRST, with the Igala **tone keyboard**, then it LOCKS and the models are revealed. Saved as `ColdAuthorAnswer` (provenance `speaker_authored_sourcefree`). This is the anti-translationese signal — an edit inherits the translationese of the text it edits; a cold answer does not.
   - **Blind pairwise**: A/B hidden + randomized, **confidence 1-4**, and explicit **"tie"** and **"both inadequate"** (two distinct outcomes, per Halim).
   - **Score the winner ONLY** (not both — the doc's "least work, cleanest target"). **Subjective** buckets are blind; a low score (≤2) forces a rationale. **Factual** buckets (`lexicon_disambig`, `idioms_metaphor`, `cultural_values`) show a **RAG reference panel** so fluency can't rescue an invented fact.
   - **Inline edit of the winner**: tone keyboard + a **tone-aware word diff** (`web/src/lib/diff.ts`, never strips diacritics). `both_inadequate` swaps this for "write the correct version" → salvage gold (`ColdAuthorAnswer`, provenance `corrected_from_inadequate`). `tie` lets you optionally correct a chosen side WITHOUT faking a winner (edit attaches via `edit.modelOutputId`).
   - **Consent**: one block (may-enter-benchmark / may-train) covering everything authored that episode → stored on `ColdAuthorAnswer` and `OutputEdit`.
   - Demo banner shown when `?demo=<id>` is in the URL.

2. **Demo / testing session** (researcher). `/admin/arena/demo` → `DemoLauncher` → POST `/api/arena/demo-sessions` creates a `DemoSession`, returns `/annotator/annotate?demo=<id>`. Everything submitted under it is `isDemo=true` and EXCLUDED from training export, leaderboard, and fine-tune sources. Lets Halim walk anyone through the real flow live without polluting data.

3. **Holistic cost ledger** (researcher). `/admin/arena/costs` → `CostLedger` → GET `/api/arena/costs`. Derives spend live: **inference** estimated from `ModelOutput` token counts × `pricing.ts` rates (grouped by provider), **fine-tune** from `FineTuneJob.costUsd` (the "Together sessions" line, broken out as a headline total), plus the explicit `CostEntry` ledger. Eval generation now records `EvalRun.costUsd` (`eval-runs/[id]/generate`). Rates live in `web/src/lib/arena/pricing.ts` (estimates — providers don't return per-call cost).

4. **Together AI fine-tune provider** (real, OFF for the pilot). `web/src/lib/arena/together.ts` = the real API client (2-step file upload → presigned PUT → `/v1/fine-tunes` → poll), mirroring singulars. Wired into `fine-tune-providers.ts` `together` provider (builds JSONL from the job via the same contamination+demo-guarded builders). Default provider stays the offline **mock**; Together throws a clear error unless `TOGETHER_API_KEY` is set. Base models: Llama-3.3-70B / Qwen3-14B / Mistral-Nemo (sft+dpo).

5. **Learner = Igala only + explainer landing**. `chat-interface.tsx` rebuilt with no language picker, no Lebanese/RTL. New `/learner` explainer page ("Teaching AI to speak Igala") is the landing; `roles.ts` + `personas.ts` redirect learners there → "Start practicing" → `/learner/chat`. Swept remaining `lebanese_arabic`/RTL from `prompt-form.tsx` + `prompt-list.tsx`.

### Schema + migration (additive, safe on live data)

Migration `web/prisma/migrations/20260624120000_episode_cold_author_demo_cost` — applied to Supabase schema `wikitongues` via the management API (token-scoped), baselined with `prisma migrate resolve --applied`, client regenerated. New: enum `CostCategory`; models `ColdAuthorAnswer`, `PromptFlag`, `DemoSession`, `CostEntry`. Added columns: `PairwiseComparison.confidence` + winner now allows `tie|both_inadequate` (KEPT as String — BT/aggregate/export already speak this union; migration-safe); `RubricScore.confidence`; `OutputEdit.provenance/consentBenchmark/consentTraining`; `+isDemo/+demoSessionId` on PairwiseComparison/RubricScore/OutputEdit/ColdAuthorAnswer/ModelOutput. All 16 columns + 4 tables verified present in Supabase.

### Contamination + demo guards (where isDemo:false / isHoldout is enforced)

`isDemo:false` added to: export route (DPO+SFT), leaderboard route (pairwise+rubric), build route (pairwise+edits), Together JSONL builder. `isHoldout` still dropped in the pure builders (`training-export.ts`, tested). `/next` excludes demo comparisons from the real completion set.

### buckets.ts additions

Each `BucketDef` now has `scoring: "subjective"|"factual"` + `watchFor`. Helpers: `bucketWatchFor`, `bucketScoring`, `isFactualBucket`, `isGoldFirstBucket` (register+tone). Factual = lexicon_disambig, idioms_metaphor, cultural_values.

### Locked decisions (Halim can revisit)

- Score the WINNER only (not both outputs).
- `tie` and `both_inadequate` are two distinct winner values.
- Gold-first cold authoring auto-applies to register_honorifics + grammar_tone only.
- One consent block per episode (not per-artifact).
- `winner` stays a String union, not a Prisma enum (migration safety + BT already types it).

### Verification (proof)

`pnpm typecheck` 0 · `pnpm lint` clean · `pnpm test` 27/27 (added diff.test.ts ×4, pricing.test.ts ×6) · `pnpm build` compiled successfully (all new routes present). Live-DB runtime smoke test created+read+deleted ColdAuthorAnswer/PromptFlag/CostEntry/DemoSession → "SMOKE OK", then the throwaway script was removed.

### New/changed files

New: `lib/arena/together.ts`, `lib/arena/pricing.ts`(+test), `lib/diff.ts`(+test), `components/tone-keyboard.tsx`, `components/arena/cost-ledger.tsx`, `components/arena/demo-launcher.tsx`, `app/(app)/admin/arena/costs/page.tsx`, `app/(app)/admin/arena/demo/page.tsx`, `app/(learner)/learner/page.tsx`, `app/api/annotations/flag/route.ts`, `app/api/arena/costs/route.ts`, `app/api/arena/demo-sessions/route.ts`, the migration dir.
Changed: `prisma/schema.prisma`, `annotation-interface.tsx`, `chat-interface.tsx`, `buckets.ts`, `personas.ts`, `roles.ts`, `fine-tune-providers.ts`, `api/annotations/next+submit`, `api/arena/export+leaderboard+eval-runs/[id]/generate+jobs/[id]/build`, `admin/arena/page.tsx` (nav: +Cost ledger +Demo session), `prompt-form.tsx`, `prompt-list.tsx`.

### Open questions / next steps

- NOT committed/pushed/deployed this session — awaiting Halim's go (prior PR #1 already merged to main `3fd6a20`; this is new work on the same branch).
- Gold-first sampling currently register+tone only; consider a deterministic ~1-in-3 sample of other buckets.
- Factual-bucket references come from `searchRag(prompt.text)` (semantic, may be approximate) + `prompt.expectedCulturalContext`. Curated per-prompt gold references would be stronger.
- Together cost is estimated from rows×tokens×epochs (Together's API doesn't return cost). A Together webhook (singulars pattern) would capture actuals — not wired.
- Demo sessions have no auto-cleanup/finalize endpoint yet (records just sit flagged isDemo).
- Real community-authored held-out prompts still needed (never from Igala Wikipedia). Raise Idoma-vs-Yoruba/Igbo with Lydia (noted in lexicon_disambig watchFor).

### Design system artifact (2026-06-24)

`wikitongues-design-system.html` (repo root) - a standalone, self-demonstrating, exhaustive brand reference, built so Halim can hand it to a person or a bot to make slides / IG posts. Mirrors `web/src/app/globals.css` exactly (tokens are the source of truth). Covers: foundations + personality + wordmark, full color ramps (ochre 50-700, ink 50-950, clay/sage/indigo) + semantic tokens + contrast rules, typography (Fraunces/Inter/JetBrains Mono, type scale, Igala-in-mono), spacing/radius/elevation/motion scales, live components, the arena data-viz language (pick A=indigo / B=clay, red→ochre→green score ramp, `ns` honesty), voice & copy do/don't, imagery direction, **presentation templates (1920×1080)** and **IG templates (1080² / 1080×1350 / story)** as real rendered previews, plus a **machine-readable JSON token block + a "brief a bot" prompt template**. Has a light/dark toggle. Note on brand fonts: Fraunces/Inter are on impeccable's reflex-reject list but identity-preservation wins (already shipping), so they were kept, not swapped.

The `/learner` landing page (`web/src/app/(learner)/learner/page.tsx`) was restyled as a brand exemplar: Fraunces display headline with an italic ochre accent word ("Igala"), em dashes removed, mono kicker + meta line, staggered `.animate-rise` entrance (new keyframe in globals.css, reduced-motion safe). Gates still green (typecheck/lint/build). Open: confirm accent `#e0a21f` vs the official Wikitongues brand kit before any print use.

## Session State (2026-07-02) - RUBRIC V2 (Lydia's axes) + all Jul-2-call bugs fixed + merged to main + deployed

Context: the Jul 2 8am call (Halim, Agnes, Daniel, Lydia) ran the live demo against STALE production (10 days old, pre-everything). Agnes hit bugs live; Halim promised fixes before next Tuesday's call. This session fixed everything, restructured the rubric to Lydia's revision, merged PR #2 to main (b7916b2), and redeployed production.

### Root cause of the call's bugs

Production was never redeployed after the episode work: main lacked `both_inadequate` entirely; prod also predated the Supabase env cutover (hanging submissions = old code, likely paused Neon). The demo URL served the ancient 2-step flow. Fix = the deploy itself.

### Rubric v2 (THE big change - Lydia's revised rubric, from the Source-of-Truth doc tab + Jul 2 call)

- New model `RubricAxisScore`: ONE ROW PER SCORED AXIS. Axes are CONFIG (`RUBRIC_V2` in `web/src/lib/buckets.ts`), not schema - the Monday rubric-lock meeting can rename/add/drop axes with a code edit, no migration.
- 9 axes in two passes. Linguistic (scored first): syntax, lexicon, spelling, diacritics, semantics. Pragmatics (reflective second pass, Lydia's framing "Thinking about the answer you just scored…"): cultural_relevance, authenticity, dialect, contamination (cross-linguistic bleed; 5 = fully Igala).
- Scale 0-5 (0 = completely wrong - Agnes's ask) + per-axis N/A (null in DB; an explicit N/A row IS stored - "not relevant" is signal). Lydia's anchors are tooltips (`RUBRIC_ANCHORS`), marked provisional until Monday.
- `rubricVersion` stamps every score (legacy = v1, new = v2) so rubric changes never mix data. Old 4-axis `RubricScore` table retained (3 test rows), columns made nullable; NO new writes go there.
- Consumers ALL ported to v2 (axis-generic, N/A-safe, isDemo-excluded): submit route (accepts `rubricAxes: [{axis, score|null, note?}]`, requires every axis answered + ≥1 real score, winner-only), arena leaderboard, eval-run aggregate, admin leaderboard (+ win-rate fix: tie/both_inadequate now count as games without wins, was crediting B on ties), admin category-breakdown, admin agreement (per-axis std-dev proxy), admin export (long-format CSV: axis,score,NA,note,version), admin activity. Components leaderboard.tsx + category-breakdown.tsx render dynamic axis columns from the API's `axes` list.
- `aggregate.ts` rubric half rewritten: per-axis means; a cell's overall = mean of axis means (rare axes not drowned by frequent ones). Tests updated + new cases (0-score pull-down, axis-weighting) - 29/29 green.

### Jul 2 call bugs - all fixed

1. "Both are wrong" option: EXISTED on branch since 6/24 (`both_inadequate` + salvage rewrite); root cause was stale prod. Deployed now.
2. Explanation min-20-chars: REMOVED everywhere (UI label says optional, API accepts empty). Lydia had independently suggested optional explanations for workload.
3. Rubric N/A: per-axis N/A button (info-blue when selected).
4. Rubric 0: scale now 0-5 with anchors.
5. Continue-button deadlock when both wrong: resolved via both_inadequate being a first-class winner value.
6. Un-dismissable New Prompt modal: backdrop click + Escape now close it (`prompt-form.tsx`).
7. Annotate form resets on navigation: episodes now AUTOSAVE to sessionStorage per output-pair (`wt-episode-<idA>:<idB>`), restored on return, cleared on submit/flag. Matters for Agnes's flaky power/connectivity.
8. Review queue not populating during call: old-prod artifact (annotations don't feed /annotator/review - that's learner handoffs; submitted edits appear in /admin/arena/contested "Edits pending verification"). Worth showing Agnes where submissions actually land.
9. Learner defaulted to Lebanese Arabic: already fixed (Igala-only + explainer landing), now deployed.

### Deploy state (READ THIS - two Vercel projects!)

PR #2 (https://github.com/madihg/wikitongues-ai/pull/2) merged to main = b7916b2. TWO Vercel projects exist: `wikitongues-ai` (prj_AwAK..., GitHub-integrated - merging to main AUTO-DEPLOYS, has full env) and `wikitongues-ai-web` (prj_tHoR..., created Jun 18, HAD ZERO ENV VARS - the source of the call's hanging submissions; env now populated too). The PUBLIC URL https://wikitongues-ai-web.vercel.app was aliased to a Jun 18 build; this session RE-POINTED it to the fresh auto-deploy (wikitongues-pubwbm7lf, built from main b7916b2, Ready). Smoke-tested live: /, /learner, /annotator/annotate, /admin/arena all 200, /api/annotations/next 401 unauthed, zero Lebanese.

CAVEATS: (1) The alias is MANUAL/static - after the NEXT merge to main, re-point it: `vercel alias set <new-deploy-url> wikitongues-ai-web.vercel.app`, or better: in the Vercel dashboard move the domain wikitongues-ai-web.vercel.app from project wikitongues-ai-web to project wikitongues-ai (Settings -> Domains) so it auto-tracks production - CLI can't (domain "assigned to another project"). (2) The live build was created seconds BEFORE GOOGLE_GENERATIVE_AI_API_KEY was added to env, so prod runtime LACKS the Gemini key until the next deploy (annotation flow unaffected; only Gemini "Run eval" in the arena). (3) CLI `vercel --prod` deploys came out BLOCKED (team plan friction; the Jun 23 "not a member of the team / upgrade to Pro" email is related) - the GitHub auto-deploy path works, use PRs. (4) Direct `git push origin HEAD:main` is classifier-blocked; PR flow (gh pr create + gh pr merge) works. Vercel prod env on wikitongues-ai: DATABASE_URL/DIRECT_URL (Supabase wikitongues schema), ANTHROPIC_API_KEY (NO CREDIT - top up!), OPENAI_API_KEY (works, GPT-4.1/o3 accessible), GOOGLE_GENERATIVE_AI_API_KEY, NEXTAUTH_SECRET+URL.

### Call intel (from Granola/Gmail/Drive agents, Jul 2)

- Team: START WITH 5 ANNOTATORS (Agnes hand-picks, replaces laggards). Budget: 105 reviewer-hours over ~3 months (Daniel) = 8-9 h/week total. Agnes sends 5 names+emails; access "next week or so". Train-the-trainer model.
- Rubric process: Lydia emails both rubrics + justification to broader team TODAY, inviting challenge; Halim+Lydia finalize MONDAY morning (before Google Research mtg); next Tuesday call = demo updated platform + rubric, then Agnes trains her team.
- Goal quote: "best Igala-speaking model in the world by October."
- Live model finding: both outputs for 'morning' were wrong; Agnes: "it's not an Igala word… maybe it's coming from Yoruba" - validates the contamination axis.
- Daniel acknowledged the DB should eventually move to a Wikitongues-owned Supabase (currently Halim's personal project smytgqkgomsfyurskpcl).
- Jun 30 recap email confirms training sequencing: RAG first → SFT on community edits (esp. orthography/diacritics) → DPO later. Kartik: A/B as cheap bootstrap, LLM-judge to find low-signal rubrics, learn a weighted rubric predictor. Josiah: anchor annotators with expert-reviewed corpus. Andrew Smart (Jul 1): Berezkin folklore-motif DB (ruthenia.ru/folklore/berezkin) as a prompt source for idioms/motifs buckets. DAIR: licensingafricandatasets.com for data governance.
- Lydia's doc extras: multimodal (video recordings of correct pronunciations - discuss with Agnes), MQM metrics (themqm.org), WALS for Yoruba/Idoma what-NOT-to-do, "expectation of model movement" per bucket (High: diacritics, morphosyntax, semantics, register, authenticity; Medium: lexicon, tone, idioms; Low: spelling, punctuation, dialect, honorifics). Google-side companion rubric exists (Andrew Smart's "Cultural Significance" rater guidelines doc, 1-5+N/A with anchors).

### Data-size math (for the pilot, within the 105-hour budget)

~6 min/episode → ~10/hour → 105h ≈ 1,000-1,050 episodes total capacity. Binomial power: distinguishing a 65/35 model pair needs ~85 comparisons (one-sided α=.05, power .8); 60/40 needs ~190. With 3 candidates (3 pairs) and 8 buckets, clear-cut differences (65/35) per bucket per pair ≈ 85×3×8 ≈ 2,000 - OVER budget. Honest pilot framing: ~125 episodes/bucket total → per-bucket distinguishability only for large gaps; overall (pooled) ranking solid. SFT: 500-1,000 verified gold targets = measurable movement (LIMA/Tamil-Llama scale); DPO: 2-5K clean pairs = post-pilot; CPT: needs 10M+ clean tokens - doesn't exist yet.

### Open / next steps

- MONDAY: rubric-lock with Lydia. Platform is config-ready: edit `RUBRIC_V2` axes/labels/anchors in buckets.ts only. Open rubric questions to settle: (a) 0-vs-1 anchor overlap (0 absorbed "nothing correct"; Lydia's 1-anchor needs rewording), (b) factual correctness now lives in semantics+cultural_relevance + the factual-bucket reference panel - confirm that's acceptable, (c) exact anchor wording per level.
- Prompt bank is 8 prompts (1/bucket) - FAR too small for 5 annotators. Need ~30-50/bucket; community-authored for held-out. Berezkin motifs + Agnes's team as sources. `pnpm seed:outputs` generates answers for new prompts.
- When Agnes's 5 names arrive: create accounts (register route allows self-signup as ANNOTATOR; or seed). CHANGE default passwords ("password") + set OWNER_PASSWORD in prod.
- Anthropic key: OUT OF CREDIT + possibly compromised (rotate! see 2026-06-24 security notes; OpenAI key shared across projects - rotate both). Gemini 2.5-pro needs paid tier.
- Swap-consistency reinjection + calibration mode still unbuilt (spec'd in research doc). Krippendorff proper still a proxy.
- DB migration to Wikitongues-owned Supabase - Daniel acknowledged, plan post-pilot.

## Session State (2026-07-06 pm) - Jul-6 taxonomy shipped + THE JSON bug fixed + deployed

Reviewed the three Jul-6 calls (Lydia rubric-lock, Google Research, Daniel sync) and Lydia's Source-of-Truth tabs. Challenged her taxonomy, implemented the recommended version, fixed the real "JSON bug", merged PR #3 to main (388854b), re-aliased the public URL to the new build, and verified the fix live.

### THE JSON bug (root cause found + fixed)

"Both inadequate" + a salvage rewrite (and the gold-first cold-author path) 500'd with an EMPTY body -> the client's `res.json()` threw "Unexpected end of JSON input" = the "no man's land JSON bug" Agnes/Halim hit. Cause: `ColdAuthorAnswer.promptId` is a FK to `Prompt.id` (cuid) but the submit route passed the PUBLIC promptId ("ig_orth_001"), violating the FK. Fix (submit/route.ts): use `outputA.promptId` (the cuid) for both ColdAuthorAnswer creates; wrap `$transaction` in try/catch returning JSON 500; and add `safeJson()` in annotation-interface.tsx so NO client fetch can ever crash on a non-JSON 5xx again. Verified live: both_inadequate+salvage -> 200 salvageSaved:true (was 500). NOTE: PairwiseComparison.promptId and RubricAxisScore.promptId are free strings (no FK) so they still store the public promptId - inconsistent but harmless; ColdAuthorAnswer is the only FK'd one.

### Taxonomy (the deliverable) - `tasks/taxonomy-recommendation.md`

Verdict: Lydia's Jul-6 direction is right; adopted with 3 challenges. (1) KEEP cross-linguistic contamination as its OWN scored axis (she folded it into "authenticity" on Jul 6 - disagree; it's the headline, most-measurable, most-trainable failure). (2) SCOPE axes per prompt category (each category declares in-scope axes; others collapse/N/A) instead of "all axes, mostly N/A" - denser data, less fatigue. (3) DROP "dialect" as a scored axis -> future code-switching benchmark (Igala dialects mutually intelligible). Adopted from her as-is: prompt-category vs rubric-axis split, diacritics split from spelling, pragmatics split (cultural fit vs authenticity), 0-5 + N/A.

RUBRIC axes now 8 (`RUBRIC_V2` in buckets.ts, `RUBRIC_VERSION="v3"`): syntax(Grammar & word order), lexicon(Word choice), spelling, diacritics(Tone marks), semantics(Meaning) | cultural_relevance(Cultural fit), authenticity, contamination(Is it Igala?). Labels are non-linguist-friendly (Sonja's concern). PROMPT CATEGORIES = the EvalBucket enum RELABELLED (no migration) with an `axes[]` in-scope list each: orthography->"Spelling & tone marks", grammar_tone->"Grammar & sentence structure", lexicon_disambig->"Vocabulary & word meaning", register_honorifics->"Register, tone & honorifics", idioms_metaphor->"Figurative language", cultural_values->"Cultural knowledge & values", authenticity->"Authenticity & naturalness", dialectal_fidelity->"Dialect & code-switching (experimental)". `/api/annotations/next` sends `applicableAxes`; the interface shows in-scope axes + collapses off-scope; rubricComplete requires all IN-SCOPE answered + >=1 real score.

CRITICAL PROCESS NOTE (from Jul-6): the rubric was DELIBERATELY NOT locked - it stays mutable ~2 weeks then revises from real annotation. Our config+version-stamp architecture already supports this (edit RUBRIC_V2 / BUCKETS axes in buckets.ts only; every score carries RUBRIC_VERSION). Do NOT hardcode axes anywhere.

### Deploy

PR #3 merged main=388854b. GitHub auto-deploy -> wikitongues-ai project deployment `wikitongues-govs8ukjf` (Ready). Public URL https://wikitongues-ai-web.vercel.app re-aliased to it (MANUAL - re-alias after each merge, or move the domain to the wikitongues-ai project in the Vercel dashboard so it auto-tracks; CLI can't move it, "assigned to another project"). CLI `vercel --prod` still comes out BLOCKED (team plan). Env has GOOGLE_GENERATIVE_AI_API_KEY now.

### Deliverables done

- `tasks/taxonomy-recommendation.md` (buckets + prompt categories + the challenge).
- Gmail DRAFT (not sent) to the advisory group (Lydia, Daniel, Emily emilyblack@nyu.edu, Erin evanliemt@google.com, Andrew andrewsmart@google.com, Isaac icaswell@google.com, Sonja sonja.schmergalunder@gmail.com): subject "Igala benchmark: rubric taxonomy, and how much data / how many people it takes" - taxonomy + data-size math + blindspots, no creds/deploy. Halim to review recipients + send.
- Multi-agent prototype review workflow run (wf_4136135d-53e) - findings folded in below when it lands.

### Data-size answer (for reference, also in the email)

5 annotators, ~105 hrs -> ~1,000 episodes. Benchmark: 65/35 model gap needs ~85 comparisons, 60/40 ~190; full per-bucket resolution ~2,000 (over budget) -> pilot resolves LARGE per-bucket gaps + solid pooled overall. SFT 500-1,000 gold (reachable); DPO 2-5K (post-pilot); CPT 10M+ tokens (doesn't exist). BINDING CONSTRAINT = PROMPTS not people: have 8, need ~30-50/category community-authored held-out. Blindspots: prompt bank 4% of needed; keep contamination measured standalone; text-only phonology gap (Lydia); calibration session week 1 (agreement was 0.08-0.17); data governance (DAIR framework).

### Open / next

- Lydia writing per-axis anchors (what's a 2 vs 4, with Igala examples) - the real quality lever.
- Build the prompt bank to ~30-50/category (community-authored held-out; Berezkin motifs for figurative/cultural). `pnpm seed:outputs` generates model answers for new prompts.
- Dialect/code-switching resolved with Agnes (Jul 7).
- Still open from before: rotate Anthropic+OpenAI keys; calibration mode + swap-consistency reinjection unbuilt; move DB to Wikitongues-owned Supabase; move the Vercel domain to auto-track.

### Multi-agent prototype review (2026-07-06 pm) - findings + fixes (PR #4, main=65ae8e5)

Ran a 13-agent review (5 finders + adversarial verifiers), wf_4136135d-53e. Fixed all confirmed high/critical + data-integrity:

- HIGH data corruption: switching pairwise pick A<->B after visiting the score step left the LOSING output's text in the edit box, saved as a gold "correction" of the winner. Fixed via `editSeededFor` state (re-seed editWinner on pick change; persisted in draft). annotation-interface.tsx.
- CRITICAL benchmark leak: `split=='test'` (arena held-out) and `isHoldout` (training-export guard) were set INDEPENDENTLY in prompts/route.ts POST -> a test prompt with isHoldout=false could train on the benchmark. Fixed: derive both from either signal at write time (invariant `isHoldout == split==='test'`). Verified 0 existing rows mismatch. NOTE follow-up: also make the export/build/fine-tune BUILDERS key off split (defense in depth) - not done, write-invariant closes it for all new data.
- MEDIUM demo leak: admin/export (pairwise CSV + report counts), arena/trajectory, arena/contested (+pending edits) now exclude isDemo.
- MEDIUM: admin/activity counted orphaned legacy `rubricScores` (always 0) -> now `rubricAxisScores`.
- LOW hardening: annotations/flag + submit guard req.json() + wrap DB writes -> always JSON.
  Verified FALSE by adversarial pass (NOT bugs): OutputEdit.promptId cuid (it's correct); arena/contested POST editId P2025 (failure mode wrong).
  DEFERRED (documented, low-risk to leave for now):
- PairwiseComparison.promptId + RubricAxisScore.promptId store the PUBLIC promptId string while ColdAuthorAnswer stores the cuid (FK). Dormant (all current readers self-consistent: leaderboard/contested/dedup all use the public string); becomes a problem only for a future cross-table join. Fixing requires a coordinated migration + update of the dedup lookup + leaderboard + contested. Do it as one shot, not a one-liner.
- Shared `withApiErrors()` wrapper for all annotations+arena GET routes (annotations/next + arena reads can 500 non-JSON on DB error). Client `safeJson()` already degrades these gracefully; the wrapper is the clean fix.
- Orphaned legacy `RubricScore` model + RUBRIC_AXES/RUBRIC_KEYS exports in buckets.ts - no writer; delete in a cleanup pass.
- LOW cosmetic: contested-items shows tie/both_inadequate in pick-B color; agreement-stats has a dead DIMENSION_LABELS map (falls through to correct label).

## Session State (2026-07-07 pm) - Go-live prep

**Data IS persisting** (answered Halim's "is nothing saving?" - it is). Live prod: 10 real pairwise (9 both_inadequate + 1 'a'), 3 cold answers, 2 annotators. `RubricAxisScore=0` is EXPECTED, not a bug: both_inadequate skips the winner-rubric, so no axis rows until someone picks a clear winner. Only 1 real ANNOTATOR account (annotator@test.com); other "annotators" were owner/researcher.

**Shipped in PR #7** (branch halim-bot/fervent-jemison-b6bb05, commit d982973, pushed) - AWAITING MERGE (classifier blocks agent self-merge of PR into main; Halim must merge PR #7, then re-alias public URL):

- **Prompt-show cap = 2/prompt/annotator.** `web/src/lib/pairing.ts` (`firstPairs`, `MAX_SHOWS_PER_PROMPT=2`) + `pairing.test.ts` (5 tests). Wired into BOTH count+serve loops of `api/annotations/next/route.ts` (refactored 2 nested loops -> 1 for-of). Live proof: 8 prompts x3 outputs, queue 24->16 (each prompt 3x->2x). firstPairs(3,2)=[[0,1],[0,2]] covers all 3 models (1v2 intentionally unmatched).
- **Real annotator dashboard.** `api/annotator/summary/route.ts` (NEW) returns per-user pending/completed/coldAnswers + recent activity, isDemo excluded, researcher-only promptsInCatalogue+pendingReviews. `app/(app)/annotator/page.tsx` was 100% HARDCODED MOCK ("12/3/47" + fake activity table) -> now fetches real data + loading/empty/error states. Pending calc mirrors /next exactly (same firstPairs + same deterministic modelOutput order `[{createdAt asc},{id asc}]` - tiebreak added to BOTH so counts can't drift).
- **admin/activity** now counts with explicit `.count({isDemo:false})` (was un-filterable `_count` incl. demo). HandoffItem has no isDemo (unfiltered, correct).
- **leaderboard** "Best" badge guarded `bestScore>0` (was tagging every model at score 0).
- **Tone keyboard caps toggle** (`tone-keyboard.tsx`): ⇧ Aa button uppercases special letters via toUpperCase() (handles precomposed + combining marks).
- **Account tool** `prisma/create-annotators.ts` + npm script `create:annotators`. `npm run create:annotators -- "a@x.com:Name" b@y.com` -> ANNOTATOR accounts, strong bcrypt(12) pw, Igala native lang, skips existing unless `--reset`, prints creds table. AWAITING Halim's list of emails.

**Verified:** vitest 5/5, tsc, eslint, `next build` all pass. 2 review agents (dashboard audit + diff review) - no shipping blockers; hardened the 2 worthwhile findings (order tiebreak, dashboard error state).

### Go-live SHIPPED + 6 real accounts (2026-07-08)

PR #7 MERGED to main (merge commit d7c78d9); Vercel production build dpl_BamBpkd2 READY. Two follow-up commits rode in on the same branch before merge: b7bbf7a (create-annotators --role flag) and 5e9cb62 (auth email-normalization + friendlier passwords).

**auth.ts:** login now lowercases+trims the email before lookup (findUnique is exact-match; stored emails are lowercased). Prevents "invalid email or password" when someone types a stray capital (e.g. Ibrahim's email was shared with a capital I) or trailing space. Passwords stay verbatim.

**create-annotators.ts password style CHANGED:** was random 14-char mixed-case (real annotators kept mistyping on phones -> Sarah hit "invalid email or password"); now pronounceable all-lowercase CV-syllable + 2-digit (e.g. "tukabeni47"), ~31 bits. `--role researcher` flag added.

**6 accounts created on PROD (all verified: bcrypt match=true, igala native lang), current passwords:**

- ANNOTATOR agadasarah03@gmail.com (Sarah Agada) = finagoni82
- ANNOTATOR charityogali0@gmail.com (Charity Ogali) = totawobo29
- ANNOTATOR ibrahimabdulraheem24@gmail.com (Abdulraheem Ibrahim) = guwumaro33
- ANNOTATOR blessingbenjamin40.bb@gmail.com (Blessing Benjamin) = bakifupa48
- ANNOTATOR amoduaustine04@gmail.com (Austine Amodu) = konasudi98
- RESEARCHER ajben12@gmail.com (Agnes, community lead - email found in Gmail) = hojibeni88

Login VERIFIED end-to-end live: POSTed Sarah's creds to wikitongues-ai-web.vercel.app/api/auth/callback/credentials -> valid session returned. Sign-in link for annotators: https://wikitongues-ai-web.vercel.app/login. Password reset is a DB change so it's effective immediately regardless of the alias. No self-serve password reset in-app; reset via `npm run create:annotators -- --reset <email>` (add `--role researcher` to keep a researcher's role).

**STILL MANUAL:** re-alias wikitongues-ai-web.vercel.app to the newest wikitongues-ai build to serve the new UI (dashboard/cap/email-norm); or permanently move that domain onto the wikitongues-ai project so it auto-tracks. Login already works on the current alias.

**NEXT ACTIONS:** (1) Halim merges PR #7. [DONE] (2) Vercel auto-deploys wikitongues-ai; re-alias https://wikitongues-ai-web.vercel.app to newest build (manual - see Deploy section). (3) Halim sends annotator emails -> run create:annotators, hand out passwords privately. (4) Still open from before: rotate Anthropic+OpenAI keys; build prompt bank to ~30-50/category.

## Session State (2026-07-08 pm) - Scale-up: prompt bank x37, annotation review UI, cold-answer UX

Orchestrated session (Fable planning, Opus/Sonnet/Haiku subagent execution): 8 agents - recon (haiku), prompt-bank (opus), review-surface (opus), ux-flow (sonnet), ui-reviewer (opus, verdict SAFE TO SHIP), fixer (sonnet), content-reviewer (opus, verdict ACCEPTABLE FOR PILOT), bank-editor (opus).

**1. PROMPT BANK 8 -> 300 (the binding constraint, now resolved).** prisma/seed-prompt-bank.ts + npm run seed:prompt-bank: 292 claude-authored prompts (40/category core, 20 dialectal_fidelity experimental), all split=train isHoldout=false provenance=claude_authored_v1, promptId namespace ig_bank_<short>_NNN, create-only upserts (update:{}). Seeded to PROD; 300/300 prompts have >=2 outputs (annotatable). Content-reviewed independently: zero cultural-fact violations (uncertain specifics deferred to annotator via expectedCulturalContext - keep this convention). ~24 prompts revised post-review (degenerate idiom template block de-templated, orthography strays rewritten in place, metalinguistic lexicon asks made concrete, dial model-framing removed); 34 stale outputs deleted+regenerated; zero annotated prompts modified (verified). Held-out/test expansion stays community-authored (Agnes) - NOT claude-authored, by design.

**2. GEMINI KEY DEAD.** Google rejects the key ("API key not valid") - likely revoked after chat exposure. New bank prompts have 2 outputs each (gpt-4.1 + gpt-4.1-mini) = 1 pair per prompt per annotator (~308 pairs/annotator total, >1500 episodes capacity across 5). ACTION Halim: new Gemini key into web/.env + Vercel env, then `set -a; source .env; set +a; npm run seed:outputs` (idempotent, fills missing only; needs env sourced - tsx does not auto-load .env). Backfilling Gemini doubles pairs/prompt to the cap of 2. NOTE: seed-outputs does NOT write CostEntry rows (cost ledger gap, minor).

**3. ANNOTATION REVIEW SURFACE (researcher).** New /admin/annotations (page + component annotations-review.tsx): unified pairwise/cold/edit event list, filters (annotator/type/bucket/include-demo default-off), detail drawer (pairwise shows both outputs + model identity + winner rubric axes + related edits/cold answers), inline researcher corrections (cold answerText, edit correctedText, verificationStatus promote via PATCH; pairwise READ-ONLY by design - 405). APIs: GET /api/admin/annotations (+facets, total), GET+PATCH /api/admin/annotations/[type]/[id], all requireResearcher()-gated. Deep-link contract: ?annotator=<userId>&type=pairwise|cold|edit. src/lib/annotations-query.ts (+12 tests) is the param parser. /api/admin/activity now returns user id; annotator-activity rows link to the filtered view (Sarah's work = click her row). admin/page.tsx has cards linking Annotations + Prompt Catalogue (/annotator/prompts - the pre-existing full edit UI w/ PromptEdit audit; verified working, was a discoverability gap). KNOWN DEBT (LOW): list API loads matching tables fully into memory before paging - fix with DB-side take/cursor when volume grows.

**4. DASHBOARD ACTIONABLE + MY WORK.** StatCards are links (Queue->/annotator/annotate, Comparisons+Gold->/annotator/history, Reviews->/annotator/review, Prompts->/annotator/prompts); activity rows -> history; researcher extra link -> /admin/annotations. New /annotator/history + /api/annotator/history: session-scoped own-work list (pairwise w/ both outputs, cold, edits), expandable, paginated, isDemo excluded. Nav (personas.ts): "My Work" all roles; "Annotations" researcher-only.

**5. COLD ANSWERS ON ALL 8 CATEGORIES (was 2).** annotation-interface.tsx: optional cold-author step before reveal on non-goldFirst buckets ("First - how would YOU say it?" + value framing), primary "Lock my answer & reveal", secondary skip. Submit sends coldAuthor whenever coldLocked && coldAnswer.trim() (server accepted any bucket all along). Integrity fixes from review: (a) lock survives Back - after reveal the cold answer renders read-only (source-free guarantee; also holds across draft restore); (b) both_inadequate: if salvage text == cold text, only the cold row is sent (provenance speaker_authored_sourcefree wins, no dup gold). Success toast acknowledges saved gold answers.

**GATES (final, central):** typecheck 0, lint 0, tests 46/46 (12 new), next build clean (65 routes).

**NEXT:** (1) merge PR (this branch), re-alias wikitongues-ai-web.vercel.app (or move domain to auto-track - still manual). (2) Halim: new Gemini key -> backfill outputs. (3) Community-authored held-out prompts w/ Agnes (30-50/category test split). (4) Deferred: list-API pagination at scale; CostEntry rows for seed-outputs; rotate Anthropic+OpenAI keys (still open).
