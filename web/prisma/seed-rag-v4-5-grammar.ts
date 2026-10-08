import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import {
  buildProtectedSet,
  checkStatic,
  containsWholeWord,
} from "../src/lib/eval/leak-guard";
import { fullFold } from "../src/lib/eval/normalize";
import { GRAMMAR_NOTE_STATUS } from "../src/lib/arena/grammar-block";

/**
 * Seed the v4.5 grammar_rule RagEntry rows: the rules of the Salem Ejeba and
 * Lydia Wiernik write-up "Igala grammar writeup: Patching the holes in the
 * model" (sent 2026-09-25), read rule by rule on 2026-10-08 and diffed
 * against what we serve in tasks/salem-lydia-writeup-2026-09-25-inventory.md
 * (82 rules, each with an evidence grade and a status). Its "Ship list" names
 * exactly what this file carries.
 *
 * WHY THESE ROWS EXIST
 * --------------------
 * Three of the write-up's rules clear the two-class bar and were in no served
 * text: an embedded clause keeps its linker (kí 'that' against kì 'who,
 * which'), only a closed set of verbs changes for number and none for person,
 * and the tone on kí/kì and jọ/jọ̀ is the whole meaning. Prompt v4.5
 * (src/lib/generation-prompt-v4-5.ts) carries each as one line; these rows
 * carry the forms and the frames, served by the grammar block when a question
 * matches them. Everything single-class (the Ibaji and Ogwugwu alternations,
 * the s/ch statement, the kw/gw argument, the one-variety observation) is
 * stored as a scholarship_note with attribution, which the block skips.
 *
 * GRADING, AS PUBLISHED IN tasks/grammar-failure-analysis-v4-1.md
 * ---------------------------------------------------------------
 * Two evidence classes to be served; one class is a note. The write-up and
 * Ejeba (2023) count as ONE class (same author); the Bible corpus and the
 * community's corrections and gold are the other two. Served rows carry
 * verificationStatus external_sourced (scholarship + corpus) or
 * community_verified (a community leg too), exactly as the v4.3 seed used
 * them. Notes carry GRAMMAR_NOTE_STATUS.
 *
 * LICENCE: everything below is restated in our own words; Igala forms are
 * cited as data with the write-up named as the source. No sentence of the
 * write-up is reproduced. The write-up spells two words the Scope-A gate
 * bracketed before (child, pot); they are schematized here in English
 * brackets, as the v4.3 seed did.
 *
 * GATES, identical to prisma/seed-rag-v4-3-grammar.ts: draft lint (banned
 * characters, dashes, the E8 fabrication denylist), then the REAL Scope-A
 * leak check against frozen benchmark gold (threshold zero, nothing inserted
 * on a hit, offending entries schematized and the script re-run). Idempotent
 * and create-only: a rerun creates 0 rows.
 *
 * Run:  npx tsx --env-file=.env.local prisma/seed-rag-v4-5-grammar.ts
 */

const LANGUAGE = "igala";

const SOURCE_WRITEUP =
  "Ejeba, S. and Wiernik, L., 'Igala grammar writeup: Patching the holes in the model', sent to the project 2026-09-25 (thread 'Salem & I's writeup'), restated 2026-10-08 per tasks/salem-lydia-writeup-2026-09-25-inventory.md (rule ids W-*); the write-up and Ejeba (2023) count as one evidence class, the same author.";

/** The E8 fabrication denylist, as in the v4.1 and v4.3 seeds. */
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

const BANNED_CHARS = ["ṣ", "č", "ị", "ụ", "ṅ"];

export interface SeedEntry {
  chunkType: string;
  topic: string;
  content: string;
  source: string;
  verificationStatus: string;
}

// ─── Served rows (grade B: two evidence classes) ─────────────────────────────

