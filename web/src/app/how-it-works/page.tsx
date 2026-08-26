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
 * "How it works" - the whole project explained for non-ML readers:
 * Wikitongues staff, funders, community members. Researcher-gated by the
 * admin layout's RoleGuard, like every sibling page under /admin.
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

      {/* ── e. The benchmark ────────────────────────────────────────────── */}
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
          question. The chart borrows the familiar benchmark layout - longer
          bar, closer to how the community actually writes - but the yardstick
          is agreement with this one community&apos;s writing, on Igala
          questions only. It is not comparable to general-knowledge benchmarks
          like MMLU, and a high bar here claims nothing beyond Igala.
        </p>
        <div className="mt-4">
          <BenchmarkBars
            candidates={candidates}
            ceilingChrf={m.agreementCeilingChrf}
            leakFreePrompts={benchmark.leakFreePrompts}
          />
        </div>

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
            That is also why a bar can pass 100: matching the pooled community
            answers more closely than one speaker matches another is possible,
            and when it happens the chart shows it rather than clamping it.
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
            . So these bars chart progress from &quot;does not speak Igala&quot;
            toward &quot;speaks it badly&quot;, and the speakers judge the rest.
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

      {/* ── g. What changed, when ───────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-xl text-text-primary">What changed, when</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
          The dates are fixed history - what each day added and what it
          corrected. Every live number they produced is recomputed above, not
          repeated here.
        </p>
        <ul className="mt-3 max-w-2xl space-y-3">
          {[
            {
              date: "Aug 9, 2026",
              text: "The automatic eval harness, the honest human ceiling, and the leak guard. The audit that day found the benchmark had served 15+ of its 43 frozen questions their own community answers - those scores measured copying, so every number since is reported on the leak-free subset.",
            },
            {
              date: "Aug 12, 2026",
              text: "The Bible parallel corpus - 30,907 Igala-English sentence pairs ingested under BSN permission - plus a 2,104-entry lexicon, powering retrieval v2 and THE METHOD.",
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
          ].map((e) => (
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
