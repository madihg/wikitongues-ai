[PRD]

# PRD: Cultural Language AI System

**Date:** Feb 13, 2026
**Source:** Meeting -- Language learning AI system architecture exploration with MLM and RAG prototyping

---

## 1. Overview

Two interconnected products for low-resource and culturally rich languages (starting with Igala and Lebanese Arabic):

1. **Cultural Language Benchmark Tool** -- A Surge AI-style evaluation system where native speaker annotators compare model outputs, rate cultural/linguistic fidelity, and build a prompt catalogue. This lives inside the teacher/annotator interface.

2. **Language Learning Conversational AI** -- A learner-facing conversational interface backed by an agentic pipeline (orchestrator, translator agent, reviewer agent) with confidence scoring. When the system is uncertain, requests are handed off to human teacher/annotators. A RAG knowledge base (seeded from linguistic databases, augmented by annotators) grounds responses.

The benchmark tool feeds the conversational AI: benchmarking determines the best base model, annotator corrections improve the RAG, and the prompt catalogue informs evaluation cycles.

**Single application, role-based access:** There is one web application. Teacher/annotators see their annotation work queue, prompt catalogue, and learner handoff reviews. Researchers see a read-only admin panel with benchmark results, leaderboard, and epoch tracking. No separate interfaces.

---

## 2. Goals

- Benchmark Claude, ChatGPT, Gemini, and Gemma on cultural and linguistic fidelity for Igala and Lebanese Arabic
- Build a structured prompt catalogue across 4 categories to systematically probe model capabilities
- Create an annotator rubric measuring cultural accuracy, linguistic authenticity, creative depth, and factual correctness
- Implement an agentic pipeline (orchestrator + translator + reviewer) with confidence scoring that routes uncertain responses to human experts
- Seed a RAG knowledge base from available linguistic databases and grow it through annotator contributions
- Establish iterative eval loops: benchmark base performance, measure improvement across epochs as annotator data feeds back into the system
- Surface all low-confidence responses and identified knowledge gaps directly in the teacher/annotator interface for human resolution

---

## 3. Quality Gates

These commands must pass for every user story:

- `pnpm typecheck` -- TypeScript compilation with no errors
- `pnpm lint` -- Linting passes with no errors

For Python research scripts (benchmarking phase), manual verification is acceptable until the web UI is built.

---

## 4. User Stories

### Phase A: Benchmarking & Prompt Catalogue (Python Scripts)

#### US-001: Define Prompt Catalogue Schema

**Description:** As a researcher, I want a structured schema for the prompt catalogue so that prompts are organized across all 4 categories.

**Acceptance Criteria:**

- [ ] Schema supports 4 prompt categories: (1) Real-world use (e.g. "tell me a story in Lebanese Arabic"), (2) Words & concepts (e.g. translate "gharaam"), (3) Frontier aspirations (culturally nuanced prompts informed by known cultural gaps), (4) Abstract vs. everyday concept pairs (testing dialect divergence)
- [ ] Each prompt has fields: id, category, language, text, source_language (if translation), target_culture (distinct from language -- enables cross-language prompting, e.g. prompt in English about Lebanese culture), expected_cultural_context, difficulty_level
- [ ] Schema is stored as a JSON/YAML spec with example entries for both Igala and Lebanese Arabic
- [ ] At least 5 seed prompts per category per language (40 total minimum)

#### US-002: Build Model Runner Script

**Description:** As a researcher, I want to send the same prompts to Claude, ChatGPT, Gemini, and Gemma and collect their outputs so that I can compare them.

**Acceptance Criteria:**

- [ ] Python script accepts a prompt catalogue file and target models as input
- [ ] Supports 4 model APIs: Claude (Anthropic API), ChatGPT (OpenAI API), Gemini (Google AI API), Gemma (local or API)
- [ ] Each prompt is sent to all 4 models with identical parameters (temperature, max tokens)
- [ ] Outputs are saved in a structured format: prompt_id, model, output_text, timestamp, token_count
- [ ] Script handles API rate limits and failures gracefully (retry with backoff)
- [ ] Script supports resume: tracks per-prompt-per-model completion so a failed run can continue from where it left off
- [ ] Outputs are stored in a results directory, one file per run

