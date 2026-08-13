import { PrismaClient, Prisma } from "@prisma/client";
import { buildLanguageIdModel, identifyLanguage } from "../src/lib/eval/langid";

/**
 * Ingest the Igala Bible as a parallel corpus (ParallelPair).
 *
 * WHAT THE TEXT IS, AND WHY WE MAY NOW USE IT
 * -------------------------------------------
 * The underlying text is the Bible Society of Nigeria's Igala Bible (IGL70).
 * The HuggingFace dataset dalaone/eng_igl_bible (~31k English-Igala verse
 * pairs, CSV) is merely the VEHICLE we obtain it through - the HF upload is an
 * unlicensed copy and grants us nothing. This corpus was previously off-limits
 * for exactly that reason. What changed is permission, not the upload:
 * Permission granted via Wikitongues outreach (Lydia Wiernik), recorded by
 * Halim Madi 2026-08-12. Written terms held by Wikitongues - confirm before
 * any public data release. This ingest is internal R&D use under that
 * permission, and every row carries the trail in its `source` column so the
 * constraint travels with the data.
 *
 * WHY A PARALLEL CORPUS AT ALL
 * ----------------------------
 * Agnes's live test (2026-08-11) was unambiguous: the models have Igala
 * vocabulary but not Igala syntax - "the first sentence is saying three
 * different things". Word lists cannot fix that. Whole aligned sentences can:
 * ~31k verse pairs is orders of magnitude more full-sentence Igala than the
 * gold corpus holds, and it is the raw material for retrieval of SENTENCE
 * exemplars (and later for alignment-induced lexicon work).
 *
 * WHAT THIS SCRIPT DOES
 * ---------------------
 *   1. Downloads the CSV from HF (discovered via the datasets API; the repo
 *      holds a single data file, cleaned_eng_igl_data.csv).
 *   2. Cleans it: NFC + trim, drop empty sides, drop rows whose "Igala" side
 *      is >80% English words (misaligned rows exist upstream), drop exact
 *      duplicate pairs. Counts are reported per rule.
 *   3. Gate before ingest: language-IDs 200 random Igala sides against the
 *      consented community gold profile and ABORTS below 60% Igala-share,
 *      because inserting 31k rows of the wrong language would poison every
 *      retrieval consumer downstream.
 *   4. Inserts via createMany(skipDuplicates), batched. `ref` is the upstream
 *      row index (the CSV has no verse-reference column) and (source, ref) is
 *      unique, so re-running creates 0 rows.
 *   5. Verifies the DB-side FTS path (generated "englishTsv" column) actually
 *      retrieves, and prints final corpus stats.
 *
 * Run:  npx tsx --env-file=.env.local prisma/ingest-bible-parallel.ts
 */

const prisma = new PrismaClient();

const HF_CSV_URL =
  "https://huggingface.co/datasets/dalaone/eng_igl_bible/resolve/main/cleaned_eng_igl_data.csv";

/**
 * Provenance carried on every row. The source-specific tail names the actual
 * rights holder (BSN) and the vehicle (the HF upload) separately, because the
 * permission covers the former and merely explains the latter.
 */
const SOURCE =
  "BSN IGL70 via HF dalaone/eng_igl_bible. Permission granted via Wikitongues " +
  "outreach (Lydia Wiernik), recorded by Halim Madi 2026-08-12. Written terms " +
  "held by Wikitongues - confirm before any public data release.";

/** Rows whose Igala side is more English than this are treated as misaligned. */
const MISALIGNED_ENGLISH_SHARE = 0.8;
/** How many random Igala sides the language-ID gate inspects. */
const LANGID_SAMPLE = 200;
/** Below this Igala-share the ingest refuses to run. */
const LANGID_MIN_SHARE = 0.6;
const INSERT_BATCH = 1000;

function log(...args: unknown[]) {
  console.log(...args);
}

// ─── CSV ────────────────────────────────────────────────────────────────────

/**
 * Minimal RFC 4180 parser. Hand-rolled rather than a new dependency because
 * the repo has no CSV library and this is the only consumer: quoted fields,
 * doubled-quote escapes, embedded commas/newlines, CRLF.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ─── cleaning helpers ───────────────────────────────────────────────────────

/** Lowercased word tokens, punctuation stripped, apostrophes kept. */
function wordTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{M}']/gu, ""))
    .filter((t) => t.length > 0);
}

