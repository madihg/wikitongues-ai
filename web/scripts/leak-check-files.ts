import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { PrismaClient } from "@prisma/client";
import { buildProtectedSet, checkStatic } from "../src/lib/eval/leak-guard";
import { fullFold } from "../src/lib/eval/normalize";
import { applyLeakAllowList, neutraliseEscapes } from "../src/lib/eval/leak-allow";
import { LEAK_ALLOW } from "./leak-check-allow";

/**
 * SCOPE-A CHECK FOR FILES WE PUBLISH. madihg/wikitongues-ai is a PUBLIC
 * repository: a document committed under tasks/ or a comment in a source file
 * is published the moment it is pushed, and a frozen-benchmark gold answer
 * inside one publishes the exam. The served-text gates (static-leak-check-*,
 * the seeds) never looked at documents, so this checks any file, paragraph by
 * paragraph, against the real frozen protected set, with a spiked negative
 * control so a PASS means "checked", not "checker asleep". Written 2026-10-08
 * after the v4.5 bank's drafted notes were found to carry 58 hits.
 *
 * Run before committing any document that quotes Igala:
 *   npx tsx --env-file=.env.local scripts/leak-check-files.ts <file> [file ...]
 * Exit code 1 on any hit, a dead control, or an allow-list entry whose count
 * no longer matches its file.
 *
 * Since 2026-10-15 each file is read with backslash escapes neutralised (a
 * newline escape used to glue the next word onto an "n" and hide it), and
 * the reviewed allow-list in scripts/leak-check-allow.ts masks the few words
 * that must stay as written (see src/lib/eval/leak-allow.ts). The whole of
 * web/src passes:
 *   git ls-files 'src/**' | grep -E '\.(ts|tsx|md|mdx|json)$' | tr '\n' '\0' \
 *     | xargs -0 npx tsx --env-file=.env.local scripts/leak-check-files.ts
 */
async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) throw new Error("usage: leak-check-files.ts <file> [file ...]");
  const prisma = new PrismaClient();
  try {
    const frozen = await prisma.prompt.findMany({
      where: { isHoldout: true, language: "igala" },
      select: { id: true, promptId: true },
    });
    const slugOf = new Map(frozen.map((f) => [f.id, f.promptId]));
    const golds = await prisma.coldAuthorAnswer.findMany({
      where: { promptId: { in: frozen.map((f) => f.id) }, isDemo: false, consentBenchmark: true },
      select: { promptId: true, answerText: true },
    });
    if (golds.length === 0) throw new Error("protected set is empty - wrong database?");
    const protectedSet = buildProtectedSet(
      golds.map((g) => ({ promptId: slugOf.get(g.promptId) ?? g.promptId, answerText: g.answerText })),
    );
    const spike = checkStatic([{ where: "control", text: `x ${golds[0].answerText} y` }], protectedSet);
    if (spike.pass) throw new Error("NEGATIVE CONTROL DEAD: a spiked frozen gold was not flagged");
    console.log(
      `protected strings: ${protectedSet.length} (negative control live); allow-list: ${LEAK_ALLOW.length} entries`,
    );
    const webRoot = resolve(__dirname, "..");
    let failed = false;
    for (const f of files) {
      const rel = relative(webRoot, resolve(f)).split(sep).join("/");
      const allowed = applyLeakAllowList(
        rel,
        neutraliseEscapes(readFileSync(f, "utf8")),
        LEAK_ALLOW,
      );
      for (const p of allowed.problems) console.log(`FAIL ${p}`);
      if (allowed.problems.length > 0) failed = true;
      const paras = allowed.text
        .split(/\n\s*\n/)
        .map((text, i) => ({ where: `${f}#para${i}`, text }));
      const report = checkStatic(paras, protectedSet);
      console.log(`${report.pass ? "PASS" : "FAIL"} ${f}: ${report.hitCount} hit(s)`);
      for (const h of report.hits) console.log(`  [${h.tier}] frozen ${h.promptId} in ${h.where}`);
      // Point at the words to fix: line number and the text as it stands in
      // the file (nothing the file does not already contain). Tokens split on
      // anything that is not a letter, mark or digit, as the guard does.
      if (!report.pass) {
        const src = allowed.text;
        const toks = [...src.matchAll(/[\p{L}\p{M}\p{N}]+/gu)].map((m) => ({
          s: m.index!,
          e: m.index! + m[0].length,
          f: fullFold(m[0]),
        }));
        const hitIds = new Set(report.hits.map((h) => h.promptId));
        for (const p of protectedSet.filter((x) => hitIds.has(x.promptId))) {
          const want = p.full.split(/\s+/).filter(Boolean);
          for (let i = 0; i + want.length <= toks.length; i++) {
            if (want.every((w, k) => toks[i + k].f === w)) {
              const at = toks[i].s;
              const line = src.slice(0, at).split("\n").length;
              console.log(`    line ${line}: "${src.slice(at, toks[i + want.length - 1].e)}"`);
            }
          }
        }
      }
      if (!report.pass) failed = true;
    }
    if (failed) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
