[PRD]
# PRD: Data rights, consent and three-tier licensing

Date: 2026-10-19. Owner: Halim Madi. Status: draft, supersedes the ownership answer in tasks/speech/prd-igala-speech-tts-first-2026-10-19.md. Audit of the current state: AUDIT.md. Legal wording is PENDING COUNSEL throughout; this document specifies product behaviour, not legal advice.

## Overview

Contributors (Igala speakers who record, write, correct and judge) keep the copyright in what they create. Wikitongues holds a non-exclusive, sublicensable licence scoped per item by a tier the contributor chooses, and holds the compilation. Every item is one of three tiers: OPEN (CC-BY 4.0, permanent once published), LICENSED (bespoke non-exclusive commercial licence under a signed agreement and gated access), or COMMUNITY-ONLY (used only inside that community's own retrieval layer). Nothing is pre-selected toward licensing; an item without an explicit choice is COMMUNITY-ONLY. The private benchmark never leaves. Contributors are paid a fixed share of licensing revenue. Everything collected so far is COMMUNITY-ONLY until each contributor gives retrospective consent.

Copy rule for every surface: "Speakers keep the rights to what they record and write." and "Wikitongues licenses data only as each speaker chooses."

### Why the earlier answer was rejected

The Oct 19 speech PRD said "Wikitongues owns the data and releases it CC-BY-4.0". That is withdrawn:
- CC licences cannot be revoked once applied, which makes the opt-out promise impossible (Creative Commons FAQ, https://creativecommons.org/faq/).
- CC-BY lets any lab, Google included, train for free, which removes the revenue that pays contributors.
- An open benchmark is contaminated the moment it is published; the frozen exam only works private.
- "Wikitongues owns" contradicts the contributors' copyright.
- Waxal is not a precedent: Google paid for it and benefits from an open commons (https://research.google/blog/waxal-a-large-scale-open-resource-for-african-language-speech-technology/).
- Also rejected: CC0 for anything beyond trivial samples; CC-BY-NC as protection (NC does not bind where fair use or text-and-data-mining exceptions apply: https://creativecommons.org/2025/05/15/understanding-cc-licenses-and-ai-training-a-legal-primer/); Hippocratic License and AGPL for data (software licences, deter lab counsel); a Google-only licence; any exclusivity.
- Principle: a public licence alone protects little. Protection is a signed contract plus access control.

## Goals

- Every data item carries a tier, a consent record (versioned text, hash, method) and a funding source, and the defaults protect the contributor.
- No path (API, export, script, backup, repo) can move COMMUNITY-ONLY or test-set data out; this is proven by tests that try every path.
- Contributors can see, change and opt out of their items' tiers and see their royalty statements.
- Licensees receive data only through authenticated, logged, expiring delivery under an active signed agreement, with the community allow-list enforced.
- Labs evaluate against the private benchmark only as a service that returns scores.
- The repository holds no contributor data, no test-set content and no personal data.

## Quality Gates

Run from `web/` for every story: `pnpm typecheck` (exit 0), `pnpm lint` (exit 0), `pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork --no-file-parallelism` (all pass). Migrations are reversible (each has a down path) and are never run against production by an agent. Any committed file that could carry Igala passes `npx tsx --env-file=.env.local scripts/leak-check-files.ts <files>` with 0 hits. Fixtures are synthetic.

## Sections and acceptance criteria

### 1. Rights and consent

- [ ] Consent screen (written form) and an oral script, both in simple English that survives machine translation, with placeholders for Igala and other translations; text stored in `consents` with version, language, method (written or verbal), timestamp, witness for verbal, and the SHA-256 of the exact text shown.
- [ ] The screen explains how to withdraw BEFORE the consent question; states that OPEN is permanent once published, that opt-out cannot untrain models already trained, and how royalties work.
- [ ] Separate explicit consents stored per contributor and version: commercial licensing; transfer outside Nigeria and Ghana; voice cloning (default off); speaker identification (default off).
- [ ] Grant text covers recordings, written answers, annotations, corrections and preference judgments; includes a moral-rights waiver where lawful; names the licence as worldwide, non-exclusive, sublicensable, scoped by tier. PENDING COUNSEL.
- [ ] Nothing is pre-checked. The current consentBenchmark and consentTraining checkboxes (default true) are removed from the episode and replaced by the tier choice.
- [ ] Retrospective-consent flow: existing contributors see a one-time screen listing their item counts by type and can grant the new consent; until they do, all their items are COMMUNITY-ONLY. The flow records which rows were covered.

### 2. Tiers

- [ ] Enum tier: open, licensed, community_only; default community_only on every data table; a tier_history row for each change with actor, time and reason.
- [ ] OPEN requires: contributor chose it, item is not test set, funder rule or contributor choice; published_open_at set at publication locks the tier to open. Local Contexts labels stored per item.
- [ ] LICENSED requires: contributor chose it AND commercial_licensing_consent AND cross_border_consent (when the licensee is outside Nigeria and Ghana).
- [ ] COMMUNITY-ONLY: never exported, never licensed, used only in that community's retrieval layer; the retrieval loader filters by community.
- [ ] Per-item choice in the UI with the three options explained in one plain sentence each and no default selected toward licensing.

### 3. Data model (adapt names to the existing schema)

- [ ] Per item (ColdAuthorAnswer, OutputEdit, PairwiseComparison, RubricAxisScore, RubricScore, SpeechRecording): tier, consent_id, consent_version, consent_method, contributor_id (existing annotatorId), community_id, language, dialect, funding_source (gates, lacuna, google_research, licence_revenue, unrestricted, unknown; default unknown), local_contexts_labels, is_test_set (derived from the prompt's split and forced true on frozen prompts), published_open_at, commercial_licensing_consent, cross_border_consent, voice_cloning_opt_in (false), speaker_id_opt_in (false).
- [ ] Tables: consents, tier_history, communities (provider allow-list, settings), licensees, licence_agreements (licensee, term start, term end, renewal date, field of use, price tier, signed document reference, status), deliveries (snapshot id, licensee, item ids, delivered at, deletion certified at), optout_requests, royalty_ledger (revenue events, pool share, allocation per contributor), access_log (who, what, when, route).
- [ ] Migrations reversible; backfill sets tier community_only and funding_source unknown on every existing row; a report lists counts per table.

### 4. Access control and gated delivery

- [ ] No public endpoint returns LICENSED, COMMUNITY-ONLY or test-set data; /api/public stays numbers and ids only (test).
- [ ] Licensee accounts (new role LICENSEE) see only a delivery page: their agreements, snapshots, expiring signed URLs; every download writes access_log.
- [ ] RLS on with deny-all policies on every data table; the app's service role path stays; no public bucket is ever created by code (test on the storage helper).
- [ ] Public self-registration no longer grants ANNOTATOR; new annotators are created by a researcher or by invite.

### 5. Opt-out and renewal enforcement

- [ ] A contributor can move any item out of LICENSED at any time; this writes an optout_request and tier_history and blocks the item from every future snapshot.
- [ ] At each licence renewal the delivery set is recomputed; opted-out items are listed for deletion and the licensee's deletion certificate is recorded in deliveries.
- [ ] OPEN items cannot be withdrawn after published_open_at; before that they can be moved (test).
- [ ] The consent and My Work copy say plainly that opt-out cannot untrain models already trained.

### 6. Community provider allow-list

- [ ] communities.provider_allowlist (Google, OpenAI, Anthropic, Meta, Mistral, others, each on or off) editable by the community's lead account; overrides any contract default; no provider can be marked exclusive (schema check).
- [ ] The LICENSED export rule includes "licensee on the community allow-list" and a test proves a delisted provider gets nothing.

### 7. Evaluation-as-a-service

- [ ] Endpoint where an authenticated licensee submits model outputs for the benchmark prompt ids (ids and a submission token only, never the prompt text) or registers an endpoint Wikitongues calls; Wikitongues runs the frozen exam and returns scores and intervals only.
- [ ] No response ever contains a prompt text, a gold answer or a per-item diff; test asserts the response schema.
- [ ] Rate and attempt limits per licensee to stop test-set reconstruction by probing.

### 8. Licensing operations

- [ ] docs/licence-template-DRAFT.md (non-exclusive commercial data licence modelled on the Esethu licence's commercial component, https://arxiv.org/pdf/2502.15916): 2 to 3 year renewable term; no exclusivity, no right of first refusal, no restriction on licensing others; per-language and per-community opt-out honoured at renewal; deletion of raw data at term end with certification; attribution; no surveillance, speaker identification or voice cloning without separate consent; audit rights. Marked DRAFT, not legal advice.
- [ ] Free tier for research, nonprofits and local entities below a revenue threshold (config value, PENDING Halim); fee tiers for large commercial labs (PENDING Halim). Distribution direct and through Mozilla Data Collective (https://community.mozilladatacollective.com/about/).
- [ ] docs/google-agreement-checklist.md with the clauses listed in the decision.

### 9. Royalty accounting

- [ ] royalty_ledger records each revenue event; pool share is a config value (placeholder 50 percent, flagged PENDING board decision); allocation pro rata by accepted tasks or hours (Karya model, https://time.com/6297403/the-workers-behind-ai-rarely-see-its-rewards-this-indian-startup-wants-to-fix-that/).
- [ ] My Work shows each contributor their statement; an annual public revenue report is generated from the ledger (template only in this PRD).
- [ ] Tax treatment of royalties versus services (eval-as-a-service and API delivery may be unrelated business income): PENDING COUNSEL.

### 10. Funding-source tagging

- [ ] Every new item records funding_source at collection (set per campaign or per session by a researcher); existing rows are unknown until Halim assigns them.
- [ ] Funder rules as config: gates and lacuna force OPEN eligibility (Gates Open Access Policy 2025, https://openaccess.gatesfoundation.org/open-access-policy/2025-open-access-policy/; Global Access, https://www.gatesfoundation.org/about/policies-and-resources/global-access-statement; Lacuna requires CC-BY), subject to the contributor's consent and never for the test set. Licence-revenue-funded collection is accounted separately. PENDING COUNSEL on the grant terms.

### 11. Compliance

- [ ] Recordings are sensitive personal data under Nigeria's Data Protection Act 2023 (https://cert.gov.ng/ngcert/resources/Nigeria_Data_Protection_Act_2023.pdf): lawful basis recorded, consent freely given and specific, data minimised, retention stated, breach process documented. PENDING COUNSEL.
- [ ] Ghana Data Protection Act 2012 for Ghana-based contributors; GDPR for EU-based; Illinois BIPA for diaspora contributors in Illinois (biometric identifiers include voiceprints): written release, retention schedule, no sale. PENDING COUNSEL.
- [ ] Cross-border transfer basis for delivery outside Nigeria and Ghana: PENDING COUNSEL.

### 12. Repository hygiene (from AUDIT.md)

- [ ] No contributor data, test-set content or personal data in the repo; synthetic fixtures only; .gitignore for backups and results.
- [ ] LICENSE: MIT, code only (the README already says MIT). DATA_LICENSE.md: the three tiers, no data covered by the code licence, how to request a licence, the opt-out promise. README section "Data and licensing". CONTRIBUTING: real contributor data never goes in the repo.
- [ ] Dataset card template for OPEN releases: CC-BY 4.0, Local Contexts labels, funding source, consent version, known limits.

### 13. Non-goals

- Publishing any dataset (a separate decision, after consent and counsel).
- Rewriting git history or deleting files (Halim's decision, see AUDIT.md A10).
- Setting prices, the free-tier threshold or the royalty share (Halim and the board).
- Building a payments system; the ledger records allocations, payment is manual for now.
- Exclusive deals with any provider.

## Re-check of the speech PRD's other answers against this decision

- Question 1, TTS first: stands. The pilot voice is trained only on recordings whose contributor chose LICENSED or OPEN with voice_cloning_opt_in true for the voice speaker, or on the single consented studio speaker; the arena listening judgments are items with their own tier.
- Question 2, record in the annotate screen: stands, with the Section 1 consent flow in front of the first recording and a per-item tier choice after each clip; nothing pre-selected.
- Question 4, gates: stand; add the leak check and the export-path tests from Section 2 and 4 to the speech stories.
- Speech PRD lines to change: the decision line "Wikitongues owns the data and releases it CC-BY-4.0"; US-001's consentRelease field (becomes tier plus the Section 1 consents); US-004's manifest licence string (licence follows the tier; LICENSED exports only through Section 4); FR-2 and FR-8 (consentRelease becomes tier logic); Technical Considerations and Open Questions that cite Waxal as the template.

## Open questions (Halim)

- Royalty pool share; free-tier revenue threshold; price tiers.
- History remediation and the fate of the current 43-item test set (AUDIT.md A10).
- Funding-source tags for existing data.
- Consent translations (Igala first) and who records the oral script.
- Counsel review of: consent wording, grant text, cross-border basis, BIPA, UBIT treatment, Gates and Lacuna terms.
- Code licence for the site repo (none today).
[/PRD]