const ASCII_WORD = /^[a-z']+$/;

/**
 * Share of a text's tokens that are ASCII-only AND attested on the English
 * side of the corpus. The vocabulary is derived from the dataset's own English
 * column (not a fixed stopword list) because the misaligned rows are English
 * BIBLE prose - content words like "wilderness" that no function-word list
 * holds. Genuine Igala stays far below the threshold even though its
 * orthography is mostly ASCII: only incidental collisions ("do", "a") count.
 */
function englishWordShare(text: string, englishVocab: Set<string>): number {
  const tokens = wordTokens(text);
  if (tokens.length === 0) return 0;
  const hits = tokens.filter(
    (t) => ASCII_WORD.test(t) && englishVocab.has(t),
  ).length;
  return hits / tokens.length;
}

/** Deterministic PRNG so the spot-validation sample is reproducible. */
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

/** Sample k distinct indices from [0, n) with a seeded Fisher-Yates prefix. */
function sampleIndices(n: number, k: number, seed: number): number[] {
  const rand = mulberry32(seed);
  const idx = Array.from({ length: n }, (_, i) => i);
  const take = Math.min(k, n);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rand() * (n - i));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, take);
}

interface CleanPair {
  /** Upstream CSV row index - the ref, since the CSV has no verse column. */
  ref: string;
  english: string;
  igala: string;
}

// ─── steps ──────────────────────────────────────────────────────────────────

