[PRD]
# PRD: Igala speech, text-to-voice first

Date: 2026-10-19. Owner: Halim Madi. Status: draft for review, not yet built.
Decisions taken by Halim on 2026-10-19: first deliverable is text-to-voice (TTS); first speech data is recorded inside the annotate screen; Wikitongues owns the data and releases it CC-BY-4.0; every story passes typecheck, lint and vitest.
Evidence: tasks/speech/research-igala-speech-methodology-2026-10-19.md (sources in tasks/speech/papers-and-sources-2026-10-19.md).

## Overview

The Igala community asked for two things, in this order: Wikipedia translation, then speech in both directions. The partners (Google Research, the Gates-funded African language programmes) want open speech data, a benchmark and community ownership. Today the platform holds text only. No Igala TTS exists anywhere. One ASR exists (Meta Omnilingual ASR, Apache-2.0, trained on 7.6 hours of Igala, CER 27.6 on an unstated test set), which gives a free baseline.

This PRD adds a speech layer to the existing platform in the order the evidence supports: capture consented speaker recordings where the speakers already work (the annotate screen), build the conventions and the tone-marking step a TTS voice needs, run the free ASR baseline, pilot one TTS voice, and judge it in the same blind pairwise way the text answers are judged. A recording campaign in Kogi, ASR training and any voice cloning are out of scope for this PRD.

## Goals

- Every locked speaker answer can carry a consented recording of the speaker saying it, stored privately, with the CC-BY release and the synthetic-voice permission recorded per clip.
- A written orthography and tone convention exists and is enforced in the export, so recordings and transcripts can be scored tone-stripped and tone-retained.
- The Omnilingual ASR baseline is measured on Igala audio we hold, with CER, WER and a tone error rate, before any training.
- A tone-mark restoration step (Gemini with the Igala grammar prompt and retrieval) is measured against speaker-marked gold on a held-out set.
- One TTS voice is produced from 1 to 2 hours of a single speaker and judged by native listeners in a blind pairwise arena of at least 100 pairs per listener.
- A CC-BY-4.0 dataset manifest can be exported at any time with consent fields, excluding frozen exam prompts and non-consented rows.

## Quality Gates

These commands must pass for every user story (run from `web/`):

- `pnpm typecheck` - TypeScript, exit 0
- `pnpm lint` - ESLint, exit 0
- `pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork --no-file-parallelism` - all tests pass

Also, for any committed file that quotes Igala: `npx tsx --env-file=.env.local scripts/leak-check-files.ts <files>` reports 0 hits (the repository is public and frozen exam gold must never appear in it). Python pipelines (US-007, US-008) ship with a `make check` or `pytest` that runs on a tiny fixture.

## User Stories

### US-001: Speech recording table, bucket and consent fields

**Description:** As a researcher, I want every recording stored with who said it, what text it is, and what the speaker consented to, so the dataset can be released and audited.

**Acceptance Criteria:**
- [ ] Prisma model `SpeechRecording` with: id, promptId, coldAuthorAnswerId (nullable), modelOutputId (nullable, for later TTS outputs), annotatorId, storagePath, mimeType, durationMs, sampleRate, dialect (free text, same options as ColdAuthorAnswer), consentRelease (Boolean, CC-BY-4.0 release), consentSyntheticVoice (Boolean, may be used to train a voice), isDemo, demoSessionId, verificationStatus, createdAt; indexes on promptId, annotatorId, isDemo
- [ ] Migration applied with `prisma migrate` and committed; `prisma generate` succeeds
- [ ] A private Supabase Storage bucket `igala-speech` exists; a server-side helper in `web/src/lib/speech/storage.ts` returns a short-lived signed upload URL and a signed read URL; no public URL is ever produced
- [ ] A unit test proves rows on frozen (isHoldout or split test) prompts are refused by the shared guard in `web/src/lib/speech/guard.ts`

### US-002: Record my answer in the annotate screen

**Description:** As an annotator, I want to record myself saying the answer I just locked, so my voice becomes training and evaluation data.

