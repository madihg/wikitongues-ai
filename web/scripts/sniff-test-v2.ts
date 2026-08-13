/**
 * SNIFF TEST: serving path v2 against v1, end to end, on the frozen 43.
 *
 * Agnes's live verdict on the v1-fed models (2026-08-11) was "vocabulary, not
 * syntax". v2 answers that with a rebuilt retrieval composition (lexicon +
 * parallel pairs + gold, no prose - see src/lib/arena/retrieval-v2.ts). This
 * script is the go/no-go check on that bet, in five steps:
 *
 *   1. audit       assemble v2 retrieval for all 43 frozen prompts, no spend:
 *                  dictionary coverage, pair counts, leak-guard drops, token
 *                  budget, plus two full assembled prompts for eyeball review.
 *   2. generate    run every registered rag-v2 candidate over the frozen bank
 *                  through the SAME wiring as the eval-run route (SPENDS MONEY,
 *                  estimated well under $2; idempotent - existing outputs are
 *                  skipped, so a crashed run resumes rather than double-pays).
 *   3. score       rescore ALL candidates through scripts/leak-audit.ts's
 *                  exported core (same code path as the published v1 numbers),
 *                  plus the language-gate Igala share per candidate.
 *   4. qualitative v2 vs stored v1 on three NON-benchmark free-form prompts,
 *                  printed for native-speaker review, never scored or stored.
 *   5. verdict     paired bootstrap (v2 - v1) per base model on the leak-free
 *                  subset - the only comparison allowed to claim a difference.
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/sniff-test-v2.ts [step]
 * step = audit | generate | score | qualitative | verdict | all (default all)
 */

import { prisma } from "@/lib/prisma";
import {
  generateForCandidate,
  type CandidateLike,
} from "@/lib/arena/providers";
import {
  buildRetrievalV2,
  contentWords,
  type RetrievalV2Result,
} from "@/lib/arena/retrieval-v2";
import { IGALA_SYSTEM_V2, buildUserTurnV2 } from "@/lib/generation-prompt-v2";
import { estimateGenerationCostUsd, roundUsd } from "@/lib/arena/pricing";
import { pairedBootstrapDelta, wilsonInterval } from "@/lib/eval/stats";
import {
  buildLanguageIdModel,
  identifyLanguage,
  type LanguageIdModel,
} from "@/lib/eval/langid";
import {
  loadLeakAudit,
  scoreOutputs,
  buildRescoreRow,
  fmt,
  type LeakAuditData,
  type AuditedOutput,
} from "./leak-audit";

/** v1 slug -> v2 slug, the same trio register-rag-v2.ts registered. */
const PAIRS: { v1Slug: string; v2Slug: string }[] = [
  { v1Slug: "gpt-4-1-rag", v2Slug: "gpt-4-1-rag-v2" },
  { v1Slug: "llama-3-3-70b-rag", v2Slug: "llama-3-3-70b-rag-v2" },
  { v1Slug: "gemma-4-31b-rag", v2Slug: "gemma-4-31b-rag-v2" },
];

/**
 * The three free-form review prompts. NOT in any benchmark bank, and never
 * stored: they exist so Agnes can read a v2 answer next to a v1 answer on the
 * kind of open request she actually makes, without the number-chasing risk of
 * folding unofficial prompts into the scored set.
 */
const QUAL_PROMPTS: { text: string; v1SearchTerms: string[] }[] = [
  {
    text: "Give me a short story in Igala about a farmer and rain",
    v1SearchTerms: ["farmer", "rain", "story"],
  },
  {
    text: "How do you greet an elder in the morning in Igala?",
    v1SearchTerms: ["greet", "elder", "morning"],
  },
  {
    text: "Translate: The children are eating",
    v1SearchTerms: ["children", "eating"],
  },
];

// ─── shared run state ───────────────────────────────────────────────────────

/** Retrieval is deterministic, so one build per prompt serves every step. */
const retrievalCache = new Map<string, RetrievalV2Result>();
let spendUsd = 0;
let tokensInTotal = 0;
let tokensOutTotal = 0;