async function download(): Promise<string[][]> {
  log(`downloading ${HF_CSV_URL}`);
  const res = await fetch(HF_CSV_URL, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    throw new Error(`HF download failed: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  const rows = parseCsv(text);
  log(`  ${rows.length} CSV rows (incl. header), ${text.length} chars`);
  return rows;
}

function clean(rows: string[][]): CleanPair[] {
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const enCol = header.indexOf("english");
  const igCol = header.indexOf("igala");
  // The first (unnamed) column is the upstream row index; it becomes `ref`.
  // Resolve columns by NAME so an upstream reorder breaks loudly, not silently.
  if (enCol === -1 || igCol === -1) {
    throw new Error(`expected 'english' and 'igala' columns, got: ${header}`);
  }
  const refCol = header.findIndex((h) => h === "");
  const data = rows.slice(1);

  // English-side vocabulary for the misalignment rule. Words seen at least
  // twice, so a single upstream typo does not become "English evidence".
  const vocabCounts = new Map<string, number>();
  for (const r of data) {
    for (const t of wordTokens(r[enCol] ?? "")) {
      if (ASCII_WORD.test(t)) vocabCounts.set(t, (vocabCounts.get(t) ?? 0) + 1);
    }
  }
  const englishVocab = new Set(
    [...vocabCounts.entries()].filter(([, n]) => n >= 2).map(([w]) => w),
  );

  let droppedEmpty = 0;
  let droppedMisaligned = 0;
  let droppedDuplicate = 0;
  const seenPairs = new Set<string>();
  const out: CleanPair[] = [];

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const english = (r[enCol] ?? "").normalize("NFC").trim();
    const igala = (r[igCol] ?? "").normalize("NFC").trim();
    const ref = refCol >= 0 && r[refCol]?.trim() ? r[refCol].trim() : String(i);

    if (english.length === 0 || igala.length === 0) {
      droppedEmpty++;
      continue;
    }
    if (englishWordShare(igala, englishVocab) > MISALIGNED_ENGLISH_SHARE) {
      droppedMisaligned++;
      continue;
    }
    // A NUL separator (\u0000) cannot occur in either trimmed side, so the key
    // is collision-free ("a b"+"c" can never collide with "a"+"b c").
    const key = `${igala}\u0000${english}`;
    if (seenPairs.has(key)) {
      droppedDuplicate++;
      continue;
    }
    seenPairs.add(key);
    out.push({ ref, english, igala });
  }

  log(
    `\nCLEANING (english vocab for misalignment rule: ${englishVocab.size} words)`,
  );
  log(`  input rows            ${data.length}`);
  log(`  dropped empty side    ${droppedEmpty}`);
  log(
    `  dropped misaligned    ${droppedMisaligned} (Igala side >${MISALIGNED_ENGLISH_SHARE * 100}% English words)`,
  );
  log(`  dropped duplicate     ${droppedDuplicate} (exact pair repeats)`);
  log(`  kept                  ${out.length}`);
  return out;
}

/**
 * The gate that keeps garbage out of the DB: language-ID a random sample of
 * Igala sides against the profile built from consented community gold - the
 * same construction scripts/igala-rag-run.ts uses, and the same consent rule:
 * only isDemo=false, consentBenchmark=true answers may train the profile.
 */
async function spotValidate(pairs: CleanPair[]): Promise<number> {
  const gold = await prisma.coldAuthorAnswer.findMany({
    where: { isDemo: false, consentBenchmark: true },
    select: { answerText: true },
  });
  const prompts = await prisma.prompt.findMany({ select: { text: true } });
  const model = buildLanguageIdModel({
    igalaTexts: gold.map((g) => g.answerText),
    englishTexts: prompts.map((p) => p.text),
  });

  const indices = sampleIndices(pairs.length, LANGID_SAMPLE, 42);
  let igala = 0;
  let englishLike = 0;
  let lowConfidence = 0;
  for (const i of indices) {
    const r = identifyLanguage(model, pairs[i].igala);
    if (r.isIgala) igala++;
    if (r.isEnglishLike) englishLike++;
    if (r.lowConfidence) lowConfidence++;
  }
  const share = indices.length > 0 ? igala / indices.length : 0;
  log(
    `\nLANGUAGE-ID SPOT VALIDATION (${indices.length} random Igala sides, seed 42)`,
  );
  log(`  gold profile          ${gold.length} consented answers`);
  log(`  identified Igala      ${igala} (${(share * 100).toFixed(1)}%)`);
  log(`  identified English    ${englishLike}`);
  log(`  low confidence        ${lowConfidence}`);
  return share;
}

async function insert(pairs: CleanPair[]): Promise<void> {
  let created = 0;
  for (let i = 0; i < pairs.length; i += INSERT_BATCH) {
    const batch = pairs.slice(i, i + INSERT_BATCH).map((p) => ({
      igala: p.igala,
      english: p.english,
      source: SOURCE,
      ref: p.ref,
    }));
    // skipDuplicates + the (source, ref) unique constraint is the idempotency
    // mechanism: a re-run attempts every row and creates none.
    const res = await prisma.parallelPair.createMany({
      data: batch,
      skipDuplicates: true,
    });
    created += res.count;
  }
  log(`\nINSERT`);
  log(`  attempted             ${pairs.length}`);
  log(`  created               ${created}`);
  log(`  skipped as existing   ${pairs.length - created}`);
}

/**
 * Prove the retrieval path works end to end, not just that rows landed:
 * englishTsv is a DB-side generated column Prisma cannot see, so the one way
 * to verify it is the same raw query retrieval consumers will run.
 */
async function verifyFts(): Promise<void> {
  const query = "water";
  const top = await prisma.$queryRaw<
    { ref: string | null; igala: string; english: string; rank: number }[]
  >`
    SELECT ref, igala, english,
           ts_rank("englishTsv", plainto_tsquery('english', ${query}))::float8 AS rank
    FROM "ParallelPair"
    WHERE "englishTsv" @@ plainto_tsquery('english', ${query})
    ORDER BY rank DESC, ref
    LIMIT 3`;
  log(`\nFTS CHECK - top 3 for '${query}' by ts_rank over "englishTsv"`);
  if (top.length === 0) {
    throw new Error("FTS returned 0 rows - englishTsv is not retrieving");
  }
  for (const t of top) {
    log(`  [${t.ref}] rank=${t.rank.toFixed(4)}`);
    log(`     EN ${t.english.slice(0, 100)}`);
    log(`     IG ${t.igala.slice(0, 100)}`);
  }
}

async function finalCounts(): Promise<void> {
  const [stats] = await prisma.$queryRaw<
    { total: number; meanigala: number; meanenglish: number }[]
  >`
    SELECT count(*)::int AS total,
           avg(length(igala))::float8 AS meanigala,
           avg(length(english))::float8 AS meanenglish
    FROM "ParallelPair"`;
  log(`\nFINAL CORPUS`);
  log(`  ParallelPair rows     ${stats.total}`);
  log(`  mean Igala length     ${stats.meanigala.toFixed(1)} chars`);
  log(`  mean English length   ${stats.meanenglish.toFixed(1)} chars`);
}

async function main() {
  const rows = await download();
  const pairs = clean(rows);

  const share = await spotValidate(pairs);
  if (share < LANGID_MIN_SHARE) {
    // Refuse rather than ingest: below this bar the "Igala" column is more
    // likely a misalignment or the wrong language than a usable corpus.
    log(
      `\nABORTING: Igala-share ${(share * 100).toFixed(1)}% is under the ` +
        `${LANGID_MIN_SHARE * 100}% gate. Nothing was inserted.`,
    );
    process.exitCode = 1;
    return;
  }

  await insert(pairs);
  await verifyFts();
  await finalCounts();
}

main()
  .catch((e) => {
    // Surface Prisma's structured error codes when present - P2002 etc. say
    // more than the generic message.
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      console.error(`Prisma ${e.code}:`, e.message);
    } else {
      console.error(e);
    }
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
