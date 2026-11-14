import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  WORDS_PER_MINUTE,
  buildScript,
  coverageReport,
  isOutsideRepo,
  lengthStats,
  scriptToJsonl,
  selectSentences,
  type ScriptCandidate,
} from "../../src/lib/speech/tts-script";

/**
 * Build the tone-marked reading script for the studio speaker (PRD US-008).
 *
 *   npx tsx --env-file=.env.local scripts/speech/build-tts-script.ts \
 *     --out ~/Documents/igala-studio/script.jsonl [--hours 5] [--dry-run]
 *
 * Sentences come from consented, speaker-authored, train-side cold answers
 * (never isHoldout, never split test, never a demo row). Tone marks are
 * restored with restoreTones (src/lib/speech/tone-restore.ts); an answer the
 * restorer changes beyond tone marks is skipped and counted. Duplicates are
 * found on the tone-stripped form. The length target is --hours at 130 words
 * a minute (default 5). The script goes to --out, which must be OUTSIDE this
 * repository (it is Igala text and the repo is public); stdout carries
 * numbers only. --dry-run selects and counts, calls no LLM and writes nothing.
 * The studio page (/lab/speech/studio) reads the file's JSON lines.
 *
 * Restoration is lazy: sentences are sent in order until the target is
 * reached, so a run costs only as many calls as the script needs (cost rows
 * are written by the chat helper under refType speech_tts_script).
 */

export const REF_TYPE = "speech_tts_script";

export interface ScriptDeps {
  loadCandidates: () => Promise<ScriptCandidate[]>;
  restore: (text: string, runId: string) => Promise<string>;
  isViolation: (e: unknown) => boolean;
  write: (path: string, body: string) => void;
  repoRoot: string;
}

export interface ScriptArgs {
  out?: string;
  hours: number;
  dryRun: boolean;
  runId: string;
}

/** The report lines, key=value, numbers and letter names only. */
export async function run(deps: ScriptDeps, args: ScriptArgs): Promise<string[]> {
  if (!Number.isFinite(args.hours) || args.hours <= 0) {
    throw new Error("--hours must be a positive number");
  }
  if (!args.dryRun) {
    if (!args.out) throw new Error("--out is required unless --dry-run");
    if (!isOutsideRepo(args.out, deps.repoRoot)) {
      throw new Error("--out must be outside the repository: the script is Igala text");
    }
  }

  const sel = selectSentences(await deps.loadCandidates());
  const out: string[] = [];
  const kv = (k: string, v: number | string) => out.push(`${k}=${v}`);
  for (const [k, v] of Object.entries(sel.counts)) kv(k, v);
  kv("target_hours", args.hours);
  kv("words_per_minute", WORDS_PER_MINUTE);

  if (args.dryRun) {
    const words = sel.sentences.reduce((n, s) => n + s.text.split(/\s+/u).length, 0);
    kv("available_hours_before_restoration", (words / WORDS_PER_MINUTE / 60).toFixed(3));
    const cov = coverageReport(sel.sentences);
    reportCoverage(kv, cov);
    kv("dry_run", "true (no LLM calls, nothing written)");
    return out;
  }

  const built = await buildScript(
    sel.sentences,
    args.hours,
    (t) => deps.restore(t, args.runId),
    deps.isViolation,
  );
  deps.write(resolve(args.out!), scriptToJsonl(built.lines));

  kv("script_sentences", built.lines.length);
  kv("script_words", built.words);
  kv("script_minutes", built.minutes.toFixed(1));
  kv("reached_target", String(built.reachedTarget));
  for (const [k, v] of Object.entries(built.restore)) kv(`restore_${k}`, v);
  const stats = lengthStats(built.lines);
  for (const [k, v] of Object.entries(stats)) kv(`length_${k}`, Number.isInteger(v) ? v : v.toFixed(2));
  reportCoverage(kv, coverageReport(built.lines));
  return out;
}

function reportCoverage(
  kv: (k: string, v: number | string) => void,
  cov: ReturnType<typeof coverageReport>,
) {
  for (const [k, v] of Object.entries(cov.digraphs)) kv(`digraph_${k}`, v);
  for (const [k, v] of Object.entries(cov.dottedVowels)) kv(`dotted_vowel_${k}`, v);
  kv("letters_missing", cov.missing.length ? cov.missing.join(",") : "none");
}

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const { prisma } = await import("../../src/lib/prisma");
  const { restoreTones, ToneRestoreViolation } = await import(
    "../../src/lib/speech/tone-restore"
  );
  const args: ScriptArgs = {
    out: argValue("out"),
    hours: argValue("hours") ? Number(argValue("hours")) : 5,
    dryRun: process.argv.includes("--dry-run"),
    runId: `tts-script-${new Date().toISOString()}`,
  };
  const deps: ScriptDeps = {
    repoRoot: resolve(process.cwd(), ".."),
    isViolation: (e) => e instanceof ToneRestoreViolation,
    restore: (text, runId) =>
      restoreTones(text, { refType: REF_TYPE, refId: runId, label: "tts script tone restore" }),
    write: (path, body) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, body, { mode: 0o600 });
    },
    loadCandidates: async () => {
      const rows = await prisma.coldAuthorAnswer.findMany({
        where: {
          isDemo: false,
          consentTraining: true,
          verificationStatus: { not: "seed" },
          prompt: { language: "igala", isHoldout: false, split: { not: "test" } },
        },
        select: {
          id: true,
          answerText: true,
          isDemo: true,
          consentTraining: true,
          verificationStatus: true,
          prompt: { select: { promptId: true, isHoldout: true, split: true } },
        },
        orderBy: { id: "asc" },
      });
      return rows.map((r) => ({
        id: r.id,
        promptCode: r.prompt.promptId,
        text: r.answerText,
        prompt: { isHoldout: r.prompt.isHoldout, split: r.prompt.split },
        isDemo: r.isDemo,
        consentTraining: r.consentTraining,
        verificationStatus: r.verificationStatus,
      }));
    },
  };
  try {
    for (const line of await run(deps, args)) console.log(line);
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when invoked as a script, never when imported by a test.
if (process.argv[1]?.endsWith("build-tts-script.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