async function retrievalFor(prompt: {
  promptId: string;
  text: string;
  bucket: string | null;
}): Promise<RetrievalV2Result> {
  if (!retrievalCache.has(prompt.promptId)) {
    retrievalCache.set(
      prompt.promptId,
      await buildRetrievalV2(prisma, {
        promptId: prompt.promptId,
        text: prompt.text,
        bucket: prompt.bucket,
        // Every prompt this script retrieves for is frozen bank (isHoldout in
        // the DB) or free-form chat - both must run under the leak guard.
        isHoldout: true,
      }),
    );
  }
  return retrievalCache.get(prompt.promptId)!;
}

async function frozenPrompts() {
  return prisma.prompt.findMany({
    where: { isHoldout: true, language: "igala" },
    select: { id: true, promptId: true, text: true, bucket: true },
    orderBy: { promptId: "asc" },
  });
}

/** The registered rag-v2 candidates this environment can actually call. */
async function v2Candidates() {
  const rows = await prisma.candidateModel.findMany({
    where: { slug: { in: PAIRS.map((p) => p.v2Slug) } },
  });
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const hasTogetherKey = Boolean(
    process.env.OPENAI_COMPATIBLE_API_KEY ?? process.env.TOGETHER_API_KEY,
  );
  const usable: typeof rows = [];
  for (const { v2Slug } of PAIRS) {
    const c = bySlug.get(v2Slug);
    if (!c) {
      console.log(`  !! ${v2Slug} is not registered - skipping`);
      continue;
    }
    if (c.provider === "openai-compatible" && !hasTogetherKey) {
      console.log(`  !! ${v2Slug} needs TOGETHER_API_KEY - skipping`);
      continue;
    }
    usable.push(c);
  }
  return usable;
}

/** chars/4 - the same crude-but-consistent estimate pricing.ts uses. */
function approxTokens(text: string): number {
  return Math.round(text.length / 4);
}

// ─── 1. ASSEMBLY AUDIT ──────────────────────────────────────────────────────

async function stepAudit() {
  const prompts = await frozenPrompts();
  console.log(
    `\n═══ 1. ASSEMBLY AUDIT (${prompts.length} frozen prompts, no spend) ═══\n`,
  );

  let lexTotal = 0;
  let dictLineTotal = 0;
  let coveredTotal = 0;
  let contentWordTotal = 0;
  let pairTotal = 0;
  let goldTotal = 0;
  let leakDropTotal = 0;
  let promptsWithDrops = 0;
  let tokenTotal = 0;
  const perPromptTokens: number[] = [];

  for (const p of prompts) {
    const r = await retrievalFor(p);
    const lexN = r.contextIds.filter((i) => i.startsWith("lex:")).length;
    const pairN = r.contextIds.filter((i) => i.startsWith("pp:")).length;
    const goldN = r.contextIds.filter((i) => i.startsWith("gold:")).length;
    lexTotal += lexN;
    pairTotal += pairN;
    goldTotal += goldN;

    // Coverage: which content words earned a dictionary line. The rendered
    // line always opens `"<word>" is `, so the check reads the block the model
    // will actually see rather than re-deriving retrieval internals.
    const words = contentWords(p.text);
    const covered = words.filter((w) =>
      r.dictionaryBlock.includes(`"${w}" is `),
    );
    contentWordTotal += words.length;
    coveredTotal += covered.length;
    dictLineTotal += covered.length;

    if (r.leakReport.hitCount > 0) {
      leakDropTotal += r.leakReport.hitCount;
      promptsWithDrops++;
    }

    // The full assembled request, as generate will send it: system prompt +
    // gold example turns + the composed user turn.
    const userTurn = buildUserTurnV2(p.text, r, p.bucket);
    const exampleChars = r.exampleTurns
      .map((t) => t.question + t.answer)
      .join("").length;
    const tokens =
      approxTokens(IGALA_SYSTEM_V2) +
      approxTokens(userTurn) +
      Math.round(exampleChars / 4);
    tokenTotal += tokens;
    perPromptTokens.push(tokens);
  }

  const n = prompts.length;
  console.log(
    `mean dictionary senses per prompt : ${(lexTotal / n).toFixed(1)} (lex: ids served)`,
  );
  console.log(
    `mean dictionary lines per prompt  : ${(dictLineTotal / n).toFixed(1)}`,
  );
  console.log(
    `content-word coverage             : ${coveredTotal}/${contentWordTotal} (${((100 * coveredTotal) / contentWordTotal).toFixed(1)}%)`,
  );
  console.log(
    `mean parallel pairs per prompt    : ${(pairTotal / n).toFixed(1)} (of k=6)`,
  );
  console.log(
    `mean gold exemplars per prompt    : ${(goldTotal / n).toFixed(1)} (of k=4)`,
  );
  console.log(
    `leak-guard drops                  : ${leakDropTotal} pieces across ${promptsWithDrops} prompts`,
  );
  console.log(
    `assembled prompt tokens (chars/4) : total ${tokenTotal}, mean ${(tokenTotal / n).toFixed(0)}, max ${Math.max(...perPromptTokens)}`,
  );

  // Two full assemblies for eyeball review: one lexicon, one grammar.
  for (const bucket of ["lexicon_disambig", "grammar_tone"]) {
    const p = prompts.find((x) => x.bucket === bucket);
    if (!p) continue;
    const r = await retrievalFor(p);
    console.log(`\n────── FULL ASSEMBLY  ${p.promptId}  (${bucket}) ──────`);
    console.log(`[system]\n${IGALA_SYSTEM_V2}\n`);
    for (const t of r.exampleTurns) {
      console.log(`[user]      ${t.question}`);
      console.log(`[assistant] ${t.answer}`);
    }
    console.log(`[user]\n${buildUserTurnV2(p.text, r, p.bucket)}`);
    console.log("────── END ASSEMBLY ──────");
  }
}