#### US-003: Benchmark Report Generator

**Description:** As a researcher, I want to generate a summary report from pairwise comparisons and rubric scores so that I can identify the best base model per language.

**Acceptance Criteria:**

- [ ] Script aggregates pairwise win rates per model per language
- [ ] Script computes average rubric scores per model per language per dimension
- [ ] Report includes inter-annotator agreement metrics (Krippendorff's alpha or similar)
- [ ] Report highlights best model per language with confidence intervals
- [ ] Output is a markdown file with tables and a recommendation section
- [ ] Report breaks down performance by prompt category (real-world, words/concepts, frontier, abstract/everyday)

#### US-003b: Data Migration (Phase A → Phase B)

**Description:** As a researcher, I want to import all Phase A benchmark data (prompt catalogue, model outputs, annotations) into the Phase B database so that no work is lost when transitioning to the web application.

**Acceptance Criteria:**

- [ ] Migration script reads Phase A JSON/CSV files and validates against the database schema
- [ ] Prompt catalogue, model outputs, pairwise comparisons, and rubric scores are all imported
- [ ] Data integrity checks: counts match, no orphaned records, all foreign keys valid
- [ ] Migration is idempotent (can be run multiple times safely)
- [ ] Prompt catalogue version is tagged at time of migration

### Phase B: Web Application (Single App, Role-Based)

#### US-004: Authentication & Role-Based Access

**Description:** As a user, I want to log in and see the interface appropriate to my role so that teachers/annotators see their work queue and researchers see the admin panel.

**Acceptance Criteria:**

- [ ] Simple auth (email + password or OAuth)
- [ ] Two roles: teacher/annotator and researcher/admin
- [ ] Teacher/annotator dashboard shows: pending annotations (pairwise + rubric), pending learner handoffs, low-confidence items requiring review, completion stats
- [ ] Researcher/admin dashboard shows: benchmark leaderboard, epoch tracking, inter-annotator agreement stats, export controls
- [ ] User profile includes: role, languages spoken (with per-language expertise level), annotator qualifications
- [ ] Annotator task assignment: system distributes tasks ensuring overlapping coverage (minimum 3 annotators per item) and that annotators only receive tasks in their qualified languages

#### US-005: Annotation Interface (Pairwise Comparison + Rubric Scoring)

**Description:** As a teacher/annotator, I want a single interface where I compare model outputs side by side AND rate each output on cultural/linguistic dimensions so that all annotation happens in one flow.

**Acceptance Criteria:**

- [ ] Shows the original prompt, its category, and target language
- [ ] **Pairwise mode:** Displays two model outputs side by side (model identity hidden in both modes). Annotator selects A or B and writes explanation
- [ ] **Rubric mode:** After pairwise selection, annotator rates each output individually on 4 dimensions (1-5 scale): cultural accuracy, linguistic authenticity (dialect fidelity), creative depth/nuance, factual correctness. Model identity remains hidden
- [ ] Free-text notes field per dimension
- [ ] All pairwise combinations for a prompt are covered (6 pairs for 4 models)
- [ ] Supports both LTR (English) and RTL (Arabic) text rendering
- [ ] Submit saves all data (pairwise result + rubric scores) and loads next comparison
- [ ] Keyboard shortcuts for efficient workflow
- [ ] Results saved with: prompt_id, model_a, model_b, winner, explanation, dimension_scores per model, annotator_id, timestamp
- [ ] Multiple annotators can rate the same output (for inter-annotator agreement)
- [ ] Progress tracker: X of Y comparisons completed

#### US-006: Prompt Catalogue Management

**Description:** As a teacher/annotator, I want to create, edit, and categorize prompts so that the benchmark catalogue grows with expert input.

**Acceptance Criteria:**

- [ ] CRUD for prompts across 4 categories
- [ ] Annotators can propose new prompts with category, language, cultural context
- [ ] Deep research agent integration: system suggests prompts based on known cultural gaps (stretch goal)
- [ ] Prompts can be tagged and filtered by language, category, difficulty
- [ ] Audit trail of who created/edited each prompt

#### US-007: Learner Handoff Review Queue + Low-Confidence Surfacing

**Description:** As a teacher/annotator, I want to review uncertain model responses -- both from learner conversations AND from pipeline confidence scoring -- so that I can correct them and feed data back into the system.

**Acceptance Criteria:**

- [ ] Queue shows all items where confidence score fell below threshold, including: original learner request, model answer, confidence score, reviewer agent reasoning, gap category (missing vocabulary, missing cultural context, missing dialect knowledge, missing translation pair)
- [ ] Items are prioritized by: gap severity, frequency of similar gaps, confidence score (lowest first)
- [ ] Handoff items have a status lifecycle: pending -> in_review -> approved | corrected | rejected. Items have SLA tracking (time in queue)
- [ ] Annotator can: approve (correct as-is), edit and approve (provide corrected answer), reject (flag as hallucination)
- [ ] When multiple annotators review the same item concurrently, consensus rules apply (majority wins; conflicts escalated to senior annotator)
- [ ] Corrected answers are saved to the RAG knowledge base with verification_status (single_annotator -> multi_annotator_verified -> expert_reviewed)
- [ ] Identified gaps are logged and cross-linked to the prompt catalogue for targeted prompt creation
- [ ] Multiple annotators can review the same item (inter-rater reliability)
- [ ] Dashboard badge/counter shows number of pending low-confidence items requiring attention
- [ ] Gap reduction metrics visible: how many gaps have been resolved vs. remaining

#### US-008: Researcher Admin Panel

**Description:** As a researcher, I want a read-only admin panel showing the outcomes of all teacher/annotator work so that I can track benchmark results, model performance, and system improvement over time.

**Acceptance Criteria:**

- [ ] Leaderboard: models ranked by aggregate score per language
- [ ] Breakdown by prompt category and evaluation dimension
- [ ] Epoch tracking: show performance changes as annotator data feeds back (epoch 1 vs 2 vs N)
- [ ] Inter-annotator agreement visualization (per dimension, per language)
- [ ] Gap closure dashboard: total gaps identified, resolved, remaining -- trend over time
- [ ] Annotator activity summary: completion rates, throughput
- [ ] Export to markdown/CSV for papers
- [ ] Read-only: researcher cannot modify annotations, prompts, or handoff decisions

### Phase C: Language Learning Conversational AI

#### US-009: Learner Conversation Interface

**Description:** As a language learner, I want to have a conversation in my target language so that I can practice and learn.

**Acceptance Criteria:**

- [ ] Chat interface supporting text input and display
- [ ] Supports RTL and LTR languages
- [ ] Conversation history is persisted per session with schema: conversation (id, learner_id, language, created_at), message (id, conversation_id, role, content, source [ai|human], confidence_score, pipeline_run_id, timestamp)
- [ ] Learner can select target language (Igala or Lebanese Arabic initially)
- [ ] UI indicates when response is AI-generated vs. human-reviewed
- [ ] When a response is escalated to human review, learner sees: the low-confidence AI answer with a disclaimer ("This answer is uncertain and has been sent for expert review") plus a "pending human review" indicator. Updated answer replaces it when available

#### US-010: Agentic Pipeline -- Orchestrator

**Description:** As the system, I want an orchestrator that routes learner requests through the translator and reviewer agents so that every response is quality-checked.

**Acceptance Criteria:**

- [ ] Orchestrator receives learner input and dispatches to translator agent
- [ ] Translator agent generates response using the selected base model
- [ ] Orchestrator then dispatches translator output + original input to reviewer agent
- [ ] Orchestrator collects confidence score from reviewer
- [ ] If confidence >= threshold: return response to learner
- [ ] If confidence is in "retry zone" (configurable, e.g. 50-70%): orchestrator sends reviewer feedback back to translator for one retry attempt before escalating
- [ ] If confidence < threshold (after retry if applicable): route to teacher/annotator handoff queue (US-007) with full context (learner request, model answer, confidence score, gap category, reviewer reasoning)
- [ ] If reviewer agent fails, times out, or returns unparseable response: treat as low-confidence and escalate to handoff queue
- [ ] All steps are logged as a pipeline_run record: (id, conversation_message_id, translator_model, translator_output, translator_latency, reviewer_output, reviewer_confidence, rag_context_ids, retry_count, final_disposition [returned|escalated], created_at)
- [ ] Learner receives a "pending human review" indicator when handoff occurs

#### US-011: Translator Agent

**Description:** As the system, I want a translator agent that generates culturally and linguistically appropriate responses in the target language.

**Acceptance Criteria:**

- [ ] System prompt enforces: respond only with known information, flag uncertainty, do not hallucinate
- [ ] Queries RAG knowledge base before generating response
- [ ] If RAG has relevant data: ground response in that data
- [ ] If RAG has no data: still attempt but flag low confidence to orchestrator
- [ ] Supports Igala and Lebanese Arabic

#### US-012: Reviewer Agent

**Description:** As the system, I want a reviewer agent that evaluates the translator agent's output for accuracy and cultural appropriateness before it reaches the learner.

**Acceptance Criteria:**

- [ ] Receives: original learner input, translator output, RAG context used
- [ ] Outputs: pass/fail judgment, confidence score (0-100), reasoning notes, gap category (if applicable)
- [ ] System prompt is specialized for linguistic and cultural review
- [ ] Can flag specific issues: potential hallucination, dialect mismatch, cultural insensitivity, factual error
- [ ] If both translator and reviewer are uncertain, always escalate to human via US-007 handoff queue

#### US-013: RAG Knowledge Base

**Description:** As the system, I want a knowledge base seeded from linguistic databases and augmented by annotator corrections so that the AI has grounded, verified information.

**Acceptance Criteria:**

- [ ] Seeded from available linguistic resources for Igala and Lebanese Arabic
- [ ] Chunking strategy: linguistic data is chunked by type (vocabulary entries, grammar rules, cultural notes, example dialogues) with metadata (chunk_type, language, topic) embedded alongside the vector
- [ ] Supports ingestion of annotator corrections from the handoff review queue (US-007)
- [ ] Supports semantic search (vector embeddings) for retrieval. Embedding model must be evaluated for low-resource language retrieval quality before deployment
- [ ] Data is structured: language, concept, verified_answer, source, confidence, annotator_id, verification_status (seed | single_annotator | multi_annotator_verified | expert_reviewed), version history
- [ ] Verified/seed data is weighted higher than single-annotator corrections in retrieval ranking
- [ ] Gap tracking: when a query finds no relevant data, the gap is logged and surfaced in the teacher/annotator handoff queue (US-007)

#### US-014: Confidence Scoring & Gap Identification

**Description:** As the system, I want to output uncertainty scores for model responses and identify data gaps so that low-confidence items are surfaced to teacher/annotators and the system self-improves over time.

**Acceptance Criteria:**

- [ ] Confidence score is computed from: reviewer agent judgment, RAG coverage (data found vs. not), translator agent self-reported uncertainty
- [ ] Configurable threshold for human handoff (default: escalate below 70%)
- [ ] Gaps are categorized: missing vocabulary, missing cultural context, missing dialect knowledge, missing translation pair
- [ ] All sub-threshold items are automatically routed to the teacher/annotator handoff queue (US-007) with gap category and context
- [ ] Gap reports are surfaced on the teacher/annotator dashboard as a priority badge/counter
- [ ] Epoch tracking: measure gap reduction over time as annotators fill gaps
- [ ] Researcher admin panel (US-008) shows aggregate confidence distribution and gap trends

---

## 5. Functional Requirements

- **FR-1:** The prompt catalogue must support 4 categories: real-world use, words/concepts, frontier aspirations, abstract vs. everyday concept pairs
- **FR-2:** The model runner must support Claude, ChatGPT, Gemini, and Gemma APIs with identical prompt parameters
- **FR-3:** Pairwise comparison must cover all model combinations (6 pairs for 4 models) per prompt
- **FR-4:** The rubric must score on 4 dimensions: cultural accuracy, linguistic authenticity (dialect fidelity), creative depth/nuance, factual correctness (1-5 scale)
- **FR-5:** Multiple annotators must be able to rate the same output for inter-annotator agreement measurement
- **FR-6:** The agentic pipeline must route: orchestrator -> translator agent -> reviewer agent, with confidence-based branching to either learner or human handoff
- **FR-7:** The RAG must support both seeded data ingestion and incremental updates from annotator corrections
- **FR-8:** The system must support RTL text rendering for Arabic/Lebanese
- **FR-9:** Gap identification must automatically log unresolved queries and surface them in the teacher/annotator handoff queue with gap category
- **FR-10:** Epoch tracking must show model performance improvement across benchmark iterations
- **FR-11:** Inter-annotator agreement must be computed using Krippendorff's alpha (handles multiple raters, ordinal + nominal scales, and missing data) with a minimum of 3 annotators per item for gold-set items
- **FR-12:** The learner interface must indicate whether a response is AI-generated or human-reviewed
- **FR-13:** There is one web application with role-based access; teacher/annotator and researcher/admin share the same app, not separate interfaces
- **FR-14:** All low-confidence items from the agentic pipeline must be surfaced in the teacher/annotator interface with priority ordering
- **FR-15:** Model identity must be hidden from annotators in both pairwise comparison and rubric scoring modes (blinding)
- **FR-16:** Per-user rate limits and daily API budget caps must be enforced on the learner-facing pipeline (2 LLM calls per message)
- **FR-17:** Phase A data (JSON/CSV) must be importable into the Phase B database via a migration script with integrity validation
- **FR-18:** RAG entries must carry a verification_status (seed, single_annotator, multi_annotator_verified, expert_reviewed) that affects retrieval ranking
- **FR-19:** Annotator task assignment must ensure: (a) annotators only receive tasks in their qualified languages, (b) minimum 3 annotators overlap per item, (c) balanced workload distribution
- **FR-20:** Reviewer agent errors must fall to error (error, timeout, or unparseable response → treat as low-confidence → escalate to handoff queue)

---

## 6. Non-Goals (Out of Scope)

- Speech-to-text / text-to-speech (audio modality)
- Image generation or multimodal inputs
- More than 2 languages in v1 (Igala + Lebanese Arabic only)
- Fine-tuning models (v1 focuses on prompting, RAG, and agentic architecture)
- Deep research agent that auto-generates prompts from ethnographic databases (noted as stretch goal in US-006)
- Mobile app (web-only for now)
- Public-facing deployment (internal/research use only)
- Model training or RLHF (evaluation and RAG augmentation only)
- Resolving the political sensitivity of cross-model comparison for publication (noted risk, handled case-by-case)
- Separate interfaces for different user roles (single app, role-based access)

---

## 7. Technical Considerations

### Architecture

- **Phase A (Benchmarking):** Python scripts, JSON/CSV data storage, API clients for 4 model providers
- **Phase B+C (Web UI):** Next.js/TypeScript frontend, API routes, database (Postgres or similar), vector store for RAG (pgvector with HNSW index -- sufficient for expected <100K entries in v1)
- **Single app:** One Next.js application with role-based routing. Teacher/annotator views and researcher/admin views are different pages/tabs within the same app
- **Agentic pipeline:** Orchestrator pattern with sequential agent handoff and optional reviewer→translator retry loop. Each agent is a system prompt + model call. Consider LangChain/LangGraph or custom implementation

### Epoch Definition

An **epoch** is a complete benchmark run: all prompts in the catalogue sent to all models, with annotator evaluation. Formally:

```
epoch:
  id, epoch_number, language
  trigger: manual | correction_threshold | scheduled
  rag_snapshot_id    -- frozen RAG state at time of benchmark
  prompt_catalogue_version  -- frozen prompt set used
  started_at, completed_at, notes
```

- RAG state must be snapshotted per epoch (so results are reproducible)
- Prompt catalogue must be versioned per epoch. Define a "core prompt set" (frozen across epochs for comparability) plus an "extended set" (can grow)
- Epoch-level aggregation table for dashboard queries: (epoch_id, model, language, prompt_category, dimension, avg_score, win_rate, annotator_agreement, n_items)

### Key Database Entities (Not in Original PRD)

- **annotator_languages**: per-language qualification level per annotator (not flat profile)
- **conversation** + **message**: conversation history with pipeline_run linkage
- **pipeline_run**: full trace of each agentic pipeline execution (translator output, reviewer output, RAG context, confidence, disposition)
- **handoff_item**: status lifecycle (pending → in_review → approved/corrected/rejected) with SLA tracking
- **rag_entry_history**: version chain for RAG entries (provenance from seed → annotator edits)
- **epoch_results**: pre-aggregated summary per epoch for dashboard performance

### Known Constraints

- Igala is extremely low-resource -- model outputs may be minimal or nonsensical. This is expected and is itself a data point
- Lebanese Arabic is a dialect without standardized orthography -- annotators will need to accept variation
- API costs for 4 models across many prompts will add up. Budget per benchmark run should be estimated
- Inter-annotator agreement may be low for subjective dimensions (creative depth, cultural accuracy). Calibration sessions recommended before scoring

### Dependencies

- Native speaker annotators for Igala (must be recruited and onboarded)
- Native speaker annotators for Lebanese Arabic
- API keys for Claude, ChatGPT, Gemini, Gemma
- Seed data from linguistic databases for RAG initialization

### Key Insight from Meeting

- Abstract/sophisticated concepts tend to stay consistent across dialects, while everyday/concrete terms diverge. This hypothesis should be explicitly tested in the prompt catalogue (category 4)
- Models may answer differently about a culture depending on the prompt language (e.g. cultural norms in Farsi prompts vs. English prompts about Iran). Cross-language prompting should be explored

---

## 8. Success Metrics

- **Benchmark coverage:** All 40+ seed prompts run across 4 models for both languages
- **Annotator throughput:** Minimum 3 annotators rating each output, with Krippendorff's alpha targets: >= 0.6 for factual correctness and linguistic authenticity, >= 0.4 for cultural accuracy and creative depth (these are inherently more subjective)
- **Best model identified:** Clear recommendation for base model per language with statistical significance
- **RAG utility:** >30% of learner queries successfully grounded in RAG data within 3 months
- **Handoff rate:** Track % of responses escalated to humans; target reduction over epochs
- **Gap closure:** Measurable reduction in identified knowledge gaps across epochs
- **Paper-ready:** Benchmark results for Igala + Lebanese Arabic across 4 models publishable as conference paper

---

## 9. Open Questions

1. **Annotator recruitment:** How do we recruit and vet Igala-speaking annotators with sufficient cultural expertise? What is the minimum number needed?
2. **Confidence threshold calibration:** What initial threshold for human handoff? How do we tune it?
3. **RAG seed data:** What specific linguistic databases/resources are available for Igala and Lebanese Arabic?
4. **Publication risk:** If Gemini underperforms, can the benchmark results be published externally, or only used internally?
5. **Cross-language prompting:** Should the benchmark systematically test prompting about Culture X in Language Y vs. Language X? (e.g., asking about Lebanese norms in English vs. in Lebanese Arabic)
6. **Abstract vs. concrete hypothesis:** How do we formally define and categorize "abstract" vs. "everyday" concepts for the prompt catalogue?
7. **Annotator rubric calibration:** How many calibration rounds are needed before scoring begins to ensure annotator alignment?
8. **Epoch cadence:** How frequently should benchmark re-runs happen? After every N annotator corrections, or on a time schedule?

[/PRD]
