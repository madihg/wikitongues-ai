/**
 * Seed the v4.5 PROMPT BANK - the questions aimed at where speakers still
 * judge the model's Igala illegible, authored 2026-10-08.
 *
 * WHY THESE PROMPTS
 * -----------------
 * The queue ran dry again. By Oct 8 the speakers had judged every pair the
 * pool could draw (Agnes had 0 prompts left; pooling v4.4 that day gave her
 * 18, because an annotator sees each PROMPT once and a new arm only reopens
 * the prompts a speaker has not judged). The relief is new questions, and
 * the only questions worth their judgment time are the ones that make a
 * measured failure visible and make the speaker's answer teach us a rule.
 *
 * So this bank was built from the evidence, not from a syllabus. Nine
 * analyses read every one of the 637 judgments between the two pooled
 * Gemini arms (v3 vs bare since Sep 13: 121 wins, 87 losses, 132 ties, 49
 * "both inadequate"), all 213 speaker corrections as token diffs, the 1,446
 * speaker-authored answers, the 249 unjudged v4.4 answers against the gold on
 * the same prompts, and the rules Salem Ejeba and Lydia Wiernik asked for in
 * their Sep 25 write-up (tasks/salem-lydia-writeup-2026-09-25-inventory.md).
 * tasks/prompt-bank-v45-evidence-2026-10-08.md holds the findings this header
 * summarises.
 *
 * WHAT THE SPEAKERS STILL REJECT (the failures these prompts probe)
 *   ki-family      a ki-form with no job (v4.4: a standalone ki in 45% of
 *                  answers, 4.4 per 100 words against 3.5 in gold); ki where ku
 *                  belongs before plural ma (11 corrections, 4 annotators);
 *                  ki where kẹ joins two verbs; "said that" built as ka kakini
 *                  or a bare clause where speakers write kakini.
 *   tone           v4.4 tones 69% of answers while 72% of gold carries no mark;
 *                  35 corrections strip marks, 11 add them. The tone_marks tag
 *                  mostly means "wrong word or wrong dotted vowel".
 *   contraction    speakers CONTRACT verb-plus-object idioms (kọ'la, gbọ'la,
 *                  gw'[hand]: 28 corrections) and expand only wrong joints; the
 *                  write-up asks for expanded forms. The bank collects both
 *                  forms of one sentence from the same speaker.
 *   formulas       good night, welcome, sorry, blessings and condolence are
 *                  fixed phrases the model composes instead (41 judgments; 99
 *                  "both inadequate" in the authenticity bucket were mostly
 *                  this); Nnọ (Igbo) and Agó o (Yoruba) at the door.
 *   loan words     Yoruba ra/[hand]/ọja/má still leak from the bare arm; the
 *                  retrieval arm's own non-words (é- prefix in 28 of 31
 *                  corrections of that kind, ádṣa, kwotejugede, Ígáláà in 46 of
 *                  249 v4.4 answers) survive the ban list; modern loans split
 *                  the speakers (ẹkẹnọmiks vs economics).
 *   agreement      du/kó with a plural second verb (tẹ/jọ), gwugwu/jọ for sit,
 *                  the equative tag i che / ma che, plural prefixes ami/abo/abi,
 *                  clitic subjects (ẹ, not wẹ; i, not u).
 *   aspect         "has finished V-ing" = V kpa mẹ in all seven gold answers,
 *                  never in the model; future na with any subject; fused
 *                  incompletive a-; ya for "now", never oñ.
 *   numbers        11 to 19 without mẹ-, 70 as ẹtẹẹgwa or three twenties,
 *                  ñyọ as the only linker, money counted in units at the market.
 *   dialect        every area attribution the model invented was rejected
 *                  (33 "both inadequate", 0 explanations); no speaker has ever
 *                  written an Ogwugwu r-form; yes/no has three attested pairs
 *                  and the model has none of them.
 *   names          Idah keeps its h, Ankpa its n, banki Access its order,
 *                  Grace is not translated, English is enẹfu.
 *
 * WHAT A PROMPT LOOKS LIKE HERE
 *   One concrete utterance in a stated scene, addressee and number named, one
 *   target construction, the number or the name given in English so the form
 *   is checkable. Paired prompts (one child / all the children; as texted /
 *   with every tone mark; as spoken / as a learner should see it) make the
 *   rule the only variable. Never "note any variation between areas", never
 *   "say whether you would change the spelling", never an English explanation
 *   beside the Igala, never a four-turn dialogue: those shapes produced the
 *   ties and the "both inadequate" verdicts that taught nothing.
 *
 * THE FAMILIES
 *   key   (n) what it probes (buckets: grammar_tone 39, lexicon_disambig 19, orthography 14, dialectal_fidelity 12, authenticity 10, register_honorifics 8, idioms_metaphor 4, cultural_values 2)
 *   comp  (10) A ki-form emitted with no job or in the wrong shape, and the write-up's complementiser against relativiser contrast that gold cannot show because...
 *   vari  ( 8) Fabricated area attributions and mixed varieties, invisible to the arena because no gold names a variety
 *   erel  ( 4) The Ogwugwu r for central l, which the arena has never collected: the gold dialect field says ogugu on 2 of 1,446 rows and no speaker has produced...
 *   loan  ( 6) Loanword policy running against the speakers
 *   tone  ( 8) Partial tone marking and the spelling Ígáláà
 *   expd  ( 6) Contractions the community does not write, and the write-up's expanded form that nobody has asked for
 *   concd ( 7) Restricted number agreement, never tested as a pair
 *   negq  ( 6) The negator and the yes-no particle
 *   pron  ( 6) Pronoun shape, person and addressee number
 *   aspec ( 5) Tense and aspect frames the speakers converge on and v4.4 lacks
 *   formu (10) Fixed speech acts composed instead of known, the largest both_inadequate block in the arena: 24 of 29 judgments on ig_bank_auth_002, 004, 008, 011...
 *   regis ( 6) Register weight misplaced, the write-up's 'words too strong or too childish for the context'
 *   money ( 6) Prices, counting and contested numerals
 *   words ( 7) Word-level items the speakers corrected with near-unanimity that v4.4 still misses, several in repaired rows
 *   locat ( 4) Locative and determiner slots the rule names but the model still misses in new sentences
 *   dirct ( 3) Cardinal directions, where the speakers run two systems and the model invents
 *   provb ( 4) Proverbs and fixed texts coined on the spot and attributed to the Igala
 *   expos ( 2) Template expository prose
 *
 * SAFETY - this is a PRODUCTION database with live annotators:
 *  - CREATE-ONLY. Every row is upserted by promptId with `update: {}`, so a
 *    re-run never mutates or deletes an existing row.
 *  - split "train", isHoldout false. Held-out prompts must be
 *    community-authored; nothing here is eligible and nothing here claims to be.
 *  - Fresh promptId namespace ig_v45_<family>_NNN, collision-checked against
 *    every existing namespace.
 *  - Near-duplicates are refused at seed time: Jaccard over content words
 *    against every existing prompt (0.55) and against the frozen prompts
 *    (0.45), and between the new prompts themselves.
 *  - Scope A on the prompt text against the real frozen protected set, with a
 *    spiked negative control.
 *
 * THE SOURCING CONTRACT applies to prompt text too: no prompt asserts an
 * Igala form we have not verified. Every Igala token a prompt quotes names its
 * source on the row (igalaSources: the write-up, a grammar row, or a speaker's
 * own answer on a TRAIN prompt). Where the answer is contested (yes and no,
 * the loan spelling, the variety) the prompt ASKS, and expectedCulturalContext
 * says plainly that we hold no rule there.
 *
 * Run with:  npx tsx --env-file=.env.local prisma/seed-prompt-bank-v45.ts
 */
