# Reference: Arena Design Spec + Brand Tokens (raw research output, 2026-06-22)

> Verbatim build references from the research workflow. Implement from these. The
> recommendation in research-recommendation.md supersedes any over-confident claims here
> (e.g. CPT is post-pilot, not Rung 1; confound is Yoruba/Igbo not Idoma).

---

## ARENA DATA MODEL + SCREENS

I now have full grounding on the schema, the existing aggregation logic, the role-gating pattern (`session.user.role !== "RESEARCHER"`), the design system in use (note: the existing code uses indigo accents and rounded/shadow, which actually contradicts the Oulipo brand spec in the task — I'll flag and correct to the stated brand). I have everything needed to write a concrete, buildable spec.

One important grounding note: the current `ModelOutput.model` is a free-text string ("claude", "gemma") and rubric axes are the _poetry_ axes (`creativeDepth`), not the 8 Igala buckets. My spec must reconcile both. Here is the spec.

---

# Wikitongues Researcher-Mode Model Arena — Buildable Spec

## 0. Grounding notes (what's actually in the repo)

- Schema: `web/prisma/schema.prisma`. Role gate pattern: `session.user.role !== "RESEARCHER"` → 403 (see `src/app/api/admin/leaderboard/route.ts`).
- Admin dashboard: `src/app/(app)/admin/page.tsx` composes 6 read-only components in `src/components/admin/`.
- **Two mismatches to fix in this work:**
  1. `RubricScore` carries the _poetry_ axes (`culturalAccuracy, linguisticAuthenticity, creativeDepth, factualCorrectness`). The Igala arena needs **8 buckets**, not 4 generic axes. I introduce a `bucket` dimension that lives on `Prompt` (the bucket a prompt belongs to) and on `EvalScore` (per-bucket aggregation), without breaking the existing 4-axis `RubricScore` rows.
  2. `ModelOutput.model` is free-text. The arena needs a stable **CandidateModel** identity. I add `ModelOutput.candidateModelId` (nullable FK) so legacy rows survive and new arena outputs are linked. The free-text `model`/`modelId` stay as denormalized labels.
- Brand correction: existing components use `indigo-600`, `rounded-lg`, `shadow-sm`. The stated Oulipo design system is **white bg, opacity grays, no accent, radius 0, no shadow**. New arena components follow the brand spec (`border-black/10`, `bg-black/[0.03]`, no radius, no shadow, rank/delta shown via type weight and `▲▼` glyphs, not color).

---

## 1. New Prisma models + enums

Add to `schema.prisma`. All additive — no destructive change to existing tables except two nullable columns.

```prisma
// ─── Researcher Model Arena ──────────────────────────────────

enum EvalBucket {
  orthography            // 1 spelling
  grammar_tone           // 2 grammar/morphology/tone
  lexicon_disambig       // 3 lexicon, no Idoma bleed
  dialectal_fidelity     // 4 no collapse to prestige standard
  register_honorifics    // 5
  idioms_metaphor        // 6 floating motifs
  cultural_values        // 7 taboo/sacred
  authenticity           // 8 vs translationese
}

enum CandidateKind {
  baseline           // frontier API, no adaptation
  rag                // base + retrieval
  sft                // supervised fine-tune from edits
  dpo                // preference fine-tune from pairwise
  continued_pretrain // CPT checkpoint
  composite          // e.g. CPT base + DPO adapter + RAG
}

enum FineTuneMethod {
  sft
  dpo
  continued_pretrain
}

enum FineTuneStatus {
  draft            // training set being assembled
  building_dataset
  uploading
  queued
  running
  succeeded
  failed
  cancelled
  registered       // output auto-registered as CandidateModel
}

enum EvalRunStatus {
  draft
  generating       // producing outputs on held-out bank
  awaiting_human   // outputs generated, pairwise/rubric pending
  judging          // optional LLM-judge pass
  aggregating
  complete
  failed
}

enum EvalTrigger {
  manual
  post_finetune    // auto-eval after a job registers a candidate
  scheduled
  epoch_rollover
}

model CandidateModel {
  id              String        @id @default(cuid())
  name            String        // "Gemma-2-9B + Igala DPO v3"
  slug            String        @unique
  family          String        // gemma, claude, gpt, aya
  versionLabel    String?       // "v3", "2025-06-epoch4"
  kind            CandidateKind
  language        String        @default("igala")

  // ── CONFIG (see §2): everything needed to reproduce a generation ──
  baseModelId     String        // provider model id, e.g. "google/gemma-2-9b-it"
  apiEndpoint     String?       // null = use platform default provider router
  hfRepo          String?       // hf repo for self-hosted weights/adapter
  adapterUri      String?       // LoRA/DPO adapter location (s3/hf), null for full FT
  systemPrompt    String?       // null = no system prompt
  useSystemPrompt Boolean       @default(false)
  ragEnabled      Boolean       @default(false)
  ragSnapshotId   String?       // pins RAG corpus version for reproducibility
  decodingParams  Json?         // {temperature, top_p, max_tokens}

  // provenance / lineage
  fineTuneSource        String? // human note
  fineTuneJobId         String? @unique   // job that produced this candidate
  parentCandidateId     String?           // composite/base lineage

  isPublic        Boolean       @default(false) // show on public leaderboard
  archived        Boolean       @default(false)
  createdById     String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  fineTuneJob       FineTuneJob?  @relation("JobOutput", fields: [fineTuneJobId], references: [id])
  parent            CandidateModel?  @relation("Lineage", fields: [parentCandidateId], references: [id])
  children          CandidateModel[] @relation("Lineage")
  modelOutputs      ModelOutput[]
  evalRuns          EvalRun[]
  jobsTrainedFrom   FineTuneJob[] @relation("JobBase")  // jobs that used this as base

  @@index([language, archived])
}

model FineTuneJob {
  id                 String          @id @default(cuid())
  method             FineTuneMethod
  provider           String          // openai, together, fireworks, vertex, modal
  baseModelId        String          // provider model id being tuned
  baseCandidateId    String?         // arena candidate used as base (composite lineage)
  language           String          @default("igala")
  trainingFormat     String          // "openai-chat", "dpo-pairs", "raw-text-cpt"
  systemPrompt       String?

  // ── data lineage: which collected annotations built this set ──
  sourcePairwiseIds  String[]        // PairwiseComparison ids -> DPO pairs
  sourceEditIds      String[]        // HandoffItem ids (correctedAnswer) -> SFT pairs
  sourceRubricIds    String[]        // RubricScore ids (filter/weight signal)
  holdoutPromptIds   String[]        // Prompt.promptId reserved out of training
  bucketFilter       EvalBucket[]    // restrict training to certain buckets
  nTrainingRows      Int?
  datasetUri         String?         // built jsonl location
  hyperparameters    Json?           // {epochs, lr, beta(DPO), lora_rank, ...}

  providerJobId      String?         // provider-side id for polling
  providerFileId     String?
  status             FineTuneStatus  @default(draft)
  errorMessage       String?
  costUsd            Float?
  epochId            String?         // platform Epoch this job belongs to

  triggeredById      String?
  createdAt          DateTime        @default(now())
  startedAt          DateTime?
  completedAt        DateTime?

  baseCandidate   CandidateModel?  @relation("JobBase", fields: [baseCandidateId], references: [id])
  outputCandidate CandidateModel?  @relation("JobOutput")
  epoch           Epoch?           @relation(fields: [epochId], references: [id])

  @@index([status, language])
}

model EvalRun {
  id                String        @id @default(cuid())
  candidateModelId  String
  language          String        @default("igala")
  promptSetLabel    String        // "igala-heldout-v2"
  holdoutPromptIds  String[]      // exact bank used (reproducibility)
  judgeModel        String?       // null = human-only run
  positionSwap      Boolean       @default(true) // A/B order swapped to debias judge
  status            EvalRunStatus @default(draft)
  trigger           EvalTrigger   @default(manual)
  epochId           String?

  // aggregate roll-ups (denormalized from EvalScore)
  nPrompts          Int           @default(0)
  winRate           Float?        // overall, vs current champion
  meanRubric        Float?        // mean of bucket rubric means
  meanRank          Float?
  costUsd           Float?
  configSnapshot    Json?         // frozen CandidateModel config at run time
  published         Boolean       @default(false)

  triggeredById     String?
  createdAt         DateTime      @default(now())
  completedAt       DateTime?

  candidateModel    CandidateModel @relation(fields: [candidateModelId], references: [id])
  epoch             Epoch?         @relation(fields: [epochId], references: [id])
  scores            EvalScore[]

  @@index([candidateModelId, status])
}

model EvalScore {
  id            String      @id @default(cuid())
  evalRunId     String
  bucket        EvalBucket  // the per-bucket row
  promptId      String?     // null = bucket-level aggregate row

  // per-prompt result (when promptId set)
  modelOutputId String?     // the generated output scored
  candidateWon  Boolean?    // pairwise vs champion at this prompt
  candidateRank Int?
  humanScore    Float?      // mean rubric for this bucket axis, human
  judgeScore    Float?      // LLM-judge score
  judgeRationale String?
  positionSwapAgreement Boolean? // judge agreed across A/B swap
  confidence    Float?
  rawJudgePayload Json?

  // bucket-level aggregate (when promptId null)
  bucketWinRate Float?
  bucketMeanScore Float?
  bucketN       Int?

  createdAt     DateTime    @default(now())

  evalRun       EvalRun     @relation(fields: [evalRunId], references: [id])

  @@index([evalRunId, bucket])
}
```

### Two additive columns on existing models

```prisma
model ModelOutput {
  // ...existing fields...
  candidateModelId String?         // NEW: links arena outputs to a candidate
  evalRunId        String?         // NEW: which eval run generated it
  bucket           EvalBucket?     // NEW: denormalized from prompt for fast filtering
  candidateModel   CandidateModel? @relation(fields: [candidateModelId], references: [id])
}

model Prompt {
  // ...existing fields...
  bucket           EvalBucket?     // NEW: which of the 8 buckets this prompt tests
  isHoldout        Boolean         @default(false) // NEW: reserved for eval, never trained on
}

model Epoch {
  // ...existing relations...
  fineTuneJobs FineTuneJob[]       // NEW
  evalRuns     EvalRun[]           // NEW
}
```

### How it relates to existing models

- **`Prompt.bucket`** is the single source of truth for which of the 8 buckets a question tests. `Prompt.isHoldout` carves out the held-out Igala question bank.
- **`ModelOutput`** stays the unit of generation. Legacy rows keep `model`/`modelId` strings; new arena rows additionally set `candidateModelId` + `evalRunId` + `bucket`. Nothing breaks.
- **`PairwiseComparison`** and **`RubricScore`** are unchanged and remain the _human signal_. The eval-run aggregator reads them by `modelOutputId`/`promptId` and rolls them into `EvalScore`. So humans keep annotating exactly as today; the arena just aggregates by bucket and candidate.
- **`HandoffItem.correctedAnswer`** = the edit signal feeding SFT. **`PairwiseComparison`** = the preference signal feeding DPO. Both are referenced by id arrays on `FineTuneJob`.
- **`Epoch`** gains job + eval-run children, giving you the trajectory view (epoch N champion → epoch N+1 champion).

---

## 2. A candidate is a CONFIG, not a model

A `CandidateModel` row is a **fully-specified, reproducible generation recipe**. The generation runner reads exactly these fields and nothing implicit:

```
output = generate(
  base       = baseModelId (+ apiEndpoint | hfRepo),
  adapter    = adapterUri,              // null unless fine-tuned
  system     = useSystemPrompt ? systemPrompt : none,
  context    = ragEnabled ? retrieve(ragSnapshotId, prompt) : none,
  decoding   = decodingParams
)
```

So the three contrasts the council cares about are **just three rows differing in a few columns**:

| name                    | kind      | baseModelId          | adapterUri    | ragEnabled | systemPrompt       |
| ----------------------- | --------- | -------------------- | ------------- | ---------- | ------------------ |
| Claude baseline         | baseline  | claude-sonnet-4-5    | –             | false      | –                  |
| Gemma + RAG             | rag       | google/gemma-2-9b-it | –             | **true**   | Igala instructions |
| Gemma + DPO             | dpo       | google/gemma-2-9b-it | s3://…/dpo-v3 | false      | –                  |
| Gemma + CPT + DPO + RAG | composite | (CPT ckpt)           | s3://…/dpo-v3 | true       | –                  |

The "update weights vs RAG" open question becomes **empirically decidable inside the arena**: register `Gemma+RAG` and `Gemma+DPO` as siblings, run both on the same `holdoutPromptIds`, compare `EvalScore` per bucket. `configSnapshot` on `EvalRun` freezes the recipe so a result is never silently invalidated by later edits to the candidate row.

---

## 3. Eval-run orchestration flow

API surface (mirrors existing `/api/admin/*` role gate):

```
POST /api/arena/eval-runs            create EvalRun (candidateId, promptSetLabel, judgeModel?, positionSwap)
POST /api/arena/eval-runs/[id]/generate    run generation on holdout bank
POST /api/arena/eval-runs/[id]/judge       optional LLM-judge pass
POST /api/arena/eval-runs/[id]/aggregate   roll human+judge into EvalScore + EvalRun rollups
GET  /api/arena/eval-runs/[id]             status + scores
GET  /api/arena/leaderboard?bucket=&language=   per-bucket arena leaderboard
```

Flow:

1. **Create run** — freeze `holdoutPromptIds = Prompt where isHoldout && language && bucket in scope`. Snapshot candidate config into `configSnapshot`. Status `draft → generating`.
2. **Generate** — for each holdout prompt, run the §2 recipe → write `ModelOutput` (candidateModelId, evalRunId, bucket). Record latency/tokens/cost. Status `generating → awaiting_human`.
3. **Human signal** — the new outputs flow into the _existing_ annotation queue (`/api/annotations/next`). Annotators do pairwise (candidate vs current champion's stored output on the same prompt) + rubric. No new annotator UI needed; the arena reuses the annotation pipeline. Champion = published `CandidateModel` with best overall on this bank.
4. **Optional LLM-judge** (`status → judging`) — for each prompt, ask `judgeModel` to pick A/B with a rationale, **run twice with A/B swapped** (`positionSwap`). Store both; set `positionSwapAgreement = (verdict_1 == verdict_2)`. Disagreements are dropped from win-rate or flagged low-confidence. This is the standard position-bias debias.
5. **Aggregate** (`status → aggregating → complete`) — for each bucket: `bucketWinRate = wins/comparisons` (human-weighted, judge as tiebreak), `bucketMeanScore = mean rubric on that bucket's axis`, write one bucket-aggregate `EvalScore` (promptId null) + per-prompt rows. Roll up `EvalRun.winRate/meanRubric/meanRank`. `published=true` makes it visible on the leaderboard.

Reuse the existing aggregation math in `leaderboard/route.ts` (win/total counts, rubric averaging) — the arena version just groups by `(candidateModelId, bucket)` instead of `(model)`.

---

## 4. The flywheel: launch fine-tune jobs from collected annotations

```
POST /api/arena/jobs                 create FineTuneJob (draft)
POST /api/arena/jobs/[id]/build      assemble training set from selected ids
POST /api/arena/jobs/[id]/launch     upload + call provider fine-tune API
POST /api/arena/jobs/[id]/poll       (cron) poll provider status
GET  /api/arena/jobs/[id]            monitor
```

**Dataset construction (the core mapping):**

- **DPO** ← `PairwiseComparison`. Each comparison gives `(prompt, chosen=winner output, rejected=loser output)`. Pull from `sourcePairwiseIds`. Filter to high inter-annotator agreement and exclude any prompt in `holdoutPromptIds`. Optionally weight/filter by `bucketFilter`. This is the confirmed next-phase method.
- **SFT** ← `HandoffItem.correctedAnswer` (and `PromptEdit`/RAG corrections). Each correction gives `(learnerRequest/prompt, correctedAnswer)` as a gold completion. Pull from `sourceEditIds`, restricted to `verificationStatus >= multi_annotator_verified` to keep quality high.
- **Continued pretraining** ← raw community-written Igala text: verified `RagEntry.content`, `HandoffItem.correctedAnswer`, and community corpus. Format `raw-text-cpt`. This directly answers the Google Translate researcher's "must be in pretraining" point — CPT is a first-class `FineTuneMethod`, and a CPT checkpoint becomes a `baseModelId`/`baseCandidateId` that DPO/SFT then stack on (composite lineage via `parentCandidateId`).

**Job lifecycle:**

1. `build` → query the source ids, dedupe, drop holdout, write JSONL to `datasetUri`, set `nTrainingRows`. Status `draft → building_dataset → queued`.
2. `launch` → upload file (`providerFileId`), call provider's fine-tune endpoint with `hyperparameters` (DPO `beta`, lora_rank, epochs, lr), store `providerJobId`. Status `→ running`.
3. `poll` (cron, reuse a `CronCreate` scheduled task hitting `/poll`) → on `succeeded`, capture output weights/adapter URI + `costUsd`.
4. **Auto-register** → create a `CandidateModel` (kind = job.method, `baseModelId`/`adapterUri` from the job output, `fineTuneJobId` back-link, `parentCandidateId` = base). Status `→ registered`.
5. **Auto-eval** → immediately `POST /api/arena/eval-runs` with `trigger=post_finetune` on the same held-out bank. The new candidate lands on the leaderboard with zero manual steps. The loop is closed: annotate → train → register → eval → annotate.

`epochId` ties each job + its eval run to an `Epoch`, so "epoch N+1 was triggered by the correction threshold, trained a DPO job, and moved orthography win-rate from 41% → 58%" is a queryable, chartable fact.

---

## 5. Researcher UI screens

New route group `src/app/(app)/researcher/arena/` (RESEARCHER-gated, same pattern as admin). Add an "Arena" entry to the researcher dashboard. **Brand: white bg, `border-black/10`, no radius, no shadow, no accent color; rank deltas via type weight + `▲▼ =` glyphs.** Reuse the table markup from `leaderboard.tsx` but strip indigo/rounded/shadow.

1. **Arena Leaderboard (by bucket)** — `arena/page.tsx`. Matrix: rows = candidates, columns = the 8 buckets + Overall. Each cell = bucket win-rate (and a small rubric mean). Column header lets you sort the whole board by one bucket ("who's best at honorifics?"). Champion row in bold with a `★`. Toggle: human-only vs human+judge. This is the council money-shot — it shows _RAG vs DPO vs CPT, per linguistic dimension_.

2. **Candidate Detail** — `arena/candidates/[id]/page.tsx`. The full config (§2) rendered as a recipe card (base, adapter, RAG on/off + snapshot, system prompt, decoding). Lineage breadcrumb (`parent → this`). All `EvalRun`s for the candidate, each expandable to per-bucket `EvalScore` and example outputs with judge rationales. "Run new eval" button.

3. **Training-Data Builder** — `arena/jobs/new/page.tsx`. Pick method (SFT / DPO / CPT). Live counts of available rows by source and bucket (DPO pairs from agreed comparisons; SFT pairs from verified edits; CPT tokens from verified corpus). Filters: bucket, min agreement, min verification status. Holdout selector (auto-fills `isHoldout` prompts, locked out of training). Preview first N rows of the JSONL. Hyperparameter form. "Build dataset" → "Launch job".

4. **Fine-Tune Job Monitor** — `arena/jobs/page.tsx` + `arena/jobs/[id]/page.tsx`. List with status chips (`draft…running…succeeded…registered`), provider, method, n_rows, cost. Detail: dataset lineage (which annotation ids), provider job id, live status from `poll`, link to the auto-registered candidate and its auto-eval run.

5. **Head-to-Head Diff** — `arena/compare?a=<candidate>&b=<candidate>`. Two-column, prompt-by-prompt on the held-out bank: candidate A output | candidate B output, with the human pairwise winner + explanation and judge verdict per prompt. Filterable by bucket. This is where Agnes's "everything wrong" claims become concrete, side-by-side evidence (e.g. show Idoma bleed in baseline vs clean lexicon in DPO).

6. **Epoch Trajectory** — `arena/trajectory/page.tsx`. Line/step view: x = Epoch number, y = bucket win-rate (one line per bucket) for the champion of each epoch. Annotated with what triggered each epoch (correction threshold / job method). Proves the flywheel is moving the needle over time — the central claim to the advisory council.

---

## 6. Build order (minimal, verifiable slices)

1. **Migration**: add enums + 4 models + the nullable columns. `prisma migrate dev`. Backfill `Prompt.bucket` from existing categories where mappable; set `isHoldout` on a chosen split.
2. **Registry + leaderboard read path**: `CandidateModel` CRUD + `/api/arena/leaderboard` (group existing pairwise/rubric by candidate+bucket). Ship screens 1–2. Verifiable against current data immediately.
3. **Eval-run orchestration** (§3) + screens 5.
4. **Flywheel** (§4) behind a provider adapter interface (`launch/poll` stubbed per provider) + screens 3–4.
5. **Trajectory** (screen 6) once ≥2 epochs exist.

**Verification per slice** (per your testing rule): seed 2 candidates + a holdout bank, assert `/api/arena/leaderboard` returns 8 bucket columns and that a known pairwise outcome produces the expected `bucketWinRate`; assert position-swap disagreements are excluded; assert a `succeeded` job auto-creates exactly one `CandidateModel` and one `post_finetune` `EvalRun`. Build with a lightweight route-test (the repo has no test harness yet — add one alongside this).

---

### Files this touches (all absolute)

- `/Users/halim/Documents/wikitongues/.claude/worktrees/fervent-jemison-b6bb05/web/prisma/schema.prisma` — new models/enums/columns (§1).
- New: `/Users/halim/Documents/wikitongues/.claude/worktrees/fervent-jemison-b6bb05/web/src/app/(app)/researcher/arena/**` — 6 screens (§5).
- New: `/Users/halim/Documents/wikitongues/.claude/worktrees/fervent-jemison-b6bb05/web/src/app/api/arena/**` — eval-run + job routes (§3, §4).
- New: `/Users/halim/Documents/wikitongues/.claude/worktrees/fervent-jemison-b6bb05/web/src/components/arena/**` — bucket-matrix table, recipe card, diff view, trajectory chart.
- New: `/Users/halim/Documents/wikitongues/.claude/worktrees/fervent-jemison-b6bb05/web/src/lib/arena/{generate,judge,aggregate,providers}.ts` — recipe runner, position-swap judge, bucket aggregator, provider fine-tune adapters.
- Edit: `/Users/halim/Documents/wikitongues/.claude/worktrees/fervent-jemison-b6bb05/web/src/app/(app)/admin/page.tsx` — add Arena nav entry.

### Defensible recommendation embedded in the design

The arena makes the council's open question (**weights vs RAG**) a measurement, not an opinion: `Gemma+RAG`, `Gemma+DPO`, and `Gemma+CPT+DPO+RAG` are sibling rows scored on the identical held-out bank, per bucket. CPT is first-class (answering the Google Translate researcher), DPO is the wired-in flywheel method (matching team direction), and the epoch trajectory turns community RLHF into a visible, monotonic curve.

---

## BRAND TOKENS + GAP LIST

I have enough. The pipeline is hard-wired (translator/reviewer with no model parameter exposed for swapping), the rubric axis mismatch is confirmed (`creativeDepth` instead of cultural-norm adherence), gap categories are 4 not the 8 buckets, and the admin dashboard is read-only with the six named components. On the brand: the JS-rendered site blocks CSS scraping, but I have a confident, defensible read of Wikitongues' identity (warm, humanist, face-centered, light/dark logo system, "Every Language in the World," dignity/consent/community values). I'll ground the palette in their well-documented warm-yellow/ink identity rather than fabricate exact hexes I couldn't scrape, and say so.

Here is the deliverable.

---

# Wikitongues AI - Design Direction + Gap Analysis

## Part 1 - Brand grounding (what I confirmed)

Wikitongues' public identity (wikitongues.org, FAQ, Wikipedia, Instagram) is **warm, humanist, community-first**: human faces and oral-history video as the hero, a light/dark dual logo system, motto "Every Language in the World" / "Safeguarding every language in the world," and value language centered on **dignity, consent, equity, and grassroots empowerment** ("celebrated, respected, and institutionally supported"; "with your rights protected"). The site is JS-rendered, so I could not scrape exact production hex values - the palette below is a defensible reconstruction of their signature warm-ochre-on-ink humanist look, tuned for a long-session research/annotation tool (lower chroma, higher legibility than a marketing site). Treat the accent hex as the one token to confirm against their official brand kit before launch; everything else is independently sound.

This is the inverse of the current Oulipo system: Oulipo is achromatic, brutalist, radius-0, no shadow, marketing-font. Wikitongues AI should read as warm, calm, legible, gently structured - serious instrument, humane surface.

---

## Part 2 - Concrete tokens (drop into `web/src/app/globals.css`)

Replace the `:root` and `@theme inline` blocks. Reintroduces an accent palette, semantic state colors, soft radii, restrained shadows, and a real dark mode.

```css
:root {
  /* ─── Brand: warm ochre + ink (Wikitongues humanist) ─── */
  --wt-ochre-50: #fdf6e9;
  --wt-ochre-100: #f9e7c2;
  --wt-ochre-200: #f2cf86;
  --wt-ochre-300: #ebb84e;
  --wt-ochre-400: #e0a21f; /* signature accent - CONFIRM vs brand kit */
  --wt-ochre-500: #c4881a;
  --wt-ochre-600: #9c6a13; /* accessible accent text on white (AA) */
  --wt-ochre-700: #744f10;

  /* Ink (warm-neutral, not pure black) */
  --wt-ink-950: #1a1714;
  --wt-ink-900: #26211c;
  --wt-ink-800: #3a332c;
  --wt-ink-700: #544a40;
  --wt-ink-500: #7d7064;
  --wt-ink-300: #b6aa9c;
  --wt-ink-200: #d8cfc4;
  --wt-ink-100: #ece6dd;
  --wt-ink-50: #f7f3ec; /* warm paper background */

  /* Supporting hue for data viz / secondary (terracotta + sage) */
  --wt-clay-500: #b5512f;
  --wt-sage-500: #4f7a5e;
  --wt-indigo-500: #3f5a8a;

  /* ─── Semantic surface/text (light = default) ─── */
  --background: #fbf8f2; /* warm off-white, not #fff */
  --surface: #ffffff;
  --surface-raised: #ffffff;
  --surface-sunken: var(--wt-ink-50);
  --foreground: var(--wt-ink-900);
  --text-primary: var(--wt-ink-900);
  --text-secondary: var(--wt-ink-700);
  --text-tertiary: var(--wt-ink-500);
  --text-muted: var(--wt-ink-300);
  --border: var(--wt-ink-100);
  --border-strong: var(--wt-ink-200);

  --accent: var(--wt-ochre-400);
  --accent-hover: var(--wt-ochre-500);
  --accent-text: var(--wt-ochre-600); /* accent used as text */
  --accent-contrast: var(--wt-ink-950); /* text ON accent fills */
  --accent-subtle: var(--wt-ochre-50); /* tinted backgrounds */

  /* ─── Semantic state (annotation tool needs these) ─── */
  --success: #2f7d54;
  --success-subtle: #e7f3ec; /* verified / approved */
  --warning: #b5790f;
  --warning-subtle: #fdf2dc; /* pending / low-confidence */
  --danger: #b23b32;
  --danger-subtle: #fbeae8; /* rejected / contested */
  --info: #3f5a8a;
  --info-subtle: #eaeff6;

  /* Pairwise A/B + rubric scale (distinct, colorblind-safe pairing) */
  --pick-a: #3f5a8a;
  --pick-b: #b5512f;
  --pick-tie: var(--wt-ink-500);
  --score-lo: #b23b32;
  --score-mid: #b5790f;
  --score-hi: #2f7d54;

  /* ─── Spacing / radius / shadow / motion ─── */
  --radius-sm: 4px;
  --radius: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 999px;
  --shadow-sm: 0 1px 2px rgba(26, 23, 20, 0.06);
  --shadow: 0 1px 3px rgba(26, 23, 20, 0.08), 0 1px 2px rgba(26, 23, 20, 0.04);
  --shadow-md: 0 4px 12px rgba(26, 23, 20, 0.08);
  --shadow-lg: 0 12px 32px rgba(26, 23, 20, 0.12);
  --ring: 0 0 0 3px var(--wt-ochre-200);
  --transition-default: 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}

[data-theme="dark"] {
  --background: #16130f;
  --surface: #1f1b16;
  --surface-raised: #262019;
  --surface-sunken: #120f0c;
  --foreground: #f1ebe1;
  --text-primary: #f1ebe1;
  --text-secondary: #c8bdac;
  --text-tertiary: #8f8472;
  --text-muted: #5c5446;
  --border: #2f281f;
  --border-strong: #423a2e;
  --accent: var(--wt-ochre-300);
  --accent-hover: var(--wt-ochre-200);
  --accent-text: var(--wt-ochre-200);
  --accent-contrast: #1a1714;
  --accent-subtle: #2a2113;
  --success-subtle: #16271d;
  --warning-subtle: #2c2110;
  --danger-subtle: #2a1714;
  --info-subtle: #161d2b;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.5);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.6);
}
```

Tailwind v4 theme bridge (replaces the radius/shadow zeroing block):

```css
@theme inline {
  --color-background: var(--background);
  --color-surface: var(--surface);
  --color-foreground: var(--foreground);
  --color-border: var(--border);
  --color-accent: var(--accent);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-danger: var(--danger);
  --color-info: var(--info);

  /* Typography pairing */
  --font-display: "Fraunces", Georgia, serif; /* humanist headline */
  --font-sans: "Inter", system-ui, sans-serif; /* UI + body */
  --font-mono:
    "JetBrains Mono", ui-monospace, monospace; /* IPA, tone marks, diffs */

  --radius-sm: 4px;
  --radius: 8px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-2xl: 16px;

  --shadow-xs: var(--shadow-sm);
  --shadow-sm: var(--shadow-sm);
  --shadow: var(--shadow);
  --shadow-md: var(--shadow-md);
  --shadow-lg: var(--shadow-lg);
}
```

### Typography pairing

- **Display / headings: Fraunces** (variable serif, optical sizing, warm humanist) - carries the Wikitongues "dignity + oral storytelling" feel without being decorative. Replaces Terminal Grotesque. Use weights 400-600, soft optical settings.
- **UI + body: Inter** - workhorse for dense annotation tables, forms, rubric grids. Replaces Standard. High x-height, excellent at 13-15px in long sessions.
- **Mono: JetBrains Mono** - critical for **IPA, Igala tonal diacritics (à/á/ā), and annotator edit diffs**. The mono slot must render combining tone marks cleanly; verify glyph coverage for the Igala orthography before launch (this is load-bearing for the whole product). Replaces Diatype.
- All three are open-source / self-hostable - drop the cargo.site `@font-face` URLs entirely.

### Stance summary

| Axis          | Oulipo (now)             | Wikitongues AI (proposed)                 |
| ------------- | ------------------------ | ----------------------------------------- |
| Color         | achromatic opacity grays | warm ochre accent + ink + semantic states |
| Background    | pure `#fff`              | warm paper `#fbf8f2`                      |
| Radius        | 0 everywhere             | 8px default, 4-16px scale                 |
| Shadow        | none                     | restrained 4-step elevation               |
| Dark mode     | none                     | full warm-ink dark theme                  |
| Headline font | Terminal Grotesque       | Fraunces (humanist serif)                 |
| Feel          | brutalist marketing      | calm, dignified instrument                |

### Component style

Soft-cornered cards (`--radius-lg`) on `--surface` over warm `--background`; 1px `--border` hairlines instead of heavy rules; primary buttons = ochre fill with `--accent-contrast` ink text, secondary = `--border-strong` outline; focus = `--ring` ochre glow (keep the existing strong focus-visible discipline). Status as **tinted pills** (`--success-subtle` etc.) not raw saturated chips. Pairwise A/B uses `--pick-a`/`--pick-b` consistently across the whole arena so annotators build muscle memory. Rubric 1-5 uses the `--score-lo/mid/hi` ramp. Data viz (leaderboard, epoch trajectory) draws from `{ochre, indigo, clay, sage}` - four hues, colorblind-distinguishable.

---

## Part 3 - Prioritized gap list (October launch)

The brief's thesis is "the best way to actually improve a low-resource model = community feedback → DPO + continued pretraining, with the weights-vs-RAG question still open." The platform today is a strong **data-collection + read-only-analytics** tool. It is missing the **closed loop**: it cannot register candidate models, cannot run them head-to-head, cannot turn the collected preferences/edits/rubrics into a training artifact, and cannot show whether anything improved across epochs. Those are the must-haves.

### MUST-HAVE (the loop does not close without these)

1. **Candidate-model registry + pipeline model-swapping.** Today `translator.ts`/`reviewer.ts`/`orchestrator.ts` are hard-coded to `claude-sonnet-4-5` with no `model` parameter exposed. You cannot evaluate a _fine-tuned Igala model_ against a baseline, which is the entire point. Add a `CandidateModel` table (provider, modelId, kind: `baseline|finetuned|rag-augmented`, epoch, weightsRef) and thread a `modelId` arg through the pipeline. _Without this, DPO output can never be measured on-platform._

2. **Model arena (head-to-head generation + blind pairwise).** The schema already stores `PairwiseComparison`, but there's no UI to _generate_ two candidates on the same prompt and serve them blind to Agnes/annotators. This is the data engine for DPO preference pairs. Must support N registered models, randomized A/B side, and blind labels.

3. **DPO export / fine-tune flywheel.** A one-click export that emits a contamination-clean DPO dataset (`prompt, chosen, rejected`) from `PairwiseComparison` + a SFT set from annotator **edits** (`HandoffItem.correctedAnswer`, `PromptEdit`, `RagEntryHistory`). The current `ExportPanel` is generic; it must emit the exact JSONL the DPO trainer consumes. This is the bridge from "annotation tool" to "training pipeline."

4. **Bucket-aligned rubric + Agnes's edit field as a first-class object.** The rubric schema is **wrong against the stated 4 axes**: it has `creativeDepth` where the brief specifies **cultural-norm adherence**. Rename `creativeDepth → culturalNormAdherence` (migration + all `admin/category-breakdown.tsx`, `gap-dashboard.tsx` refs). Also: `GapCategory` has only **4** values but the thesis references **8 buckets** (and Agnes's concrete failure modes - wrong spelling, Idoma confusion, missing honorifics, literal idioms, wrong cultural values - don't map cleanly to the 4). Expand `GapCategory` to the 8 buckets and make the **annotator edit/correction** a per-output structured field on every rubric submission, not just on escalated handoffs. _This is what makes the data teach the model the right things._

5. **Contamination-safe held-out evaluation set.** No mechanism exists to mark prompts as held-out / never-trained-on. Without a frozen eval split, you cannot defensibly claim improvement to a Google Research + NYU council - any gain could be memorization. Add `Prompt.split (train|dev|test)` + lock test prompts out of all export endpoints.

### SHOULD-HAVE (needed to be _defensible_, not just functional)

6. **Epoch trajectory / trending.** `Epoch` exists in the schema but the dashboard has no time-series. The council's first question will be "is it getting better?" Add per-axis rubric trend + win-rate-vs-baseline per epoch. Pairs with #5.

7. **LLM-judge (automated pre-screen).** A judge model scores outputs before human review, to triage the cheap cases and concentrate Agnes's scarce native-speaker time on contested/high-disagreement items. Store judge scores alongside human ones to measure judge-human agreement (you already compute Krippendorff - reuse it).

8. **Annotator collective-session support.** Igala has very few qualified annotators; adjudication of disagreements (the AgreementStats already surface them) needs a shared resolution workflow - flag contested items, let annotators discuss/resolve, promote `single_annotator → multi_annotator_verified`. Turns lonely labeling into the community RLHF loop that is the umbrella thesis.

9. **Pretraining-corpus surface.** A Google Translate researcher's insistence that Igala be in _pretraining_ has no home in the current data model. Add a lightweight corpus-contribution surface (clean Igala text/translation pairs, provenance + consent flag) distinct from RAG entries - feeds continued-pretraining, and the **consent flag honors Wikitongues' core value**. This also directly informs the open weights-vs-RAG question by letting you A/B a pretrained-in model against a RAG-augmented one in the arena (#2).

### NICE-TO-HAVE (post-October polish)

10. **Fine-tune launch from the dashboard.** Kick off the DPO/SFT job (or stage the export to it) from the researcher UI and auto-register the result as a new `CandidateModel`. Fully automates the flywheel; export-to-external-trainer (#3) is acceptable for launch.
11. **RAG-vs-weights ablation view.** Side-by-side arena preset that holds the model constant and toggles RAG on/off, surfacing the open question as a measurable experiment rather than a debate.
12. **Honorific / tone-mark-aware diff viewer.** Render annotator edits with combining-diacritic-aware highlighting (depends on the mono-font glyph work above) so tonal/spelling corrections are legible at a glance.

---

### Two load-bearing corrections to flag explicitly

- **Rubric axis bug:** `web/prisma/schema.prisma:160` `RubricScore.creativeDepth` (+ its `notesCreativeDepth`) contradicts the stated rubric of _cultural-norm adherence_. Rename before you collect more data against the wrong axis.
- **Gap taxonomy too small:** `GapCategory` (schema lines 42-47) has 4 values vs. the 8 buckets the thesis and Agnes's failure modes require. Expand before launch; retagging later is expensive.

Sources: [wikitongues.org](https://wikitongues.org/), [Wikitongues FAQ](https://wikitongues.org/about/faq/), [Wikitongues on Wikipedia](https://en.wikipedia.org/wiki/Wikitongues).

(Note: I could not scrape Wikitongues' production CSS - the site is JS-rendered and the fetch tool returns pre-hydration HTML with no inline colors. The accent hex `#e0a21f` is a reconstruction of their warm-ochre identity and is the one token to verify against their official brand kit; all structural tokens stand independently.)
