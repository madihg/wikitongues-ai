/**
 * Phase A -> Phase B Data Migration Script (US-003b)
 *
 * Imports prompt catalogue, model outputs, pairwise comparisons,
 * and rubric scores from flat-file data into the Prisma database.
 *
 * Idempotent: safe to run multiple times without creating duplicates.
 *
 * Usage: pnpm migrate:phase-a
 */

import { PrismaClient, PromptCategory, DifficultyLevel } from "@prisma/client";
import { hash } from "bcryptjs";
import { readFileSync, readdirSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

const prisma = new PrismaClient();

const MIGRATION_VERSION = "phase-a-v1";
const DATA_ROOT = join(__dirname, "../../data");
const PROMPTS_DIR = join(DATA_ROOT, "prompts");
const RESULTS_DIR = join(DATA_ROOT, "results");
const PAIRWISE_DIR = join(DATA_ROOT, "annotations/pairwise");
const RUBRIC_DIR = join(DATA_ROOT, "annotations/rubric");

// ── Type definitions for source data ────────────────────────────────

interface YamlPrompt {
  id: string;
  category: string;
  language: string;
  text: string;
  source_language?: string;
  target_culture?: string;
  expected_cultural_context?: string;
  difficulty_level?: string;
}

interface YamlFile {
  language: string;
  language_code: string;
  prompts: YamlPrompt[];
}

interface ResultEntry {
  prompt_id: string;
  model: string;
  model_id: string;
  output_text: string;
  token_count_in?: number;
  token_count_out?: number;
  latency_ms?: number;
}

interface PairwiseEntry {
  prompt_id: string;
  model_a: string;
  model_b: string;
  winner: string;
  explanation: string;
  annotator_id: string;
  timestamp: string;
}

interface RubricEntry {
  prompt_id: string;
  model: string;
  scores: {
    cultural_accuracy: number;
    linguistic_authenticity: number;
    creative_depth: number;
    factual_correctness: number;
  };
  notes: {
    cultural_accuracy?: string;
    linguistic_authenticity?: string;
    creative_depth?: string;
    factual_correctness?: string;
  };
  annotator_id: string;
  timestamp: string;
}

// ── Enum maps ───────────────────────────────────────────────────────

const categoryMap: Record<string, PromptCategory> = {
  real_world_use: "real_world_use",
  words_concepts: "words_concepts",
  frontier_aspirations: "frontier_aspirations",
  abstract_vs_everyday: "abstract_vs_everyday",
};

const difficultyMap: Record<string, DifficultyLevel> = {
  basic: "basic",
  intermediate: "intermediate",
  advanced: "advanced",
};

// ── Counters ────────────────────────────────────────────────────────

const counts = {
  promptsSource: 0,
  promptsImported: 0,
  promptsSkipped: 0,
  modelOutputsSource: 0,
  modelOutputsImported: 0,
  modelOutputsSkipped: 0,
  pairwiseSource: 0,
  pairwiseImported: 0,
  pairwiseSkipped: 0,
  rubricSource: 0,
  rubricImported: 0,
  rubricSkipped: 0,
  annotatorsCreated: 0,
  warnings: [] as string[],
};

// ── Helpers ─────────────────────────────────────────────────────────

function readJsonFiles<T>(dir: string): T[] {
  if (!existsSync(dir)) {
    console.log(`  Directory not found: ${dir} (skipping)`);
    return [];
  }

  const files = readdirSync(dir).filter(
    (f) => f.endsWith(".json") && !f.startsWith("."),
  );

  const results: T[] = [];
  for (const file of files) {
    const content = readFileSync(join(dir, file), "utf-8");
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      results.push(...parsed);
    } else {
      results.push(parsed);
    }
  }
  return results;
}

/**
 * Get or create an annotator user by their annotation-file ID (e.g. "ann_001").
 * Caches lookups to avoid repeated DB queries.
 */
const annotatorCache = new Map<string, string>();

