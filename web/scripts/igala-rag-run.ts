/**
 * Operational runner for the Igala RETRIEVAL arm.
 *
 * The project fine-tuned before it tested retrieval. This script closes that
 * gap: it registers the retrieval candidates, generates every candidate's
 * answers on the frozen 43-prompt bank, and measures them side by side against
 * the plain baselines and the fine-tune.
 *
 * Like scripts/openai-sft-run.ts, every step calls the same library code the
 * API routes call - retrieveGoldExamples() for retrieval, searchRag() for
 * curated knowledge, generateForCandidate() for generation, purityMetrics() and
 * the src/lib/eval harness for scoring - so a run driven from here is
 * indistinguishable from one driven through the UI.
 *
 * WHAT "+ Igala RAG" MEANS HERE. Two retrieval sources, both injected:
 *   1. K=8 community gold (question, answer) pairs from ColdAuthorAnswer,
 *      prepended as prior chat turns. This is the primary signal: it teaches
 *      the FORM of a native answer. Contamination guard in gold-retrieval.ts.
 *   2. Up to 4 curated RagEntry chunks (dialect / lexicon / history notes) in
 *      the system prompt, via the existing searchRag() path. Facts, not form.
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/igala-rag-run.ts <step>
 * Steps:
 *   preflight  verify every provider key and model id with a 1-token call
 *   register   create/activate the candidate registrations (no spend)
 *   plan       show retrieval composition and a cost estimate (no spend)
 *   generate   generate missing frozen-bank outputs (SPENDS MONEY)
 *   metrics    purity table + chrF/language-ID eval harness comparison
 *   samples    side-by-side community gold / plain / RAG / fine-tune
 *   arena      outputs per frozen prompt and resulting pair diversity
 */

import { prisma } from "@/lib/prisma";
import {
  generateForCandidate,
  type CandidateLike,
  type GoldExample,
  type RagChunk,
} from "@/lib/arena/providers";
import {
  retrieveGoldExamples,
  type GoldPoolEntry,
} from "@/lib/arena/gold-retrieval";
import { searchRag } from "@/lib/rag";
import { purityMetrics } from "@/lib/arena/purity";
import { estimateGenerationCostUsd, roundUsd } from "@/lib/arena/pricing";
import { assignedPair } from "@/lib/pairing";
import { runEval } from "@/lib/eval/runner";
import { buildLanguageIdModel } from "@/lib/eval/langid";
import type { CandidateKind } from "@prisma/client";

/** Community gold exemplars per generation. */
const GOLD_K = 8;
/** Curated RagEntry chunks per generation. */
const RAG_K = 4;

const TOGETHER_BASE_URL = "https://api.together.xyz/v1";

/**
 * Every candidate in the comparison. `generate: false` means outputs already
 * exist and must not be re-spent (the fine-tune, and the two GPT baselines that
 * already carry 750+ human annotations against them).
 */
interface Target {
  slug: string;
  name: string;
  family: string;
  provider: string;
  baseModelId: string;
  kind: CandidateKind;
  ragEnabled: boolean;
  apiEndpoint?: string;
  color: string;
  versionLabel?: string;
  decodingParams?: { temperature: number; maxTokens: number };
  generate: boolean;
  /** Grouping for the report: which base model family/size this belongs to. */
  group: string;
}

