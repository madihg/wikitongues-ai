# One Annotate flow: text, speech and tone marks in one tab

Decided on the Wikitongues call of 2026-11-24. Written for the review on
2026-11-25 and for whoever changes this next.

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

**Annotate** (`components/work/work-flow.tsx`) holds every kind of work as a
tab inside the page:

| Tab | Screen (unchanged component) | Shown when |
| --- | --- | --- |
| Record | `RecordInterface`, now in steps | speech is on for the person |
| Check | `CheckInterface` | speech is on |
| Tone marks | `ToneInterface` | tone items were given to the person |
| Write & compare | `AnnotationInterface` | always |
| Listen | `ListenInterface` | speech is on |

- It opens on the kind the address asks for (`?work=record`, used by the
  Dashboard cards), otherwise on the first kind in the leads' order with
  something waiting.
- When a kind runs out, a line under the tabs offers the next kind in one
  tap. It never switches by itself, so nobody loses their place.
- Order: `lib/work-flow.ts`, `DEFAULT_WORK_ORDER` = record, check, tone,
  write, listen. The leads can change it without code through the Vercel
  variable `ANNOTATE_ORDER` (for example `tone,write`); a kind left out keeps
  its default place, and a typo can never hide a kind.
- Honest time: while a tab is open the flow names its kind of work
  (`openSurface`), so recording inside Annotate still counts as recording on
  the time sheet, exactly as on the old Record page.

**Record, in steps** (`components/lab/record-interface.tsx`), in the shared
episode frame (header with what is left, step bar, footer with Back, Skip
this prompt and the main button):

1. Your answer: read it once, fix a word or a tone mark with Edit answer
   (the editor has the tone keyboard), or write and lock one.
2. Say it in Igala: record, listen back, Keep or Re-record, save.
3. Say it in English: a short translation, then say it.

The main button moves on only when the step is done. Steps 2 and 3 stay
mounted while hidden, so stepping back never drops a take; Back is off while
a clip uploads. A prompt that comes back for its English clip opens on step
3.

**Old addresses:** `/annotator/tone` redirects to the Tone marks tab. The
Speech pages (`/speak/...`) still open, and Annotate stays lit on them. The
researcher tools on them (Recordings, Studio, the Listen extras: minimal pair
marker, decision cards) are reached from More, "Speech tools".

## Adding a kind of work (conversational recordings, for example)

1. Add it to `WORK_KINDS`, `DEFAULT_WORK_ORDER`, `WORK_LABEL`, `WORK_LINE`
   and `WORK_SURFACE` in `lib/work-flow.ts` (and a surface in
   `lib/activity.ts` if it is a new kind of time).
2. Give it a count in `GET /api/annotator/work`, from the same loader its
   queue uses.
3. Render its screen in `work-flow.tsx` with `onEmpty`.

No sidebar change, no new page.

## Open questions for the review

- The order is a Vercel variable, not an admin screen. An admin setting needs
  one small table (a migration on production, so it waits for Halim's yes).
- Speech researchers (Agnes, Salem hold the researcher role) lose the Speech
  sidebar line too. Recordings and Studio move to More. Is that right for
  them?
- Listen's researcher extras (minimal pair marker, decision cards) stay on
  `/speak/listen` only.
- Switching tabs drops an unsaved take on Record (text drafts are kept, as
  before). Worth a warning?
- Should Check sit before or after Record? It is the gate to training (only a
  clip another speaker checked and kept trains), so it may deserve the first
  place once Record queues are short.
