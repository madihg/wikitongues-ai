# Speech Lab: design decisions (2026-10-19)

Halim's direction: build speech, do not deploy it to annotators; researcher-only "lab" functionality, a separate track from text annotation, toggleable. Design chosen with the ui-ux-pro-max checklist applied to the existing design system (tokens in web/src/app/globals.css). The skill's generated palette (dark navy, orange, Fira fonts) was rejected: it would split the brand. Distinctness comes from structure and one visual mark, not a second theme.

## Placement and gating

- Sidebar: a divider, then a "Lab" group with one link, "Speech", a small monospace tag "researchers only". Rendered only for RESEARCHER accounts and only when the server flag is on.
- Flag: `SPEECH_LAB_ENABLED` (server env, read once in `web/src/lib/lab-flags.ts`); off means the nav link is absent, `/lab/*` pages return notFound, `/api/lab/*` routes return 404. Annotator accounts get 403 on `/lab/*` and `/api/lab/*` even when the flag is on.
- Route group `web/src/app/(app)/lab/speech/` with tabs as nested routes: `/lab/speech` (Record), `/lab/speech/listen`, `/lab/speech/recordings`.

## The mark that says "this is the lab"

- Every Lab page opens with a full-width ink band (`bg-foreground text-background`) 56px tall: left, "LAB" in `font-mono text-xs tracking-widest`, then "Speech"; right, the tab strip. Below it the page is the normal light surface. One band, one place, consistent across the three tabs.
- No other new colours. Recording state uses `--danger` for the live dot and timer, `--success` for a saved clip, `--pick-a` and `--pick-b` for the two players in Listen (same as the text arena, so A and B mean the same thing everywhere).

## Record tab (one column, mobile first)

1. Prompt text, then the researcher's own written answer for that prompt if one exists (from ColdAuthorAnswer), else a textarea to write one first (locked before recording, as in the text flow).
2. One primary control, 56px round record button, label "Record" / "Stop", elapsed time in `font-mono` beside it, hard stop at 30 s with a visible countdown from 25 s.
3. After stop: inline player (native `<audio controls>` styled minimally), "Keep", "Re-record", "Discard". Keep uploads; a progress bar replaces the button while uploading; failure shows the error in place with "Try again".
4. After Keep: the tier choice, three radio cards, nothing pre-selected, one sentence each:
   - Stays with my community ("Only used inside the Igala tools. Never shared.")
   - Licensed to AI labs ("Shared under a signed contract. You are paid a share. You can withdraw later.")
   - Open to everyone ("Published under CC-BY 4.0. Permanent once published.")
   Save is disabled until one is chosen. Voice cloning opt-in is a separate unchecked box under the choice.
5. First visit: the consent screen (versioned text, how to withdraw first, hash stored) must be accepted before the record button is enabled. Two texts exist: written and an oral script shown as a collapsible "Read aloud" block.
6. Queue: prompts the researcher has an own answer for and no recording; then prompts with no own answer; frozen prompts never appear.

## Listen tab

- Served only when a prompt has two or more clips (human from different speakers, or synthesised). Same blind pairing and A/B orientation as the text arena (reuse assignedPair and abSwap).
- Layout: prompt text, two player cards stacked on mobile (A then B), each with a 44px play button, waveform not required; below, four 44px choices: A, B, Tie, Both unusable; then one required reason chip row (wrong word, wrong tone, unclear, robotic, wrong pronunciation) and an optional note; Submit.
- Stored in SpeechComparison; one counted judgment per researcher and prompt; demo-aware.

## Recordings tab

- Researcher review list: prompt, speaker pseudonym, duration, tier, consent version, review status, inline player via signed URL. One-tap flags: bad audio, wrong text, keep. Export manifest button runs the guarded export (OPEN items only from this screen; LICENSED only via the future gated delivery).

## Accessibility and performance

- 44px minimum targets, 8px gaps, visible focus rings (existing `--ring`), labels on every control, `aria-live` for the timer and upload status, `prefers-reduced-motion` respected (no pulsing dot when set), no horizontal scroll at 375px, 16px body text.
- Audio: MediaRecorder `audio/webm;codecs=opus` where supported, `audio/mp4` on iOS Safari; 48 kHz capture; clips under 30 s and 5 MB.

## Data model (first slice, reversible migration, not applied to production by an agent)

- `SpeechRecording`: id, promptId, coldAuthorAnswerId?, modelOutputId?, annotatorId?, storagePath, mimeType, durationMs, sampleRate, dialect?, tier (enum DataTier: open | licensed | community_only, default community_only), consentId?, consentVersion?, consentMethod?, voiceCloningOptIn (false), speakerIdOptIn (false), sourceType (contributor | third_party | derived, default contributor), sourceRef?, sourceLicense?, rightsStatus (cleared | pending | restricted, default pending), fundingSource (default unknown), isTestSet (false, forced true for frozen prompts), publishedOpenAt?, reviewStatus?, isDemo, demoSessionId?, createdAt. Indexes: promptId, annotatorId, isDemo, tier.
- `SpeechComparison`: mirrors PairwiseComparison for clips (recordingAId, recordingBId, winner, reasonTags, note, annotatorId, isDemo, demoSessionId, createdAt).
- `Consent`: id, version, language, method, textHash, text, createdAt. `ConsentGrant`: id, consentId, userId, grantedAt, commercialLicensing, crossBorder, voiceCloning, speakerId.
- Storage: private bucket `igala-speech` (creation is an ops step for Halim), server-side signed URLs only, via `web/src/lib/speech/storage.ts` using the service role key from env.

## Guards as code (tests required)

- `web/src/lib/speech/guard.ts`: refuses frozen prompts on write; export predicate: OPEN export = tier open AND publishedOpenAt set AND not isTestSet AND rightsStatus cleared AND sourceType contributor; LICENSED export = tier licensed AND consent flags AND not isTestSet AND rightsStatus cleared (delivery path later); community_only and isTestSet never leave by any path. A test iterates every export entry point.