const TARGETS: Target[] = [
  // ─── closed frontier, plain ───────────────────────────────────────────────
  {
    slug: "gpt-4o-baseline",
    name: "GPT-4.1",
    family: "gpt",
    provider: "openai",
    baseModelId: "gpt-4.1",
    kind: "baseline",
    ragEnabled: false,
    color: "#4f7a5e",
    generate: false, // 43 outputs already exist, with 754 annotations on them
    group: "gpt-4.1",
  },
  {
    slug: "gpt-4o-mini-baseline",
    name: "GPT-4.1 mini",
    family: "gpt",
    provider: "openai",
    baseModelId: "gpt-4.1-mini",
    kind: "baseline",
    ragEnabled: false,
    color: "#6f9a7e",
    generate: false, // 43 already; this is the fine-tune's own base model
    group: "gpt-4.1-mini",
  },
  {
    slug: "claude-sonnet-4-5-baseline",
    name: "Claude Opus 4.8",
    family: "claude",
    provider: "anthropic",
    baseModelId: "claude-opus-4-8",
    kind: "baseline",
    ragEnabled: false,
    color: "#b5512f",
    generate: true,
    group: "claude-opus-4.8",
  },
  {
    slug: "gemini-2-0-flash-baseline",
    name: "Gemini 2.5 Flash",
    family: "gemini",
    provider: "google",
    baseModelId: "gemini-2.5-flash",
    kind: "baseline",
    ragEnabled: false,
    color: "#3f5a8a",
    // Gemini 2.5 is a thinking model and bills thoughts against the output
    // budget - a trivial prompt burned 536 thought tokens in testing. At the
    // 1024 default the answer itself can be truncated to nothing, so the cap is
    // raised. Temperature is pinned to the platform default so raising the cap
    // is the ONLY difference from every other candidate here.
    decodingParams: { temperature: 0.7, maxTokens: 2048 },
    generate: true, // only 2 of 43 exist
    group: "gemini-2.5-flash",
  },
  {
    slug: "gemini-2-5-pro-baseline",
    name: "Gemini 2.5 Pro",
    family: "gemini",
    provider: "google",
    baseModelId: "gemini-2.5-pro",
    kind: "baseline",
    ragEnabled: false,
    color: "#22407a",
    decodingParams: { temperature: 0.7, maxTokens: 4096 },
    generate: true,
    group: "gemini-2.5-pro",
  },
  {
    slug: "gemini-2-5-pro-rag",
    name: "Gemini 2.5 Pro + Igala RAG",
    family: "gemini",
    provider: "google",
    baseModelId: "gemini-2.5-pro",
    kind: "rag",
    ragEnabled: true,
    color: "#5b7fc7",
    versionLabel: "rag",
    decodingParams: { temperature: 0.7, maxTokens: 4096 },
    generate: true,
    group: "gemini-2.5-pro",
  },
  // ─── closed frontier, + retrieval ─────────────────────────────────────────
  {
    slug: "gpt-4-1-rag",
    name: "GPT-4.1 + Igala RAG",
    family: "gpt",
    provider: "openai",
    baseModelId: "gpt-4.1",
    kind: "rag",
    ragEnabled: true,
    color: "#7fb08e",
    versionLabel: "rag",
    generate: true,
    group: "gpt-4.1",
  },
  {
    slug: "claude-sonnet-4-5-rag",
    name: "Claude Opus 4.8 + Igala RAG",
    family: "claude",
    provider: "anthropic",
    baseModelId: "claude-opus-4-8",
    kind: "rag",
    ragEnabled: true,
    color: "#e0a21f",
    versionLabel: "rag",
    generate: true,
    group: "claude-opus-4.8",
  },
  {
    slug: "gemini-2-0-flash-rag",
    name: "Gemini 2.5 Flash + Igala RAG",
    family: "gemini",
    provider: "google",
    baseModelId: "gemini-2.5-flash",
    kind: "rag",
    ragEnabled: true,
    color: "#9c6a13",
    versionLabel: "rag",
    decodingParams: { temperature: 0.7, maxTokens: 2048 },
    generate: true,
    group: "gemini-2.5-flash",
  },
  // ─── open weights, served serverlessly by Together ────────────────────────
  {
    slug: "llama-3-3-70b-baseline",
    name: "Llama 3.3 70B Instruct",
    family: "llama",
    provider: "openai-compatible",
    baseModelId: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    kind: "baseline",
    ragEnabled: false,
    apiEndpoint: TOGETHER_BASE_URL,
    color: "#6a4fa3",
    generate: true,
    group: "llama-3.3-70b",
  },
  {
    slug: "llama-3-3-70b-rag",
    name: "Llama 3.3 70B + Igala RAG",
    family: "llama",
    provider: "openai-compatible",
    baseModelId: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    kind: "rag",
    ragEnabled: true,
    apiEndpoint: TOGETHER_BASE_URL,
    color: "#9b7fd4",
    versionLabel: "rag",
    generate: true,
    group: "llama-3.3-70b",
  },
  {
    slug: "gemma-4-31b-baseline",
    name: "Gemma 4 31B IT",
    family: "gemma",
    provider: "openai-compatible",
    baseModelId: "google/gemma-4-31B-it",
    kind: "baseline",
    ragEnabled: false,
    apiEndpoint: TOGETHER_BASE_URL,
    color: "#2f7f7f",
    // Together serves gemma-4-31B-it as a REASONING model: it emits a hidden
    // reasoning trace that is billed against the same completion budget. At
    // 1024 the trace consumed the entire budget and 16 of 43 answers came back
    // as empty strings. Raised so the answer itself has room after the trace.
    decodingParams: { temperature: 0.7, maxTokens: 4096 },
    generate: true,
    group: "gemma-4-31b",
  },
  {
    slug: "gemma-4-31b-rag",
    name: "Gemma 4 31B IT + Igala RAG",
    family: "gemma",
    provider: "openai-compatible",
    baseModelId: "google/gemma-4-31B-it",
    kind: "rag",
    ragEnabled: true,
    apiEndpoint: TOGETHER_BASE_URL,
    color: "#5fb0b0",
    versionLabel: "rag",
    decodingParams: { temperature: 0.7, maxTokens: 4096 },
    generate: true,
    group: "gemma-4-31b",
  },
  // ─── the fine-tune, for the three-way comparison ──────────────────────────
  {
    slug: "gpt-4-1-mini-sft-igala-cold-gold-cmsjnjcp",
    name: "GPT-4.1 mini SFT (Igala cold-gold)",
    family: "gpt",
    provider: "openai",
    baseModelId: "ft:gpt-4.1-mini-2025-04-14:personal:igala-sft:EAQGfuUV",
    kind: "sft",
    ragEnabled: false,
    color: "#c2185b",
    generate: false, // already generated; never re-spend on it
    group: "gpt-4.1-mini",
  },
];