// ─── 2. GENERATE ────────────────────────────────────────────────────────────

async function stepGenerate() {
  const prompts = await frozenPrompts();
  const candidates = await v2Candidates();
  console.log(
    `\n═══ 2. GENERATE (${candidates.length} v2 candidates x ${prompts.length} prompts, SPENDS MONEY) ═══\n`,
  );

  for (const candidate of candidates) {
    // The register script pinned temperature 0 (copy-exactly methods must not
    // sample); trust but verify, because a silently non-zero temperature would
    // make the v1/v2 comparison partly a decoding comparison.
    const d = (candidate.decodingParams ?? {}) as Record<string, unknown>;
    if (d.temperature !== 0) {
      throw new Error(
        `${candidate.slug} has temperature ${String(d.temperature)}, expected 0 - re-run scripts/register-rag-v2.ts`,
      );
    }

    const existing = await prisma.modelOutput.findMany({
      where: { candidateModelId: candidate.id, isDemo: false },
      select: { promptId: true },
    });
    const done = new Set(existing.map((e) => e.promptId));

    let created = 0;
    let skipped = 0;
    let failed = 0;
    let consecutiveFailures = 0;
    console.log(`\n${candidate.slug} (${candidate.baseModelId})`);

    for (const prompt of prompts) {
      if (done.has(prompt.id)) {
        skipped++;
        continue;
      }
      try {
        const v2 = await retrievalFor(prompt);
        // Identical wiring to the eval-run route: v2 system prompt, gold
        // exemplars as prior turns, composed user turn, v2 contextIds as the
        // audit trail.
        const gen = await generateForCandidate(candidate as CandidateLike, {
          userMessage: buildUserTurnV2(prompt.text, v2, prompt.bucket),
          goldExamples: v2.exampleTurns,
          systemPromptOverride: IGALA_SYSTEM_V2,
        });
        await prisma.modelOutput.create({
          data: {
            promptId: prompt.id,
            model: candidate.family,
            modelId: gen.modelId,
            candidateModelId: candidate.id,
            bucket: prompt.bucket,
            outputText: gen.text,
            ragContextIds: v2.contextIds,
            tokenCountIn: gen.tokensIn ?? null,
            tokenCountOut: gen.tokensOut ?? null,
            latencyMs: gen.latencyMs,
            isDemo: false,
          },
        });
        spendUsd += estimateGenerationCostUsd({
          modelId: gen.modelId,
          tokensIn: gen.tokensIn,
          tokensOut: gen.tokensOut,
        });
        tokensInTotal += gen.tokensIn ?? 0;
        tokensOutTotal += gen.tokensOut ?? 0;
        created++;
        consecutiveFailures = 0;
        console.log(
          `  ok  ${prompt.promptId.padEnd(22)} ${gen.text.replace(/\s+/g, " ").slice(0, 60)}`,
        );
      } catch (e) {
        failed++;
        consecutiveFailures++;
        console.log(
          `  ERR ${prompt.promptId}: ${(e as Error).message.slice(0, 110)}`,
        );
        // A dead key or wrong model id fails on every prompt; bail rather
        // than burning 43 identical errors (same policy as igala-rag-run.ts).
        if (consecutiveFailures >= 3 && created === 0) {
          console.log(
            `  -> abandoning ${candidate.slug} after 3 consecutive failures`,
          );
          break;
        }
      }
    }
    console.log(
      `  ${candidate.slug}: created=${created} existing=${skipped} failed=${failed}  running spend ~$${roundUsd(spendUsd).toFixed(2)}`,
    );
  }
}

