import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import {
  stripTemplateResidue,
  stripProjectMeta,
  ASJP_KEY,
  PARTIAL_LIST_NOTE,
} from "../src/lib/rag-clean";

/**
 * Clean the Igala RAG corpus of material that should never reach a model prompt
 * or an annotator's screen.
 *
 * WHY THIS IS A SCRIPT AND NOT A HAND-RUN UPDATE
 * ----------------------------------------------
 * The 13 Yoruba seed rows were quarantined in June by raw SQL against
 * production. There is no migration, no script and no changelog entry for it -
 * `updatedAt` equals `createdAt` to the millisecond, so Prisma never saw it.
 * If this database is rebuilt from prisma/, those rows come back. That is the
 * mistake this file exists not to repeat: every change here is reproducible,
 * idempotent, and re-runnable, and it re-embeds whatever it edits.
 *
 * WHAT IT FIXES, and why each one matters
 * ---------------------------------------
 * 1. BROKEN MEDIAWIKI TEMPLATE RESIDUE in the Wiktionary-derived rows. Failed
 *    template expansion left fragments like `)}}`, `}}`, `|t=...` and empty
 *    `(, )` in the glosses. One of them ships a vulgar sentence into the model
 *    prompt and onto the annotator's reference panel. These are scrape
 *    artifacts, not Igala.
 * 2. PROJECT META-COMMENTARY AND A PERSONAL EMAIL ADDRESS in the four Ejeba
 *    rows added earlier today. Reference material handed to a model should
 *    describe the language, not discuss our benchmark or carry a living
 *    scholar's contact details. That was my error and this reverses it.
 * 3. AN ARTICLE WHOSE SUBJECT IS NOT IGALA. "Ogidi, Kogi" is about an Okun
 *    (Yoruba subgroup) town and its first sentence is untranslated English.
 *    Quarantined, not deleted, under a label that says what is actually wrong
 *    with it - it is partly-untranslated Wikipedia, which is a different defect
 *    from the June rows (those were Yoruba words presented as Igala).
 * 4. UNDECODED ASJP NOTATION in the chikhapo rows. Entries like `e5a`, `gb~o`,
 *    `aby~a` use 5 = ny/ɲ and ~ = digraph-as-one-segment. Presented with no key
 *    a model will emit digits and tildes inside "Igala" words. The content is
 *    kept and a decoding key is prepended, because the forms are real data.
 * 5. A PARTIAL LIST PRESENTED AS COMPLETE. The numerals row holds one, two and
 *    four. A model handed it as the numerals reference can reasonably conclude
 *    Igala has no word for three. Labelled as partial.
 *
 * NOT FIXED HERE, deliberately: the chikhapo mis-glosses (`obɪǯɪ́m - emu` should
 * be ostrich, `óǯí - head, water`, `ɔ̀dɔ̀ - wall, heart, liver`) and the
 * `ómi` rain/water collision. Those are lexical judgements about Igala and
 * belong to fluent speakers, not to this script. They are surfaced to the
 * community instead - see the needs_review entry in seed-rag-igala.ts.
 *
 * Idempotent: re-running finds nothing to change and reports 0 edits.
 *
 * Run:  npx tsx --env-file=.env.local prisma/clean-rag-igala.ts
 *       npx tsx --env-file=.env.local prisma/clean-rag-igala.ts --dry-run
 */

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");
const LANGUAGE = "igala";

async function embed(text: string): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const openai = new OpenAI({ apiKey: key });
    const res = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    return res.data[0]?.embedding ?? null;
  } catch (e) {
    console.warn(`  re-embed failed: ${(e as Error).message}`);
    return null;
  }
}

/**
 * Current content per row id, threaded through every section.
 *
 * This map is the fix for a real bug: the sections were each reading the
 * content fetched once at the start, so when two sections touched the same row
 * the second wrote the ORIGINAL text plus its own change, silently discarding
 * the first section's edit. The numerals row lost its notation key that way.
 */
const working = new Map<string, string>();

async function applyContent(
  id: string,
  topic: string,
  before: string,
  after: string,
  reason: string,
): Promise<boolean> {
  if (before === after) return false;
  working.set(id, after);
  console.log(`  ~ ${topic}`);
  console.log(`      ${reason} (${before.length} -> ${after.length} chars)`);
  if (DRY_RUN) return true;
  await prisma.ragEntry.update({
    where: { id },
    data: { content: after },
    select: { id: true },
  });
  // Content changed, so the stored vector no longer describes the row.
  const vector = await embed(`${topic}\n${after}`);
  if (vector) {
    await prisma.$executeRawUnsafe(
      `UPDATE "RagEntry" SET embedding = $1::extensions.vector WHERE id = $2`,
      `[${vector.join(",")}]`,
      id,
    );
  }
  return true;
}