function log(...args: unknown[]) {
  console.log(...args);
}

function keyForProvider(provider: string): string | undefined {
  switch (provider) {
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "google":
      return process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    case "openai-compatible":
      return (
        process.env.OPENAI_COMPATIBLE_API_KEY ?? process.env.TOGETHER_API_KEY
      );
    default:
      return undefined;
  }
}

// ─── the frozen bank and the retrieval pool ─────────────────────────────────

async function frozenPrompts() {
  return prisma.prompt.findMany({
    where: { language: "igala", OR: [{ isHoldout: true }, { split: "test" }] },
    select: { id: true, promptId: true, text: true, bucket: true },
    orderBy: { promptId: "asc" },
  });
}

async function goldPool(): Promise<GoldPoolEntry[]> {
  const rows = await prisma.coldAuthorAnswer.findMany({
    include: {
      prompt: {
        select: {
          promptId: true,
          text: true,
          isHoldout: true,
          bucket: true,
          split: true,
        },
      },
    },
  });
  return rows.map((c) => ({
    id: c.id,
    promptId: c.promptId,
    promptRef: c.prompt.promptId,
    promptText: c.prompt.text,
    answerText: c.answerText,
    bucket: (c.bucket ?? c.prompt.bucket) as string | null,
    // Belt and braces: either signal marks a prompt as frozen.
    isHoldout: c.prompt.isHoldout || c.prompt.split === "test",
    isDemo: c.isDemo,
    consentTraining: c.consentTraining,
    verificationStatus: c.verificationStatus,
  }));
}

/** Build the retrieval payload for one frozen prompt. */
async function retrievalFor(
  prompt: { id: string; text: string; bucket: string | null },
  pool: GoldPoolEntry[],
): Promise<{ goldExamples: GoldExample[]; ragContext: RagChunk[] }> {
  const retrieved = retrieveGoldExamples(
    {
      promptId: prompt.id,
      text: prompt.text,
      bucket: prompt.bucket,
      // Everything this script generates for is a frozen benchmark prompt, so
      // the guard is always on at its strictest.
      isHoldout: true,
    },
    pool,
    { k: GOLD_K },
  );

  // Hard assertion, not a comment: refuse to spend a cent on a contaminated
  // prompt. A silent leak here would invalidate the whole experiment.
  for (const ex of retrieved.examples) {
    if (ex.promptId === prompt.id) {
      throw new Error(
        `CONTAMINATION: retrieval returned the prompt's own gold (${ex.id})`,
      );
    }
  }

  let ragContext: RagChunk[] = [];
  try {
    const entries = await searchRag(prompt.text, "igala", RAG_K);
    ragContext = entries.map((e) => ({
      id: e.id,
      content: e.content,
      topic: e.topic,
      chunkType: e.chunkType,
    }));
  } catch (e) {
    log(`  (searchRag unavailable: ${(e as Error).message})`);
  }

  return {
    goldExamples: retrieved.examples.map((e) => ({
      id: e.id,
      question: e.question,
      answer: e.answer,
    })),
    ragContext,
  };
}

// ─── steps ──────────────────────────────────────────────────────────────────

async function preflight() {
  const seen = new Set<string>();
  const results: { model: string; provider: string; status: string }[] = [];

  for (const t of TARGETS) {
    const probeKey = `${t.provider}:${t.baseModelId}`;
    if (seen.has(probeKey)) continue;
    seen.add(probeKey);

    if (!keyForProvider(t.provider)) {
      results.push({
        model: t.baseModelId,
        provider: t.provider,
        status: "NO KEY",
      });
      continue;
    }
    const candidate: CandidateLike = {
      provider: t.provider,
      baseModelId: t.baseModelId,
      apiEndpoint: t.apiEndpoint,
      decodingParams: { temperature: 0, maxTokens: 32 },
    };
    try {
      const r = await generateForCandidate(candidate, { userMessage: "hi" });
      results.push({
        model: t.baseModelId,
        provider: t.provider,
        status: `OK (${r.latencyMs}ms, ${r.text.replace(/\s+/g, " ").slice(0, 24)})`,
      });
    } catch (e) {
      results.push({
        model: t.baseModelId,
        provider: t.provider,
        status: `DEAD: ${(e as Error).message.slice(0, 90)}`,
      });
    }
  }

  log("\nPROVIDER PREFLIGHT");
  for (const r of results) {
    log(`  ${r.provider.padEnd(19)} ${r.model.padEnd(46)} ${r.status}`);
  }
  const dead = results.filter((r) => !r.status.startsWith("OK"));
  log(
    `\n${results.length - dead.length}/${results.length} model ids reachable`,
  );
  if (dead.length > 0) {
    log("Unreachable (these candidates will be SKIPPED, not failed):");
    for (const d of dead) log(`  - ${d.model}: ${d.status}`);
  }
}

