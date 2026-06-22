# Wikitongues AI

**A collaboration between Halim Madi and [Wikitongues](https://wikitongues.org)**

Teaching AI to speak the world's underserved languages, community by community —
starting with **Igala** — and building the public benchmark that holds every
model accountable for how well it does.

This is not just a tutor. It is the **instrument** for actually improving a
language model on a low-resource language: a community-run annotation platform
whose every judgment becomes training data, and a researcher-mode **model arena**
that ranks model variants per linguistic dimension and turns the open question
"weights vs. retrieval" into a measurement.

---

## The thesis (verified)

There is no single method to teach a model Igala. It is a staged ladder, and the
order is the insight: **SFT-on-edits → DPO/KTO**, on an open-weights base, with
**RAG kept permanently for facts**. Weights own _form_ (orthography, morphology,
register, authenticity); retrieval owns _facts_ (taboo, idioms, dialect,
disambiguation). DPO is the alignment _finisher_, not the teacher — on a base
that can't spell Igala it just ranks two wrong answers. Continued pretraining is
the eventual lever but is post-pilot (the clean corpus doesn't exist yet).

Full, adversarially-verified write-up: [`tasks/research-recommendation.md`](tasks/research-recommendation.md).

## The flywheel

The platform's annotation data **is** the training data:

| Annotation                            | Becomes                                                |
| ------------------------------------- | ------------------------------------------------------ |
| Pairwise (winner + explanation)       | DPO preference pairs **and** the Bradley-Terry ranking |
| Annotator edits (Agnes's corrections) | SFT gold targets                                       |
| Rubric scores (4 axes, 1-5)           | Reward/eval signal + per-bucket diagnostics            |

Collect → build training sets → fine-tune candidate → register in the arena →
evaluate vs. baselines → promote winner → repeat (epochs).

## The 8 evaluation buckets

Each bucket is a prompt category, a rubric axis, and a data-collection target:

1. Orthography & spelling 2. Grammar, morphology & tone 3. Lexicon & disambiguation
2. Dialectal fidelity 5. Register & honorifics 6. Idioms & metaphor
3. Cultural knowledge & values 8. Authenticity vs. translationese

## The model arena (researcher mode)

Register model variants that differ by exactly one rung — a closed baseline, the
same base + RAG, a fine-tuned variant — and rank them on a contamination-safe
held-out bank, **per bucket**, by human pairwise (Bradley-Terry with confidence
intervals). LLM-as-judge is restricted to triage; it cannot grade a language it
is itself poor at. `ns` cells = not statistically distinguishable at the current
sample size (expected while the annotator pool is small — honest by design).

---

## Roles

| Role           | Who                          | What they do                                                           |
| -------------- | ---------------------------- | ---------------------------------------------------------------------- |
| **Learner**    | Heritage speaker / learner   | Practices Igala with the AI tutor                                      |
| **Annotator**  | Fluent/native (Agnes's team) | Picks the better output, scores the rubric, **edits outputs directly** |
| **Researcher** | Linguist / advisory council  | Runs the arena, compares variants per bucket, exports training sets    |

## Tech stack

| Layer    | Technology                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------- |
| Frontend | Next.js 16 (App Router), React 19, Tailwind v4                                                        |
| Auth     | NextAuth.js                                                                                           |
| Database | **Supabase Postgres** (schema `wikitongues`) + Prisma + pgvector                                      |
| AI       | Anthropic + OpenAI + Google (swappable per candidate); OpenAI-compatible for self-hosted open weights |
| Ranking  | Bradley-Terry (per bucket) with bootstrap CIs                                                         |
| Tests    | Vitest (unit/logic) + Playwright (e2e)                                                                |

## Setup

See [`web/SETUP.md`](web/SETUP.md). In short: fill `web/.env.local` with your
Supabase connection strings + provider keys, `pnpm install`, `pnpm seed && pnpm
seed:arena`, `pnpm dev`. The schema is already live in Supabase.

## Quality gates

`pnpm typecheck` · `pnpm lint` · `pnpm test` (17 logic tests, incl. Bradley-Terry
and the contamination-guard) · `pnpm test:e2e` · `pnpm build`.

---

## About

A collaboration between **[Halim Madi](https://github.com/madihg)** and
**[Wikitongues](https://wikitongues.org)**, building toward the first public Igala
model leaderboard for the Wikimedia Foundation conference (Ghana, Oct 2026).

## License

MIT
