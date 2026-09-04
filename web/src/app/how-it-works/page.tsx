/*
  SOURCES for every factual claim on this page:
  - Computed live per request: src/lib/method-metrics.ts (corpus counts,
    scoreboard scores, leak counts, both ceilings, no-preference rate).
  - tasks/latest-learnings-2026-08-09.md: the ceiling dedup story (section 1),
    the 99% both-inadequate finding (section 3), the Idakwoji lexicon as the
    binding constraint (section 5), chrF caveats (section 1).
  - Context.md (repo root and web/): project history, v0/v1/v2 sequence,
    Agnes's team, Lydia's review.
  - src/lib/generation-prompt-v2.ts: Agnes's 2026-08-11 verdict ("the first
    sentence is saying three different things"), the METHOD design; the system
    prompt and terminal contract are IMPORTED from this module and rendered
    verbatim, never copied.
  - src/lib/arena/retrieval-v2.ts: the v2 assembly order, the sentence-building
    gate for parallel examples, the leak guard on every retrieved piece.
  - scripts/register-rag-v2.ts: versionLabel="rag-v2" distinguishes v2 rows.
  - src/lib/generation-prompt-v3.ts + scripts/register-rag-v3.ts: the v3
    system prompt (enshrined closed-class grammar; retrieval identical to v2)
    and versionLabel="rag-v3"; rendered verbatim below, never copied.
  - scripts/leak-audit.ts: the leak-detection composition this page's metrics
    lib mirrors.
  - The "What changed, when" section carries DATES and fixed historical facts
    only (corpus sizes at ingestion, the +22 delta as measured that day) -
    facts about past events, not live numbers that could go stale.
  - The me- concord numerals question (meji/meta beside eji/eta) comes from
    aligning the Bible parallel corpus; the concord entries themselves are
    commit 123a082 (Ejeba 2023, paraphrased into the knowledge base).
*/
import { prisma } from "@/lib/prisma";
import {
  computeMethodMetrics,
  type CandidateScore,
  type CeilingResult,
} from "@/lib/method-metrics";
import {
  IGALA_SYSTEM_V2,
  igalaTerminalContract,
} from "@/lib/generation-prompt-v2";
import { IGALA_SYSTEM_V3 } from "@/lib/generation-prompt-v3";
import { InfoTip } from "@/components/info-tip";
import { BenchmarkBars } from "@/components/arena/benchmark-bars";

/**
 * "How it works" - the slim in-app version: hero, live stat strip, the
 * four-layer system diagram, a banner to the full public story, the
 * scoreboard bars researchers need at hand, and the changelog.
 *
 * The long-form sections (journey, assembly, verbatim prompts, score
 * deep-dive, what is being tested) are moving to the marketing site's
 * /how-it-works page. They remain below in a parity-hold appendix until
 * that page carries them - see the PARITY HOLD comment.
 *
 * Every number on this page is computed from the database when the page
 * loads (force-dynamic + computeMethodMetrics). Nothing numeric is written
 * into the copy by hand - the project has shipped stale numbers before.
 */
export const dynamic = "force-dynamic";

function fmt(n: number | null): string {
  return n === null || !Number.isFinite(n) ? "n/a" : n.toFixed(1);
}

function pct(part: number, whole: number): string {
  return whole > 0 ? ((100 * part) / whole).toFixed(1) : "n/a";
}