async function register() {
  for (const t of TARGETS) {
    const data = {
      name: t.name,
      family: t.family,
      provider: t.provider,
      baseModelId: t.baseModelId,
      kind: t.kind,
      ragEnabled: t.ragEnabled,
      apiEndpoint: t.apiEndpoint ?? null,
      color: t.color,
      versionLabel: t.versionLabel ?? null,
      decodingParams: t.decodingParams ?? undefined,
      language: "igala",
      // Every candidate in the comparison must be servable by the arena.
      archived: false,
    };
    const existing = await prisma.candidateModel.findUnique({
      where: { slug: t.slug },
      select: { id: true },
    });
    await prisma.candidateModel.upsert({
      where: { slug: t.slug },
      update: data,
      create: { ...data, slug: t.slug, isPublic: true },
    });
    log(
      `  ${existing ? "updated" : "CREATED"}  ${t.slug.padEnd(42)} ${t.name}`,
    );
  }
  log(`\n${TARGETS.length} candidates registered, all non-archived.`);
}

async function plan() {
  const prompts = await frozenPrompts();
  const pool = await goldPool();
  log(`frozen prompts: ${prompts.length}   gold pool: ${pool.length}`);

  let totalGold = 0;
  let sameBucket = 0;
  let excludedSelf = 0;
  let excludedHoldout = 0;
  for (const p of prompts) {
    const r = retrieveGoldExamples(
      { promptId: p.id, text: p.text, bucket: p.bucket, isHoldout: true },
      pool,
      { k: GOLD_K },
    );
    totalGold += r.examples.length;
    sameBucket += r.examples.filter((e) => e.sameBucket).length;
    excludedSelf += r.excluded.selfPrompt;
    excludedHoldout += r.excluded.holdoutSource;
  }
  log(`\nRETRIEVAL over the frozen bank (K=${GOLD_K})`);
  log(
    `  exemplars retrieved      ${totalGold} (${(totalGold / prompts.length).toFixed(2)}/prompt)`,
  );
  log(
    `  same-bucket share        ${((sameBucket / totalGold) * 100).toFixed(1)}%`,
  );
  log(`  BLOCKED own-prompt gold  ${excludedSelf}`);
  log(`  BLOCKED held-out gold    ${excludedHoldout}`);

  const toGenerate = TARGETS.filter((t) => t.generate);
  log(`\nCANDIDATES TO GENERATE: ${toGenerate.length}`);
  let est = 0;
  for (const t of toGenerate) {
    const tin = t.ragEnabled ? 1400 : 320;
    const tout = 280;
    const per = estimateGenerationCostUsd({
      modelId: t.baseModelId,
      tokensIn: tin,
      tokensOut: tout,
    });
    est += per * prompts.length;
    log(
      `  ${t.slug.padEnd(30)} ~$${roundUsd(per * prompts.length).toFixed(2)}`,
    );
  }
  log(`\nEstimated total: ~$${roundUsd(est).toFixed(2)}`);
}

