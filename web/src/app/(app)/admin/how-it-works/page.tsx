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
  - scripts/leak-audit.ts: the leak-detection composition this page's metrics
    lib mirrors.
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
import { InfoTip } from "@/components/info-tip";

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
    <div className="max-w-4xl">
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
          The journey: three versions of the same idea
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
          The models never learn Igala the way a person does. Each version of
          the system changes what real Igala the model gets to see at the moment
          it answers, and each fix exposed the next problem.
        </p>
        <div className="mt-4 overflow-x-auto rounded-md border border-border bg-surface p-4">
          <svg
            viewBox="0 0 940 240"
            width="940"
            height="240"
            role="img"
            aria-label="Three stages: v0 plain models, v1 retrieval of community answers, v2 dictionary plus parallel sentences plus a procedure"
            className="min-w-[940px]"
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
            {[295, 615].map((x) => (
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
          How one answer is built today (v2)
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
          When someone asks a question, the system assembles a package around
          it, in this order, and sends the whole package to the model. Every
          piece retrieved for a benchmark question first passes a leak guard: if
          a piece contains that question&apos;s own community answer, it is
          dropped and the drop is recorded - otherwise the test would hand the
          model its answer key.
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
        <div className="mt-3 overflow-x-auto rounded-md border border-border bg-surface-sunken p-4">
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-text-secondary">
            {IGALA_SYSTEM_V2}
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

      {/* ── e. Scoreboard ───────────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="flex items-center gap-2 text-xl text-text-primary">
          Scoreboard
          <InfoTip label="About these scores" width="w-80">
            chrF measures character overlap between a model&apos;s answer and
            the community&apos;s answers, 0 to 100. Scores are computed on the
            stripped answer (English packaging removed) so a polite English
            preamble cannot inflate them. Sorted by the leak-free column, which
            is the honest one.
          </InfoTip>
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
          Every model faces the same {benchmark.frozenPrompts} frozen test
          questions, and each stored answer is compared with what Igala speakers
          wrote for that question; where a provider quota cut a run short, the n
          column shows fewer answers. Recomputed from stored outputs on every
          page load.
        </p>
        <div className="mt-4 overflow-x-auto rounded-md border border-border">
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

        <div className="mt-4 max-w-2xl space-y-3 rounded-md border border-border bg-surface p-4 text-sm leading-relaxed text-text-secondary">
          <p>
            <strong className="text-text-primary">What chrF is.</strong> A 0-100
            measure of how much an answer&apos;s characters overlap with the
            community&apos;s answers. It rewards writing like these speakers
            write - their spelling, their tone marks. It does not measure
            fluency or correctness.
          </p>
          <p>
            <strong className="text-text-primary">
              Why the ceiling is about {fmt(ceilings.onePerAnnotator.chrfAll)},
              not 100.
            </strong>{" "}
            Two Igala speakers answering the same question rarely write the
            identical string, so even a perfect model cannot score 100. We first
            published a ceiling of {fmt(ceilings.asShipped.chrfAll)}, but that
            number counted people re-submitting their own answer as two speakers
            agreeing. One answer per speaker gives{" "}
            {fmt(ceilings.onePerAnnotator.chrfAll)} - the honest limit, and both
            versions are shown above so the correction stays visible.
          </p>
          <p>
            <strong className="text-text-primary">
              Why leak-free is the honest column.
            </strong>{" "}
            {benchmark.leakedPrompts} of {benchmark.frozenPrompts} test
            questions had one of their own community answers included in the
            material served to the models. On those questions the models could
            simply copy, so scores there measure copying, not competence. The
            leak-free column keeps only the {benchmark.leakFreePrompts}{" "}
            questions where that never happened.
          </p>
          <p>
            <strong className="text-text-primary">
              What none of this proves.
            </strong>{" "}
            In {corpus.pairwiseComparisons} blind comparisons to date, native
            speakers found both answers inadequate {noPreferencePct}% of the
            time - far too often for any ranking by preference to exist. These
            scores measure progress from &quot;does not speak Igala&quot; toward
            &quot;speaks it badly&quot;, not toward &quot;speaks it well&quot;.
            Only the speakers can judge the rest.
          </p>
        </div>
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
            the binding constraint. Lydia&apos;s syntax write-up, to turn her
            review into data. And a frontier Claude arm, still unmeasured
            because the project&apos;s Anthropic API key has no credit.
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