async function getOrCreateAnnotator(annotatorFileId: string): Promise<string> {
  if (annotatorCache.has(annotatorFileId)) {
    return annotatorCache.get(annotatorFileId)!;
  }

  const email = `${annotatorFileId}@wikitongues.org`;
  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    const pw = await hash("changeme", 12);
    user = await prisma.user.create({
      data: {
        email,
        name: `Annotator ${annotatorFileId}`,
        passwordHash: pw,
        role: "ANNOTATOR",
      },
    });
    counts.annotatorsCreated++;
    console.log(`  Created placeholder annotator: ${email}`);
  }

  annotatorCache.set(annotatorFileId, user.id);
  return user.id;
}

// ── Step 1: Import Prompts ──────────────────────────────────────────

async function importPrompts(): Promise<void> {
  console.log("\n=== Step 1: Import Prompt Catalogue ===");

  if (!existsSync(PROMPTS_DIR)) {
    console.log("  Prompts directory not found, skipping.");
    return;
  }

  const files = readdirSync(PROMPTS_DIR).filter(
    (f) => f.endsWith(".yaml") && f !== "schema.yaml",
  );

  for (const file of files) {
    const content = readFileSync(join(PROMPTS_DIR, file), "utf-8");
    const data = parse(content) as YamlFile;

    if (!data?.prompts) continue;

    for (const prompt of data.prompts) {
      counts.promptsSource++;

      const category = categoryMap[prompt.category];
      if (!category) {
        counts.warnings.push(
          `Unknown category "${prompt.category}" for prompt ${prompt.id}`,
        );
        continue;
      }

      const existing = await prisma.prompt.findUnique({
        where: { promptId: prompt.id },
      });

      if (existing) {
        counts.promptsSkipped++;
        continue;
      }

      await prisma.prompt.create({
        data: {
          promptId: prompt.id,
          category,
          language: prompt.language,
          text: prompt.text,
          sourceLanguage: prompt.source_language ?? null,
          targetCulture: prompt.target_culture ?? null,
          expectedCulturalContext: prompt.expected_cultural_context ?? null,
          difficultyLevel:
            difficultyMap[prompt.difficulty_level ?? "intermediate"] ??
            "intermediate",
        },
      });
      counts.promptsImported++;
    }

    console.log(`  Processed: ${file}`);
  }
}

// ── Step 2: Import Model Outputs ────────────────────────────────────

async function importModelOutputs(): Promise<void> {
  console.log("\n=== Step 2: Import Model Outputs ===");

  const entries = readJsonFiles<ResultEntry>(RESULTS_DIR);
  if (entries.length === 0) {
    console.log(
      "  No result files found (this is expected if models haven't been run yet).",
    );
    return;
  }

  for (const entry of entries) {
    counts.modelOutputsSource++;

    const prompt = await prisma.prompt.findUnique({
      where: { promptId: entry.prompt_id },
    });

    if (!prompt) {
      counts.warnings.push(
        `Model output references unknown prompt: ${entry.prompt_id}`,
      );
      continue;
    }

    // Check for existing output by prompt + modelId
    const existing = await prisma.modelOutput.findFirst({
      where: {
        promptId: prompt.id,
        modelId: entry.model_id,
      },
    });

    if (existing) {
      counts.modelOutputsSkipped++;
      continue;
    }

    await prisma.modelOutput.create({
      data: {
        promptId: prompt.id,
        model: entry.model,
        modelId: entry.model_id,
        outputText: entry.output_text,
        tokenCountIn: entry.token_count_in ?? null,
        tokenCountOut: entry.token_count_out ?? null,
        latencyMs: entry.latency_ms ?? null,
      },
    });
    counts.modelOutputsImported++;
  }

  console.log(`  Processed ${counts.modelOutputsSource} model output entries.`);
}

// ── Step 3: Import Pairwise Comparisons ─────────────────────────────

