import { prisma } from "../../src/lib/prisma";
import { toneStrip } from "../../src/lib/speech/normalise";
import {
  restoreTones,
  ToneRestoreViolation,
} from "../../src/lib/speech/tone-restore";
import { LLM_CONFIG } from "../../src/lib/speech/llm-config";

/**
 * Measure tone-mark restoration (PRD US-007) on train-side cold answers that
 * already carry tone marks: strip the marks, restore them, compare with the
 * original. Prints counts and aggregate numbers only, never text; this
 * repository is public.
 *
 * Selection: language igala, prompt not a holdout and not split "test", answer
 * not a demo row, training consent given, and the answer has at least one
 * tone mark (toneStrip changes it).
 *
 *   npx tsx --env-file=.env.local scripts/speech/eval-tone-restore.ts [--limit N] [--dry-run]
 *
 * --dry-run selects and counts, makes no LLM call and writes no cost row.
 *
 * TODO(PR B): TER below is a local stub. When src/lib/speech/metrics.ts
 * lands, replace tonePositionErrors with its TER so the number matches the
 * rest of the programme. The stub counts, per letter (base plus its marks),
 * whether the restored tone marks differ from the original's, over answers
 * with no violation.
 */

const EVAL_REF_TYPE = "speech_tone_eval";
const CONCURRENCY = 4;

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** Letter clusters: a base character with the combining marks that follow it. */
function clusters(text: string): string[] {
  return text.normalize("NFD").match(/[^̀-ͯ][̀-ͯ]*/gu) ?? [];
}

/** The tone marks of one cluster: what toneStrip would remove, sorted. */
function toneOf(cluster: string): string {
  const keep = [...toneStrip(cluster).normalize("NFD")];
  const marks: string[] = [];
  for (const ch of cluster) {
    const at = keep.indexOf(ch);
    if (at === -1) marks.push(ch);
    else keep.splice(at, 1);
  }
  return marks.sort().join("");
}

/** STUB (see TODO above): [wrong letters, total letters]. Needs aligned clusters. */
export function tonePositionErrors(gold: string, restored: string): [number, number] {
  const g = clusters(gold);
  const r = clusters(restored);
  if (g.length !== r.length) return [g.length, g.length];
  let wrong = 0;
  g.forEach((c, i) => {
    if (toneOf(c) !== toneOf(r[i])) wrong++;
  });
  return [wrong, g.length];
}

async function main() {
  const limit = argValue("limit") ? Number(argValue("limit")) : undefined;
  const dryRun = process.argv.includes("--dry-run");

  const rows = await prisma.coldAuthorAnswer.findMany({
    where: {
      isDemo: false,
      consentTraining: true,
      prompt: { language: "igala", isHoldout: false, split: { not: "test" } },
    },
    select: { id: true, answerText: true },
    orderBy: { id: "asc" },
  });
  const marked = rows.filter((r) => r.answerText !== toneStrip(r.answerText));
  const picked = limit ? marked.slice(0, limit) : marked;

  console.log(`answers_considered=${rows.length}`);
  console.log(`answers_with_tone_marks=${marked.length}`);
  console.log(`answers_selected=${picked.length}`);
  console.log(`model=${LLM_CONFIG.toneRestore}`);
  if (dryRun) {
    console.log("dry_run=true (no LLM calls, no cost rows)");
    return;
  }

  const runId = `tone-eval-${new Date().toISOString()}`;
  let restored = 0;
  let violated = 0;
  let failed = 0;
  let exact = 0;
  let wrongLetters = 0;
  let totalLetters = 0;
  let violationItems = 0;

  for (let i = 0; i < picked.length; i += CONCURRENCY) {
    await Promise.all(
      picked.slice(i, i + CONCURRENCY).map(async (row) => {
        const gold = row.answerText.normalize("NFC");
        try {
          const out = await restoreTones(toneStrip(gold), {
            refType: EVAL_REF_TYPE,
            refId: runId,
            label: "tone restore eval",
          });
          restored++;
          if (out.normalize("NFC") === gold) exact++;
          const [w, t] = tonePositionErrors(gold, out);
          wrongLetters += w;
          totalLetters += t;
        } catch (e) {
          if (e instanceof ToneRestoreViolation) {
            violated++;
            violationItems += e.violations.length;
          } else {
            failed++;
          }
        }
      }),
    );
  }

  const cost = await prisma.costEntry.aggregate({
    where: { refType: EVAL_REF_TYPE, refId: runId },
    _sum: { amountUsd: true },
  });

  console.log(`restored=${restored}`);
  console.log(`violations_answers=${violated}`);
  console.log(`violations_items=${violationItems}`);
  console.log(`call_failures=${failed}`);
  console.log(`exact_match=${exact}`);
  console.log(`ter_stub=${totalLetters ? (wrongLetters / totalLetters).toFixed(4) : "n/a"} (${wrongLetters}/${totalLetters} letters)`);
  console.log(`cost_usd_total=${(cost._sum.amountUsd ?? 0).toFixed(4)}`);
}

// Run only when invoked as a script, never when imported by a test.
if (process.argv[1]?.endsWith("eval-tone-restore.ts")) {
  main()
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