async function generate() {
  const prompts = await frozenPrompts();
  const pool = await goldPool();
  const targets = TARGETS.filter((t) => t.generate);

  // Cache retrieval per prompt: it is identical for every RAG candidate, and
  // searchRag costs an embedding call each time.
  const retrievalCache = new Map<
    string,
    { goldExamples: GoldExample[]; ragContext: RagChunk[] }
  >();

  let grandCost = 0;
  const summary: string[] = [];

  for (const t of targets) {
    const candidate = await prisma.candidateModel.findUnique({
      where: { slug: t.slug },
    });
    if (!candidate) {
      summary.push(`${t.slug}: NOT REGISTERED, skipped`);
      continue;
    }
    if (!keyForProvider(t.provider)) {
      summary.push(`${t.slug}: NO API KEY for ${t.provider}, skipped`);
      log(`\n== ${t.name}: SKIPPED (no ${t.provider} key)`);
      continue;
    }

    log(`\n== ${t.name} (${t.baseModelId})${t.ragEnabled ? " +RAG" : ""}`);

    // One cheap probe before committing to 43 calls. A dead key or a model id
    // the provider will not serve should cost one failed request and a clear
    // line in the report, not 43 identical errors.
    try {
      await generateForCandidate(
        {
          provider: t.provider,
          baseModelId: t.baseModelId,
          apiEndpoint: t.apiEndpoint,
          decodingParams: { temperature: 0, maxTokens: 32 },
        },
        { userMessage: "hi" },
      );
    } catch (e) {
      const msg = (e as Error).message.slice(0, 120);
      summary.push(
        `${t.slug.padEnd(42)} SKIPPED - provider unreachable: ${msg}`,
      );
      log(`  SKIPPED - probe failed: ${msg}`);
      continue;
    }
    let created = 0;
    let skipped = 0;
    let failed = 0;
    let cost = 0;
    let consecutiveFailures = 0;

    for (const prompt of prompts) {
      const already = await prisma.modelOutput.findFirst({
        where: { promptId: prompt.id, candidateModelId: candidate.id },
        select: { id: true },
      });
      if (already) {
        skipped++;
        continue;
      }

      try {
        let retrieval: { goldExamples: GoldExample[]; ragContext: RagChunk[] } =
          { goldExamples: [], ragContext: [] };
        if (t.ragEnabled) {
          if (!retrievalCache.has(prompt.id)) {
            retrievalCache.set(prompt.id, await retrievalFor(prompt, pool));
          }
          retrieval = retrievalCache.get(prompt.id)!;
        }

        const gen = await generateForCandidate(candidate as CandidateLike, {
          userMessage: prompt.text,
          goldExamples: retrieval.goldExamples,
          ragContext: retrieval.ragContext,
        });

        await prisma.modelOutput.create({
          data: {
            promptId: prompt.id,
            model: candidate.family,
            modelId: gen.modelId,
            candidateModelId: candidate.id,
            bucket: prompt.bucket,
            outputText: gen.text,
            ragContextIds: gen.ragContextIds,
            tokenCountIn: gen.tokensIn ?? null,
            tokenCountOut: gen.tokensOut ?? null,
            latencyMs: gen.latencyMs,
          },
        });
        cost += estimateGenerationCostUsd({
          modelId: gen.modelId,
          tokensIn: gen.tokensIn,
          tokensOut: gen.tokensOut,
        });
        created++;
        consecutiveFailures = 0;
        log(
          `  ok  ${prompt.promptId.padEnd(20)} ${gen.text.replace(/\s+/g, " ").slice(0, 62)}`,
        );
      } catch (e) {
        failed++;
        consecutiveFailures++;
        log(`  ERR ${prompt.promptId}: ${(e as Error).message.slice(0, 110)}`);
        // A dead key or a wrong model id fails on every prompt. Bail out of
        // this candidate rather than burning 43 identical errors.
        if (consecutiveFailures >= 3 && created === 0) {
          log(`  -> abandoning ${t.slug} after 3 consecutive failures`);
          break;
        }
      }
    }

    grandCost += cost;
    summary.push(
      `${t.slug.padEnd(42)} created=${String(created).padStart(2)} existing=${String(skipped).padStart(2)} failed=${String(failed).padStart(2)}  ~$${roundUsd(cost).toFixed(2)}`,
    );
  }

  log("\n\nGENERATION SUMMARY");
  for (const s of summary) log(`  ${s}`);
  log(`\nEstimated spend this run: ~$${roundUsd(grandCost).toFixed(2)}`);
}

/** Frozen-bank outputs for every candidate in TARGETS, grouped. */
async function loadFrozenOutputs() {
  const prompts = await frozenPrompts();
  const promptIds = prompts.map((p) => p.id);
  const candidates = await prisma.candidateModel.findMany({
    where: { slug: { in: TARGETS.map((t) => t.slug) } },
  });
  const bySlug = new Map(candidates.map((c) => [c.slug, c]));
  const outputs = await prisma.modelOutput.findMany({
    where: {
      promptId: { in: promptIds },
      candidateModelId: { in: candidates.map((c) => c.id) },
    },
    select: {
      candidateModelId: true,
      promptId: true,
      outputText: true,
      tokenCountIn: true,
      tokenCountOut: true,
      modelId: true,
    },
  });
  return { prompts, candidates, bySlug, outputs };
}

