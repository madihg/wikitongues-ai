import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import {
  buildProtectedSet,
  checkStatic,
  containsWholeWord,
} from "../src/lib/eval/leak-guard";
import { fullFold } from "../src/lib/eval/normalize";

/**
 * Seed the nine v4.1 grammar_rule RagEntry rows specced in
 * tasks/grammar-failure-analysis-v4-1.md section 3.3 (RE1..RE9).
 *
 * WHY THESE ROWS EXIST
 * --------------------
 * The v3 failure mine found that the grade-C register/formula layer
 * (greetings, farewells, thanks, honorifics, consolation) was audit-cut from
 * the v3 system prompt and pushed to the data layer, and the data layer
 * demonstrably did not deliver it: the model failed on R9.2's own showcase
 * constructions five separate times. These rows make the C-grade material
 * retrievable as explicit grammar_rule entries. RE8 and RE9 are grade B but
 * bulky/contextual, so the prompt budget sends them here rather than into the
 * static system prompt.
 *
 * SERVING REALITY (verified 2026-08-31): only the v1 searchRag path reads
 * RagEntry rows today. buildRetrievalV2/buildRetrievalV4 serve dictionary +
 * parallel pairs (+ corrections) + gold only, so the rag-v4-1 arm does NOT
 * receive these rows; they are seeded, embedded and leak-gated so a future
 * retrieval iteration can serve them, and so v1-path chat reaches them now.
 *
 * SCOPE-A LEAK GATE, RUN BEFORE ANY INSERT
 * ----------------------------------------
 * These entries are SERVED text, so Scope A (threshold zero) applies to every
 * string below. The spec names five known-risk strings (train-attested
 * greeting/farewell/blessing formulas); train attestation is allowed, frozen
 * benchmark gold is not. This script therefore rebuilds the REAL protected
 * set (isHoldout prompts, consentBenchmark golds - the exact query
 * static-leak-check-v4.ts uses) and refuses to insert ANYTHING if any entry
 * hits it. Per leak-guard's information-hygiene rule the failure output names
 * locations and counts, never text. A failing entry must be schematized
 * (frame slots, no example) and the script re-run.
 *
 * SCHEMATIZED SLOTS (first seeding run, 2026-08-31): the Scope-A gate caught
 * collisions between several draft example words and frozen benchmark gold -
 * single-word orthography-bank answers among the greetings, kin vocatives,
 * the word for God, the 1sg independent pronoun, and the household word. Per
 * the spec ("strings that fail get schematized - frame slots, no example")
 * those slots below are described in English rather than spelled in Igala.
 * The withheld forms are deliberately NOT named here or anywhere: naming them
 * would hand the answer key to anyone reading this file (leak-guard's
 * information-hygiene rule).
 *
 * Two cheaper lint gates run first, against the spec's own lists:
 *   - banned characters (s-with-dot, c-hacek, i/u-with-dot-below, n-with-dot)
 *     must not appear anywhere;
 *   - the model's ten recurring fabrications (the E8 denylist) must not
 *     appear as words, accent-folded, anywhere.
 *
 * Idempotent and create-only: skips any entry whose (language, topic) already
 * exists, never updates or deletes. Embedding per the store's pattern
 * (text-embedding-3-small over topic + content), degrading to an unembedded
 * row that keyword search still reaches.
 *
 * Run:  npx tsx --env-file=.env.local prisma/seed-rag-v4-1-grammar.ts
 */

const prisma = new PrismaClient();

const LANGUAGE = "igala";

const SOURCE =
  "Grammar failure analysis for v4.1, tasks/grammar-failure-analysis-v4-1.md (2026-08-31), section 3.3 - synthesized from native-speaker community corrections (OutputEdit rows and the corrections evidence in tasks/igala-grammar-deduced.md R9.1-R9.3, R2.8, R10.5, R5.4, R1.3), with corpus legs re-verified against the live ParallelPair table where graded.";

/**
 * The E8 fabrication denylist: the model's recurring inventions, zero-attested
 * in every source class. None may appear in seeded content (accent-folded,
 * whole-word).
 */