const served: SeedEntry[] = [
  // ROW complementiser - retrieve for: that, said that, told, heard, know,
  // think, want, who, which, clause.
  {
    chunkType: "grammar_rule",
    topic:
      "Igala 'that' and 'who, which' - an embedded clause keeps its linker: kí (high) = that after a verb of saying, knowing, wanting; kì (low) = who, which; said that = kakini or ka ki ni; a ki with no clause to open is wrong (that, who, which, said, told, heard, know, think, want)",
    content:
      "Where English may drop 'that' (I knew she left), Igala keeps a linker in the slot: an embedded clause never starts bare. The linker is a ki-word, and its tone is its meaning. kí (high tone) is 'that', the complementiser after a verb of saying, knowing, hearing, thinking or wanting, and after a noun like 'news' that takes a clause; kì (low tone) is the relativizer 'who, which' (head noun + kì + clause + lẹ). After a verb of saying the community writes ka ki ni or kakini for 'said that' (corpus kakini 7,356 rows, always present; annotators split, 6 ka ki ni to 4 kakini). The other half of the rule: a ki-word has a job or it is not there. Two complete thoughts are joined by a full stop, never by a bare ki; on the Sep 2026 train bank a standalone ki appeared in 31% of model answers against 15.5% of speakers' answers. Do not write kí where kì belongs: a clause that describes the noun takes kì.\n\nExamples:\n- i kakini ... = he or she said that ... (the linker is kept; also i ka ki ni ...)\n- [head noun] kì ... lẹ = the one who ... (relative clause: kì, low)\n- [verb of knowing or wanting] + kí + clause = ... that ... (kí, high); a thought complete in itself starts a new sentence, with no ki",
    source:
      SOURCE_WRITEUP +
      " Evidence grade B: scholarship (W-3.2-3, W-3.2-7, W-3.2-13) + corpus (kakini 7,356 Bible rows, the linker always present) + community (ka ki ni / kakini in annotator answers, rows 003f68fc and 5deb2dc1; kì the most-toned small word in gold, 36/140, tasks/grammar-evidence-community.md section 6). Corpus and community cover the quotative frame; the general rule is the write-up's. Measured over-use: a standalone ki in 31% of v4.4 train answers against 15.5% of gold (2026-10-08). The write-up's belief-against-fact reading of kí vs kì is single-class and is not in this row.",
    verificationStatus: "community_verified",
  },
  // ROW concord guard - retrieve for: agreement, plural verb, conjugate,
  // he, she, they, we, went, saw, came.
  {
    chunkType: "grammar_rule",
    topic:
      "Igala verbs do not conjugate - only du/kó, tinyo/rinyo, tẹ/jọ and tọ/nyu/ru change for number; every other verb keeps one form for one and many, and no verb changes for person (agreement, plural verb, singular verb, conjugate, he, she, they, we, went, came)",
    content:
      "Igala verbs have one form whoever the subject is: the same verb serves I, you, he, she, we and they, and a bare verb is the completed form for all of them. Number shows on a closed set of verbs only, each with a singular and a plural form: du (one) / kó (several) = take, carry, and bring with wa; tinyo / rinyo = throw away, be lost; tẹ / jọ = keep, set down (and jọ is also 'sit, be located' for several); tọ / nyu / ru = put into one place, several into one place, several into several. With these the number of the object or the subject picks the form (du ugba wa = bring the plate; kó ugba wa = bring the plates). Every other verb keeps one form for one and for many: wa = come, lọ = go, li = see, ka = say, che = do, with one subject or many. Never build a second form by analogy: no r- form of any verb but tinyo/rinyo, no plural form for a verb outside this set, and never a change for person. Ejeba (2023) and the 2026 write-up agree that agreement is for number only and only in these constructions; the Bible corpus shows du/kó (137/77 rows) and tinyo/rinyo (356/761) and no person-inflected verb anywhere.\n\nExamples:\n- u lọ = I went; i lọ = he or she went; ma lọ = they went (one verb form)\n- du ugba wa = bring the plate; kó ugba wa = bring the plates (the closed set)\n- u li = I saw; ma li = they saw (no change for person or number)",
    source:
      SOURCE_WRITEUP +
      " Evidence grade B: scholarship (W-3.1-2, W-3.1-3, W-3.1-10, with Ejeba 2023 as the same class) + corpus (du/kó 137/77 rows, tinyo/rinyo 356/761 rows, no person-inflected verb; tasks/grammar-evidence-scholarship.md section 1.3, tasks/igala-grammar-deduced.md R5.6). The write-up's singular 'sit' gwùgwú has 0 hits in 30,907 Bible verses and is left out (conflicts registry item 4).",
    verificationStatus: "external_sourced",
  },
  // ROW tone homographs - retrieve for: tone, tone marks, accent, homograph,
  // happy, rejoice, sit, that, who.
  {
    chunkType: "grammar_rule",
    topic:
      "Igala tone that changes the word, marked even in untoned writing - kí (that) vs kì (who, which, may); jọ (sit or keep, several) vs jọ̀ (rejoice, be happy) (tone, tone mark, accent, homograph, that, who, which, happy, rejoice, sit)",
    content:
      "Community writing is mostly untoned and the model follows it, with a few one-syllable words as the exception because the mark carries the meaning. kí with a high tone is 'that', the complementiser after a verb of saying, knowing or wanting; kì with a low tone is the relativizer 'who, which' and the kì of the prohibition and the blessing (subject + kì + verb). The two are spelled alike and differ in nothing but the tone, so write it. jọ with no mark (mid tone) is 'sit, be located' or 'keep, set down' for several (kó X jọ); jọ̀ with a low tone is 'rejoice, be happy' (á jọ̀ = is rejoicing). Untoned, the corpus syllable jo also covers burn, gather and enough, which is why the mark matters here. Speakers already do this: in the Sep 2026 gold, kì is the most often toned small word (36 of 140 occurrences) while fewer than a third of answers carry any tone at all. Everywhere else leave tone off unless the question asks for it.\n\nExamples:\n- [verb of saying or knowing] + kí + clause = ... that ... (kí, high)\n- [head noun] kì ... lẹ = the one who ... (kì, low)\n- ma á jọ̀ = they are rejoicing; kó X jọ = keep several things (jọ̀ against jọ)",
    source:
      SOURCE_WRITEUP +
      " Evidence grade B: scholarship (W-3.2-7, W-3.1-19) + community (kì the most-toned small word in gold, 36/140; tasks/grammar-evidence-community.md section 6) + corpus for the jọ pair (the untoned syllable jo is polysemous in the Bible, 1,807 tokens). Gold tone rate 27.4%, annotator-driven: the REGISTER default stands and this row is its one exception.",
    verificationStatus: "community_verified",
  },
];