**Acceptance Criteria:**
- [ ] After the cold answer is locked, a "Record yourself saying it" control appears under the locked answer (web/src/components/annotation-interface.tsx), optional, never blocking the episode
- [ ] Recording uses MediaRecorder with `audio/webm` where supported and `audio/mp4` on iOS Safari; maximum 30 seconds; the UI shows elapsed time, Stop, Play back, Re-record, Delete
- [ ] First use shows a plain-language consent card with two checkboxes (release under CC-BY-4.0; may be used to make a synthetic voice) and a one-line explanation of each; the choice is remembered per account server-side and shown again as a one-line summary on later recordings
- [ ] Upload goes to the signed URL from US-001; failures show a retry and never lose the locked text answer
- [ ] In demo mode the recording is stored with isDemo true and the banner says it is not counted
- [ ] A source-level test asserts the control appears only after coldLocked and that submit does not depend on it

### US-003: Recording API

**Description:** As the platform, I want one route that issues upload URLs and writes the recording row, so every clip is attributed and guarded.

**Acceptance Criteria:**
- [ ] `POST /api/annotations/recording` (signed-in) takes promptId, coldAuthorAnswerId, mimeType, durationMs, consent flags, demoSessionId; returns the signed upload URL and the row id
- [ ] `PATCH /api/annotations/recording/:id` marks the upload complete with the final size and checksum
- [ ] Refuses frozen prompts (403 with no detail), unknown prompts (404), clips over 30 seconds or over 5 MB (400)
- [ ] Route tests cover the four refusals, the demo path and the happy path with the storage helper mocked

### US-004: Researcher recordings review and manifest export

**Description:** As a researcher, I want to listen to what was recorded, flag bad audio, and export a manifest, so the corpus is clean before anyone trains on it.

**Acceptance Criteria:**
- [ ] `/admin/recordings` (RESEARCHER only) lists recordings with prompt text, locked answer, speaker, dialect, duration, consent flags, and an inline player using signed read URLs
- [ ] One-click flags: "bad audio", "wrong text", "keep"; stored on the row (new field `reviewStatus`)
- [ ] `scripts/speech/export-manifest.ts` writes JSONL with: clip path, transcript as locked (tone-retained), transcript tone-stripped by the normaliser from US-005, speaker pseudonym, dialect, consent flags, licence string "CC-BY-4.0"; excludes frozen prompts, isDemo rows, non-consented rows and rows flagged bad
- [ ] A test proves a frozen prompt and a non-consented row never reach the manifest

### US-005: Orthography normaliser and speech metrics

**Description:** As a researcher, I want one tested normaliser and one scoring module, so every ASR and TTS number in this project is computed the same way.

**Acceptance Criteria:**
- [ ] `web/src/lib/speech/normalise.ts` exposes `toneStrip`, `normaliseForScoring` (NFC, case, punctuation, whitespace, the agreed contraction spellings) and `toneErrorRate`; dotted vowels and dotted n are letters and are never stripped
- [ ] `web/src/lib/speech/metrics.ts` exposes `cer`, `wer`, scored on normalised text, plus the tone-retained variants
- [ ] The contraction table lives in a config file `web/src/lib/speech/orthography.json` with a comment pointing at the ruling it encodes; empty until Salem and Lydia rule, and the normaliser passes it through untouched when empty
- [ ] Unit tests with English-glossed fixtures only (no frozen gold)

### US-006: Omnilingual ASR baseline on the audio we hold

**Description:** As a researcher, I want the free Igala ASR baseline measured on our audio, so training decisions rest on a number.

**Acceptance Criteria:**
- [ ] `pipelines/speech/asr-baseline/` (Python, pinned requirements) runs Meta Omnilingual ASR (CTC and the LLM variant if hardware allows) on a folder of clips plus a manifest, and writes CER, WER, tone-retained CER and tone error rate per clip and in aggregate, using the same normalisation rules as US-005 (ported, with a cross-check fixture shared by both)
- [ ] First run on the GRN "Words of Life" recording after it has been segmented and transcribed by the annotators in the recordings review (US-004 can host these segments as rows with coldAuthorAnswerId null); the report records transcription labour hours per audio hour
- [ ] Output report committed to `tasks/speech/asr-baseline-<date>.md` without any Igala text (numbers and clip ids only)
- [ ] `make check` runs the pipeline on a 3-clip fixture with a tiny model stub