// ─── 3. SCORE ───────────────────────────────────────────────────────────────

async function buildLangModel(): Promise<LanguageIdModel> {
  // Same corpora as igala-rag-run.ts metrics: consentBenchmark gold as the
  // Igala profile (consent enforced in the query, per Context.md), prompt
  // texts as the English profile.
  const goldRows = await prisma.coldAuthorAnswer.findMany({
    where: { isDemo: false, consentBenchmark: true },
    select: { answerText: true },
  });
  const allPrompts = await prisma.prompt.findMany({ select: { text: true } });
  return buildLanguageIdModel({
    igalaTexts: goldRows.map((g) => g.answerText),
    englishTexts: allPrompts.map((p) => p.text),
  });
}

function groupByCandidate(audit: LeakAuditData): Map<string, AuditedOutput[]> {
  const byCandidate = new Map<string, AuditedOutput[]>();
  for (const o of audit.outputs) {
    if (!o.candidateName) continue;
    byCandidate.set(o.candidateName, [
      ...(byCandidate.get(o.candidateName) ?? []),
      o,
    ]);
  }
  return byCandidate;
}

async function stepScore() {
  console.log(
    "\n═══ 3. SCORE (leak-audit core + language gate, no spend) ═══\n",
  );
  const audit = await loadLeakAudit(prisma);
  const allSlugs = audit.frozen.map((p) => p.promptId);
  console.log(
    `prompts whose OWN gold was in their served context: ${audit.leakedPrompts.size}/${allSlugs.length}; leak-free subset: ${audit.clean.length}\n`,
  );

  const langModel = await buildLangModel();
  const cleanSet = new Set(audit.clean);
  const byCandidate = groupByCandidate(audit);

  type ScoredRow = ReturnType<typeof buildRescoreRow> & { igala: string };
  const rows: ScoredRow[] = [];
  for (const [name, outs] of byCandidate) {
    const scored = scoreOutputs(outs, audit.slugOf, audit.goldByPrompt);
    if (scored.length === 0) continue;
    // Language gate on the RAW output, matching igala-rag-run.ts: packaging
    // counts against a model here, because a user receives the packaging too.
    const igalaN = outs.filter(
      (o) => identifyLanguage(langModel, o.outputText).isIgala,
    ).length;
    const share = wilsonInterval(igalaN, outs.length);
    rows.push({
      ...buildRescoreRow(name, scored, cleanSet),
      igala: `${share.mean.toFixed(2)} [${share.ciLow.toFixed(2)}-${share.ciHigh.toFixed(2)}]`,
    });
  }
  rows.sort((a, b) => b.strClean - a.strClean);

  console.log(
    "candidate".padEnd(38) +
      "n".padStart(4) +
      "rawAll".padStart(8) +
      "strAll".padStart(8) +
      "  |" +
      "rawLF".padStart(7) +
      "strLF".padStart(7) +
      "  95% CI (strLF)".padEnd(20) +
      "verb×".padStart(7) +
      "  IgalaID [95%]",
  );
  for (const r of rows) {
    console.log(
      r.name.slice(0, 37).padEnd(38) +
        String(r.n).padStart(4) +
        fmt(r.rawAll).padStart(8) +
        fmt(r.strAll).padStart(8) +
        "  |" +
        fmt(r.rawClean).padStart(7) +
        fmt(r.strClean).padStart(7) +
        `  ${r.ci}`.padEnd(20) +
        (fmt(r.verbMedian) + (r.nonCompliant ? " !" : "  ")).padStart(7) +
        `  ${r.igala}`,
    );
  }
  console.log(
    `\nrawAll/strAll = all ${allSlugs.length} frozen; rawLF/strLF = the ${audit.clean.length} leak-free. str = packaging stripped.`,
  );
  console.log(
    "verb× = median length / shortest gold (! = >1.5). IgalaID = share of outputs the language gate calls Igala.",
  );
}

