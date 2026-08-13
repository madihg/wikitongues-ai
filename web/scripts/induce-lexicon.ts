import { PrismaClient, Prisma } from "@prisma/client";
import { fullFold } from "../src/lib/eval/normalize";
import { promptContentWords } from "../src/lib/lexicon-parse";
import {
  induceLexicon,
  looksEnglish,
  MIN_COOC,
  MIN_SCORE,
  type InducedEntry,
} from "../src/lib/lexicon-induce";

/**
 * Induce an Igala-English lexicon from the ParallelPair Bible corpus and
 * insert it as LexEntry rows next to the curated lexicon.
 *
 * WHY
 * ---
 * Agnes's live test (2026-08-11): the models have Igala vocabulary but not
 * syntax, and even the vocabulary retrieval is capped by what three wordlists
 * cover (see the coverage baseline build-lexicon-curated.ts prints). The
 * ~31k-verse parallel corpus holds far more word knowledge than any wordlist;
 * verse-level co-occurrence alignment (src/lib/lexicon-induce.ts, unit
 * tested) mines it into one-row-per-(headword, gloss) entries the retrieval
 * layer can query as precisely as the curated ones.
 *
 * GUARDRAILS
 * ----------
 *   - confidence = min(0.7, score): induced entries must never outrank the
 *     curated Wiktionary (1.0) and chikhapo (0.8) tiers. They may tie with
 *     or pass Koelle (0.6), which is honest - Koelle is 1854 field
 *     attestation, not modern truth, and a strong alignment signal from a
 *     modern text deserves at least that much trust.
 *   - An induced entry whose English word a curated (confidence >= 0.8)
 *     entry already covers with a DIFFERENT headword is skipped unless its
 *     score >= 0.6; those conflicts are printed in full, because a
 *     high-score disagreement is exactly where a curated error would show.
 *   - Idempotent: (headword, gloss, source) unique + skipDuplicates.
 *
 * Run:  npx tsx --env-file=.env.local scripts/induce-lexicon.ts
 */

const prisma = new PrismaClient();

/**
 * Provenance on every row. Same permission trail as the corpus rows
 * themselves (prisma/ingest-bible-parallel.ts): induced entries are derived
 * data, so the BSN constraint travels with them.
 */
const SOURCE =
  "Alignment-induced from BSN IGL70 parallel corpus " +
  "(scripts/induce-lexicon.ts). Permission granted via Wikitongues outreach " +
  "(Lydia Wiernik), recorded by Halim Madi 2026-08-12. Written terms held " +
  "by Wikitongues - confirm before any public data release.";

/** Marker for telling induced rows apart from curated ones in stats below. */
const INDUCED_PREFIX = "Alignment-induced";

/** Curated entries at or above this confidence gate conflicting inductions. */
const CURATED_CONFIDENCE = 0.8;
/** A conflicting induction needs at least this score to override the skip. */
const CONFLICT_OVERRIDE_SCORE = 0.6;

/** Induced confidence cap - curated Wiktionary/chikhapo stay above 0.7. */
const CONFIDENCE_CAP = 0.7;

const INSERT_BATCH = 1000;
/** Size of the eyeball-QA sample printed at the end. */
const QA_SAMPLE = 30;

/** Deterministic PRNG so the QA sample is reproducible across runs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Conflict {
  entry: InducedEntry;
  curatedHeadwords: string[];
  kept: boolean;
}

/**
 * Coverage over the frozen prompts, same metric as
 * prisma/build-lexicon-curated.ts prints: share of distinct content words an
 * exact glossFolded lookup can answer. Recomputed here (not imported) only
 * because that file is a script, not a library; the method is identical -
 * same promptContentWords, same exact-match rule.
 */
async function coverage(
  glossKeys: Set<string>,
): Promise<{ hits: string[]; misses: string[]; total: number }> {
  const prompts = await prisma.prompt.findMany({
    where: { isHoldout: true },
    select: { text: true },
  });
  const contentWords = new Set<string>();
  for (const p of prompts)
    for (const w of promptContentWords(p.text)) contentWords.add(w);
  return {
    hits: [...contentWords].filter((w) => glossKeys.has(w)).sort(),
    misses: [...contentWords].filter((w) => !glossKeys.has(w)).sort(),
    total: contentWords.size,
  };
}

