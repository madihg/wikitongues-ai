# Speech TTS track

The Igala voice is trained with EveryVoice (FastSpeech2, MIT) on a studio set
read by one speaker. This note covers the data format, the studio flow and the
Listen decision rules. Run books for the worker are in `worker/README.md`.

## EveryVoice data and format notes

- Audio: 16-bit mono WAV, 22.05 to 48 kHz. The studio page records mono at
  48 kHz where the browser allows it, with echo cancelling, noise suppression
  and auto gain off, and shows the rate each take was captured at. Browsers
  hand over webm/opus or mp4; the worker converts to WAV before training.
- Clips: 0.5 to 10 seconds. At 130 words a minute that is about 3 to 20 words,
  which is the bound `build-tts-script` applies to every sentence.
- Text: tone-marked, NFC. A studio clip's transcript is the script line it
  read (`SpeechRecording.studioText`), not the original cold answer.
- Size: about 5 hours of kept audio is the target for the first voice.
- ASR clips are recorded at 16 kHz; this page says which is which.

## Flow

1. `npx tsx --env-file=.env.local scripts/speech/build-tts-script.ts --out <path outside the repo> --hours 5`
   (add `--dry-run` first: no LLM call, nothing written). The output is Igala
   text and must never enter this repository.
2. Open `/lab/speech/studio`, tick the checklist, choose the script file, and
   record line by line. Clips are `community_only`, `sourceRef` is
   `studio:<sessionId>`, and a take with no warning in the take check is marked
   kept.
3. "Train a voice" calls `POST /api/speech/jobs/tts`; the signed callback
   registers the candidate. "Synthesize 50 sentences" calls
   `POST /api/speech/jobs/synthesize` with Prompt ids.
4. Listen shows a Bradley-Terry card per pair of systems. It refuses to rank
   below 300 judgments from 5 listeners and names 600 as the stronger target.
   Tone minimal pairs add a "Which word did you hear?" question and a tone
   accuracy line per system.

## Rubric

`src/lib/speech/speech-axes.ts` keeps `provisional-1` active. `lydia-1` is a
placeholder behind `LYDIA_RUBRIC_READY`; old judgments keep their version.
