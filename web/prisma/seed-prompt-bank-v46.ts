/**
 * Seed the v4.6 PROMPT BANK: 200 text questions built on the gaps still
 * measurable in the v4.4 and v4.5 answers, and a 120 prompt speech queue
 * chosen for sound coverage. Authored 2026-11-13.
 *
 * WHY NOW
 * -------
 * The queue is dry again. On Nov 13 the pool could serve 299 prompts; the
 * speaker who records speech had 0 left and the most active speaker had 3. The relief is new
 * questions, and the ones worth a speaker's ten minutes are those that make
 * a measured failure visible.
 *
 * WHAT WAS MEASURED (production, read on 2026-11-13, v4.4 and v4.5 only)
 *   484 judged sides since Oct 8, 136 corrections holding 352 changed spans,
 *   1,758 train answers, the tone restoration test, 113 recorded clips.
 *   1  sentence construction  52% of changed spans rewrite two or more words;
 *                             the grammar tag is on 17.6% of judged sides.
 *   2  tone marks             restoration is wrong on 23.5% of letters; 7% of
 *                             train answers are densely toned.
 *   3  fixed formulas         43% of judged sides on the formula prompts are
 *                             "both inadequate".
 *   4  spelling, word choice  34% of changed spans change one word, one dot,
 *                             one nasal letter or one joint.
 *   5  word strength          raised on the Nov 10 call; the data cannot size
 *                             it, so the bank makes it countable.
 *   then English kept in Igala sentences, homographs, numbers, Yoruba and
 *   Igbo words (nearly closed), names, dialect, and two buckets the current
 *   model has hardly been judged on.
 * tasks/model-gap-analysis-2026-11.md has the analysis and
 * tasks/prompt-bank-v46-evidence-2026-11.md the evidence per family.
 *
 * THE SPEECH SET
 *   The Record queue serves a speaker her own unrecorded answers first, then
 *   any train prompt she has not answered, in promptId order. The 63 prompts
 *   recorded so far hold 6.5 minutes of Igala, 18 clips under three words and
 *   5 texts with a tone mark. The 120 speech prompts here are sentences of
 *   three to twenty words built on words whose toned forms are published, so
 *   the expected sound cells are known before a clip exists. Each carries the
 *   English to record after the Igala: the sentence itself, not a gloss.
 *   They are seeded under their own provenance so their pool outputs can be
 *   filled, or left out, apart from the text set.
 *
 * SAFETY: this is a PRODUCTION database with live annotators.
 *  - CREATE-ONLY. Every row is upserted by promptId with `update: {}`.
 *  - split "train", isHoldout false.
 *  - Fresh promptId namespace ig_v46_<family>_NNN, collision-checked.
 *  - Near-duplicates are refused: Jaccard over content words against every
 *    existing prompt (0.55), against the frozen prompts (0.45) and inside the
 *    bank. The members of a declared minimal pair are exempt from the inside
 *    check only.
 *  - Scope A on the prompt text against the real frozen protected set, with a
 *    spiked negative control.
 *  - `--check` runs every guard and writes nothing.
 *
 * Check, writing nothing:
 *   npx tsx --env-file=.env.local prisma/seed-prompt-bank-v46.ts --check
 * Seed everything, in serving order (the text and speech sets mixed):
 *   npx tsx --env-file=.env.local prisma/seed-prompt-bank-v46.ts
 * Seed one set (this loses the mix: the other set then lands after it):
 *   npx tsx --env-file=.env.local prisma/seed-prompt-bank-v46.ts --only text
 *   npx tsx --env-file=.env.local prisma/seed-prompt-bank-v46.ts --only speech
 */
import { PrismaClient } from "@prisma/client";
import { buildProtectedSet, checkStatic } from "../src/lib/eval/leak-guard";
import {
  V46_PROMPTS,
  V46_PROVENANCE,
  V46_SPEECH_PROVENANCE,
  findNearDuplicates,
  isSpeechPrompt,
  provenanceFor,
  speechYield,
  v46ServingOrder,
} from "../src/lib/prompt-bank-v46";

const prisma = new PrismaClient();