const FABRICATIONS = [
  "adsa",
  "kpuke",
  "ojoji",
  "teketeke",
  "akeli",
  "gbede",
  "abeki",
  "mimi",
  "kpegwa",
];

/**
 * Banned characters per E5's allowlist framing: any of these anywhere in a
 * draft means the draft is wrong. (Plain letters like x/q/v/z are legitimate
 * inside English glosses, so only the alien combining forms are linted here.)
 */
const BANNED_CHARS = ["ṣ", "č", "ị", "ụ", "ṅ"]; // ṣ č ị ụ ṅ

interface SeedEntry {
  chunkType: string;
  topic: string;
  content: string;
  source: string;
  verificationStatus: string;
}

const entries: SeedEntry[] = [
  // RE1 - retrieve for: greeting, hello, good morning/afternoon/evening/night,
  // welcome, well done
  {
    chunkType: "grammar_rule",
    topic: "Igala greetings - the (w)ọla frame, Agba oo, and no word for hello",
    content:
      "Igala has no word for 'hello'. The general hail is 'Agba oo'; peers say 'aidẹ' or 'Abẹle'. The productive greeting is (w)ọla plus a time or occasion noun: the attested slot nouns are the words for morning, afternoon, evening, night, homecoming and work. Licit shapes: wọla X, ọla X, ọl'X. Only those slot nouns go in the frame - do not put other nouns in it. Never translate 'good night' word for word as noun plus adjective.\n\nExamples:\n- wọla ọrọka = good afternoon; wọla anẹ = good evening\n- Wọla ulẹ (also written Wọla'ulẹ) = welcome home; wọla ukọlọ = well done at work\n- Agba oo = the general hail (to an elder or a gathering)",
    source: SOURCE,
    verificationStatus: "community_verified",
  },
  // RE2 - retrieve for: goodbye, farewell, safe journey, parting
  {
    chunkType: "grammar_rule",
    topic: "Igala farewells - the Ch'ugba t'ugba family",
    content:
      "Goodbye is the Ch'ugba t'ugba family ('till next time'), optionally followed by a blessing. Never compose 'go with peace' from a Yoruba word: ọlafia / alaafia is not Igala.\n\nExamples:\n- Ch'ugba t'ugba = till next time (goodbye)\n- Ẹ lọ kpaì ọla fiya = go with wellbeing (parting blessing)",
    source: SOURCE,
    verificationStatus: "community_verified",
  },
  // RE3 - retrieve for: thank, gratitude, appreciation, after a meal or gift
  {
    chunkType: "grammar_rule",
    topic: "Igala thanks - anya and the blessing frame",
    content:
      "Plain thanks is anya. 'Agba' also serves as a hail of appreciation, including 'Agba' plus the word for God for 'thank God'. Fuller thanks is a BLESSING on the giver, with the optative kì frame: subject + kì + verb ('may [God] ...'), for example giving goodness with d'ẹnyọ plus the dative ñwu. Bare 'thanks + noun' juxtaposition is English-shaped, not Igala.\n\nExamples:\n- Anya = thanks\n- Agba = a hail of appreciation\n- [God] kì d'ẹnyọ ñwu wẹ = may God give you goodness (fuller thanks as a blessing; the subject slot is the Igala word for God)",
    source: SOURCE,
    verificationStatus: "community_verified",
  },
  // RE4 - retrieve for: elder, respect, formal address, council, chief,
  // mother/father address
  {
    chunkType: "grammar_rule",
    topic: "Igala vocatives and honorific address",
    content:
      "Politeness is a kin or status vocative first plus the honorific plural, never verb morphology. The vocative is the plain kin word (the ordinary words for mother, father, child, used as address) or a status word: Atai (sir), Mama (mother, familiar register), Onàyì (elder); elders as a body are hailed 'Agba (oo) abọ ọgijọ'; the royal court address is Gabaìdu. Honorific 'you' to an elder or a group is the plural mẹ. The same message changes shape by addressee: to a child use the child vocative plus the plain form; to an elder add the vocative, mẹ, and reduplicate the manner word for respect.\n\nExamples:\n- Agba oo abọ ọgijọ = hail, body of elders (formal address to elders)\n- Gabaìdu = address at the royal court\n- Onàyì = elder (respectful address); honorific plural mẹ = you (to an elder or a group)",
    source: SOURCE,
    verificationStatus: "community_verified",
  },
  // RE5 - retrieve for: invite, request, announce, would like to
  {
    chunkType: "grammar_rule",
    topic: "Igala polite volitive - the na tẹnẹ frame",
    content:
      "Invitations, requests and announcements open with na tẹnẹ (also spelled na tene) plus a verb: 'I would like to' / 'I am going to'. Formal speech runs: honorific vocative + na tẹnẹ + ka ki ni ... ('... inform you that ...'). This frame is the backbone of formal speech.\n\nExamples:\n- na tẹnẹ + verb = I would like to / I am going to (polite volitive opener)\n- (vocative,) na tẹnẹ ka ki ni ... = I would like to inform you that ... (formal announcement)",
    source: SOURCE,
    verificationStatus: "community_verified",
  },
  // RE6 - retrieve for: comfort, grief, condolence, encourage, bad harvest, loss
  {
    chunkType: "grammar_rule",
    topic: "Igala consolation and encouragement",
    content:
      "Consolation opens with a prohibitive: subject + kì + verb + final -n ('do not cry', 'do not lose heart'), then an optative comfort: subject + kì + verb ('may [God] ...'). Do not calque English idioms ('think small', 'cool heart'); do not import Nnọ.\n\nExamples:\n- subject + kì + verb + -n = do not ... (prohibitive opener)\n- [God] kì danyedo-we = may God console you (optative comfort from a correction gold; the subject slot is the Igala word for God)",
    source: SOURCE,
    verificationStatus: "community_verified",
  },
  // RE7 - retrieve for: ask, question, why, what, where, who, when, how
  {
    chunkType: "grammar_rule",
    topic: "Igala wh-questions - question words stay in place",
    content:
      "Wh-words stay in place; there is no inversion: ewñ 'what', Ewñ chi 'why', ugbo 'where', ene 'who', egba ku 'when', abu 'how'. Do not build 'why' from tọdu ('because').\n\nExamples:\n- Abu wele = how are you\n- Ewñ chi ... = why ... (the why-frame)\n- ugbo = where; ene = who; egba ku = when",
    source: SOURCE,
    verificationStatus: "community_verified",
  },
  // RE8 - retrieve for: count, money, price, market, number above 20
  {
    chunkType: "grammar_rule",
    topic: "Igala vigesimal numbers and market money counting",
    content:
      "The number system is base-20 and only adds or multiplies - never subtracts. ogu 20; oje 50; nyoke is the additive linker; icham nyogwoko 1000. Money in the market is counted in this system. Small attributive numerals stay postnominal with mẹ-.\n\nExamples:\n- ogbo meji = forty (20 times 2)\n- ogbo meta nyoke megwa = seventy (20 times 3 plus 10)\n- ogumelu = one hundred (20 times 5)",
    source: SOURCE,
    verificationStatus: "community_verified",
  },
  // RE9 - retrieve for: 'X is Y' statements, introductions, definitions
  {
    chunkType: "grammar_rule",
    topic: "Igala tag copula - the X S chẹ closure",
    content:
      "Equative sentences allow a predicate-first order closed by the copula: X S chẹ, alongside plain S chi/chẹ X. Both are licit; the tag is optional.\n\nExamples:\n- X S chẹ = predicate first, closed by the copula. Corpus verse 625 closes 'Abraham's servant I am' exactly this way: predicate, then the 1sg independent pronoun, then the copula (spelled che in Bible orthography)\n- ... i chẹ = tag closure as a native corrector wrote it: the predicate moved forward and the sentence closed with i chẹ\n- S chi/chẹ X = the plain equative order, equally licit",
    source: SOURCE,
    verificationStatus: "community_verified",
  },
];

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
    console.warn(`  embedding failed: ${(e as Error).message}`);
    return null;
  }
}

