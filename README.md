# Wikitongues AI

**A collaboration between Halim Madi and [Wikitongues](https://wikitongues.org)**

An AI-powered platform for evaluating and improving language model performance on endangered and low-resource languages. The system combines a learner-facing chatbot with a human annotation pipeline and a research dashboard — creating a feedback loop between AI generation, expert human review, and model improvement.

---

## What this does

Most large language models perform poorly on low-resource languages. They hallucinate vocabulary, miss cultural nuance, and confuse dialects. This platform makes that visible and fixable.

It works in three parts:

1. **Learner interface** — A chatbot where someone can practice or learn an endangered language. Responses come from a three-agent AI pipeline. Low-confidence responses are automatically flagged and routed to human experts.

2. **Annotation platform** — Human experts (annotators) review AI-generated responses, score them on cultural accuracy and linguistic authenticity, and correct errors. Their work feeds back into the knowledge base.

3. **Research dashboard** — Researchers track model performance across languages, compare models head-to-head, identify knowledge gaps, and export benchmark data.

---

## Three-agent pipeline

Every learner message goes through three agents in sequence:

```
Learner message
       │
       ▼
┌──────────────┐
│  Translator  │  Generates a response using RAG (verified cultural/linguistic
│    Agent     │  knowledge base) + Claude Sonnet 4.5. Self-rates confidence.
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Reviewer   │  Scores the response 0–100. Checks for hallucinations,
│    Agent     │  cultural insensitivity, dialect errors, factual mistakes.
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Orchestrator │  Routes based on confidence:
│    Agent     │  ≥70 → response goes to user
└──────────────┘ 50–70 → retry with reviewer feedback
                  <50 → escalate to human annotator (with disclaimer)
```

All pipeline runs are logged for analysis and benchmarking.

---

## Current languages

- **Igala** (Niger-Congo, Nigeria)
- **Lebanese Arabic** (Semitic, Lebanon/diaspora)

More languages to be added.

---

## Models used

- **Generation**: Claude Sonnet 4.5 (Anthropic) — pluggable, any model can be swapped in
- **Embeddings**: OpenAI `text-embedding-3-small` for semantic RAG search
- **Database**: PostgreSQL with pgvector for similarity search
- **Planned**: Gemini integration

---

## Tech stack

| Layer         | Technology                           |
| ------------- | ------------------------------------ |
| Frontend      | Next.js 14 (App Router)              |
| Auth          | NextAuth.js                          |
| Database      | PostgreSQL (Neon) + Prisma ORM       |
| Vector search | pgvector                             |
| AI            | Anthropic Claude + OpenAI embeddings |
| Deployment    | Vercel                               |
| Benchmarking  | Python scripts (Phase A)             |

---

## Personas

| Role           | Who they are                                        | What they do                                                             |
| -------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| **Learner**    | Heritage speaker, curious learner, language student | Chats with the AI to practice or learn a language                        |
| **Annotator**  | Fluent/native speaker of the target language        | Reviews AI outputs, scores them, corrects errors, manages prompts        |
| **Researcher** | Linguist or academic                                | Tracks model performance, studies knowledge gaps, exports benchmark data |

---

## Demo

**Live app**: https://wikitongues-ai-halims-projects.vercel.app

| Role       | Email                                     | Password   |
| ---------- | ----------------------------------------- | ---------- |
| Annotator  | `annotator@test.com`                      | `password` |
| Researcher | `researcher@test.com`                     | `password` |
| Learner    | Register free at `/register?role=learner` | —          |

---

## Local setup

### Prerequisites

- Node.js 18+
- PostgreSQL with pgvector extension (or a Neon account)
- Anthropic API key
- OpenAI API key

### Web app

```bash
cd web
cp .env.example .env.local
# Fill in DATABASE_URL, NEXTAUTH_SECRET, ANTHROPIC_API_KEY, OPENAI_API_KEY

npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
```

App runs at `http://localhost:3000`.

### Seed the knowledge base

```bash
npm run seed         # Users, prompts, languages
npm run seed:rag     # RAG knowledge base entries
npm run seed:outputs # Model outputs for annotation
```

### Python benchmarking (Phase A)

```bash
pip install -e .
cp .env.example .env
# Fill in API keys
python scripts/benchmark.py
```

---

## Project structure

```
wikitongues/
├── web/                    # Next.js application
│   ├── src/
│   │   ├── app/            # Pages (App Router)
│   │   │   ├── (app)/      # Protected annotator/researcher pages
│   │   │   ├── (auth)/     # Login, register
│   │   │   └── (learner)/  # Learner chat interface
│   │   ├── components/     # React components
│   │   └── lib/
│   │       ├── agents/     # Translator, Reviewer, Orchestrator agents
│   │       └── rag.ts      # RAG retrieval system
│   └── prisma/             # Database schema and migrations
└── scripts/                # Python benchmarking scripts
```

---

## About

This project is a collaboration between **[Halim Madi](https://github.com/madihg)** and **[Wikitongues](https://wikitongues.org)**, a nonprofit dedicated to documenting and revitalizing endangered languages worldwide.

The platform is designed to surface where today's AI models fall short on cultural and linguistic nuance — and to build a human-in-the-loop system that closes those gaps over time.

---

## License

MIT