// ─── Notes (grade C, scholarship only, or already served elsewhere) ──────────

const notes: SeedEntry[] = [
  {
    chunkType: "grammar_rule",
    topic:
      "Igala dialect note (Ibaji) - closed syllables: where the Central variety has a two-syllable vowel-final word, Ibaji ends it in the velar nasal: something = Ẹnwu / Ẹñwu (Central) vs Uñ (Ibaji); what = Ẹ́nwù / Ẹ́ñwû vs ẹ́ùñ",
    content:
      "Note only, scholarship (one class), never served. The write-up states that Igala syllables are a bare vowel or a consonant plus a vowel, that a vowel closed by a consonant is not well formed in general, and that closed syllables surface only in particular dialects; Ibaji is the one shown. Where the Central (main) variety and most others say Ẹnwu or Ẹñwu for 'something' and Ẹ́nwù or Ẹ́ñwû for 'what', Ibaji says Uñ and ẹ́ùñ, the final nasal described as lengthened (no length mark is printed). Within the Central variety nw and ñw are two spellings of one word, not two words. The authors also state that the velar nasal ñ never begins a word; the served forms ñwu / ñw' (to, for) and ñyọ (the number linker) begin with a digraph the 2023 paper treats as its own sound, so the claim holds for plain ñ plus a vowel only. The Central forms are attested in the corpus and in community answers; the Ibaji forms are nowhere else in the project (gold dialect field: Ibaji 1 answer). Nothing here enters the prompt until a second evidence class arrives.",
    source:
      SOURCE_WRITEUP +
      " Evidence grade C: scholarship only (W-1-1 to W-1-7); the Central forms are corpus and community attested, the Ibaji forms are not.",
    verificationStatus: GRAMMAR_NOTE_STATUS,
  },
  {
    chunkType: "grammar_rule",
    topic:
      "Igala dialect note (Ogwugwu) - where the Central variety has l, Ogwugwu has r: li / ri = see, kpali / kpari = roll, ikelekwu / ikerenku = rat, ukpakẹlẹ / ukpankẹrẹ = ladle",
    content:
      "Note only, scholarship (one class), never served. The write-up reports a liquid alternation found in the Ogwugwu dialect and nowhere else: Central l answers to Ogwugwu r, as in li / ri (see), kpali / kpari (roll), ikelekwu / ikerenku (rat) and ukpakẹlẹ / ukpankẹrẹ (ladle). The authors write the arrow as r to l, yet every pair runs Central l to Ogwugwu r; recorded as the data lie. Two of the pairs change more than the liquid (kwu / nku, kẹ / nkẹ). Central li 'see' has corpus support (1,754 tokens); the Ogwugwu forms are nowhere else in the project (gold dialect field: Ogugu 2 answers; whether the platform's 'ogugu' key is this variety is unconfirmed). Consequence for the served rules: the ban on ra for 'buy' as Yoruba (prompt NEVER WRITE; row 003f68fc) is written for the Central variety and would flag an Ogwugwu speaker; it stands until the authors answer whether ra is correct in Ogwugwu (inventory question 16). The one-variety line in prompt v4.5 names no Ogwugwu form.",
    source:
      SOURCE_WRITEUP + " Evidence grade C: scholarship only (W-1-10 to W-1-14).",
    verificationStatus: GRAMMAR_NOTE_STATUS,
  },
  {
    chunkType: "grammar_rule",
    topic:
      "Igala sounds note - no s: every variety says ch where a source has s, and proper names and borrowed words keep their written s (s, ch, spelling, names, loanwords, foreign words)",
    content:
      "Note only: the rule is already served (prompt METHOD 9 and the ORTHOGRAPHY allowlist; rows 28a4d9f3 and 3b5fbaa6), so this row records the write-up's statement with attribution and is not served itself. Igala has no s sound; across every variety a source s is said as ch, the one sound change the authors say holds in all dialects. Their exception: proper names and foreign or borrowed words keep their written s, and the spoken ch must not be written into them. Corpus: Bible names keep their s. Community: unanimous that names keep their letters; split on loanwords (three annotators kept English loans as written, one respells them with ch).",
    source:
      SOURCE_WRITEUP +
      " Evidence grade A for the rule (W-1-8, W-1-9: scholarship + corpus + community), stored as a note because the prompt already carries it.",
    verificationStatus: GRAMMAR_NOTE_STATUS,
  },
  {
    chunkType: "grammar_rule",
    topic:
      "Igala sounds note - kw and gw as single consonants (kwa = shout vs ka = say), a contested analysis; velar colouring of a, o, u after ñ, k, g is pronunciation, not spelling",
    content:
      "Note only, scholarship (one class) for the argument, never served; the allowlist already lists kw and gw as digraphs (prompt ORTHOGRAPHY; rows 77aacd12 and 28a4d9f3). The write-up holds that the labialised velars kw and gw are consonants in their own right, not k or g plus a rounded vowel, and says outright that this status is contested. Its argument is the minimal pair kwa 'shout' against ka 'say': if kwa were ka with a phonetic rounding the two could not contrast, and if it came from k + u + a the word would hold a vowel sequence the authors say is not clearly attested inside one Igala word. That last claim sits against served kpai, community aidẹ and lia, and the proximal -i ending, all vowel sequences on the surface, so it holds only under an analysis the write-up does not give. Also recorded: velar colouring spreads rightward, a back vowel (the authors count a, o, u) after ñ, k or g taking a velar quality; pronunciation, with no spelling consequence. For the model: never split kw or gw into k + u or g + u. ka 'say' is served and corpus-attested (6,894 tokens); kwa 'shout' is uncounted.",
    source:
      SOURCE_WRITEUP +
      " Evidence: the unit-consonant claim is grade A as served (W-1-16, W-1-20: the allowlist, Ejeba 2023, corpus kw- forms); the minimal pair, the no-CVV claim and velarisation are grade C, scholarship only (W-1-15, W-1-17 to W-1-19), hedged by the authors.",
    verificationStatus: GRAMMAR_NOTE_STATUS,
  },
  {
    chunkType: "grammar_rule",
    topic:
      "Igala dialect note - one variety per answer: no speaker community mixes dialects in a sentence; the model's default is the Central (Idah) variety unless the question names another (dialect, variety, Idah, Ibaji, Ankpa, Dekina, Ogwugwu, Bassa, mix)",
    content:
      "Note only, scholarship (one class) as a claim about Igala; served in prompt v4.5 as procedure on Halim's decision of 2026-10-08, and recorded here with its open questions. The write-up observes that model output has blended two or more varieties inside one sentence, that no natural variety of Igala does so, and that every output should hold to exactly one variety. The project default is the Central variety, which the platform's dialect list records as general_idah (479 gold answers; Ankpa 172, from one annotator; Ibaji 1; Ogugu 2; 923 unset). Which town counts as Central (Idah, Dekina as in Ejeba 2023's data, or Ankpa) is a question put to the authors, as is which forms were mixed (lexical such as Uñ against Ẹnwu, phonological such as r against l, or orthographic). Retrieval itself can place general_idah and ankpa gold side by side, so the prompt line is the only guard today.",
    source:
      SOURCE_WRITEUP +
      " Evidence grade C: scholarship only (W-4-1 to W-4-3). Default variety: Halim's decision, tasks/prd-salem-writeup-ingest-2026-10-08.md. Gold dialect counts measured 2026-10-08.",
    verificationStatus: GRAMMAR_NOTE_STATUS,
  },
];