async function main() {
  console.log(
    DRY_RUN ? "DRY RUN - no writes\n" : "Cleaning Igala RAG corpus\n",
  );
  const rows = await prisma.ragEntry.findMany({
    where: { language: LANGUAGE },
    select: {
      id: true,
      topic: true,
      content: true,
      source: true,
      chunkType: true,
    },
  });
  console.log(`${rows.length} igala rows\n`);
  for (const r of rows) working.set(r.id, r.content);
  // Always read the CURRENT text, never the snapshot fetched above.
  const cur = (id: string, fallback: string) => working.get(id) ?? fallback;

  let edits = 0;

  console.log("1. MediaWiki template residue (Wiktionary rows)");
  for (const r of rows) {
    // The guard must match everything stripTemplateResidue removes, not just
    // the braces. An earlier pass removed the braces and left the dangling
    // clause behind, which a brace-only guard then made unreachable: the row
    // no longer looked dirty, so it was never revisited.
    const now = cur(r.id, r.content);
    if (!/\}\}|\|[a-z]+=|\(\s*,\s*\)|a clipping of the phrase\s*$/m.test(now))
      continue;
    const after = stripTemplateResidue(now);
    if (
      await applyContent(
        r.id,
        r.topic,
        now,
        after,
        "stripped failed template expansion",
      )
    )
      edits++;
  }

  console.log("\n2. Project meta-commentary and contact details");
  for (const r of rows) {
    const now = cur(r.id, r.content);
    if (!/\bchrF\b|@gmail\.com|\bTHE ASK\b/i.test(now)) continue;
    const after = stripProjectMeta(now);
    if (
      await applyContent(
        r.id,
        r.topic,
        now,
        after,
        "removed project asides / contact details",
      )
    )
      edits++;
  }

  console.log("\n3. Undecoded ASJP notation (chikhapo rows)");
  for (const r of rows) {
    const now = cur(r.id, r.content);
    // No leading-whitespace anchor: these codes appear backtick-quoted and
    // parenthesised as often as they appear as bare words, and an anchored
    // guard silently skipped the numerals row for exactly that reason.
    const hasAsjp = /[a-zɛɔ]5[a-zɛɔ]|~/m.test(now);
    if (!hasAsjp || now.includes("NOTATION KEY")) continue;
    if (
      await applyContent(
        r.id,
        r.topic,
        now,
        ASJP_KEY + now,
        "prepended notation decoding key",
      )
    )
      edits++;
  }

  console.log("\n4. Partial lists presented as complete");
  for (const r of rows) {
    const now = cur(r.id, r.content);
    if (!/Numerals/i.test(r.topic) || now.includes("INCOMPLETE LIST")) continue;
    if (
      await applyContent(
        r.id,
        r.topic,
        now,
        PARTIAL_LIST_NOTE + now,
        "labelled as partial",
      )
    )
      edits++;
  }

  console.log("\n5. Non-Igala subject matter");
  // Quarantine, never delete: the content is preserved and the label records
  // the actual defect, so a fluent speaker can reverse this if they disagree.
  const ogidi = rows.find((r) => /Ogidi, Kogi/.test(r.topic));
  if (ogidi) {
    console.log(`  ~ ${ogidi.topic}`);
    console.log(
      "      quarantined: subject is an Okun (Yoruba subgroup) town and the lead sentence is untranslated English",
    );
    if (!DRY_RUN) {
      await prisma.ragEntry.update({
        where: { id: ogidi.id },
        data: { language: "igala_quarantined_partly_english" },
        select: { id: true },
      });
    }
    edits++;
  } else {
    console.log("  (already quarantined)");
  }

  const remaining = await prisma.ragEntry.count({
    where: { language: LANGUAGE },
  });
  console.log(
    `\n${DRY_RUN ? "Would change" : "Changed"} ${edits} rows. Live igala rows: ${remaining}.`,
  );
}

// Only run when invoked directly. Importing this file (a test importing the
// pure transforms, for instance) must NOT mutate the production corpus - which
// it did once, before this guard existed.
const invokedDirectly =
  process.argv[1] !== undefined && /clean-rag-igala\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error(e);
      return prisma.$disconnect().then(() => process.exit(1));
    });
}