/** Fixed history - dates and what each day added or corrected. */
const CHANGELOG = [
  {
    date: "Aug 9, 2026",
    text: "The automatic eval harness, the honest human ceiling, and the leak guard. The audit that day found the benchmark had served 15+ of its 43 frozen questions their own community answers - those scores measured copying, so every number since is reported on the leak-free subset.",
  },
  {
    date: "Aug 12, 2026",
    text: "The Bible parallel corpus - 30,907 Igala-English sentence pairs from the Bible Society of Nigeria's Igala Bible - plus a 2,104-entry lexicon, powering retrieval v2 and THE METHOD. Corrected Sep 1: this entry said the pairs were ingested under BSN permission. Our records hold two written requests to the Society and no reply, so no permission is on file. What that means for the corpus is an open item recorded in the Sep 1 entry.",
  },
  {
    date: "Aug 13, 2026",
    text: "The frontier arms joined the board. Gemini 3.1 Pro topped it untouched; Claude Opus 5 gained +22 from community retrieval - a clean read on knowledge versus skill. This page was made public and the cost ledger rebuilt.",
  },
  {
    date: "Aug 14, 2026",
    text: "A working grammar deduced from all the evidence (tasks/igala-grammar-deduced.md) and METHOD v3, which enshrines only its A- and B-grade rules in the system prompt.",
  },
  {
    date: "Aug 17, 2026",
    text: "The benchmark visual and the Community Agreement Score: leak-free stripped chrF rescaled so the deduplicated native-speaker ceiling reads 100, drawn LLM-benchmark style with confidence whiskers. The raw chrF table moved under the chart; nothing was removed and no score is capped.",
  },
  {
    date: "Aug 29, 2026",
    text: "Global Recordings Network signed a copyright agreement (Aug 27) covering their “Words of Life” Igala recording, and the audio (45:38, the only usable Igala speech asset) was acquired, along with six Bible-for-Children booklets as raw assets; the booklets' fonts silently strip the ẹ/ọ subdots on extraction, so nothing from them may enter the corpus until that is solved. Outreach to other rights holders (the JWAL papers, Egbunu's proverbs study, PanLex) is in progress, with a call with the JWAL author scheduled; none of their text enters the corpus before written permission is on file, so the corpus counters above are unchanged.",
  },
  {
    date: "Aug 31, 2026",
    text: "METHOD v4 and v4.1. v4 rewrote the instructions around one rule from the community's review: translate the meaning of the whole sentence, never word by word. v4.1 added eight grammar rules mined from 132 judged failures, a step that tells the model to perform a greeting rather than describe one, a rule against inventing dialect facts, and a repair round: when an answer uses letters Igala does not have or is saturated with tone marks, the model is asked once to rewrite it. On the frozen exam Gemini v4.1 scored 120 and v4 102; Claude v4.1 scored 93 against 55 for Claude v3, so the rules that had hurt Claude at v3 no longer do. Nine grammar entries were added to the knowledge store, but the v4 retrieval path does not read them, so they contribute nothing to these scores.",
  },
  {
    date: "Sep 1, 2026",
    text: 'An adversarial audit of every public number, run against the live database. What it corrected. A bar past the 100 line is mostly built in: a model is scored against every community answer for a question while a speaker is scored against the other speakers only. Scored like-for-like the best system sits at about 103, level with the speakers, and the score is being replaced by one that cannot pass 100 by construction. The v4 to v4.1 gain is mostly fewer tone marks, which the community rarely writes; with tone marks ignored the two versions are level. The sentence "the grammar lifts Gemini measurably" was not supported and has been removed. The blind preference belongs to one pairing only, Gemini with the v3 package against the same Gemini with nothing added: 54 to 14, with ties and double rejections counted separately, or 25 to 7 when each question is counted once. No speaker has yet judged v4 or v4.1. The fall in "both answers inadequate" from 99% to about half came with a change of models, not from the method. 131 of the 238 exam answers were written after a speaker saw and rejected a model\'s attempt, so "written before seeing any model" was wrong for more than half of them. And the Bible corpus had been described as used under a BSN permission that our records do not contain. What held: speakers prefer the v3 package to nothing, every one of the six annotators; v4.1 undid the regression v3 caused for Claude; and v4.1 beats v3 on the exam in a paired test, the only step between Gemini versions that does.',
  },
  {
    date: "Sep 3, 2026",
    text: "The score was rebuilt so that a model is judged the way a speaker is judged: against the same answers, with the same one left out. The old construction stays beside it, marked deprecated, so the change is visible rather than silent. Then a control settled what the score has actually been measuring. Taking bare Gemini's answers and deleting the tone marks, with no model and no method involved at all, scores higher than every real system we have built. The community writes tone marks on about a quarter of its answers, so a measure built on letter overlap rewards leaving them off. Read plainly: the scoreboard has been ranking tone-mark habits as much as Igala. A tone-insensitive column now sits beside the main one, and it presses every system into a narrow band with the order scrambled. The repair round, which asks a model to rewrite an answer that breaks the spelling rules, turns out to be worth little to Gemini and a great deal to Claude. None of this touches the human result: speakers judging blind still prefer the v3 package to the plain model.",
  },
];