async function metrics() {
  const { prompts, bySlug, outputs } = await loadFrozenOutputs();
  const promptRefById = new Map(prompts.map((p) => [p.id, p.promptId]));

  const byCandidate = new Map<string, typeof outputs>();
  for (const o of outputs) {
    const key = o.candidateModelId!;
    if (!byCandidate.has(key)) byCandidate.set(key, []);
    byCandidate.get(key)!.push(o);
  }

  log("\nPURITY ON THE FROZEN 43 (src/lib/arena/purity.ts)");
  log(
    `${"candidate".padEnd(36)} ${"kind".padEnd(9)} ${"n".padStart(3)} ${"engFn".padStart(6)} ${"tone".padStart(6)} ${"words".padStart(7)} ${"chars".padStart(7)}`,
  );
  log("-".repeat(84));
  for (const t of TARGETS) {
    const c = bySlug.get(t.slug);
    if (!c) continue;
    const outs = byCandidate.get(c.id) ?? [];
    const m = purityMetrics(outs.map((o) => o.outputText));
    const kind = t.ragEnabled
      ? "RAG"
      : t.kind === "sft"
        ? "fine-tune"
        : "plain";
    log(
      `${t.name.padEnd(36)} ${kind.padEnd(9)} ${String(m.n).padStart(3)} ${m.englishFnWordShare.toFixed(3).padStart(6)} ${m.toneShare.toFixed(3).padStart(6)} ${m.meanWords.toFixed(1).padStart(7)} ${m.meanChars.toFixed(0).padStart(7)}`,
    );
  }
  log(
    "\nengFn = share of outputs opening with an English function word (LOWER better)",
  );
  log(
    "tone  = share carrying any Igala tone mark or dotted vowel (HIGHER better)",
  );

  // ─── the reference-based harness (chrF + language ID) ─────────────────────
  // consentBenchmark is enforced HERE, in the query, not downstream. This gold
  // feeds two benchmark uses below - the chrF references and the Igala language
  // profile - and an answer whose author declined benchmark use must reach
  // neither. Filtering in the query is the rule from Context.md rather than a
  // preference: a later `.map` or `.filter` is one refactor away from being
  // dropped, and the failure is silent.
  const goldRows = await prisma.coldAuthorAnswer.findMany({
    where: { isDemo: false, consentBenchmark: true },
    select: { promptId: true, answerText: true },
  });
  // Count what consent removed, so the exclusion is auditable rather than
  // invisible. A permission nobody can see working looks identical to one that
  // is not enforced at all.
  const goldExcludedForConsent = await prisma.coldAuthorAnswer.count({
    where: { isDemo: false, consentBenchmark: false },
  });
  log(
    `\ngold references: ${goldRows.length} answers ` +
      `(${goldExcludedForConsent} excluded - author declined benchmark use)`,
  );
  const goldByPrompt = new Map<string, string[]>();
  for (const g of goldRows) {
    if (!goldByPrompt.has(g.promptId)) goldByPrompt.set(g.promptId, []);
    goldByPrompt.get(g.promptId)!.push(g.answerText);
  }

  const allPrompts = await prisma.prompt.findMany({
    select: { id: true, text: true },
  });
  const langModel = buildLanguageIdModel({
    igalaTexts: goldRows.map((g) => g.answerText),
    englishTexts: allPrompts.map((p) => p.text),
  });

  const report = runEval({
    prompts: prompts.map((p) => ({
      promptId: p.promptId,
      bucket: p.bucket,
      text: p.text,
      golds: goldByPrompt.get(p.id) ?? [],
    })),
    outputs: outputs.flatMap((o) => {
      const t = TARGETS.find(
        (x) => bySlug.get(x.slug)?.id === o.candidateModelId,
      );
      if (!t) return [];
      return [
        {
          candidateId: t.slug,
          candidateName: t.name,
          promptId: promptRefById.get(o.promptId)!,
          text: o.outputText,
        },
      ];
    }),
    langModel,
  });

  log("\n\nREFERENCE METRICS vs COMMUNITY GOLD (src/lib/eval)");
  log(
    `${"candidate".padEnd(36)} ${"kind".padEnd(9)} ${"n".padStart(3)} ${"chrF".padStart(16)} ${"IgalaID".padStart(16)}`,
  );
  log("-".repeat(88));
  const ranked = [...report.candidates];
  for (const cr of ranked) {
    const t = TARGETS.find((x) => x.slug === cr.candidateId)!;
    const chrf = cr.overall.find((c) => c.metric === "chrf")!.best;
    const kind = t.ragEnabled
      ? "RAG"
      : t.kind === "sft"
        ? "fine-tune"
        : "plain";
    log(
      `${cr.candidateName.padEnd(36)} ${kind.padEnd(9)} ${String(cr.n).padStart(3)} ${chrf.mean.toFixed(3)} [${chrf.ciLow.toFixed(3)},${chrf.ciHigh.toFixed(3)}] ${cr.language.igalaShare.mean.toFixed(3)} [${cr.language.igalaShare.ciLow.toFixed(2)},${cr.language.igalaShare.ciHigh.toFixed(2)}]`,
    );
  }
  const ceilChrf = report.ceiling.overall.find(
    (c) => c.metric === "chrf",
  )!.best;
  log("-".repeat(88));
  log(
    `${"INTER-GOLD CEILING (human vs human)".padEnd(36)} ${"".padEnd(9)} ${String(report.ceiling.nPromptsWithCeiling).padStart(3)} ${ceilChrf.mean.toFixed(3)} [${ceilChrf.ciLow.toFixed(3)},${ceilChrf.ciHigh.toFixed(3)}]`,
  );

  // ─── paired plain-vs-RAG deltas within each base model ────────────────────
  log("\n\nPAIRED PLAIN -> RAG DELTAS (same base model, one variable changed)");
  const byGroup = new Map<string, Target[]>();
  for (const t of TARGETS) {
    if (!byGroup.has(t.group)) byGroup.set(t.group, []);
    byGroup.get(t.group)!.push(t);
  }
  for (const [group, members] of byGroup) {
    const plain = members.find((m) => !m.ragEnabled && m.kind === "baseline");
    const rag = members.find((m) => m.ragEnabled);
    if (!plain || !rag) continue;
    const h2h = report.headToHead.find(
      (h) => h.candidateA === rag.slug && h.candidateB === plain.slug,
    );
    if (!h2h) continue;
    const cell = h2h.cells.find((c) => c.metric === "chrf")!;
    const verdict = cell.delta.distinguishable
      ? cell.delta.mean > 0
        ? "RAG BETTER"
        : "RAG WORSE"
      : "not distinguishable";
    log(
      `  ${group.padEnd(18)} n=${String(h2h.nPaired).padStart(2)}  chrF delta ${cell.delta.mean >= 0 ? "+" : ""}${cell.delta.mean.toFixed(3)} [${cell.delta.ciLow.toFixed(3)},${cell.delta.ciHigh.toFixed(3)}]  ${verdict}`,
    );
  }

  // ─── the headline question: retrieval vs fine-tuning ──────────────────────
  // Soudani et al. 2024 (arXiv:2403.01432) report RAG beating SFT on rare
  // knowledge. This is that comparison on Igala, on the frozen bank.
  log("\n\nRETRIEVAL vs FINE-TUNING (paired, on the frozen 43)");
  const SFT_SLUG = "gpt-4-1-mini-sft-igala-cold-gold-cmsjnjcp";
  const contenders = [
    ...TARGETS.filter((t) => t.ragEnabled).map((t) => t.slug),
    "gpt-4o-mini-baseline", // the fine-tune's own untuned base model
  ];
  for (const slug of contenders) {
    const h2h = report.headToHead.find(
      (h) => h.candidateA === slug && h.candidateB === SFT_SLUG,
    );
    if (!h2h) continue;
    const cell = h2h.cells.find((c) => c.metric === "chrf")!;
    const name = TARGETS.find((t) => t.slug === slug)!.name;
    const verdict = cell.delta.distinguishable
      ? cell.delta.mean > 0
        ? "BEATS the fine-tune"
        : "LOSES to the fine-tune"
      : "not distinguishable from the fine-tune";
    log(
      `  ${name.padEnd(32)} n=${String(h2h.nPaired).padStart(2)}  chrF delta vs SFT ${cell.delta.mean >= 0 ? "+" : ""}${cell.delta.mean.toFixed(3)} [${cell.delta.ciLow.toFixed(3)},${cell.delta.ciHigh.toFixed(3)}]  ${verdict}`,
    );
  }

  log("\nCAVEATS");
  for (const c of report.caveats) log(`  - ${c}`);
}