function parseArgs(argv: string[]): { check: boolean; only: "text" | "speech" | null } {
  const check = argv.includes("--check");
  const at = argv.indexOf("--only");
  const only = at >= 0 ? argv[at + 1] : null;
  if (at >= 0 && only !== "text" && only !== "speech") {
    throw new Error("--only takes text or speech");
  }
  const known = new Set(["--check", "--only", "text", "speech"]);
  const stray = argv.filter((a) => !known.has(a));
  if (stray.length > 0) throw new Error(`unknown argument: ${stray.join(" ")}`);
  return { check, only: (only as "text" | "speech" | null) ?? null };
}

async function main() {
  const { check, only } = parseArgs(process.argv.slice(2));
  // Rows are written in serving order (v46ServingOrder): everyday families
  // first, idioms and cultural values last, speech spread through the text.
  // Seeding one set alone loses the mix, so the full run is the default.
  const selected = v46ServingOrder().filter((p) =>
    only === null ? true : only === "speech" ? isSpeechPrompt(p) : !isSpeechPrompt(p),
  );
  const OURS = new Set([V46_PROVENANCE, V46_SPEECH_PROVENANCE]);

  const ids = new Set(V46_PROMPTS.map((p) => p.promptId));
  if (ids.size !== V46_PROMPTS.length) {
    throw new Error("duplicate promptId in the bank: refusing to seed");
  }
  for (const p of V46_PROMPTS) {
    if (!/^ig_v46_[a-z]{3,6}_\d{3}$/.test(p.promptId))
      throw new Error(`promptId outside the v46 namespace: ${p.promptId}`);
    if (p.text.length < 25 || p.text.length > 420)
      throw new Error(`${p.promptId}: text length ${p.text.length} outside 25-420`);
    if (/[–—]/.test(p.text + (p.expectedCulturalContext ?? "")))
      throw new Error(`${p.promptId}: dash`);
  }
  const clashes = await prisma.prompt.findMany({
    where: { promptId: { in: [...ids] } },
    select: { promptId: true, provenance: true },
  });
  const foreign = clashes.filter((c) => !OURS.has(c.provenance ?? ""));
  if (foreign.length > 0) {
    throw new Error(
      `promptId namespace collision with rows this script did not write: ${foreign
        .map((c) => c.promptId)
        .join(", ")}`,
    );
  }

  // Near-duplicates against EVERY existing prompt, frozen ones strictest.
  // The whole bank is checked even when one set is seeded, so the two sets
  // can never restate each other.
  const existing = await prisma.prompt.findMany({
    where: { language: "igala" },
    select: { promptId: true, text: true, isHoldout: true },
  });
  const near = findNearDuplicates(V46_PROMPTS, existing);
  if (near.dupes.length > 0) {
    for (const d of near.dupes) {
      console.error(`  near-duplicate: ${d.a} ~ ${d.b} (${d.score.toFixed(2)}) [${d.against}]`);
    }
    throw new Error(`${near.dupes.length} near-duplicate(s): refusing to seed`);
  }
  console.log(
    `near-duplicates: none over ${existing.length} existing prompts (max Jaccard ${near.maxTrain.toFixed(2)} vs train, ${near.maxFrozen.toFixed(2)} vs frozen, ${near.maxInternal.toFixed(2)} inside the bank)`,
  );

  // Scope A on the prompt TEXT and the note shown beside it.
  const frozen = await prisma.prompt.findMany({
    where: { isHoldout: true, language: "igala" },
    select: { id: true, promptId: true },
  });
  const slugOf = new Map(frozen.map((f) => [f.id, f.promptId]));
  const golds = await prisma.coldAuthorAnswer.findMany({
    where: {
      promptId: { in: frozen.map((f) => f.id) },
      isDemo: false,
      consentBenchmark: true,
    },
    select: { promptId: true, answerText: true },
  });
  if (golds.length === 0) {
    throw new Error("protected set is empty: wrong database? refusing to seed");
  }
  const protectedSet = buildProtectedSet(
    golds.map((g) => ({
      promptId: slugOf.get(g.promptId) ?? g.promptId,
      answerText: g.answerText,
    })),
  );
  const spike = checkStatic(
    [{ where: "negative control", text: `x ${golds[0].answerText} y` }],
    protectedSet,
  );
  if (spike.pass) {
    throw new Error(
      "NEGATIVE CONTROL DEAD: a spiked frozen gold was not flagged: refusing to seed",
    );
  }
  const report = checkStatic(
    V46_PROMPTS.map((p) => ({
      where: p.promptId,
      text: `${p.text}\n${p.expectedCulturalContext ?? ""}`,
    })),
    protectedSet,
  );
  if (!report.pass) {
    for (const h of report.hits) {
      console.error(`  [${h.tier}] frozen prompt ${h.promptId} appears in ${h.where}`);
    }
    throw new Error(`SCOPE A: ${report.hitCount} hit(s): refusing to seed`);
  }
  console.log(
    `Scope A: PASS over ${protectedSet.length} protected strings (negative control live).`,
  );

  const byFamily: Record<string, number> = {};
  const byGap: Record<string, number> = {};
  const byBucket: Record<string, number> = {};
  for (const p of selected) {
    byFamily[p.family] = (byFamily[p.family] ?? 0) + 1;
    byGap[p.gap] = (byGap[p.gap] ?? 0) + 1;
    byBucket[p.bucket] = (byBucket[p.bucket] ?? 0) + 1;
  }
  const y = speechYield(selected);
  console.log(`selected: ${selected.length} prompts${only ? ` (${only} only)` : ""}`);
  console.log("by gap:", byGap);
  console.log("by bucket:", byBucket);
  console.log("by family:", byFamily);
  console.log(
    `speech set: ${y.prompts} prompts, ${y.clips} clips, about ${y.igalaMinutes} minutes of Igala and ${y.totalMinutes} minutes in all (estimated from the measured pace)`,
  );

  if (check) {
    const already = clashes.length;
    console.log(
      `\n--check: every guard passed, nothing written. ${already} of ${V46_PROMPTS.length} rows already exist.`,
    );
    return;
  }

  const owner = await prisma.user.findUnique({
    where: { email: "madihalim@gmail.com" },
    select: { id: true },
  });
  const createdById = owner?.id ?? null;

  let created = 0;
  for (const p of selected) {
    const before = await prisma.prompt.findUnique({
      where: { promptId: p.promptId },
      select: { promptId: true },
    });
    await prisma.prompt.upsert({
      where: { promptId: p.promptId },
      update: {}, // never mutate an existing row
      create: {
        promptId: p.promptId,
        bucket: p.bucket,
        language: "igala",
        text: p.text,
        targetCulture: "igala",
        expectedCulturalContext: p.expectedCulturalContext,
        difficultyLevel: p.difficultyLevel,
        split: "train",
        isHoldout: false,
        provenance: provenanceFor(p),
        createdById,
      },
    });
    if (!before) created++;
  }
  console.log(`v4.6 bank: ${selected.length} prompts selected, ${created} newly created.`);

  const fill = (slug: string, prov: string) =>
    `  npx tsx --env-file=.env.local scripts/train-queue-fill.ts generate ${slug} --provenance ${prov}\n`;
  console.log(
    "\nNEXT: a text prompt is NOT servable in the annotation queue until two pooled\n" +
      "arms that form an allowed pair have an output on it. One arm per run, each\n" +
      "run capped at $15, so a 200 prompt batch may need a second run per arm:\n" +
      fill("gemini-3-1-pro-rag-v4-5", V46_PROVENANCE) +
      fill("gemini-3-1-pro-rag-v4-4", V46_PROVENANCE) +
      fill("gemini-3-1-pro", V46_PROVENANCE) +
      "then confirm the queue serves them:\n" +
      "  npx tsx --env-file=.env.local scripts/check-queue-servable.ts\n" +
      "The speech set needs no model output to appear in the Record queue. Fill it\n" +
      "only if it should also be judged as text:\n" +
      fill("gemini-3-1-pro-rag-v4-5", V46_SPEECH_PROVENANCE) +
      fill("gemini-3-1-pro-rag-v4-4", V46_SPEECH_PROVENANCE),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