// ─── 4. QUALITATIVE ─────────────────────────────────────────────────────────

async function stepQualitative() {
  console.log(
    "\n═══ 4. QUALITATIVE (3 free-form prompts, for Agnes - unscored, unstored) ═══",
  );
  const candidates = await v2Candidates();
  const v1BySlug = new Map(
    (
      await prisma.candidateModel.findMany({
        where: { slug: { in: PAIRS.map((p) => p.v1Slug) } },
      })
    ).map((c) => [c.slug, c]),
  );

  for (const q of QUAL_PROMPTS) {
    console.log(`\n────── ${q.text} ──────`);
    // Free-form means no Prompt row: synthetic id, holdout-strict guarding,
    // exactly how the chat route serves rag-v2 candidates.
    const v2 = await buildRetrievalV2(prisma, {
      promptId: "__chat__",
      text: q.text,
      bucket: null,
      isHoldout: true,
    });

    for (const candidate of candidates) {
      try {
        const gen = await generateForCandidate(candidate as CandidateLike, {
          userMessage: buildUserTurnV2(q.text, v2, null),
          goldExamples: v2.exampleTurns,
          systemPromptOverride: IGALA_SYSTEM_V2,
        });
        spendUsd += estimateGenerationCostUsd({
          modelId: gen.modelId,
          tokensIn: gen.tokensIn,
          tokensOut: gen.tokensOut,
        });
        tokensInTotal += gen.tokensIn ?? 0;
        tokensOutTotal += gen.tokensOut ?? 0;
        console.log(`\n[v2 ${candidate.slug}]\n${gen.text.trim()}`);
      } catch (e) {
        console.log(
          `\n[v2 ${candidate.slug}] ERROR: ${(e as Error).message.slice(0, 120)}`,
        );
      }
    }

    // The v1 side: these prompts are deliberately outside every bank, so the
    // closest we can honestly print is a stored v1 output for a SIMILAR
    // benchmark prompt, labeled as such. No new v1 generation - v1 is the
    // frozen baseline, and generating fresh v1 answers would unfreeze it.
    // Restricted to prompts that actually HAVE a stored v1 output: a keyword
    // can also match dev-split bank prompts nothing ever generated for, and a
    // silent skip there looked like "no similar prompt exists" when the truth
    // was "similar prompt, nothing stored".
    const similar = await prisma.prompt.findMany({
      where: {
        language: "igala",
        OR: q.v1SearchTerms.map((t) => ({
          text: { contains: t, mode: "insensitive" as const },
        })),
        modelOutputs: {
          some: {
            isDemo: false,
            candidateModelId: {
              in: [...v1BySlug.values()].map((c) => c.id),
            },
          },
        },
      },
      select: { id: true, promptId: true, text: true },
      take: 3,
    });
    if (similar.length === 0) {
      console.log(
        "\n[v1] no similar prompt with a stored v1 output - nothing to compare",
      );
      continue;
    }
    for (const s of similar) {
      const v1Outs = await prisma.modelOutput.findMany({
        where: {
          promptId: s.id,
          isDemo: false,
          candidateModelId: {
            in: [...v1BySlug.values()].map((c) => c.id),
          },
        },
        select: {
          outputText: true,
          candidateModel: { select: { slug: true } },
        },
      });
      if (v1Outs.length === 0) continue;
      console.log(
        `\n[v1, similar benchmark prompt ${s.promptId}: "${s.text.slice(0, 90)}"]`,
      );
      for (const o of v1Outs) {
        console.log(
          `  (${o.candidateModel?.slug}) ${o.outputText.replace(/\s+/g, " ").slice(0, 220)}`,
        );
      }
    }
  }
}

// ─── 5. VERDICT ─────────────────────────────────────────────────────────────

