# Wikitongues AI v2 — Setup

The platform is **Supabase-backed**. The schema is already live in your Supabase
project (`smytgqkgomsfyurskpcl`, schema `wikitongues`). You only need to point the
app at it and seed.

## 1. Environment

```bash
cd web
cp .env.example .env.local
```

Fill `.env.local` (Supabase Dashboard → Project Settings → Database for the password):

- `DATABASE_URL` — transaction pooler (port 6543), must end with `?schema=wikitongues&pgbouncer=true&connection_limit=1`
- `DIRECT_URL` — direct connection (port 5432), must end with `?schema=wikitongues`
- `NEXTAUTH_SECRET` — `openssl rand -base64 32`
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` — the arena's three closed-API baselines

## 2. Install + client

```bash
pnpm install        # runs prisma generate
```

The schema is already applied to Supabase. If you ever change `prisma/schema.prisma`,
re-sync with:

```bash
pnpm dlx prisma db push        # greenfield-friendly; or:
pnpm db:sql                    # print the DDL to apply manually
```

## 3. Seed

```bash
pnpm seed           # Igala prompts (8 buckets, some held-out) + test users
pnpm seed:rag       # RAG knowledge base
pnpm seed:arena     # 5 baseline candidates (Claude, GPT, Gemini, +RAG variants)
```

Test logins (password `password`): `researcher@test.com`, `annotator@test.com`.

## 4. Run

```bash
pnpm dev            # http://localhost:3000
```

Researcher → **Model Arena** (`/admin/arena`) and **Candidates** (`/admin/arena/candidates`).

## 5. Quality gates

```bash
pnpm typecheck      # tsc --noEmit            (clean)
pnpm lint           # eslint                  (clean)
pnpm test           # vitest                  (17 unit/logic tests)
pnpm test:e2e       # playwright (needs: pnpm dlx playwright install chromium + a running app)
```

## What logs to Supabase (the flywheel data)

Every annotation persists to the `wikitongues` schema and is queryable immediately:

- `PairwiseComparison` (winner + explanation, bucket-tagged) → DPO pairs
- `RubricScore` (4 axes 1-5, bucket-tagged) → reward/eval signal
- `OutputEdit` (Agnes's corrections) → SFT gold targets

Export clean training sets (held-out prompts always excluded):

- `GET /api/arena/export?type=dpo`
- `GET /api/arena/export?type=sft&minVerification=multi_annotator_verified`