/** Every draft row, served first. Exported for the static leak check and the
 * unit test; the database is touched only by main(). */
export const V4_5_GRAMMAR_ENTRIES: readonly SeedEntry[] = [...served, ...notes];

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
export function lintDrafts(
  drafts: readonly SeedEntry[] = V4_5_GRAMMAR_ENTRIES,
): string[] {
  const problems: string[] = [];
  for (const e of drafts) {
    const text = `${e.topic}\n${e.content}`;
    for (const ch of BANNED_CHARS) {
      if (text.normalize("NFC").includes(ch)) {
        problems.push(
          `banned character U+${ch.codePointAt(0)!.toString(16).toUpperCase()} in "${e.topic}"`,
        );
      }
    }
    if (text.includes("\u2014") || text.includes("\u2013")) {
      problems.push(`dash in "${e.topic}"`);
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
  const prisma = new PrismaClient();
  try {
    const entries = V4_5_GRAMMAR_ENTRIES;

    // ── Gate 0: draft lint ──────────────────────────────────────────────────
    const lint = lintDrafts(entries);
    if (lint.length > 0) {
      for (const p of lint) console.error(`LINT: ${p}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `draft lint: PASS (${entries.length} entries, no banned characters, no denylist words, no dashes)\n`,
    );

    // ── Gate 1: Scope-A leak check against the REAL frozen protected set ───
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
    if (protectedSet.length === 0) {
      console.error(
        "FAIL: protected set is empty - nothing to check against. Wrong database?",
      );
      process.exitCode = 1;
      return;
    }
    const report = checkStatic(
      entries.map((e) => ({
        where: e.topic,
        text: `${e.topic}\n${e.content}`,
      })),
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

    // ── pgvector probe, same fix as src/lib/rag.ts ─────────────────────────
    let vectorSupported = true;
    try {
      await prisma.$queryRawUnsafe(
        `SELECT ('[1,2,3]'::extensions.vector OPERATOR(extensions.<=>) '[1,2,4]'::extensions.vector) AS d`,
      );
    } catch {
      vectorSupported = false;
      console.warn(
        "pgvector unreachable - entries will be created unembedded.",
      );
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

    const total = await prisma.ragEntry.count({
      where: { language: LANGUAGE, chunkType: "grammar_rule" },
    });
    const noteCount = await prisma.ragEntry.count({
      where: {
        language: LANGUAGE,
        chunkType: "grammar_rule",
        verificationStatus: GRAMMAR_NOTE_STATUS,
      },
    });
    console.log(
      `\nv4.5 grammar seed: ${created} created (${embedded} embedded), ${skipped} skipped as already present.`,
    );
    console.log(
      `grammar_rule rows for "${LANGUAGE}" now: ${total}, of which ${noteCount} are notes the block skips.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && /seed-rag-v4-5-grammar/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
