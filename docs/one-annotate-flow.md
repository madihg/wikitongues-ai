# One Annotate flow: text, speech and tone marks in one place

Decided on the Wikitongues call of 2026-11-24. Reshaped after the review of
2026-11-25, and again on 2026-11-26 (one prompt, text then speech). For
whoever changes this next.

## What was asked

- "Speech interface needs to be sequential like the text part: record,
  review, etc."
- "I want a speech and text interface all in one, and tone marks."
- "The task itself can change, but I don't want them to go to different tabs
  on the left-hand side."
- Speech before tone marks. Modular: text, speech, tone marks now, and
  conversational data later.

## What it was before

An annotator had up to six sidebar lines: Dashboard, Annotate (text), Speech
(itself four tabs: Record, Listen, Check, Profile), Pass 2: tone marks, My
Work, Rubric. Each kind of work was its own page. The Record page showed the
prompt, the answer and both clips at once, with no steps.

## What it is now

**Sidebar:** Dashboard, Annotate, My Work, Rubric, for every role (the same
four lines annotators had before speech existed). Annotate's number is
everything waiting inside it.

**Annotate** (`components/work/work-flow.tsx`) hands out one task at a time.

- **All (the default) is a mixed stream.** It serves a run of each kind in
  the leads' order, then moves to the next kind with work waiting, round and
  round. By default that's 3 new prompts (each written, then said), then 10
  earlier answers to record, then 5 clips to check, then 5 listening pairs,
  then 10 answers to mark. The kind only
  changes between tasks, when a screen says one is saved, never in the
  middle of one. A line over the work says what comes next ("This recording
  and 2 more, then Check."), and a screen reader hears "Now: Check." when the
  kind changes.
- **One prompt, text then speech** (Halim, 2026-11-26: "they annotate text
  for one prompt and then record speech for that prompt... that would be
  more efficient"). A new prompt is one task with both halves. In Write the
  stages are Your answer, Say it, Compare, Why & fix, Score: the speaker
  writes and locks the answer, says it straight away in Igala and in a short
  English translation, then sees the AI answers.
  - Say it is a stage of the prompt, not an optional extra. "Skip, no
    recording" is still there (no microphone, a noisy room), and a skipped
    answer waits in Record.
  - The answer is locked before Say it and cannot be edited there, so a clip
    never reads words that change afterwards.
  - The open step and its saved clips are kept with the episode's draft
    (`lib/episode-draft.ts`). A reload comes back to Say it with what was
    saved, and the clips still attach to the answer at submit. Before, a
    reload skipped the step and left a saved clip unattached.
  - The clips are attached before the flow is told the prompt is done, so
    the answer just said is not counted as waiting in Record.
  - While the step has the microphone on or a clip uploading, the other
    kinds wait, as they do for Record.
- **Record is the catch-up.** It holds the answers written before recording
  existed (134 to 565 per annotator, 1,526 answers and 2 clips on
  2026-11-26), any answer whose Say it was skipped, and an answer still
  missing its English clip. It keeps its place in the mix until that backlog
  is gone.
- **Why a mix, not a strict order:** each annotator has 134 to 565 past
  answers with no clip, so Record almost never runs out. A strict order would
  starve Check (the gate to training), Write and Tone marks for weeks
  (review of 2026-11-25).
- **The filter above the work:** All, then one button per kind the person
  has, with what waits in it. Picking a kind stays on it. When it runs out, a
  line offers the next kind in one tap. Dashboard cards open one kind
  (`?work=record`). An address with its own text episode (`?prompt=` from the
  review drawer, `?demo=` from the arena demo launcher) opens Write.

| Kind | Screen (same component as its old page) | The person has it when |
| --- | --- | --- |
| Record | `RecordInterface`, now in steps | speech is on for them |
| Check | `CheckInterface` | speech is on |
| Write & compare | `AnnotationInterface` | always |
| Listen | `ListenInterface` | speech is on |
| Tone marks | `ToneInterface` | tone items were given to them |

**Plan:** `lib/work-flow.ts`.
- `DEFAULT_WORK_ORDER` is write, record, check, listen, tone: a new prompt
  first (it ends in a clip too), then the catch-up recordings. Tone marks
  come last until the tone call with Salem and Agnes.
- `DEFAULT_WORK_RUN` holds the run lengths.
- The leads can change both without code through the Vercel variable
  `ANNOTATE_ORDER`, for example `check:8,record:4,write`.
  - A kind left out keeps its default place and run.
  - A run must be 1 to 50.
  - A typo can never hide a kind.

**Nothing is lost by moving away.** Every screen once shown stays mounted,
hidden while another kind is on screen. That keeps a take, a verdict picked
but not sent, and a tone edit.
- A hidden screen is quiet: its audio is paused, the text screen's 1 to 4
  keys are off, and Tone marks' time counter stops.
- While Record, or Write's Say it step, has the microphone on or a clip
  uploading, the other kinds wait.
- A screen that found nothing left counts as zero until new work comes in for
  it. Shown again, it starts afresh and asks its queue again.

**Numbers** come from `GET /api/annotator/work`, from the same loaders the
queues use. They refresh after every finished task and every saved clip.

**Honest time:** while a kind is on screen the flow names it (`openSurface`),
so recording inside Annotate still counts as recording, exactly as on the old
Record page.

**Record, in steps** (`components/lab/record-interface.tsx`), in the shared
episode frame (a header with what is left, a step bar, and a footer with
Back, Skip this prompt and the main button):

1. Your answer: read it once, fix a word or a tone mark with Edit answer
   (the editor has the tone keyboard), or write and lock one.
2. Say it in Igala: record, listen back, Keep or Re-record, save.
3. Say it in English: a short translation, then say it.

The main button moves on only when the step is done. Steps 2 and 3 stay
mounted while hidden, so stepping back never drops a take. Back is off while
a clip uploads.
- Editing the answer after a take first says the take will be thrown away
  (it read the old words), then does throw it away.
- A prompt that comes back for its English clip opens on step 3.

**Tone marks and clips** (`lib/answer-revisions.ts`, `clipStillSays`): an
Igala answer that only gains tone marks after its clip was recorded keeps the
clip. The clip's transcript is always the answer as it stands, so it gains
the marks too.
- Any of these still retires the clip until it is recorded again: a tone mark
  changed or taken off, a dot below, or any other letter or word.
- The same rule applies to Check, the dataset builder and the manifests.

**Old addresses:** `/annotator/tone` redirects to `?work=tone`. The Speech
pages (`/speak/...`) still open, and Annotate stays lit on them. The
researcher tools there (Recordings, Studio, and the Listen extras: minimal
pair marker, decision cards) are reached from More, "Speech tools".

## Adding a kind of work (conversational recordings, for example)

1. In `lib/work-flow.ts`, add it to `WORK_KINDS`, `DEFAULT_WORK_ORDER`,
   `DEFAULT_WORK_RUN`, `WORK_LABEL`, `WORK_LINE`, `WORK_UNIT` and
   `WORK_SURFACE`. If it is a new kind of time, also add a surface in
   `lib/activity.ts`.
2. Give it a count in `GET /api/annotator/work`, from the same loader its
   queue uses.
3. Render its screen in `work-flow.tsx`. The screen takes `WorkScreenProps`:
   `onEmpty` when its queue is empty, `onDone` once a task is saved, and
   `active` if it has keys or timers.

No sidebar change, no new page.

## Still open

- The order and runs are a Vercel variable, not an admin screen (the review
  agreed: no table yet).
- Agnes should hear before release that the Speech sidebar line goes away.
  Recordings and Studio move to More.
- Listen's researcher extras stay on `/speak/listen` only.
- A dropped connection restarts a whole long upload (from the #120 review).
- Nobody has tried a real two minute take in a browser yet.
- Say it inside Write has not been tried by an annotator yet: none has
  written an answer since the speech layer went live for them.
- Record also hands out prompts with no answer, to write and record with no
  compare step. Whether those should go through Write instead is undecided.
- Tone marks are not chained to a prompt (40 of the 45 tone items' authors
  have no clip of that answer, so "mark the tones, then say it" is
  possible). Waiting for the tone call.