async function importPairwise(): Promise<void> {
  console.log("\n=== Step 3: Import Pairwise Comparisons ===");

  const entries = readJsonFiles<PairwiseEntry>(PAIRWISE_DIR);
  if (entries.length === 0) {
    console.log("  No pairwise comparison files found.");
    return;
  }

  for (const entry of entries) {
    counts.pairwiseSource++;

    const prompt = await prisma.prompt.findUnique({
      where: { promptId: entry.prompt_id },
    });

    if (!prompt) {
      counts.warnings.push(
        `Pairwise comparison references unknown prompt: ${entry.prompt_id}`,
      );
      continue;
    }

    // Look up model outputs for model_a and model_b under this prompt
    const outputA = await prisma.modelOutput.findFirst({
      where: { promptId: prompt.id, model: entry.model_a },
    });

    const outputB = await prisma.modelOutput.findFirst({
      where: { promptId: prompt.id, model: entry.model_b },
    });

    if (!outputA || !outputB) {
      const missing = [];
      if (!outputA) missing.push(entry.model_a);
      if (!outputB) missing.push(entry.model_b);
      counts.warnings.push(
        `Pairwise for ${entry.prompt_id}: missing model outputs for [${missing.join(", ")}]. ` +
          `Import model results first, then re-run migration.`,
      );
      counts.pairwiseSkipped++;
      continue;
    }

    const annotatorId = await getOrCreateAnnotator(entry.annotator_id);

    // Check for duplicate: same prompt, same models, same annotator, same timestamp
    const existing = await prisma.pairwiseComparison.findFirst({
      where: {
        promptId: entry.prompt_id,
        modelOutputAId: outputA.id,
        modelOutputBId: outputB.id,
        annotatorId,
      },
    });

    if (existing) {
      counts.pairwiseSkipped++;
      continue;
    }

    await prisma.pairwiseComparison.create({
      data: {
        promptId: entry.prompt_id,
        modelOutputAId: outputA.id,
        modelOutputBId: outputB.id,
        winner: entry.winner,
        explanation: entry.explanation,
        annotatorId,
      },
    });
    counts.pairwiseImported++;
  }

  console.log(
    `  Processed ${counts.pairwiseSource} pairwise comparison entries.`,
  );
}

// ── Step 4: Import Rubric Scores ────────────────────────────────────

async function importRubricScores(): Promise<void> {
  console.log("\n=== Step 4: Import Rubric Scores ===");

  const entries = readJsonFiles<RubricEntry>(RUBRIC_DIR);
  if (entries.length === 0) {
    console.log("  No rubric score files found.");
    return;
  }

  for (const entry of entries) {
    counts.rubricSource++;

    const prompt = await prisma.prompt.findUnique({
      where: { promptId: entry.prompt_id },
    });

    if (!prompt) {
      counts.warnings.push(
        `Rubric score references unknown prompt: ${entry.prompt_id}`,
      );
      continue;
    }

    const modelOutput = await prisma.modelOutput.findFirst({
      where: { promptId: prompt.id, model: entry.model },
    });

    if (!modelOutput) {
      counts.warnings.push(
        `Rubric for ${entry.prompt_id}/${entry.model}: no model output found. ` +
          `Import model results first, then re-run migration.`,
      );
      counts.rubricSkipped++;
      continue;
    }

    const annotatorId = await getOrCreateAnnotator(entry.annotator_id);

    // Check for duplicate: same model output + annotator
    const existing = await prisma.rubricScore.findFirst({
      where: {
        modelOutputId: modelOutput.id,
        annotatorId,
        promptId: entry.prompt_id,
      },
    });

    if (existing) {
      counts.rubricSkipped++;
      continue;
    }

    await prisma.rubricScore.create({
      data: {
        promptId: entry.prompt_id,
        modelOutputId: modelOutput.id,
        culturalAccuracy: entry.scores.cultural_accuracy,
        linguisticAuthenticity: entry.scores.linguistic_authenticity,
        creativeDepth: entry.scores.creative_depth,
        factualCorrectness: entry.scores.factual_correctness,
        notesCulturalAccuracy: entry.notes.cultural_accuracy ?? null,
        notesLinguisticAuthenticity:
          entry.notes.linguistic_authenticity ?? null,
        notesCreativeDepth: entry.notes.creative_depth ?? null,
        notesFactualCorrectness: entry.notes.factual_correctness ?? null,
        annotatorId,
      },
    });
    counts.rubricImported++;
  }

  console.log(`  Processed ${counts.rubricSource} rubric score entries.`);
}