### US-007: Tone-mark restoration pass and its held-out score

**Description:** As a researcher, I want a measured step that adds tone marks to bare Igala text, so TTS scripts and the tone-retained scores do not depend on who typed the answer.

**Acceptance Criteria:**
- [ ] `web/src/lib/speech/tone-restore.ts` calls the existing v4.5 generation path with a restoration instruction (not stored, not served to annotators), returns marked text, and refuses to change letters other than adding or removing combining marks
- [ ] `scripts/speech/eval-tone-restore.ts` builds a held-out set from speaker answers that carry tone marks (train prompts only), strips them, restores, and reports tone error rate and letter-change violations
- [ ] Result committed to `tasks/speech/tone-restore-<date>.md` with numbers only
- [ ] Tests: the letter-change guard, and the exclusion of frozen prompts from the held-out set

### US-008: TTS script builder

**Description:** As the project, I want a tone-marked, domain-matched reading script for one studio speaker, so the pilot voice is trained on the text it will be asked to say.

**Acceptance Criteria:**
- [ ] `scripts/speech/build-tts-script.ts` assembles sentences from consented speaker answers and translated long-form prompts (train split only), restores tone marks with US-007, deduplicates, and targets 1 to 2 hours of reading at about 130 words per minute
- [ ] Reports letter and digraph coverage (including kw, gw, nw, ch, dotted vowels) and sentence length distribution
- [ ] Output is written outside the repository (path given on the command line) and never committed
- [ ] Test on an English-glossed fixture proves dedup, split guard and the coverage report

### US-009: TTS pilot pipeline

**Description:** As the project, I want one fine-tuned Igala voice from 1 to 2 hours of one speaker, so native listeners can judge it.