async function samples() {
  const { prompts, bySlug, outputs } = await loadFrozenOutputs();
  // Same consent rule as the harness above: these gold answers are printed as
  // the reference a reader judges the models against, which is benchmark use.
  const goldRows = await prisma.coldAuthorAnswer.findMany({
    where: { isDemo: false, consentBenchmark: true },
    select: { promptId: true, answerText: true },
  });
  const goldByPrompt = new Map<string, string[]>();
  for (const g of goldRows) {
    if (!goldByPrompt.has(g.promptId)) goldByPrompt.set(g.promptId, []);
    goldByPrompt.get(g.promptId)!.push(g.answerText);
  }

  const outKey = new Map<string, string>();
  for (const o of outputs)
    outKey.set(`${o.candidateModelId}:${o.promptId}`, o.outputText);

  // One prompt per bucket where possible, so the sample is not all one type.
  const chosen: typeof prompts = [];
  const seenBucket = new Set<string>();
  for (const p of prompts) {
    if (p.bucket && !seenBucket.has(p.bucket)) {
      seenBucket.add(p.bucket);
      chosen.push(p);
    }
    if (chosen.length >= 8) break;
  }
  for (const p of prompts) {
    if (chosen.length >= 8) break;
    if (!chosen.includes(p)) chosen.push(p);
  }

  const show = [
    "gpt-4o-baseline",
    "gpt-4-1-rag",
    "llama-3-3-70b-baseline",
    "llama-3-3-70b-rag",
    "gemma-4-31b-baseline",
    "gemma-4-31b-rag",
    "gpt-4o-mini-baseline",
    "gpt-4-1-mini-sft-igala-cold-gold-cmsjnjcp",
  ];

  for (const p of chosen) {
    log(`\n${"=".repeat(94)}`);
    log(`${p.promptId}  [${p.bucket}]`);
    log(`PROMPT      ${p.text}`);
    const golds = goldByPrompt.get(p.id) ?? [];
    log(
      `GOLD (${String(golds.length).padStart(2)})   ${golds
        .slice(0, 3)
        .map((g) => g.replace(/\s+/g, " "))
        .join("  |  ")
        .slice(0, 150)}`,
    );
    log("-".repeat(94));
    for (const slug of show) {
      const c = bySlug.get(slug);
      if (!c) continue;
      const t = TARGETS.find((x) => x.slug === slug)!;
      const text = outKey.get(`${c.id}:${p.id}`);
      const label = t.name.slice(0, 30).padEnd(30);
      log(
        `${label} ${text ? text.replace(/\s+/g, " ").slice(0, 120) : "(no output)"}`,
      );
    }
  }
}