// ── Step 5: Integrity Checks ────────────────────────────────────────

async function runIntegrityChecks(): Promise<void> {
  console.log("\n=== Step 5: Integrity Checks ===");

  const dbPrompts = await prisma.prompt.count();
  const dbOutputs = await prisma.modelOutput.count();
  const dbPairwise = await prisma.pairwiseComparison.count();
  const dbRubric = await prisma.rubricScore.count();

  // Check for orphaned model outputs (no matching prompt)
  const orphanedOutputs = await prisma.modelOutput.findMany({
    where: { prompt: { id: undefined } },
    select: { id: true },
  });

  // Check for rubric scores without model outputs
  const orphanedRubric = await prisma.rubricScore.count({
    where: { modelOutput: { id: undefined } },
  });

  console.log(`  DB Prompts:               ${dbPrompts}`);
  console.log(`  DB Model Outputs:         ${dbOutputs}`);
  console.log(`  DB Pairwise Comparisons:  ${dbPairwise}`);
  console.log(`  DB Rubric Scores:         ${dbRubric}`);

  if (orphanedOutputs.length > 0) {
    counts.warnings.push(
      `${orphanedOutputs.length} orphaned model outputs found`,
    );
  }
  if (orphanedRubric > 0) {
    counts.warnings.push(`${orphanedRubric} orphaned rubric scores found`);
  }
}

// ── Step 6: Record migration version ────────────────────────────────

function recordMigration(): void {
  const logPath = join(__dirname, "../.migration-log.json");

  let log: Array<{
    version: string;
    timestamp: string;
    counts: typeof counts;
  }> = [];
  if (existsSync(logPath)) {
    log = JSON.parse(readFileSync(logPath, "utf-8"));
  }

  log.push({
    version: MIGRATION_VERSION,
    timestamp: new Date().toISOString(),
    counts,
  });

  writeFileSync(logPath, JSON.stringify(log, null, 2));
  console.log(`\n  Migration logged to .migration-log.json`);
}

// ── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\nPhase A -> Phase B Migration (${MIGRATION_VERSION})`);
  console.log("=".repeat(50));

  await importPrompts();
  await importModelOutputs();
  await importPairwise();
  await importRubricScores();
  await runIntegrityChecks();
  recordMigration();

  // ── Summary ─────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(50));
  console.log("MIGRATION SUMMARY");
  console.log("=".repeat(50));
  console.log(
    `  Prompts:     ${counts.promptsImported} imported, ${counts.promptsSkipped} skipped (already existed) / ${counts.promptsSource} source`,
  );
  console.log(
    `  Outputs:     ${counts.modelOutputsImported} imported, ${counts.modelOutputsSkipped} skipped / ${counts.modelOutputsSource} source`,
  );
  console.log(
    `  Pairwise:    ${counts.pairwiseImported} imported, ${counts.pairwiseSkipped} skipped / ${counts.pairwiseSource} source`,
  );
  console.log(
    `  Rubric:      ${counts.rubricImported} imported, ${counts.rubricSkipped} skipped / ${counts.rubricSource} source`,
  );
  console.log(`  Annotators:  ${counts.annotatorsCreated} created`);

  if (counts.warnings.length > 0) {
    console.log(`\nWARNINGS (${counts.warnings.length}):`);
    for (const w of counts.warnings) {
      console.log(`  - ${w}`);
    }
  } else {
    console.log("\n  No warnings.");
  }

  console.log("\nMigration complete.\n");
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
