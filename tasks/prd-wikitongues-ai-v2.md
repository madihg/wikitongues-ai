# PRD: Wikitongues AI v2 — Igala Model Arena & Training Flywheel

See the canonical, full PRD content generated in-session (this file mirrors it). Companion docs:

- tasks/research-recommendation.md — verified methods recommendation
- tasks/reference-arena-and-brand.md — arena data model, screens, brand tokens, gap list
- Context.md — living project context + locked decisions

## Locked decisions

- Scope = "the instrument": rebrand + candidate registry + model-swapping + bucket rubric + edit field + held-out split + closed-API arena (per-bucket Bradley-Terry) + DPO/SFT export; fine-tune flywheel scaffolded behind a provider adapter. CPT/DPO training = post-pilot.
- Igala only (Lebanese Arabic archived).
- Supabase-backed (project smytgqkgomsfyurskpcl, schema `wikitongues`); annotation data loggable ASAP. Fresh start (no migration of prototype data).
- Quality gates: pnpm typecheck && pnpm lint && pnpm test (Vitest) && pnpm test:e2e (Playwright) + manual visual verification for UI.

## Epics / stories (see in-session PRD for full acceptance criteria)

- A Foundation: US-001 repoint DB to Supabase; US-002 test harness (Vitest+Playwright); US-003 fresh Igala-only migration.
- B Buckets: US-004 8-bucket taxonomy + rubric rename (creativeDepth->culturalNormAdherence); US-005 first-class edit field.
- C Candidates: US-006 candidate registry; US-007 model-swapping pipeline (+ @ai-sdk/google).
- D Held-out: US-008 held-out split + export lockout.
- E Arena: US-009 eval-run backend; US-010 per-bucket Bradley-Terry; US-011 leaderboard-by-bucket UI; US-012 candidate detail + head-to-head; US-013 epoch trajectory.
- F Flywheel: US-014 DPO/SFT export; US-015 fine-tune scaffold (provider adapter).
- G Judge & brand: US-016 LLM-judge triage (position-swap); US-017 Wikitongues rebrand; US-018 annotation logging + collective-session visibility.