export default async function HowItWorksPage() {
  const m = await computeMethodMetrics(prisma);
  const { corpus, benchmark, ceilings, candidates } = m;
  const noPreferencePct = pct(
    corpus.pairwiseBothInadequate,
    corpus.pairwiseComparisons,
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      {/* ── a. What this is ─────────────────────────────────────────────── */}
      <div className="mb-10">
        <h1 className="flex items-center gap-2 text-2xl text-text-primary">
          How it works
          <InfoTip label="About this page" width="w-80">
            This page explains the Igala pilot end to end for readers who are
            not machine-learning specialists. Every figure is recomputed from
            the live database on each page load, using the same scoring code the
            research harness uses - there are no saved numbers to go stale.
          </InfoTip>
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">
          Ask most AI models a question in Igala and they answer in Yoruba or
          English instead. This project has Igala speakers teach the models
          their language - by writing answers, judging outputs, and correcting
          mistakes - and measures honestly how far that teaching has gotten.
          Every number below is computed live from the project database at the
          moment this page loads, never copied from an old report.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Gold answers", value: corpus.goldAnswers },
            { label: "Blind comparisons", value: corpus.pairwiseComparisons },
            { label: "Parallel sentences", value: corpus.parallelPairs },
            { label: "Dictionary entries", value: corpus.lexEntries },
            { label: "Community annotators", value: corpus.annotators },
            { label: "Frozen test questions", value: benchmark.frozenPrompts },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-md border border-border bg-surface p-3"
            >
              <div className="text-xl font-medium text-accent-text">
                {s.value}
              </div>
              <div className="mt-0.5 text-xs text-text-tertiary">{s.label}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-text-muted">
          Counts exclude demo sessions; the annotator count also excludes seed
          test accounts. Computed {new Date(m.computedAt).toUTCString()}.
        </p>
      </div>

      {/* ── a2. The whole system on one canvas ──────────────────────────── */}
      {/* Placed immediately after "what this is" so a reader holds the full
          mental model before the history (journey) and the zoom-in (assembly).
          Counts inside the diagram are the same live values as the stat strip
          above - never literals, per the house rule. */}
      <section className="mb-10">
        <h2 className="text-xl text-text-primary">The whole system</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
          One picture, four layers. Read it top to bottom: the community
          produces the knowledge, the knowledge is assembled around each
          question, a model answers, and every answer flows back to the
          community for judgment - which becomes new knowledge. The dashed loop
          on the left is the whole idea.
        </p>
        <div className="mt-4 overflow-x-auto rounded-md border border-border bg-surface p-4">
          <svg
            viewBox="0 0 960 640"
            className="h-auto w-full min-w-[760px]"
            role="img"
            aria-label="System diagram: the Igala community produces cold answers, blind comparisons and corrections; these fill the knowledge stores and the deduced grammar; per question, retrieval passes a leak guard into an assembled context that a model answers; answers return to the community for judgment and to the frozen benchmark for scoring"
          >
            {/* ── layer 1: the community ── */}
            <rect
              x="20"
              y="16"
              width="920"
              height="88"
              rx="8"
              fill="var(--surface-sunken)"
              stroke="var(--border-strong)"
            />
            <text
              x="36"
              y="40"
              fontSize="13"
              fontFamily="var(--font-display)"
              fill="var(--text-primary)"
            >
              The Igala community — {corpus.annotators} annotators, led from
              Abuja
            </text>
            {[
              {
                x: 36,
                w: 280,
                t1: "Cold answers",
                t2: "written before seeing any model",
              },
              {
                x: 336,
                w: 280,
                t1: "Blind comparisons",
                t2: "which of two answers is better",
              },
              {
                x: 636,
                w: 288,
                t1: "Corrections + reasons",
                t2: "what was wrong, fixed by a speaker",
              },
            ].map((b) => (
              <g key={b.t1}>
                <rect
                  x={b.x}
                  y="52"
                  width={b.w}
                  height="40"
                  rx="6"
                  fill="var(--surface)"
                  stroke="var(--border-strong)"
                />
                <text
                  x={b.x + 12}
                  y="69"
                  fontSize="12"
                  fill="var(--text-primary)"
                >
                  {b.t1}
                </text>
                <text
                  x={b.x + 12}
                  y="84"
                  fontSize="10"
                  fill="var(--text-tertiary)"
                >
                  {b.t2}
                </text>
              </g>
            ))}

            {/* arrows community -> knowledge */}
            {[176, 476, 780].map((x) => (
              <line
                key={x}
                x1={x}
                y1="104"
                x2={x}
                y2="136"
                stroke="var(--text-tertiary)"
                strokeWidth="1.5"
                markerEnd="url(#arr)"
              />
            ))}

            {/* ── layer 2: knowledge stores + deduced grammar ── */}
            <text
              x="20"
              y="130"
              fontSize="10"
              fill="var(--text-tertiary)"
              letterSpacing="1"
            >
              KNOWLEDGE — the standing corpus, growing with every session
            </text>
            {[
              {
                x: 20,
                w: 220,
                t1: "Community gold",
                t2: `${corpus.goldAnswers} question–answer pairs`,
                t3: "the register anchor",
              },
              {
                x: 252,
                w: 220,
                t1: "Dictionary",
                t2: `${corpus.lexEntries} word ↔ meaning entries`,
                t3: "curated + induced from the Bible",
              },
              {
                x: 484,
                w: 220,
                t1: "Parallel sentences",
                t2: `${corpus.parallelPairs} Igala ↔ English pairs`,
                t3: "how sentences are built",
              },
            ].map((b) => (
              <g key={b.t1}>
                <rect
                  x={b.x}
                  y="140"
                  width={b.w}
                  height="66"
                  rx="6"
                  fill="var(--surface-sunken)"
                  stroke="var(--border-strong)"
                />
                <text
                  x={b.x + 12}
                  y="160"
                  fontSize="12"
                  fontFamily="var(--font-display)"
                  fill="var(--text-primary)"
                >
                  {b.t1}
                </text>
                <text
                  x={b.x + 12}
                  y="177"
                  fontSize="11"
                  fill="var(--text-secondary)"
                >
                  {b.t2}
                </text>
                <text
                  x={b.x + 12}
                  y="192"
                  fontSize="10"
                  fill="var(--text-tertiary)"
                >
                  {b.t3}
                </text>
              </g>
            ))}
            {/* deduced grammar -> system prompt, the rules column */}
            <rect
              x="716"
              y="140"
              width="224"
              height="66"
              rx="6"
              fill="var(--accent-subtle)"
              stroke="var(--accent)"
            />
            <text
              x="728"
              y="160"
              fontSize="12"
              fontFamily="var(--font-display)"
              fill="var(--text-primary)"
            >
              Deduced grammar → system prompt
            </text>
            <text x="728" y="177" fontSize="10" fill="var(--text-secondary)">
              rules read out of all the evidence,
            </text>
            <text x="728" y="191" fontSize="10" fill="var(--text-secondary)">
              only two-source-verified rules ship
            </text>

            {/* arrows knowledge -> serving */}
            {[130, 362, 594].map((x) => (
              <line
                key={x}
                x1={x}
                y1="206"
                x2={x}
                y2="252"
                stroke="var(--text-tertiary)"
                strokeWidth="1.5"
                markerEnd="url(#arr)"
              />
            ))}
            <line
              x1="828"
              y1="206"
              x2="828"
              y2="300"
              stroke="var(--accent)"
              strokeWidth="1.5"
              markerEnd="url(#arrAccent)"
            />
            <text x="836" y="240" fontSize="10" fill="var(--text-tertiary)">
              rules travel as
            </text>
            <text x="836" y="253" fontSize="10" fill="var(--text-tertiary)">
              instructions, not
            </text>
            <text x="836" y="266" fontSize="10" fill="var(--text-tertiary)">
              retrieved prose
            </text>

            {/* ── layer 3: per-question serving ── */}
            <text
              x="20"
              y="246"
              fontSize="10"
              fill="var(--text-tertiary)"
              letterSpacing="1"
            >
              PER QUESTION — assembled fresh every time
            </text>
            <rect
              x="20"
              y="256"
              width="120"
              height="56"
              rx="6"
              fill="var(--surface)"
              stroke="var(--border-strong)"
            />
            <text x="32" y="280" fontSize="12" fill="var(--text-primary)">
              Question
            </text>
            <text x="32" y="296" fontSize="10" fill="var(--text-tertiary)">
              from a person
            </text>
            <line
              x1="140"
              y1="284"
              x2="168"
              y2="284"
              stroke="var(--text-tertiary)"
              strokeWidth="1.5"
              markerEnd="url(#arr)"
            />

            <rect
              x="170"
              y="256"
              width="130"
              height="56"
              rx="6"
              fill="var(--surface)"
              stroke="var(--border-strong)"
            />
            <text x="182" y="280" fontSize="12" fill="var(--text-primary)">
              Retrieval
            </text>
            <text x="182" y="296" fontSize="10" fill="var(--text-tertiary)">
              best-matching pieces
            </text>

            {/* the leak guard, drawn as the filter it is */}
            <g>
              <line
                x1="300"
                y1="284"
                x2="336"
                y2="284"
                stroke="var(--text-tertiary)"
                strokeWidth="1.5"
              />
              <path
                d="M336 270 L354 284 L336 298 Z"
                fill="var(--danger)"
                opacity="0.85"
              />
              <line
                x1="354"
                y1="284"
                x2="382"
                y2="284"
                stroke="var(--text-tertiary)"
                strokeWidth="1.5"
                markerEnd="url(#arr)"
              />
              <text x="300" y="322" fontSize="10" fill="var(--danger)">
                leak guard: no exam question is ever
              </text>
              <text x="300" y="335" fontSize="10" fill="var(--danger)">
                handed its own answer
              </text>
            </g>

            <rect
              x="384"
              y="248"
              width="300"
              height="120"
              rx="6"
              fill="var(--surface-sunken)"
              stroke="var(--border-strong)"
            />
            <text
              x="396"
              y="268"
              fontSize="12"
              fontFamily="var(--font-display)"
              fill="var(--text-primary)"
            >
              Assembled context
            </text>
            {[
              "1  THE METHOD (system prompt: the rules)",
              "2  gold Q&A exemplars (register)",
              "3  parallel sentences (structure prompts only)",
              "4  dictionary lines for this question's words",
              "5  the question + one-line output contract",
            ].map((t, i) => (
              <text
                key={t}
                x="396"
                y={286 + i * 15}
                fontSize="10"
                fill="var(--text-secondary)"
              >
                {t}
              </text>
            ))}
            <line
              x1="684"
              y1="300"
              x2="716"
              y2="300"
              stroke="var(--text-tertiary)"
              strokeWidth="1.5"
              markerEnd="url(#arr)"
            />

            <rect
              x="718"
              y="272"
              width="100"
              height="56"
              rx="6"
              fill="var(--surface)"
              stroke="var(--border-strong)"
            />
            <text x="732" y="296" fontSize="12" fill="var(--text-primary)">
              Model
            </text>
            <text x="732" y="312" fontSize="10" fill="var(--text-tertiary)">
              any of them
            </text>
            <line
              x1="818"
              y1="300"
              x2="848"
              y2="300"
              stroke="var(--text-tertiary)"
              strokeWidth="1.5"
              markerEnd="url(#arr)"
            />

            <rect
              x="850"
              y="272"
              width="90"
              height="56"
              rx="6"
              fill="var(--accent-subtle)"
              stroke="var(--accent)"
            />
            <text x="864" y="296" fontSize="12" fill="var(--text-primary)">
              Answer
            </text>
            <text x="864" y="312" fontSize="10" fill="var(--text-tertiary)">
              in Igala
            </text>

            {/* answer -> two destinations */}
            <line
              x1="895"
              y1="328"
              x2="895"
              y2="420"
              stroke="var(--text-tertiary)"
              strokeWidth="1.5"
            />
            <line
              x1="895"
              y1="420"
              x2="686"
              y2="420"
              stroke="var(--text-tertiary)"
              strokeWidth="1.5"
              markerEnd="url(#arr)"
            />
            <line
              x1="895"
              y1="420"
              x2="895"
              y2="470"
              stroke="var(--text-tertiary)"
              strokeWidth="1.5"
              markerEnd="url(#arr)"
            />

            {/* ── layer 4: judgment and measurement ── */}
            <text
              x="20"
              y="414"
              fontSize="10"
              fill="var(--text-tertiary)"
              letterSpacing="1"
            >
              JUDGMENT — the only measure that finally counts
            </text>
            <rect
              x="20"
              y="424"
              width="440"
              height="92"
              rx="6"
              fill="var(--surface-sunken)"
              stroke="var(--border-strong)"
            />
            <text
              x="32"
              y="446"
              fontSize="12"
              fontFamily="var(--font-display)"
              fill="var(--text-primary)"
            >
              Native judgment
            </text>
            <text x="32" y="464" fontSize="11" fill="var(--text-secondary)">
              blind pairs + corrections on the strongest models
            </text>
            <text x="32" y="480" fontSize="10" fill="var(--text-tertiary)">
              {corpus.poolComparisons > 0
                ? `${corpus.poolComparisons} strong-pair judgments so far`
                : "collecting now"}
            </text>
            <text x="32" y="496" fontSize="10" fill="var(--text-tertiary)">
              what speakers fix becomes tomorrow&apos;s rules
            </text>

            <rect
              x="480"
              y="424"
              width="206"
              height="92"
              rx="6"
              fill="var(--surface-sunken)"
              stroke="var(--border-strong)"
            />
            <text
              x="492"
              y="446"
              fontSize="12"
              fontFamily="var(--font-display)"
              fill="var(--text-primary)"
            >
              Frozen exam
            </text>
            <text x="492" y="464" fontSize="11" fill="var(--text-secondary)">
              {benchmark.frozenPrompts} questions no model
            </text>
            <text x="492" y="479" fontSize="11" fill="var(--text-secondary)">
              ever trains or retrieves on
            </text>
            <text x="492" y="496" fontSize="10" fill="var(--text-tertiary)">
              scored leak-free only
            </text>

            <rect
              x="706"
              y="424"
              width="234"
              height="92"
              rx="6"
              fill="var(--accent-subtle)"
              stroke="var(--accent)"
            />
            <text
              x="718"
              y="446"
              fontSize="12"
              fontFamily="var(--font-display)"
              fill="var(--text-primary)"
            >
              Agreement Score
            </text>
            <text x="718" y="464" fontSize="11" fill="var(--text-secondary)">
              100 = two native speakers&apos;
            </text>
            <text x="718" y="479" fontSize="11" fill="var(--text-secondary)">
              agreement with each other
            </text>
            <text x="718" y="496" fontSize="10" fill="var(--text-tertiary)">
              the bars below
            </text>
            <line
              x1="686"
              y1="470"
              x2="706"
              y2="470"
              stroke="var(--text-tertiary)"
              strokeWidth="1.5"
              markerEnd="url(#arr)"
            />

            {/* ── the flywheel: judgment loops back to the top ── */}
            <path
              d="M 20 470 C -6 470 -6 60 20 60"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.5"
              strokeDasharray="5 4"
              markerEnd="url(#arrAccent)"
            />
            <text
              x="26"
              y="556"
              fontSize="11"
              fill="var(--accent-text)"
              fontFamily="var(--font-display)"
            >
              The flywheel: every judgment and correction re-enters the
              knowledge,
            </text>
            <text
              x="26"
              y="572"
              fontSize="11"
              fill="var(--accent-text)"
              fontFamily="var(--font-display)"
            >
              the grammar, and the next round of models. The community is not
            </text>
            <text
              x="26"
              y="588"
              fontSize="11"
              fill="var(--accent-text)"
              fontFamily="var(--font-display)"
            >
              labeling for the system — the community is the system.
            </text>

            <defs>
              <marker
                id="arr"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill="var(--text-tertiary)" />
              </marker>
              <marker
                id="arrAccent"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill="var(--accent)" />
              </marker>
            </defs>
          </svg>
        </div>
        <p className="mt-2 max-w-2xl text-xs text-text-muted">
          Counts in the diagram are live, from the same computation as the
          numbers above. The red filter is the leak guard: every retrieved piece
          is checked so no benchmark question is ever served its own answer -
          the reason the scores below can be believed.
        </p>
      </section>

      {/* ── The full story lives on the public site ─────────────────────── */}
      <a
        href="https://wikitongues-ai-site.vercel.app/how-it-works/"
        target="_blank"
        rel="noopener noreferrer"
        className="group mb-10 flex items-center justify-between gap-4 rounded-lg border border-accent bg-accent-subtle p-5 shadow-sm transition-shadow hover:shadow-md"
      >
        <div>
          <p className="text-base font-semibold text-text-primary">
            The full story - method, scores, and the exact instructions the
            models receive
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            On the public Wikitongues AI site - readable without a login,
            shareable with funders and community.
          </p>
        </div>
        <svg
          className="h-6 w-6 shrink-0 text-accent-text transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M7 17L17 7" />
          <path d="M8 7h9v9" />
        </svg>
      </a>

      {/* ── The scoreboard ──────────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="flex items-center gap-2 text-xl text-text-primary">
          The benchmark: Community Agreement Score
          <InfoTip label="About this score" width="w-80">
            Character overlap (chrF) with the community&apos;s answers, rescaled
            so that 100 marks how closely one native speaker agrees with another
            on the same questions. Computed live from the database on every page
            load, on the leak-free subset only, and never capped at 100.
          </InfoTip>
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
          Every model faces the same {benchmark.frozenPrompts}-question frozen
          exam - questions the models never saw during any adaptation step - and
          each answer is compared with what Igala speakers wrote for that
          question. Longer bar, closer to how the community actually writes; the
          yardstick is agreement with this one community&apos;s writing, on
          Igala questions only.
        </p>
        <div className="mt-4">
          <BenchmarkBars
            candidates={candidates}
            ceilingChrf={m.agreementCeilingChrf}
            leakFreePrompts={benchmark.leakFreePrompts}
          />
        </div>
      </section>

      {/* ── What changed, when ──────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-xl text-text-primary">What changed, when</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
          The dates are fixed history - what each day added and what it
          corrected. Every live number they produced is recomputed above, not
          repeated here.
        </p>
        <ul className="mt-3 max-w-2xl space-y-3">
          {CHANGELOG.map((e) => (
            <li
              key={e.date}
              className="rounded-md border border-border bg-surface p-4 text-sm leading-relaxed text-text-secondary"
            >
              <span className="font-mono text-xs text-accent-text">
                {e.date}
              </span>
              <p className="mt-1">{e.text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── PARITY HOLD (2026-08-28) ─────────────────────────────────────
          Everything below is slated to move to the marketing site's
          /how-it-works page (linked in the banner above) and then be deleted
          from this app page. At the time of this edit that public page
          returned 404, so per the coordination rule these sections stay here
          until the public page verifiably carries their content. Once parity
          is confirmed, delete from this divider to the end of the "What is
          being tested now" section. */}
      <div className="mb-10 border-t border-border pt-6">
        <p className="max-w-2xl text-xs text-text-muted">
          The sections below are moving to the public story page linked above.
          They stay here until that page carries them, so nothing is lost in the
          move.
        </p>
      </div>

      {/* ── b. The journey ──────────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-xl text-text-primary">
          The journey: four versions of the same idea
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
          The models never learn Igala the way a person does. Each version of
          the system changes what real Igala the model gets to see at the moment
          it answers, and each fix exposed the next problem.
        </p>
        <div className="mt-4 overflow-x-auto rounded-md border border-border bg-surface p-4">
          <svg
            viewBox="0 0 1260 240"
            className="h-auto w-full min-w-[940px]"
            role="img"
            aria-label="Four stages: v0 plain models, v1 retrieval of community answers, v2 dictionary plus parallel sentences plus a procedure, v3 the same package plus a deduced grammar"
          >
            {/* stage boxes */}
            {[
              {
                x: 10,
                title: "v0 - plain models",
                sub: "Ask a frontier model in English",
                fixed: "Nothing yet: this is the baseline.",
                missing: [
                  "Asked for Igala, models answer",
                  "in Yoruba or English -",
                  "invented words, wrong language.",
                ],
              },
              {
                x: 330,
                title: "v1 - retrieval",
                sub: "Paste community answers into the prompt",
                fixed: "Real Igala words appear in answers.",
                missing: [
                  "Words without sentence structure.",
                  "Agnes: “the first sentence is",
                  "saying three different things.”",
                ],
              },
              {
                x: 650,
                title: "v2 - a method",
                sub: "Dictionary + parallel Bible sentences + a procedure",
                fixed: "Attested spellings, copied sentence shape.",
                missing: [
                  "Still copying, not speaking.",
                  "v1 and v2 both stay live in chat",
                  "for native structural review.",
                ],
              },
              {
                x: 970,
                title: "v3 - a grammar",
                sub: "v2's package + a grammar deduced from the evidence",
                fixed: "Pronouns, negation, word order as rules.",
                missing: [
                  "Only A/B-grade rules enshrined;",
                  "greetings stay retrieval-served.",
                  "Speakers still judge structure.",
                ],
              },
            ].map((s) => (
              <g key={s.title}>
                <rect
                  x={s.x}
                  y="20"
                  width="280"
                  height="200"
                  rx="8"
                  fill="var(--surface-sunken)"
                  stroke="var(--border-strong)"
                />
                <rect
                  x={s.x}
                  y="20"
                  width="280"
                  height="6"
                  rx="3"
                  fill="var(--accent)"
                />
                <text
                  x={s.x + 14}
                  y="52"
                  fontSize="16"
                  fontFamily="var(--font-display)"
                  fill="var(--text-primary)"
                >
                  {s.title}
                </text>
                <text
                  x={s.x + 14}
                  y="72"
                  fontSize="11"
                  fill="var(--text-tertiary)"
                >
                  {s.sub}
                </text>
                <text
                  x={s.x + 14}
                  y="104"
                  fontSize="11"
                  fontWeight="600"
                  fill="var(--success)"
                >
                  What it fixed
                </text>
                <text
                  x={s.x + 14}
                  y="121"
                  fontSize="11"
                  fill="var(--text-secondary)"
                >
                  {s.fixed}
                </text>
                <text
                  x={s.x + 14}
                  y="152"
                  fontSize="11"
                  fontWeight="600"
                  fill="var(--danger)"
                >
                  What it did not
                </text>
                {s.missing.map((line, i) => (
                  <text
                    key={line}
                    x={s.x + 14}
                    y={169 + i * 16}
                    fontSize="11"
                    fill="var(--text-secondary)"
                  >
                    {line}
                  </text>
                ))}
              </g>
            ))}
            {/* arrows */}
            {[295, 615, 935].map((x) => (
              <g key={x}>
                <line
                  x1={x}
                  y1="120"
                  x2={x + 30}
                  y2="120"
                  stroke="var(--text-tertiary)"
                  strokeWidth="2"
                />
                <polygon
                  points={`${x + 30},114 ${x + 40},120 ${x + 30},126`}
                  fill="var(--text-tertiary)"
                />
              </g>
            ))}
          </svg>
        </div>
      </section>

      {/* ── c. How an answer is built ───────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-xl text-text-primary">
          How one answer is built today (v2 and v3)
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
          When someone asks a question, the system assembles a package around
          it, in this order, and sends the whole package to the model. v3 uses
          this exact same package and changes only the first piece - its system
          prompt adds the deduced grammar - so any difference between v2 and v3
          scores is attributable to that one change. Every piece retrieved for a
          benchmark question first passes a leak guard: if a piece contains that
          question&apos;s own community answer, it is dropped and the drop is
          recorded - otherwise the test would hand the model its answer key.
        </p>
        <div className="mt-4 overflow-x-auto">
          <ol className="min-w-[560px] space-y-2">
            {[
              {
                title: "THE METHOD (system prompt)",
                why: "A numbered procedure telling the model how to use the material below - dictionary for word forms, examples for sentence shape - because the failure mode is a model that has the material and does not know what to do with it.",
                guarded: false,
              },
              {
                title: "Community gold Q/A exemplars",
                why: "Real question-and-answer pairs written by Igala speakers, shown as example exchanges, so the model sees what a good answer looks and sounds like - terse, in Igala, spelled the community's way.",
                guarded: true,
              },
              {
                title: "Parallel example sentences (Igala-English pairs)",
                why: "Bible-corpus sentence pairs that show how Igala sentences are built. Served only for questions that ask the model to build something - a sentence, a story, a greeting - because word-lookup questions were measurably hurt by them.",
                guarded: true,
              },
              {
                title: "Per-word dictionary lines",
                why: "One line per content word of the question that the dictionary attests, with the exact attested Igala form. Placed immediately above the question because spelling is meaning in Igala - a changed letter is a different word, not a typo.",
                guarded: true,
              },
              {
                title: "The question",
                why: "The user's actual question, unchanged.",
                guarded: false,
              },
              {
                title: "Terminal contract",
                why: "One closing line under the question restating the output rule - answer in Igala only, nothing else - because instructions at both ends of a long prompt hold better than instructions at one.",
                guarded: false,
              },
            ].map((box, i) => (
              <li
                key={box.title}
                className="rounded-md border border-border bg-surface p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-text-muted">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium text-text-primary">
                    {box.title}
                  </span>
                  {box.guarded && (
                    <span className="rounded-full border border-accent bg-accent-subtle px-2 py-0.5 text-[10px] font-medium text-accent-text">
                      passes the leak guard
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                  {box.why}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── d. The exact system prompt ──────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-xl text-text-primary">
          The exact instructions the models receive
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
          This is the v2 system prompt, imported directly from the code that
          serves the models and rendered verbatim - not a paraphrase, and not a
          copy that could drift out of date.
        </p>
        {/* Source documents. GitHub links resolve for people with repository
            access (the team); the prompt itself is already rendered verbatim
            below for everyone else, so no reader is left without the content. */}
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
          Source documents for readers with repository access:{" "}
          <a
            className="underline decoration-accent underline-offset-2"
            href="https://github.com/madihg/wikitongues-ai/blob/main/web/src/lib/generation-prompt-v3.ts"
          >
            the system prompt in code
          </a>
          ,{" "}
          <a
            className="underline decoration-accent underline-offset-2"
            href="https://github.com/madihg/wikitongues-ai/blob/main/tasks/igala-grammar-deduced.md"
          >
            the deduced grammar with its evidence
          </a>
          , and{" "}
          <a
            className="underline decoration-accent underline-offset-2"
            href="https://github.com/madihg/wikitongues-ai/blob/main/tasks/rag-design.md"
          >
            the retrieval design document
          </a>
          .
        </p>
        <div className="mt-3 overflow-x-auto rounded-md border border-border bg-surface-sunken p-4">
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-text-secondary">
            {IGALA_SYSTEM_V2}
          </pre>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">
          And the v3 system prompt - the same skeleton plus the closed-class
          grammar and register sections, every line traced to an A- or B-grade
          rule in the grammar deduction (tasks/igala-grammar-deduced.md):
        </p>
        <div className="mt-2 overflow-x-auto rounded-md border border-border bg-surface-sunken p-4">
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-text-secondary">
            {IGALA_SYSTEM_V3}
          </pre>
        </div>
        <p className="mt-3 text-sm text-text-secondary">
          And the one line appended below every question:
        </p>
        <div className="mt-2 overflow-x-auto rounded-md border border-border bg-surface-sunken p-4">
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-text-secondary">
            {igalaTerminalContract("")}
          </pre>
        </div>
      </section>

      {/* ── e. Reading the score (the bars themselves are above) ────────── */}
      <section className="mb-10">
        <h2 className="text-xl text-text-primary">
          Reading the Community Agreement Score
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
          The scoreboard above is not comparable to general-knowledge benchmarks
          like MMLU, and a high bar there claims nothing beyond Igala. Here is
          what the number actually measures.
        </p>

        <div className="mt-4 max-w-2xl space-y-3 rounded-md border border-border bg-surface p-4 text-sm leading-relaxed text-text-secondary">
          <p>
            <strong className="text-text-primary">What the score means.</strong>{" "}
            Underneath is chrF, the standard character-overlap metric machine
            translation systems are scored with (the sacrebleu convention):
            0-100 for how much an answer&apos;s characters overlap with the
            community&apos;s answers, computed on the stripped answer so an
            English preamble cannot inflate it. We then rescale it so that the
            agreement between two native speakers reads exactly 100. A score of
            85 means: this model&apos;s answers are 85% as close to the
            community&apos;s writing as one native speaker&apos;s answers are to
            another&apos;s.
          </p>
          <p>
            <strong className="text-text-primary">A worked example.</strong>{" "}
            Suppose a test question asks for a word and two speakers wrote the
            same five letters, differing only in one accent mark - their overlap
            is high but not perfect, and that speaker-to-speaker overlap is what
            the 100 line is anchored to. A model whose answer shares four of
            those five letters in order lands near the line; a model that
            answers in English shares almost no characters and lands near zero.
          </p>
          <p>
            <strong className="text-text-primary">
              Why 100 is native agreement, not perfection.
            </strong>{" "}
            Two Igala speakers answering the same question rarely write the
            identical string - spelling varies, tone marks vary, phrasing
            varies. So the honest yardstick is not &quot;matched the answer
            key&quot; (there is no single answer key) but &quot;agreed with the
            community as much as its own members agree with each other&quot;.
            Every bar here is scored LIKE-FOR-LIKE: for each held-out speaker,
            the model is compared to the same k-1 references that speaker&apos;s
            own peers are judged against, then averaged over which speaker was
            held out - never against more answer keys than a speaker gets. A bar
            past the 100 line is not a construction artifact under this rule: it
            means the model measured closer to the community&apos;s writing than
            one speaker measured to another, on the same construction as every
            other bar.
          </p>
          <p>
            <strong className="text-text-primary">
              Why it is measured on the leak-free subset.
            </strong>{" "}
            {benchmark.leakedPrompts} of {benchmark.frozenPrompts} frozen
            questions once had one of their own community answers included in
            material served to the models; on those, a high score measures
            copying, not competence. The score therefore uses only the{" "}
            {benchmark.leakFreePrompts} questions where that never happened, and
            its ceiling is computed on those same questions with one answer per
            speaker - repeat submissions by the same person do not count as
            agreement.
          </p>
          <p>
            <strong className="text-text-primary">
              Why we do not call it &quot;% fluent&quot;.
            </strong>{" "}
            chrF measures resemblance to how the community writes; only native
            judgment measures fluency. In {corpus.pairwiseComparisons} blind
            comparisons to date, speakers found both answers inadequate{" "}
            {noPreferencePct}% of the time -{" "}
            {corpus.poolComparisons === 0 ? (
              <>
                and none of those comparisons involved the strongest systems on
                this chart, whose blind test is only beginning
              </>
            ) : (
              <>
                on the strongest current systems specifically, the no-preference
                rate so far is{" "}
                {pct(corpus.poolBothInadequate, corpus.poolComparisons)}% of{" "}
                {corpus.poolComparisons} comparisons
              </>
            )}
            . So the bars above chart progress from &quot;does not speak
            Igala&quot; toward &quot;speaks it badly&quot;, and the speakers
            judge the rest.
          </p>
        </div>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-accent-text">
            Full data: the raw chrF table, both ceilings, all prompts vs
            leak-free
          </summary>
          <div className="mt-3 overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[640px] border-collapse bg-surface text-sm">
              <thead>
                <tr className="border-b border-border-strong bg-surface-sunken text-left text-xs uppercase tracking-wide text-text-tertiary">
                  <th className="px-3 py-2 font-medium">Candidate</th>
                  <th className="px-3 py-2 font-medium">Approach</th>
                  <th className="px-3 py-2 text-right font-medium">n</th>
                  <th className="px-3 py-2 text-right font-medium">
                    All {benchmark.frozenPrompts} prompts
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    Leak-free ({benchmark.leakFreePrompts})
                  </th>
                </tr>
              </thead>
              <tbody>
                <CeilingRow
                  label="Human agreement ceiling - one answer per speaker"
                  note="the honest ceiling"
                  ceiling={ceilings.onePerAnnotator}
                />
                <CeilingRow
                  label="Human agreement ceiling - as first shipped"
                  note="inflated: counts repeat submissions by the same person as agreement"
                  ceiling={ceilings.asShipped}
                />
                {candidates.map((c) => (
                  <ScoreRow key={c.name} candidate={c} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 max-w-2xl space-y-3 rounded-md border border-border bg-surface p-4 text-sm leading-relaxed text-text-secondary">
            <p>
              These are the raw chrF values the agreement score is rescaled from
              - where a provider quota cut a run short, the n column shows fewer
              answers.
            </p>
            <p>
              <strong className="text-text-primary">
                Why the ceiling is about {fmt(ceilings.onePerAnnotator.chrfAll)}
                , not 100.
              </strong>{" "}
              Two Igala speakers answering the same question rarely write the
              identical string, so even a perfect model cannot score 100 in raw
              chrF. We first published a ceiling of{" "}
              {fmt(ceilings.asShipped.chrfAll)}, but that number counted people
              re-submitting their own answer as two speakers agreeing. One
              answer per speaker gives {fmt(ceilings.onePerAnnotator.chrfAll)} -
              the honest limit, and both versions are shown above so the
              correction stays visible.
            </p>
          </div>
        </details>
      </section>

      {/* ── f. What is being tested now ─────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-xl text-text-primary">What is being tested now</h2>
        <ul className="mt-3 max-w-2xl space-y-3">
          <li className="rounded-md border border-border bg-surface p-4 text-sm leading-relaxed text-text-secondary">
            <span className="font-medium text-text-primary">
              v1 versus v2, judged by Agnes.
            </span>{" "}
            The scoreboard cannot see sentence structure - character overlap
            treats a coherent sentence and a word salad with the same words
            alike, and because the frozen questions are mostly single-word
            lookups, v1 can outrank v2 there even where v2&apos;s sentences are
            better built. Both versions stay live in the chat so Agnes&apos;s
            team can judge, side by side, exactly the thing the benchmark cannot
            measure.
          </li>
          <li className="rounded-md border border-border bg-surface p-4 text-sm leading-relaxed text-text-secondary">
            <span className="font-medium text-text-primary">
              The me- numeral question.
            </span>{" "}
            Aligning the Bible parallel corpus surfaced numeral forms with a me-
            prefix (meji, meta) alongside the dictionary&apos;s plain citation
            forms (eji, eta). The reference grammar says Igala agreement is
            governed by number, which makes a numeral concord form plausible -
            but plausible is not confirmed, so the question goes to speakers
            before the corpus teaches the model a pattern the community has not
            confirmed.
          </li>
          <li className="rounded-md border border-border bg-surface p-4 text-sm leading-relaxed text-text-secondary">
            <span className="font-medium text-text-primary">
              Pending unlocks.
            </span>{" "}
            The Idakwoji lexicon (roughly 5,000 headwords, against the{" "}
            {corpus.lexEntries.toLocaleString()} dictionary lines the system
            serves from today) - lexical coverage, not model architecture, is
            the binding constraint. And Lydia&apos;s syntax write-up, to turn
            her review into data.
          </li>
        </ul>
      </section>
    </div>
  );
}

function CeilingRow({
  label,
  note,
  ceiling,
}: {
  label: string;
  note: string;
  ceiling: CeilingResult;
}) {
  return (
    <tr className="border-b border-border bg-accent-subtle">
      <td className="px-3 py-2">
        <div className="font-medium text-text-primary">{label}</div>
        <div className="text-xs text-text-tertiary">{note}</div>
      </td>
      <td className="px-3 py-2 text-text-secondary">speakers vs speakers</td>
      <td className="px-3 py-2 text-right font-mono text-text-secondary">
        {ceiling.nPromptsAll}
      </td>
      <td className="px-3 py-2 text-right font-mono text-text-primary">
        {fmt(ceiling.chrfAll)}
      </td>
      <td className="px-3 py-2 text-right font-mono text-text-primary">
        {fmt(ceiling.chrfClean)}
      </td>
    </tr>
  );
}

function ScoreRow({ candidate: c }: { candidate: CandidateScore }) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-3 py-2 text-text-primary">{c.name}</td>
      <td className="px-3 py-2 text-text-secondary">{c.approach}</td>
      <td className="px-3 py-2 text-right font-mono text-text-secondary">
        {c.n}
      </td>
      <td className="px-3 py-2 text-right font-mono text-text-secondary">
        {fmt(c.strippedChrfAll)}
      </td>
      <td className="px-3 py-2 text-right font-mono text-text-primary">
        {fmt(c.strippedChrfClean)}
      </td>
    </tr>
  );
}
