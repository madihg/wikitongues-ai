import { readFileSync } from "node:fs";

/**
 * Write the numbers of a worker batch (worker/first_model.py) into the tables
 * the dashboard reads. Rows are documented in the speech DATA.md.
 *
 *   npx tsx --env-file=.env.local scripts/speech/record-speech-measures.ts
 *       --file FILE [--only eval|measures] [--dry-run | --apply]
 *
 * The default is a dry run. The file holds numbers, ids and model refs only:
 * no clip text, no transcript, no audio.
 *
 *  - evalResults go to SpeechEvalResult (the recogniser against the locked
 *    text). That table exists; a row is skipped when one with the same
 *    modelRef and manifestVersion is already there.
 *  - clipMeasures, autoMeasures and derivatives go to SpeechClipMeasure,
 *    SpeechAutoMeasure and SpeechDerivative. They need the speech_measures
 *    migration; each has a unique key, so a second run writes nothing.
 */

export interface EvalResultRow {
  modelRef: string;
  manifestVersion: string;
  cer: number;
  werStripped: number;
  werRetained: number;
  ter: number;
  perSpeaker: Record<string, unknown>;
  perDialect: Record<string, unknown>;
  nClips: number;
}

export interface ClipMeasureRow {
  clipKey: string;
  recordingId: string | null;
  promptId: string;
  language: string;
  systemRef: string;
  stage: "raw" | "cleaned" | "synth";
  rulerRef: string;
  values: Record<string, unknown>;
}

export interface AutoMeasureRow {
  kind: string;
  modelRef: string;
  rulerRef: string;
  manifestVersion: string;
  nClips: number;
  values: Record<string, unknown>;
}

export interface DerivativeRow {
  recordingId: string;
  kind: string;
  version: string;
  rawKey: string;
  key24k: string | null;
  key16k: string | null;
  usedDenoised: boolean;
  keptRawReason: string | null;
  log: Record<string, unknown>;
}

export interface MeasuresFile {
  evalResults?: EvalResultRow[];
  clipMeasures?: ClipMeasureRow[];
  autoMeasures?: AutoMeasureRow[];
  derivatives?: DerivativeRow[];
}

const TEXT_KEYS = /^(text|transcript|hypothesis|reference|answerText|ref|hyp)$/i;

/**
 * Refuse a file that could carry clip text: a key named like text anywhere,
 * or a string value with a space in a `values` object (numbers, short labels
 * and reason codes have none).
 */
export function assertNumbersOnly(file: MeasuresFile): void {
  const walk = (v: unknown, path: string, inValues: boolean): void => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, inValues));
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (TEXT_KEYS.test(k)) throw new Error(`${path}.${k}: clip text does not belong in this file`);
        walk(x, `${path}.${k}`, inValues || k === "values");
      }
    } else if (inValues && typeof v === "string" && /\s/.test(v)) {
      throw new Error(`${path}: a sentence in a values object; numbers and codes only`);
    }
  };
  walk(file, "file", false);
}

/** Eval rows not already stored (same modelRef and manifestVersion). */
export function newEvalRows(
  rows: EvalResultRow[],
  existing: Array<{ modelRef: string; manifestVersion: string }>,
): EvalResultRow[] {
  const have = new Set(existing.map((e) => `${e.modelRef}\n${e.manifestVersion}`));
  const out: EvalResultRow[] = [];
  for (const r of rows) {
    const key = `${r.modelRef}\n${r.manifestVersion}`;
    if (have.has(key)) continue;
    have.add(key);
    for (const k of ["cer", "werStripped", "werRetained", "ter"] as const) {
      if (!Number.isFinite(r[k]) || r[k] < 0) throw new Error(`${r.modelRef}: ${k} is not a score`);
    }
    if (!Number.isInteger(r.nClips) || r.nClips < 1) throw new Error(`${r.modelRef}: nClips`);
    out.push(r);
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const path = args[args.indexOf("--file") + 1];
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
  const apply = args.includes("--apply");
  if (!args.includes("--file") || !path || (only && only !== "eval" && only !== "measures")) {
    throw new Error("usage: record-speech-measures.ts --file FILE [--only eval|measures] [--dry-run | --apply]");
  }
  if (apply && args.includes("--dry-run")) throw new Error("Choose --dry-run or --apply, not both.");
  const file = JSON.parse(readFileSync(path, "utf8")) as MeasuresFile;
  assertNumbersOnly(file);

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const say = (s: string) => console.log(`${apply ? "APPLY" : "DRY RUN"} ${s}`);
  try {
    if (only !== "measures") {
      const rows = file.evalResults ?? [];
      const existing = await prisma.speechEvalResult.findMany({
        where: { modelRef: { in: rows.map((r) => r.modelRef) } },
        select: { modelRef: true, manifestVersion: true },
      });
      const fresh = newEvalRows(rows, existing);
      say(`SpeechEvalResult: ${fresh.length} new, ${rows.length - fresh.length} already stored`);
      for (const r of fresh) {
        say(`  ${r.modelRef}: ${r.nClips} clips, CER ${r.cer.toFixed(4)}, WER ${r.werStripped.toFixed(4)}, WER with tones ${r.werRetained.toFixed(4)}, TER ${r.ter.toFixed(4)}`);
      }
      if (apply && fresh.length > 0) {
        await prisma.speechEvalResult.createMany({
          data: fresh.map((r) => ({
            modelRef: r.modelRef,
            manifestVersion: r.manifestVersion,
            cer: r.cer,
            werStripped: r.werStripped,
            werRetained: r.werRetained,
            ter: r.ter,
            perSpeaker: r.perSpeaker as object,
            perDialect: r.perDialect as object,
            nClips: r.nClips,
          })),
        });
      }
    }
    if (only !== "eval") {
      const clip = file.clipMeasures ?? [];
      const auto = file.autoMeasures ?? [];
      const der = file.derivatives ?? [];
      say(`SpeechClipMeasure: ${clip.length} row(s); SpeechAutoMeasure: ${auto.length}; SpeechDerivative: ${der.length}`);
      if (apply) {
        const a = await prisma.speechClipMeasure.createMany({
          data: clip.map((r) => ({ ...r, values: r.values as object })),
          skipDuplicates: true,
        });
        const b = await prisma.speechAutoMeasure.createMany({
          data: auto.map((r) => ({ ...r, values: r.values as object })),
          skipDuplicates: true,
        });
        const c = await prisma.speechDerivative.createMany({
          data: der.map((r) => ({ ...r, log: r.log as object })),
          skipDuplicates: true,
        });
        say(`wrote ${a.count} clip measure(s), ${b.count} aggregate(s), ${c.count} derivative(s); the rest already existed`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when invoked as a script, never when imported by a test.
if (process.argv[1]?.endsWith("record-speech-measures.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