import { PrismaClient } from "@prisma/client";
import { buildProtectedSet, checkStatic } from "../src/lib/eval/leak-guard";
import {
  V45_PROMPTS,
  V45_PROVENANCE as PROVENANCE,
  contentWords,
  jaccard,
} from "../src/lib/prompt-bank-v45";

const prisma = new PrismaClient();

async function main() {
  const owner = await prisma.user.findUnique({
    where: { email: "madihalim@gmail.com" },
    select: { id: true },
  });
  const createdById = owner?.id ?? null;

  const ids = new Set(V45_PROMPTS.map((p) => p.promptId));
  if (ids.size !== V45_PROMPTS.length) {
    throw new Error("duplicate promptId in the bank - refusing to seed");
  }
  for (const p of V45_PROMPTS) {
    if (!/^ig_v45_[a-z]{3,6}_\d{3}$/.test(p.promptId))
      throw new Error(`promptId outside the v45 namespace: ${p.promptId}`);
    if (p.text.length < 25 || p.text.length > 420)
      throw new Error(`${p.promptId}: text length ${p.text.length} outside 25-420`);
    if (/—/.test(p.text + (p.expectedCulturalContext ?? "")))
      throw new Error(`${p.promptId}: em dash`);
  }
  const clashes = await prisma.prompt.findMany({
    where: { promptId: { in: [...ids] } },
    select: { promptId: true, provenance: true },
  });
  const foreign = clashes.filter((c) => c.provenance !== PROVENANCE);
  if (foreign.length > 0) {
    throw new Error(
      `promptId namespace collision with rows this script did not write: ${foreign
        .map((c) => c.promptId)
        .join(", ")}`,
    );
  }

  // ── Near-duplicates against EVERY existing prompt, frozen ones strictest ──
  // A new train prompt that restates a frozen one would hand the model a
  // rehearsal of the exam; a restated train prompt would double its weight in
  // the queue. Jaccard over content words: 0.55 for train, 0.45 for frozen.
  const existing = await prisma.prompt.findMany({
    where: { language: "igala" },
    select: { promptId: true, text: true, isHoldout: true },
  });
  const ex = existing.map((e) => ({ ...e, words: contentWords(e.text) }));
  const nw = V45_PROMPTS.map((p) => ({ id: p.promptId, words: contentWords(p.text) }));
  let maxTrain = 0;
  let maxFrozen = 0;
  const dupes: string[] = [];
  for (const n of nw) {
    for (const e of ex) {
      if (e.promptId === n.id) continue; // a rerun sees its own rows
      const j = jaccard(n.words, e.words);
      if (e.isHoldout) {
        maxFrozen = Math.max(maxFrozen, j);
        if (j >= 0.45) dupes.push(`${n.id} ~ FROZEN ${e.promptId} (${j.toFixed(2)})`);
      } else {
        maxTrain = Math.max(maxTrain, j);
        if (j >= 0.55) dupes.push(`${n.id} ~ ${e.promptId} (${j.toFixed(2)})`);
      }
    }
    for (const m of nw) {
      if (m.id <= n.id) continue;
      const j = jaccard(n.words, m.words);
      if (j >= 0.55) dupes.push(`${n.id} ~ ${m.id} (${j.toFixed(2)}) [internal]`);
    }
  }
  if (dupes.length > 0) {
    for (const d of dupes) console.error("  near-duplicate: " + d);
    throw new Error(`${dupes.length} near-duplicate(s) - refusing to seed`);
  }
  console.log(
    `near-duplicates: none (max Jaccard ${maxTrain.toFixed(2)} vs train, ${maxFrozen.toFixed(2)} vs frozen)`,
  );

  // ── Scope A on the prompt TEXT ──────────────────────────────────────────
  // A prompt is served to the very annotators whose independent answers the
  // frozen benchmark depends on. A prompt that quoted a frozen gold answer
  // would hand them the answer, so the bank is checked against the real
  // protected set before a single row is written, with a spiked negative
  // control so a PASS means "checked", not "checker asleep".
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
    throw new Error("protected set is empty - wrong database? refusing to seed");
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
      "NEGATIVE CONTROL DEAD: a spiked frozen gold was not flagged - refusing to seed",
    );
  }
  const report = checkStatic(
    V45_PROMPTS.map((p) => ({
      where: p.promptId,
      text: `${p.text}\n${p.expectedCulturalContext ?? ""}`,
    })),
    protectedSet,
  );
  if (!report.pass) {
    for (const h of report.hits) {
      console.error(`  [${h.tier}] frozen prompt ${h.promptId} appears in ${h.where}`);
    }
    throw new Error(`SCOPE A: ${report.hitCount} hit(s) - refusing to seed`);
  }
  console.log(
    `Scope A: PASS over ${protectedSet.length} protected strings (negative control live).`,
  );

  let created = 0;
  for (const p of V45_PROMPTS) {
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
        provenance: PROVENANCE,
        createdById,
      },
    });
    if (!before) created++;
  }

  const byFamily: Record<string, number> = {};
  for (const p of V45_PROMPTS) byFamily[p.family] = (byFamily[p.family] ?? 0) + 1;
  console.log(`v4.5 bank: ${V45_PROMPTS.length} prompts, ${created} newly created.`);
  console.log("by family:", byFamily);

  const byBucket = await prisma.prompt.groupBy({
    by: ["bucket"],
    where: { provenance: PROVENANCE },
    _count: true,
  });
  console.log("by bucket:", Object.fromEntries(byBucket.map((b) => [b.bucket, b._count])));
  console.log(
    "\nNEXT: these prompts are NOT servable until every pooled arm has an\n" +
      "output on them - a prompt with one arm can never form a pair. One arm per\n" +
      "run, so each gets the full $15 scope:\n" +
      "  npx tsx --env-file=.env.local scripts/train-queue-fill.ts generate gemini-3-1-pro --provenance " + PROVENANCE + "\n" +
      "  npx tsx --env-file=.env.local scripts/train-queue-fill.ts generate gemini-3-1-pro-rag-v3 --provenance " + PROVENANCE + "\n" +
      "  npx tsx --env-file=.env.local scripts/train-queue-fill.ts generate gemini-3-1-pro-rag-v4-4 --provenance " + PROVENANCE + "\n" +
      "then confirm the queue actually serves them:\n" +
      "  npx tsx --env-file=.env.local scripts/check-queue-servable.ts",
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
