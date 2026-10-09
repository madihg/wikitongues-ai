import { closeSync, openSync, writeSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { generateForCandidate } from "../src/lib/arena/providers";
import {
  referenceFormRefusal,
  renderReferenceForm,
  summarizeReferenceReport,
  type ReferenceFormResult,
} from "../src/lib/arena/reference-form";
import { estimateGenerationCostUsd } from "../src/lib/arena/pricing";

/**
 * Twenty v4.4 TRAIN answers rendered in the reference form, for Salem Ejeba's
 * verdict (tasks/prd-salem-writeup-ingest-2026-10-08.md, US-011).
 *
 * WHAT IT DOES
 * ------------
 * Picks --n stored answers of gemini-3-1-pro-rag-v4-4 to TRAIN prompts
 * (prompt.isHoldout false, isDemo false, one per prompt; frozen-exam rows are
 * excluded by the query and refused again row by row, so no frozen gold's
 * question or answer can reach the file), spread across the buckets
 * round-robin in promptId order so the pick is deterministic, renders each
 * through the REAL provider with renderReferenceForm, and writes one Markdown
 * file: question, community answer, reference form and the mechanical report
 * per sample, the aggregate at the end. Then prints the aggregate.
 *
 * It writes NOTHING to the database. The samples exist for a human reading,
 * and the chat path is the only place the rendering is served; storing them
 * would put a second pass's text next to judged rows that never had one.
 *
 * COST
 * ----
 * One Gemini 3.1 Pro call per sample: about 20 calls at --n 20, each a few
 * hundred tokens in and, with the reasoning trace, up to the candidate's
 * maxTokens out. The estimate printed at the end is from the counts the
 * provider returned, at the rates in src/lib/arena/pricing.ts. Expect well
 * under a dollar. The script makes no other call, and books no CostEntry:
 * log the printed estimate with scripts/log-cost-entry.ts if it should count.
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/reference-form-samples.ts --n 20 --out ../tasks/reference-form-samples-2026-10-08.md
 *
 * Refuses to overwrite an existing --out file (opened with "wx", the rule the
 * backup files in regenerate-train-outputs.ts follow), and opens it BEFORE
 * the first model call so a bad path costs nothing.
 */

const V44_SLUG = "gemini-3-1-pro-rag-v4-4";

function flag(argv: string[], name: string): string | undefined {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
}

interface Sample {
  promptId: string;
  bucket: string;
  question: string;
  community: string;
  result: ReferenceFormResult | null;
  failure: string | null;
}

function renderSample(i: number, s: Sample): string {
  const lines = [
    `## ${i + 1}. ${s.promptId} (${s.bucket})`,
    "",
    "**Question**",
    "",
    s.question,
    "",
    "**Community answer (served, v4.4)**",
    "",
    s.community,
    "",
    "**Reference form (second pass)**",
    "",
  ];
  if (s.result) {
    lines.push(
      s.result.text,
      "",
      `Report: ${summarizeReferenceReport(s.result.report)}. ` +
        `Tokens in/out ${s.result.tokensIn ?? "?"}/${s.result.tokensOut ?? "?"} (cap ${s.result.maxTokens}), ${s.result.latencyMs} ms.`,
    );
    // What the chat page would do with it: the same guard the route applies.
    const refusal = referenceFormRefusal(s.result);
    if (refusal) lines.push("", `Chat would NOT show this rendering: ${refusal}.`);
  } else {
    lines.push(`(second pass failed: ${s.failure})`);
  }
  lines.push("");
  return lines.join("\n") + "\n";
}

async function main() {
  const argv = process.argv.slice(2);
  const n = Number(flag(argv, "--n") ?? 20);
  const out = flag(argv, "--out");
  if (!out || !Number.isInteger(n) || n <= 0) {
    throw new Error(
      "usage: reference-form-samples.ts --n <count> --out <markdown path>",
    );
  }
  const fd = openSync(out, "wx");
  const write = (s: string) => writeSync(fd, s);

  try {
    const rows = await prisma.modelOutput.findMany({
      where: {
        isDemo: false,
        candidateModel: { slug: V44_SLUG },
        prompt: { isHoldout: false },
      },
      select: {
        id: true,
        outputText: true,
        prompt: {
          select: { promptId: true, text: true, bucket: true, isHoldout: true },
        },
        candidateModel: true,
      },
      orderBy: { prompt: { promptId: "asc" } },
    });
    if (rows.length === 0) {
      throw new Error(`no stored train answers for ${V44_SLUG} - wrong database?`);
    }

    // One row per prompt, grouped by bucket, each group in promptId order.
    const byBucket = new Map<string, typeof rows>();
    const seen = new Set<string>();
    for (const r of rows) {
      if (r.prompt.isHoldout) {
        throw new Error(`frozen row ${r.id} came back from a train query`);
      }
      if (!r.outputText.trim() || seen.has(r.prompt.promptId)) continue;
      seen.add(r.prompt.promptId);
      const bucket = r.prompt.bucket ?? "unbucketed";
      byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), r]);
    }
    // Round-robin across buckets so the sample is not one prompt family.
    const buckets = [...byBucket.keys()].sort();
    const picked: typeof rows = [];
    for (let depth = 0; picked.length < n; depth++) {
      let took = false;
      for (const bucket of buckets) {
        const list = byBucket.get(bucket)!;
        if (depth < list.length && picked.length < n) {
          picked.push(list[depth]);
          took = true;
        }
      }
      if (!took) break;
    }
    console.log(
      `${rows.length} stored ${V44_SLUG} train answers across ${buckets.length} buckets; rendering ${picked.length}.`,
    );

    write(
      [
        "# Reference-form samples: v4.4 community answers rendered by a second pass",
        "",
        `Generated ${new Date().toISOString()} by scripts/reference-form-samples.ts.`,
        `Source rows: stored answers of ${V44_SLUG} to TRAIN prompts (frozen-exam rows excluded). ` +
          "Nothing here was written to the database.",
        "",
        "Each sample shows the question, the answer as served (the community register the speakers judge), " +
          "the same answer rendered in the reference form (tone marks on every word, no contraction), " +
          "and the mechanical report on that rendering. The report cannot judge a tone; Salem can.",
        "",
      ].join("\n") + "\n",
    );

    const samples: Sample[] = [];
    let costUsd = 0;
    for (const [i, r] of picked.entries()) {
      const sample: Sample = {
        promptId: r.prompt.promptId,
        bucket: r.prompt.bucket ?? "unbucketed",
        question: r.prompt.text,
        community: r.outputText,
        result: null,
        failure: null,
      };
      if (!r.candidateModel) {
        sample.failure = "row has no candidate";
      } else {
        try {
          sample.result = await renderReferenceForm(
            r.candidateModel,
            r.outputText,
            generateForCandidate,
          );
          costUsd += estimateGenerationCostUsd({
            modelId: sample.result.modelId,
            tokensIn: sample.result.tokensIn,
            tokensOut: sample.result.tokensOut,
          });
        } catch (e) {
          sample.failure = (e as Error).message.slice(0, 200);
        }
      }
      samples.push(sample);
      write(renderSample(i, sample));
      console.log(
        `${i + 1}/${picked.length} ${sample.promptId}: ${
          sample.result
            ? summarizeReferenceReport(sample.result.report)
            : `FAILED ${sample.failure}`
        }`,
      );
    }

    const rendered = samples.filter((s) => s.result !== null);
    const reports = rendered.map((s) => s.result!.report);
    const sum = (f: (r: (typeof reports)[number]) => number) =>
      reports.reduce((acc, r) => acc + f(r), 0);
    const mean = (f: (r: (typeof reports)[number]) => number) =>
      reports.length === 0 ? 0 : sum(f) / reports.length;
    const aggregate = [
      `rendered ${rendered.length} of ${samples.length} (${samples.length - rendered.length} failed)`,
      `mean toned share ${(mean((r) => r.tonedShare) * 100).toFixed(1)}%`,
      `words left unmarked ${sum((r) => r.unmarkedWords)} of ${sum((r) => r.referenceWords)}, partly marked ${sum((r) => r.partiallyTonedWords)}`,
      `apostrophes left ${sum((r) => r.apostrophesLeft)}`,
      `refused by the chat guard ${rendered.filter((s) => referenceFormRefusal(s.result!) !== null).length}`,
      `words dropped ${sum((r) => r.dropped.length)}, added ${sum((r) => r.added.length)}`,
      `words with letters changed ${sum((r) => r.lettersChanged)}, vowels restored ${sum((r) => r.vowelsRestored)}`,
      `words with a new s ${sum((r) => r.newSWords.length)}`,
      `tokens in ${rendered.reduce((a, s) => a + (s.result!.tokensIn ?? 0), 0)}, out ${rendered.reduce((a, s) => a + (s.result!.tokensOut ?? 0), 0)}`,
      `mean latency ${Math.round(rendered.reduce((a, s) => a + s.result!.latencyMs, 0) / Math.max(1, rendered.length))} ms`,
      `estimated cost $${costUsd.toFixed(4)}`,
    ];
    write(["## Aggregate", "", ...aggregate.map((l) => `- ${l}`), ""].join("\n"));
    console.log("\nAGGREGATE");
    for (const l of aggregate) console.log(`  ${l}`);
    console.log(`\nwrote ${out}`);
  } finally {
    closeSync(fd);
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