async function main() {
  console.log("Inducing lexicon from the ParallelPair corpus\n");

  // ─── induction ────────────────────────────────────────────────────────────
  const corpus = await prisma.parallelPair.findMany({
    select: { english: true, igala: true },
    orderBy: { ref: "asc" },
  });
  console.log(`${corpus.length} parallel pairs loaded`);

  const { considered, induced, englishDf } = induceLexicon(corpus);
  console.log(
    `${considered} co-occurring pair types considered ` +
      `(both sides in >= ${MIN_COOC} verses)`,
  );
  console.log(
    `${induced.length} kept (score >= ${MIN_SCORE} and c(e,i) >= ${MIN_COOC})`,
  );

  // ─── conflict gate against the curated lexicon ────────────────────────────
  // Compare headwords through fullFold: an induced entry that only differs
  // from the curated one in tone marking is the SAME word (the corpus
  // under-marks tone), not a disagreement worth skipping or reporting.
  const curated = await prisma.lexEntry.findMany({
    where: {
      confidence: { gte: CURATED_CONFIDENCE },
      NOT: { source: { startsWith: INDUCED_PREFIX } },
    },
    select: { headword: true, glossFolded: true },
  });
  const curatedByGloss = new Map<string, Set<string>>();
  for (const c of curated) {
    const set = curatedByGloss.get(c.glossFolded) ?? new Set();
    set.add(fullFold(c.headword));
    curatedByGloss.set(c.glossFolded, set);
  }

  const conflicts: Conflict[] = [];
  const toInsert: InducedEntry[] = [];
  for (const entry of induced) {
    // entry.english is already fullFolded - it lives in glossFolded space.
    const curatedHeads = curatedByGloss.get(entry.english);
    if (curatedHeads && !curatedHeads.has(fullFold(entry.headword))) {
      const kept = entry.score >= CONFLICT_OVERRIDE_SCORE;
      conflicts.push({
        entry,
        curatedHeadwords: [...curatedHeads].sort(),
        kept,
      });
      if (!kept) continue;
    }
    toInsert.push(entry);
  }

  console.log(
    `\n${conflicts.length} conflicts with curated (confidence >= ` +
      `${CURATED_CONFIDENCE}) entries - gold dust for curated-error hunting:`,
  );
  for (const c of conflicts) {
    console.log(
      `  [${c.kept ? "KEPT " : "skip "}] ${c.entry.english}: induced ` +
        `${c.entry.headword} (score ${c.entry.score.toFixed(3)}, ` +
        `${c.entry.cEI}/${c.entry.cE}/${c.entry.cI}) vs curated ` +
        c.curatedHeadwords.join(", "),
    );
  }

  // ─── insert ───────────────────────────────────────────────────────────────
  const rows: Prisma.LexEntryCreateManyInput[] = toInsert.map((e) => ({
    headword: e.headword,
    headwordFolded: fullFold(e.headword),
    // The folded English token is both gloss and key: alignment works on
    // folded tokens, so there is no richer "original" gloss to preserve.
    gloss: e.english,
    glossFolded: e.english,
    pos: null,
    source: SOURCE,
    confidence: Math.min(CONFIDENCE_CAP, e.score),
    exampleIg: e.exampleIg,
    exampleEn: e.exampleEn,
  }));
  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const res = await prisma.lexEntry.createMany({
      data: rows.slice(i, i + INSERT_BATCH),
      skipDuplicates: true,
    });
    inserted += res.count;
  }
  console.log(
    `\nInserted ${inserted} of ${rows.length} rows ` +
      `(${rows.length - inserted} already present).`,
  );

  // ─── coverage before/after ────────────────────────────────────────────────
  // Both sets read back from the DB (not from this run's memory) so the
  // numbers describe what retrieval will actually see, and so a re-run
  // reports the same before/after split instead of before == after.
  const all = await prisma.lexEntry.findMany({
    select: { glossFolded: true, source: true },
  });
  const curatedKeys = new Set(
    all
      .filter((e) => !e.source.startsWith(INDUCED_PREFIX))
      .map((e) => e.glossFolded),
  );
  const allKeys = new Set(all.map((e) => e.glossFolded));

  const before = await coverage(curatedKeys);
  const after = await coverage(allKeys);
  const gained = after.hits.filter((w) => !before.hits.includes(w));

  console.log(`\nFrozen-prompt content-word coverage (exact glossFolded):`);
  console.log(
    `  before induction  ${before.hits.length}/${before.total} = ` +
      (before.hits.length / before.total).toFixed(3),
  );
  console.log(
    `  after induction   ${after.hits.length}/${after.total} = ` +
      (after.hits.length / after.total).toFixed(3),
  );
  console.log(`  newly covered:    ${gained.join(", ") || "(none)"}`);
  console.log(`  still missing:    ${after.misses.join(", ") || "(none)"}`);
  const pct = (after.hits.length / after.total) * 100;
  // DiPMT (Ghazvininejad et al. 2023): dictionary-in-prompt starts paying off
  // once 5-20% of content words get dictionary hits.
  const verdict =
    pct < 5
      ? "below the 5-20% DiPMT band - dictionaries not yet expected to help"
      : pct <= 20
        ? "inside the 5-20% DiPMT band where dictionaries start helping"
        : "above the 5-20% DiPMT band - well past the help threshold";
  console.log(`  DiPMT position:   ${pct.toFixed(1)}% - ${verdict}`);

  // ─── eyeball QA sample ────────────────────────────────────────────────────
  // Seeded shuffle-prefix over the induced list: reproducible, and sampling
  // from ALL induced entries (not just this run's inserts) keeps the sample
  // meaningful on idempotent re-runs.
  const rand = mulberry32(42);
  const idx = Array.from({ length: induced.length }, (_, i) => i);
  const take = Math.min(QA_SAMPLE, idx.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rand() * (idx.length - i));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  console.log(`\n${take} random induced entries for eyeball QA (seed 42):`);
  for (const i of idx.slice(0, take).sort((a, b) => a - b)) {
    const e = induced[i];
    const flag = looksEnglish(e.headword, e.english, englishDf)
      ? "  << LOOKS ENGLISH"
      : "";
    console.log(
      `  ${e.headword} = ${e.english}  (score ${e.score.toFixed(3)}, ` +
        `c(e,i)=${e.cEI}, c(e)=${e.cE}, c(i)=${e.cI})${flag}`,
    );
    console.log(`     EN ${e.exampleEn.slice(0, 90)}`);
    console.log(`     IG ${e.exampleIg.slice(0, 90)}`);
  }
}

main()
  .catch((e) => {
    // Surface Prisma's structured error codes when present, same as
    // prisma/ingest-bible-parallel.ts.
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      console.error(`Prisma ${e.code}:`, e.message);
    } else {
      console.error(e);
    }
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