/** Lint the drafts against the spec's own lists. Returns problem strings. */
function lintDrafts(): string[] {
  const problems: string[] = [];
  for (const e of entries) {
    const text = `${e.topic}\n${e.content}`;
    for (const ch of BANNED_CHARS) {
      if (text.normalize("NFC").includes(ch)) {
        problems.push(
          `banned character U+${ch.codePointAt(0)!.toString(16).toUpperCase()} in "${e.topic}"`,
        );
      }
    }
    const folded = fullFold(text);
    for (const fab of FABRICATIONS) {
      if (containsWholeWord(folded, fab)) {
        problems.push(`fabricated word "${fab}" in "${e.topic}"`);
      }
    }
  }
  return problems;
}

async function main() {
  // ── Gate 0: draft lint (banned characters, fabrication denylist) ──────────
  const lint = lintDrafts();
  if (lint.length > 0) {
    for (const p of lint) console.error(`LINT: ${p}`);
    process.exitCode = 1;
    return;
  }
  console.log("draft lint: PASS (no banned characters, no denylist words)\n");

  // ── Gate 1: Scope-A leak check against the REAL frozen protected set ─────
  const frozen = await prisma.prompt.findMany({
    where: { isHoldout: true, language: LANGUAGE },
    select: { id: true, promptId: true },
  });
  const slugOf = new Map(frozen.map((p) => [p.id, p.promptId]));
  const golds = await prisma.coldAuthorAnswer.findMany({
    where: {
      promptId: { in: frozen.map((p) => p.id) },
      isDemo: false,
      consentBenchmark: true,
    },
    select: { promptId: true, answerText: true },
  });
  const protectedSet = buildProtectedSet(
    golds.map((g) => ({
      promptId: slugOf.get(g.promptId) ?? g.promptId,
      answerText: g.answerText,
    })),
  );
  console.log(
    `frozen prompts: ${frozen.length}  gold answers: ${golds.length}  protected strings: ${protectedSet.length}`,
  );
  const report = checkStatic(
    entries.map((e) => ({ where: e.topic, text: `${e.topic}\n${e.content}` })),
    protectedSet,
  );
  if (!report.pass) {
    console.error(
      `SCOPE A: FAIL - ${report.hitCount} hit(s); NOTHING was inserted. Schematize the offending entries and re-run:`,
    );
    for (const h of report.hits) {
      console.error(`  [${h.tier}] prompt ${h.promptId}  in  ${h.where}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(
    "SCOPE A: PASS - no frozen gold answer appears in any draft entry.\n",
  );

  // ── pgvector probe, same fix as src/lib/rag.ts:58 ────────────────────────
  let vectorSupported = true;
  try {
    await prisma.$queryRawUnsafe(
      `SELECT ('[1,2,3]'::extensions.vector OPERATOR(extensions.<=>) '[1,2,4]'::extensions.vector) AS d`,
    );
  } catch {
    vectorSupported = false;
    console.warn("pgvector unreachable - entries will be created unembedded.");
  }

  let created = 0;
  let embedded = 0;
  let skipped = 0;

  for (const e of entries) {
    const existing = await prisma.ragEntry.findFirst({
      where: { language: LANGUAGE, topic: e.topic },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const vector = vectorSupported
      ? await embed(`${e.topic}\n${e.content}`)
      : null;

    if (vector) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "RagEntry"
           (id, language, "chunkType", topic, content, source, "verificationStatus", embedding, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7::extensions.vector, now(), now())`,
        LANGUAGE,
        e.chunkType,
        e.topic,
        e.content,
        e.source,
        e.verificationStatus,
        `[${vector.join(",")}]`,
      );
      embedded++;
    } else {
      // Degrade to an unembedded row rather than throwing: the content is
      // still reachable by keyword, and a later run backfills the vector.
      await prisma.ragEntry.create({
        data: {
          language: LANGUAGE,
          chunkType: e.chunkType,
          topic: e.topic,
          content: e.content,
          source: e.source,
          verificationStatus: e.verificationStatus,
        },
        select: { id: true },
      });
    }
    created++;
    console.log(`  + ${e.topic}${vector ? "" : " (no embedding)"}`);
  }

  const total = await prisma.ragEntry.count({ where: { language: LANGUAGE } });
  console.log(
    `\nv4.1 grammar seed: ${created} created (${embedded} embedded), ${skipped} skipped as already present.`,
  );
  console.log(`RagEntry rows for "${LANGUAGE}" now: ${total}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