async function arena() {
  const prompts = await frozenPrompts();
  const active = await prisma.candidateModel.findMany({
    where: { archived: false, language: "igala" },
    select: { id: true, name: true },
  });
  const activeIds = new Set(active.map((a) => a.id));

  const outputs = await prisma.modelOutput.findMany({
    where: { promptId: { in: prompts.map((p) => p.id) } },
    select: { id: true, promptId: true, candidateModelId: true },
    orderBy: { createdAt: "asc" },
  });

  const perPrompt = new Map<string, string[]>();
  for (const o of outputs) {
    if (!o.candidateModelId || !activeIds.has(o.candidateModelId)) continue;
    if (!perPrompt.has(o.promptId)) perPrompt.set(o.promptId, []);
    perPrompt.get(o.promptId)!.push(o.candidateModelId);
  }

  const counts = prompts.map((p) => (perPrompt.get(p.id) ?? []).length);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  log(`\nFROZEN BANK: ${prompts.length} prompts`);
  log(
    `outputs per prompt (non-archived candidates): min=${min} max=${max} mean=${mean.toFixed(1)}`,
  );
  const hist = new Map<number, number>();
  for (const c of counts) hist.set(c, (hist.get(c) ?? 0) + 1);
  for (const n of [...hist.keys()].sort((a, b) => a - b)) {
    log(`  ${String(n).padStart(2)} outputs: ${hist.get(n)} prompts`);
  }

  // Simulate the real queue: which distinct candidate pairs do annotators land
  // on across the bank? This is what assignedPair actually spreads.
  const annotators = await prisma.user.findMany({
    where: { role: { in: ["ANNOTATOR", "RESEARCHER"] } },
    select: { id: true, name: true },
  });
  const nameById = new Map(active.map((a) => [a.id, a.name]));
  const pairSet = new Set<string>();
  let assignments = 0;
  for (const a of annotators) {
    for (const p of prompts) {
      const ids = perPrompt.get(p.id) ?? [];
      const pair = assignedPair(a.id, p.promptId, ids.length);
      if (!pair) continue;
      assignments++;
      const [i, j] = pair;
      const key = [nameById.get(ids[i]), nameById.get(ids[j])]
        .sort()
        .join(" vs ");
      pairSet.add(key);
    }
  }
  const nActive = active.filter((a) =>
    outputs.some((o) => o.candidateModelId === a.id),
  ).length;
  log(
    `\nannotators=${annotators.length} assignments=${assignments} distinct pairs reached=${pairSet.size} of C(${nActive},2)=${(nActive * (nActive - 1)) / 2}`,
  );
  for (const k of [...pairSet].sort().slice(0, 80)) log(`  ${k}`);
}

const STEPS: Record<string, () => Promise<void>> = {
  preflight,
  register,
  plan,
  generate,
  metrics,
  samples,
  arena,
};

async function main() {
  const step = process.argv[2];
  const fn = STEPS[step];
  if (!fn) {
    log(`Usage: igala-rag-run.ts <${Object.keys(STEPS).join("|")}>`);
    process.exitCode = 1;
    return;
  }
  await fn();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