**Acceptance Criteria:**
- [ ] `pipelines/speech/tts-pilot/` fine-tunes a pretrained multilingual TTS model on the recorded script; first candidate OmniVoice, with MMS-TTS or VITS as a second system only if its non-commercial licence is acceptable for the pilot; the chosen model's licence is written into the pipeline README before any training run
- [ ] Synthesises a fixed prompt set (the 108-question bank's train-side answers) to WAV at 24 kHz or higher and uploads them as `SpeechRecording` rows with modelOutputId set and annotatorId null
- [ ] Records data hours, GPU hours, model version and seed in `tasks/speech/tts-pilot-<date>.md`
- [ ] `make check` runs a smoke synthesis with a stub model on 3 sentences

### US-010: Blind listening arena

**Description:** As an annotator, I want to hear two audio versions of the same answer and pick the better one, so voices are judged the way text answers are.

**Acceptance Criteria:**
- [ ] New lane in the annotate flow, "Listen", served when a prompt has at least two synthesised clips; reuses assignedPair and abSwap so A and B are blind and stable per annotator and prompt
- [ ] The screen shows the text, two players, Pick A, Pick B, Tie, Both unusable, and a required one-tap reason chip set (wrong word, wrong tone, unclear, robotic, wrong pronunciation) plus an optional note
- [ ] Stored in `SpeechComparison` (same shape as PairwiseComparison with clip ids), one counted judgment per annotator and prompt, demo-aware
- [ ] Researcher dashboard card shows per-system wins, ties, both unusable, and a Bradley-Terry score with a bootstrap interval once 100 or more judgments exist
- [ ] Route and component tests mirror the text arena's

### US-011: Tone minimal-pair items

**Description:** As a researcher, I want listening items that test tone specifically, so a fluent-sounding voice with wrong tones is caught.

**Acceptance Criteria:**
- [ ] A researcher can mark a prompt as a tone minimal pair with two target spellings (train side only); the Listen lane then asks "Which word did you hear?" after the pairwise pick
- [ ] Results reported as tone accuracy per system beside the arena card
- [ ] Tests for the guard that keeps frozen prompts out and for the scoring

## Functional Requirements

- FR-1: Recordings are optional and never block submission of a text judgment.
- FR-2: Every recording row carries both consent flags; a row with consentRelease false is never exported.
- FR-3: No route serves, stores or exports audio or text for a frozen exam prompt.
- FR-4: All storage is private; access is through short-lived signed URLs issued server-side to signed-in users with the right role.
- FR-5: All ASR and TTS scores are computed through the US-005 normaliser; both tone-stripped and tone-retained numbers are reported.
- FR-6: Demo sessions store speech rows with isDemo true and they are excluded from every count, export and arena result.
- FR-7: The contraction and tone conventions live in one config file and are versioned; a change bumps a version string stored on new rows.
- FR-8: Synthesised clips are stored as SpeechRecording rows with modelOutputId set, never mixed with human clips in exports unless the manifest flag `includeSynthetic` is passed.
- FR-9: Human clips are never used for voice cloning of a speaker who did not tick consentSyntheticVoice.
- FR-10: Every committed report in tasks/speech contains numbers and identifiers only, no Igala text.

## Non-Goals (Out of Scope)

- A recording campaign in Kogi State or paid studio sessions beyond one pilot speaker (phase 2, pending funding and the Google agreement).
- Training or fine-tuning ASR (only the baseline measurement is in scope).
- Live speech-to-speech, voice chat, or dictation into the annotate screen.
- Zero-shot voice cloning of any speaker.
- Public release of audio; this PRD produces an exportable manifest, release is a separate decision.
- Changing the text arena, the pool or the frozen exam.

## Technical Considerations

- The app reaches Gemini through OpenRouter (OPENROUTER_API_KEY); a Gemini TTS or audio route would need a direct Google key (GOOGLE_API_KEY) added by Halim.
- Supabase project smytgqkgomsfyurskpcl has no bucket for this project yet; create `igala-speech` private, with RLS off and all access via the service role on the server.
- MediaRecorder on iOS Safari produces audio/mp4 (AAC); store the mimeType and convert to WAV in the pipelines, not in the browser.
- Keep clips under 30 seconds and 5 MB; the annotators work on phones with limited data.
- Python pipelines live under `pipelines/speech/` with pinned requirements and a Makefile; they are not part of the Next.js build.
- Reuse `web/src/lib/pairing.ts` (assignedPair, abSwap) and the demo-session mechanics for the Listen lane.
- Licences to verify before training: OmniVoice (unconfirmed), MMS-TTS (CC-BY-NC), F5-TTS (CC-BY-NC), Omnilingual ASR (Apache-2.0).
- The GRN permission is project-scoped; whether it allows redistribution of segments is unknown and must be checked before any export includes them.

## Success Metrics

- 200 or more consented human clips from at least 4 speakers within 4 weeks of US-002 shipping.
- Omnilingual baseline CER on our audio reported, with tone-stripped and tone-retained figures.
- Tone restoration tone error rate reported on a held-out set of at least 100 sentences.
- One pilot voice judged in at least 600 blind pairwise listens (6 annotators, 100 pairs each) with an interval around its Bradley-Terry score.
- A CC-BY-4.0 manifest export that passes the frozen-prompt and consent tests.

## Open Questions

- Salem and Lydia's ruling on tone marks and contractions (blocks the orthography.json content, not the code).
- Who is the pilot studio voice, and where is it recorded.
- Does the GRN permission allow redistributing segmented audio under CC-BY, or only internal use.
- Does the Lanfrica and NaijaVoices Igala set (part of 110 hours across 11 languages) exist with a usable licence; contact before recording more than the pilot.
- OmniVoice licence; if non-commercial, which pilot model is acceptable.
- Whether Meta's 7.6 hours of Igala overlap with GRN or Lanfrica audio (would flatter the baseline).
- The Google research agreement's data-licensing clause and whether CC-BY release needs their sign-off.
[/PRD]