async function stepVerdict() {
  console.log(
    "\n═══ 5. VERDICT (paired bootstrap on the leak-free subset) ═══\n",
  );
  const audit = await loadLeakAudit(prisma);
  const cleanSet = new Set(audit.clean);
  const langModel = await buildLangModel();

  const nameOf = new Map(
    (
      await prisma.candidateModel.findMany({
        where: {
          slug: { in: PAIRS.flatMap((p) => [p.v1Slug, p.v2Slug]) },
        },
        select: { slug: true, name: true },
      })
    ).map((c) => [c.slug, c.name]),
  );
  const byCandidate = groupByCandidate(audit);

  for (const { v1Slug, v2Slug } of PAIRS) {
    const v1Name = nameOf.get(v1Slug);
    const v2Name = nameOf.get(v2Slug);
    const v1Outs = v1Name ? (byCandidate.get(v1Name) ?? []) : [];
    const v2Outs = v2Name ? (byCandidate.get(v2Name) ?? []) : [];
    if (v1Outs.length === 0 || v2Outs.length === 0) {
      console.log(
        `${v2Slug} vs ${v1Slug}: missing outputs (${v2Outs.length} v2, ${v1Outs.length} v1) - no verdict\n`,
      );
      continue;
    }

    // Align per-prompt STRIPPED chrF on leak-free prompts both systems
    // answered. Pairing removes prompt difficulty, the dominant variance
    // component at n this small (see stats.ts).
    const v1Str = new Map(
      scoreOutputs(v1Outs, audit.slugOf, audit.goldByPrompt).map((s) => [
        s.slug,
        s.str,
      ]),
    );
    const v2Str = new Map(
      scoreOutputs(v2Outs, audit.slugOf, audit.goldByPrompt).map((s) => [
        s.slug,
        s.str,
      ]),
    );
    const slugs = [...cleanSet]
      .filter((s) => v1Str.has(s) && v2Str.has(s))
      .sort();
    const delta = pairedBootstrapDelta(
      slugs.map((s) => v2Str.get(s)!),
      slugs.map((s) => v1Str.get(s)!),
    );

    const gate = (outs: AuditedOutput[]) => {
      const igalaN = outs.filter(
        (o) => identifyLanguage(langModel, o.outputText).isIgala,
      ).length;
      return wilsonInterval(igalaN, outs.length);
    };
    const g1 = gate(v1Outs);
    const g2 = gate(v2Outs);
    // Two Wilson intervals that do not overlap are a real move; overlapping
    // intervals at n=43 are reported as "not established", not as a trend.
    const gateMoved = g2.ciLow > g1.ciHigh || g2.ciHigh < g1.ciLow;

    const verdict = delta.distinguishable
      ? delta.mean > 0
        ? "v2 BEATS v1"
        : "v2 WORSE than v1"
      : "NOT DISTINGUISHABLE at this n";
    console.log(`${v2Name}  vs  ${v1Name}`);
    console.log(
      `  strLF paired delta (v2-v1): ${delta.mean >= 0 ? "+" : ""}${delta.mean.toFixed(1)} [${delta.ciLow.toFixed(1)}, ${delta.ciHigh.toFixed(1)}]  n=${slugs.length}  -> ${verdict}`,
    );
    console.log(
      `  language gate (Igala share): v1 ${g1.mean.toFixed(2)} [${g1.ciLow.toFixed(2)}-${g1.ciHigh.toFixed(2)}]  v2 ${g2.mean.toFixed(2)} [${g2.ciLow.toFixed(2)}-${g2.ciHigh.toFixed(2)}]  -> ${gateMoved ? "MOVED (intervals disjoint)" : "no established move (intervals overlap)"}\n`,
    );
  }
}

// ─── entrypoint ─────────────────────────────────────────────────────────────

async function main() {
  const step = process.argv[2] ?? "all";
  const steps: Record<string, () => Promise<void>> = {
    audit: stepAudit,
    generate: stepGenerate,
    score: stepScore,
    qualitative: stepQualitative,
    verdict: stepVerdict,
  };
  if (step === "all") {
    await stepAudit();
    await stepGenerate();
    await stepScore();
    await stepQualitative();
    await stepVerdict();
  } else if (steps[step]) {
    await steps[step]();
  } else {
    throw new Error(
      `unknown step "${step}" - use audit|generate|score|qualitative|verdict|all`,
    );
  }
  console.log(
    `\nAPI usage this run: ${tokensInTotal} tokens in, ${tokensOutTotal} tokens out, estimated spend ~$${roundUsd(spendUsd).toFixed(2)}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
