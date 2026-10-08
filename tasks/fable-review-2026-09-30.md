# Fable 5.1 review of the Sep 23-28 work (run Wednesday 2026-09-30)

Written 2026-09-28 by Claude Opus 5.5, which stood in for Claude Fable 5.1
after Fable's usage limit was hit on Sep 23. Halim asked for everything done
since then to be reviewed on Fable 5.1 once the limit resets. You are that
review. Treat every claim below as a claim to verify, not a fact.

## 0. Before anything

1. Confirm you are running as Claude Fable 5.1 (model id `claude-fable-5-1`).
   If you are not, try switching this session's model to it with the
   session-management tool. If that is not possible, do NOT run the review:
   append a two-line note to Context.md ("Fable review not run: session was
   on <model>") and stop, so Halim can start it by hand.
2. Find the repo. It is `~/Documents/wikitongues` unless Halim ran
   `zsh ~/move-repos-out-of-icloud.sh --apply`, in which case it is
   `~/Code/wikitongues` (the site is `wikitongues-ai-web` beside it). Work in
   a fresh branch from `origin/main`, never on main.
3. If the repos are still under `~/Documents`, they sit in iCloud Drive and
   node_modules reads stall (memory `icloud-node-modules-timeouts`). Warm the
   packages before tsc/eslint/vitest: `brctl download <dir>` then
   `find <dir> -type f -name '*.js' -print0 | xargs -0 cat >/dev/null`.
   If `pnpm`/`npm` dependencies are missing after a move, install first.
   Check `git status` before committing: on Sep 28 something rewrote 8
   tracked files with prettier-style diffs (restored); never commit those.
4. Read, in order: `Context.md` (the Session State sections dated 2026-09-23
   and 2026-09-28), `tasks/jwal-ejeba-2023-rule-inventory.md`, this file.
   Load the Supabase style guide before writing anything in Halim's name.

Ultracode is Halim's standing preference for substantive work: use the
Workflow tool (review, then an adversarial skeptic per finding) for each
review below. Token discipline still holds: agents inherit your model; use
`effort: 'low'` for mechanical stages.

## 1. What to review (merged and live unless marked)

App repo madihg/wikitongues-ai:

- #60 (Sep 23) humanRounds on the public metrics payload; v4.3 grammar
  block (`web/src/lib/arena/grammar-block.ts`); v4.4 prompt
  (`web/src/lib/generation-prompt-v4-4.ts`, twelve amended lines); grammar
  seed `web/prisma/seed-rag-v4-3-grammar.ts` (15 rows, already seeded).
- #61 (Sep 23) Context handoff and exam results.
- The Sep 28 PR (number in Context.md): v4.4 pooled; train-queue-fill
  v4-family branch; the QUOTED-SOURCE fix in
  `web/src/lib/arena/repair-round.ts`; shared assembly
  `web/src/lib/arena/v4-family-train.ts`; row-repair scripts
  `web/scripts/replay-quoted-source-fix.ts`,
  `web/scripts/regenerate-train-outputs.ts`; approachLabel v4.2-4.4 fix;
  admin headline third-arm fix; Sep 28 changelog.

Site repo madihg/wikitongues-web-ai:

- #2, #3 (Sep 23) the "Out of every ten questions" section.
- The Sep 28 PR from branch `verdicts-every-pair` (one panel per judged
  pair, version-vs-version head to head, computed margin phrase).

Documents (drafts, never sent without Halim):

- White paper brief Google Doc:
  https://docs.google.com/document/d/1r_zNmz2bXav2TPkNG4kll3vFCBR4ypNnuWPhgj-mfJs/edit
- Gmail drafts: to Andy/Erin/Isaac ("[white paper] Igala brief +
  references"), to Agnes ("[annotation] Austine's draws"), reply in Lydia's
  thread ("Re: Salem & I's writeup").

## 2. The review, in priority order

### A. Correctness of what now serves annotators

1. Pool state: run `web/scripts/check-queue-servable.ts` and
   `web/scripts/queue-summary.ts`. Expect three pooled arms
   (gemini-3-1-pro, gemini-3-1-pro-rag-v3, gemini-3-1-pro-rag-v4-4), every
   remaining prompt servable, and all three allowed pairs being drawn.
2. Since the flip: count v4.4 judgments; check for any annotator with two
   comparisons on the same prompt (the known two-tab window, see Context);
   report, do not delete.
3. Re-run `replay-quoted-source-fix.ts` read-only. Expect v4.4 train
   CLEARED = 0 and CHANGED = 0. Decide what to do with the v4.1 train rows
   it lists (v4.1 is not pooled; recommendation to Halim, no writes).
4. Truncation: 28 repaired v4.4 train rows were written before the
   served-pass guard and store only summed tokens. List those with
   tokenCountOut >= 4088 and read their endings. If any is cut off AND has
   not been judged, regenerate it with `regenerate-train-outputs.ts`
   (backup path required; it refuses judged and frozen rows).
5. Adversarially re-review the checker fix on the real prompt bank: can the
   fixed checker now MISS a real violation (a quoted invented s-word, an
   elision apostrophe at a word edge, requestsEnglish over-matching)? Run
   the functions; add tests for anything real.

### B. The claims we published

1. /how-it-works on both the app and the site: every number, label and
   sentence must match the live payload. Specifically: the verdict panels,
   the margin phrase, "v4.4 joined the blind test on Sep 28", the approach
   labels (no v4.x labelled "retrieval v1"), the changelog entries of Sep 23
   and Sep 28 (site copy must be byte-identical to the app's constant; the
   site test pins the hash).
2. The exam scoreboard: v4.4 105.3 / tone-insensitive 94.7 / speakerRank
   62.7; v4.3 101.3; v4.2 96.4. The quoted-source replay found all 16
   repaired frozen rows unchanged, so these should stand; re-derive them
   from the payload and say so.
3. The white paper doc: re-read against the Sep 28 facts (v4.4 now in the
   blind test; the checker bug; the Salem/Lydia write-up; speaker spend).
   Propose factual edits as Google Doc comments for Halim. Do not rewrite
   his prose, do not share the doc, do not send the email draft.

### C. New material not yet ingested (the most valuable work left)

"Igala grammar writeup: Patching the holes in the model" (Salem Ejeba and
Lydia Wiernik, emailed by Lydia on 2026-09-25, thread "Salem & I's writeup",
attachment .docx, 1,329 words; fetch with Composio GMAIL_GET_ATTACHMENT,
message id 1a0d92b922612967). Do for it what was done for the JWAL paper on
Sep 23:

1. Extract every rule line by line into `tasks/salem-lydia-writeup-2026-09-25-inventory.md`
   with status against what we serve (v4.4 prompt, grammar_rule rows) and
   an evidence grade (scholarship / corpus / community; Salem is the author
   of the JWAL paper, so his write-up is the SAME evidence class as it, not
   an independent one).
2. Seed grade-appropriate rows with the existing seed pattern (draft lint,
   the real Scope-A gate against frozen gold, embeddings, create-only),
   bracketing any frozen gold word in English as the Sep 23 seed did.
3. Flag, do not resolve, the policy conflicts for Halim: the write-up asks
   for tone marks always and expanded forms (ki ọla, not k'ọla); the served
   REGISTER rule says write like the community (no tone marks unless asked,
   apostrophized elision). Lydia asked Halim whether the model can output
   both at once (furigana-style). Draft a short technical feasibility note
   FOR HALIM (not a reply to Lydia): what it would take in serving,
   storage, the annotation UI and the benchmark, and what it would do to
   agreement scores measured against community-register gold.
4. Also in the write-up and worth checking against our data: complementiser
   ki (COMP) vs kì (REL); never mixing dialects in one answer; gwùgwú/tẹ́
   vs jọ presentative with yì; recording audio of gold answers; register
   strength mismatches.

### D. Open decisions for Halim (collect, do not act)

- Send or edit the three Gmail drafts.
- Run the iCloud migration (`zsh ~/move-repos-out-of-icloud.sh`, then
  `--apply` with no sessions open), and whether to turn off Optimize Mac
  Storage.
- Tone marks and expanded forms vs community register (C.3).
- Older: FFWD application answers; Claude subscription allocation; the May 8
  receipt; the "Culture in the Code" PDF for the research notebook.

## 3. Rules for this run

- Never send an email, post, or share a document. Drafts and comments only.
- Never delete data. Row replacement only through the two repair scripts,
  which back up first and refuse judged and frozen rows.
- Frozen-exam gold never appears in a prompt or a seeded row (Scope-A gate).
- Do not change pool membership, ALLOWED_PAIRINGS or the orthography policy
  without Halim.
- PR + squash-merge flow, never push to main; every fix ships with its
  test, and only when the full suite, tsc and lint pass.
- No em dashes anywhere; no emojis; writing in Halim's name follows the
  Supabase style guide and its self-check.
- Finish by writing a `## Session State (2026-09-30, Fable 5.1 review)`
  section in Context.md: what was verified, what was wrong, what shipped,
  what needs Halim.
