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

NEXT SLICE (scaffolded, not wired): US-005 edit field in annotation-interface UI; US-007 route learner pipeline through providers; US-009 aggregate endpoint + EvalScore persistence + judge; US-012 candidate detail + head-to-head diff; US-013 epoch trajectory; US-015 fine-tune scaffold UI + provider adapter (FineTuneJob model exists); US-016 LLM-judge (position-swap) ; US-018 collective-session/adjudication view; finish rebrand sweep of admin/\* components. Confirm Wikitongues accent hex (#e0a21f reconstructed) vs official brand kit.
