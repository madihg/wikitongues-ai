import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import {
  buildProtectedSet,
  checkStatic,
  containsWholeWord,
} from "../src/lib/eval/leak-guard";
import { fullFold } from "../src/lib/eval/normalize";
import { GRAMMAR_NOTE_STATUS } from "../src/lib/arena/grammar-block";
import {
  GRAMMAR_CHUNK_TYPE_V4_5,
  GRAMMAR_CHUNK_TYPE_V4_5_TONE,
  V4_5_ONLY_CHUNK_TYPES,
} from "../src/lib/arena/grammar-chunk-types";

/**
 * Seed the v4.5 grammar rows: the rules of the Salem Ejeba and Lydia
 * Wiernik write-up "Igala grammar writeup: Patching the holes in the model"
 * (sent 2026-09-25), read rule by rule on 2026-10-08 and diffed against what
 * we serve in tasks/salem-lydia-writeup-2026-09-25-inventory.md, revised
 * after the three-lens review of the same day against the speakers' gold.
 *
 * SCOPED TO v4.5. Every row here is chunkType grammar_rule_v4_5, or
 * grammar_rule_v4_5_tone for the tone row (src/lib/arena/grammar-chunk-types.ts),
 * never grammar_rule. The grammar block reads rows by chunkType
 * (grammarChunkTypesFor): rag-v4-5 reads grammar_rule plus grammar_rule_v4_5,
 * and the tone row's chunkType only when the question asks for tone
 * (asksForTone, the repair round's own predicate); every other label reads
 * grammar_rule alone; the v1 search in src/lib/rag.ts excludes both. So
 * seeding this file cannot change what the live, pooled v4.4 arm is served,
 * nor the v4.3/v4.4 exams, nor the common-word statistics their ranking
 * computes over the store, nor any rag-v1 column.
 *
 * WHY THESE ROWS EXIST
 * --------------------
 * The served rows carry the forms behind the v4.5 prompt lines: every ki
 * needs a job (with the attested linkers after tọdu, chẹñwu, before a clause
 * of time, and after verbs of saying); only a closed set of verbs changes
 * for number and none for person; and, only for a question that asks for
 * tone (gated in code, not by keyword match), the low-tone kì.
 * Everything single-class (the Ibaji and Ogwugwu alternations, jọ/jọ̀, the
 * s/ch statement, the kw/gw argument, the one-variety observation) is a
 * scholarship_note with attribution, which the block skips.
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
 * bracketed before (child, pot); neither appears here.
 *
 * GATES: draft lint (banned characters, dashes, the E8 fabrication
 * denylist), then the REAL Scope-A leak check against frozen benchmark gold
 * with a spiked negative control first (a real gold planted in a synthetic
 * block must be flagged, or the gate is dead and nothing is inserted),
 * threshold zero, nothing inserted on a hit. Idempotent and create-only: a
 * rerun creates 0 rows.
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

const CHUNK = GRAMMAR_CHUNK_TYPE_V4_5;
const CHUNK_TONE = GRAMMAR_CHUNK_TYPE_V4_5_TONE;

// ─── Served rows (grade B: two evidence classes) ─────────────────────────────

const served: SeedEntry[] = [
  // ROW clause linkers - retrieve for: that, said that, told, if, because,
  // when, while, who, which, clause, blessing.
  {
    chunkType: CHUNK,
    topic:
      "Igala clause linkers - every ki needs a job: who or which after a noun (ku before ma, mẹ), may or must-not before a verb, ki or ku after tọdu (because) and chẹñwu (if), ka ki or kaki = when, while, kakini or ka ki ni after say, tell, know, ki + subject after want; a ki with no job is wrong (that, said, know, want, if, because, when, while, who, which, blessing)",
    content:
      "Igala keeps a linker where English may drop 'that', and every ki-word has one of these jobs. After a noun it is the relativizer who, which (head + ki + clause; lẹ may close it). Before ma and mẹ it is ku. Wherever ki stands, ku writes ki + u (I) and kẹ writes ki + ẹ (you). Before a verb it carries may (a wish or blessing; most speakers bless in one may-clause, [God] ki + verb + object) or, with the clause-final nasal, must-not. After tọdu (because) and (i)chẹñwu (if) speakers write ki or ku. Before a clause of time, ka ki or kaki is when, while. After a verb of saying, telling or knowing the linker is kakini, ka ki ni or kaki, never dropped. After 'want' it is ki fused with the next subject (na tẹnẹ ku kà = I want to say; na tẹnẹ kẹ wa = I want you to come). A ki with none of these jobs is wrong: two complete thoughts are two sentences.\n\nExamples:\n- chẹñwu ki + clause = if ...; tọdu ku + clause = because ...\n- ka ki + clause = when ... (a clause of time)\n- i kakini ... = he or she said that ... (also i ka ki ni ...)",
    source:
      SOURCE_WRITEUP +
      " Evidence grade B: scholarship (W-3.2-3, W-3.2-13) + corpus (ParallelPair bigrams: todu ku 202, todu ki 272, (i)chewñ ku 264, (i)chewñ ki 229; kakini 7,356 rows, always present) + community (gold of the Oct 8 review export, 1,446 answers: chẹñwu ki/ku 30, tọdu ku/ki 21; ka ki or kaki for 'when' from annotators 4, 5, 7; kakini, ka ki ni or kaki after say, tell, announce and know ('had we known', ig_bank_gram_031: 8 answers, 6 annotators); after tẹnẹ 'want' a ki-word 18 times from 5 annotators, ka ki ni 3 times on one prompt; kẹ after chẹñwu from annotator_7; most blessings one clause (7 of 50 gold answers on blessing prompts string more, annotators 4, 5, 8; evidence-full authenticity 5); rows 003f68fc and 5deb2dc1). The measured excess (a standalone ki in 31% of v4.4 train answers against 15.5% of gold) is density: no v4.4 sentence opens with ki, and every word before its standalone ki is a listed job ([God] 27, ichẹñwu 22, ka 19, ẹnẹ 15). The write-up's kí/kì tone contrast and its belief-against-fact reading are not served here.",
    verificationStatus: "community_verified",
  },
  // ROW concord guard - retrieve for: agreement, plural verb, conjugate,
  // he, she, they, we, went, came.
  {
    chunkType: CHUNK,
    topic:
      "Igala verbs do not conjugate - only du/kó, tinyo/rinyo, tẹ/jọ and tọ/nyu/ru change for number; every other verb keeps one form, and no verb changes for person (agreement, plural verb, conjugate, he, she, they, we, went)",
    content:
      "An Igala verb has one form whoever the subject is: a bare verb is the completed form for I, you, he, she, we and they alike. Number shows on a closed set only: du / kó = take, carry (bring with wa); tinyo / rinyo = throw away, be lost; tẹ / jọ = keep, set down; tọ / nyu / ru = put into one place, several into one, several into several. With these the number of the object picks the form: du ugba wa = bring the plate; kó ugba wa = bring the plates. Every other verb keeps one form for one and many (wa, lọ, li, ka, che). gwugwu (sit) is attested for one person; its plural jọ has a single gold token, and the commoner sit verb gwanẹ keeps one form with a plural subject. Never build a second form by analogy: no r- form but rinyo, no plural form outside this set, never a change for person.\n\nExamples:\n- u lọ = I went; i lọ = he or she went; ma lọ = they went\n- du ugba wa = bring the plate; kó ugba wa = bring the plates\n- u li = I saw; ma li = they saw",
    source:
      SOURCE_WRITEUP +
      " Evidence grade B: scholarship (W-3.1-2, W-3.1-3, W-3.1-10, with Ejeba 2023) + corpus (du/kó 137/77 rows, tinyo/rinyo 356/761, no person-inflected verb; tasks/grammar-evidence-scholarship.md 1.3, tasks/igala-grammar-deduced.md R5.6; glosses per row 42657b2c). Sit, as data only: gwugwu 11 gold answers from three annotators, 0 Bible hits; plural jọ one gold token; gwanẹ 9 gold answers from four annotators, unchanged with a plural subject.",
    verificationStatus: "external_sourced",
  },
  // ROW tone of the linker - its own chunkType, read only when the question
  // asks for tone (grammarChunkTypesFor + asksForTone).
  {
    chunkType: CHUNK_TONE,
    topic:
      "Igala tone marks on ki, for a question that asks for tone - the relativizer (who, which) and the ki of may and must-not take a low tone, kì; kakini and ka ki ni stay as the community writes them (tone, tone marks, accent, diacritics)",
    content:
      "This row is served only when the question asks for tone. Community writing leaves ki unmarked: in the Oct 2026 gold, 461 ki-words carry no mark, 139 a low tone and 22 a high tone, and one annotator writes almost all the marked ones. When tones are asked for, mark the relativizer with a low tone (head + kì + clause), and the ki of the prohibition and the blessing too (subject + kì + verb), as the 2026 write-up and the speakers who tone both do. After a verb of saying, telling or knowing, kakini and ka ki ni keep their community spelling; do not replace them with a toned ki. Without a request for tone, write ki unmarked.\n\nExamples:\n- [head noun] kì ... = the one who ... (low)\n- subject + kì + verb ... ñ = must not (low)\n- i kakini ... = he or she said that ... (unchanged)",
    source:
      SOURCE_WRITEUP +
      " Evidence grade B: scholarship (W-3.2-7, the relativizer kì low) + community (kì 139 in the Oct 8 gold from three annotators, 133 of them one annotator; 36/140 in tasks/grammar-evidence-community.md section 6). The write-up's high-tone kí for 'that' is single-class (gold kí 22, none opening a that-clause after a verb of saying) and is not served. Gold tone rate 27.4%: the no-marks default stands, and this row's chunkType is read only for questions that ask for tone.",
    verificationStatus: "community_verified",
  },
];

// ─── Notes (grade C, scholarship only, or already served elsewhere) ──────────

const notes: SeedEntry[] = [
  {
    chunkType: CHUNK,
    topic:
      "Igala tone note - jọ (sit or keep, several) vs jọ̀ (rejoice, be happy) differ only in tone",
    content:
      "Note only, scholarship (one class), never served. The write-up's examples write jọ with no mark (mid tone) for 'sit, be located' with several subjects and for 'keep, set down' several things, and jọ̀ with a low tone for 'rejoice, be happy' after the incompletive. The Bible marks no tone, so the corpus cannot attest the mark, though it shows the untoned syllable jo covering several meanings (burn, gather, enough; 1,807 tokens). No speaker has yet written the pair. Speakers writing jọ̀ for 'rejoice' would be the second class that lets it be served.",
    source:
      SOURCE_WRITEUP +
      " Evidence grade C: scholarship only (W-3.1-19); the corpus leg (jo polysemous, 1,807 tokens) shows the homograph, not the tone mark.",
    verificationStatus: GRAMMAR_NOTE_STATUS,
  },
  {
    chunkType: CHUNK,
    topic:
      "Igala dialect note (Ibaji) - closed syllables: where the Central variety has a two-syllable vowel-final word, Ibaji ends it in the velar nasal: something = Ẹnwu / Ẹñwu (Central) vs Uñ (Ibaji); what = Ẹ́nwù / Ẹ́ñwû vs ẹ́ùñ",
    content:
      "Note only, scholarship (one class), never served. The write-up states that Igala syllables are a bare vowel or a consonant plus a vowel, that a vowel closed by a consonant is not well formed in general, and that closed syllables surface only in particular dialects; Ibaji is the one shown. Where the Central (main) variety and most others say Ẹnwu or Ẹñwu for 'something' and Ẹ́nwù or Ẹ́ñwû for 'what', Ibaji says Uñ and ẹ́ùñ, the final nasal described as lengthened (no length mark is printed). Within the Central variety nw and ñw are two spellings of one word. The authors also state that the velar nasal ñ never begins a word; the served forms ñwu / ñw' (to, for) and ñyọ (the number linker) begin with a digraph the 2023 paper treats as its own sound, so the claim holds for plain ñ plus a vowel only. The Central forms are attested in the corpus and in community answers; the Ibaji forms are nowhere else in the project (gold dialect field: Ibaji 1 answer).",
    source:
      SOURCE_WRITEUP +
      " Evidence grade C: scholarship only (W-1-1 to W-1-7); the Central forms are corpus and community attested, the Ibaji forms are not.",
    verificationStatus: GRAMMAR_NOTE_STATUS,
  },
  {
    chunkType: CHUNK,
    topic:
      "Igala dialect note (Ogwugwu) - where the Central variety has l, Ogwugwu has r: li / ri = see, kpali / kpari = roll, ikelekwu / ikerenku = rat, ukpakẹlẹ / ukpankẹrẹ = ladle",
    content:
      "Note only, scholarship (one class), never served. The write-up reports a liquid alternation found in the Ogwugwu dialect and nowhere else: Central l answers to Ogwugwu r, as in li / ri (see), kpali / kpari (roll), ikelekwu / ikerenku (rat) and ukpakẹlẹ / ukpankẹrẹ (ladle). The authors write the arrow as r to l, yet every pair runs Central l to Ogwugwu r; recorded as the data lie. Two of the pairs change more than the liquid (kwu / nku, kẹ / nkẹ). Central li 'see' has corpus support (1,754 tokens); no gold answer shows an Ogwugwu r-form, and whether the platform's 'ogugu' key is this variety is unconfirmed. Consequence for the served rules: the ban on ra for 'buy' as Yoruba (prompt NEVER WRITE; row 003f68fc) is written for the Central variety and would flag an Ogwugwu speaker; it stands until the authors answer whether ra is correct in Ogwugwu (inventory question 16). The v4.5 one-variety line names no Ogwugwu form.",
    source:
      SOURCE_WRITEUP + " Evidence grade C: scholarship only (W-1-10 to W-1-14).",
    verificationStatus: GRAMMAR_NOTE_STATUS,
  },
  {
    chunkType: CHUNK,
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
    chunkType: CHUNK,
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
    chunkType: CHUNK,
    topic:
      "Igala dialect note - one variety per answer: no speaker community mixes dialects in a sentence; the model keeps one form of each word and names Central (Idah) usage when asked (dialect, variety, Idah, Ibaji, Ankpa, Dekina, Ogwugwu, Bassa, mix)",
    content:
      "Note only, scholarship (one class) as a claim about Igala; served in prompt v4.5 as a constraint on Halim's decision of 2026-10-08, and recorded here with its open questions. The write-up observes that model output has blended two or more varieties inside one sentence, that no natural variety of Igala does so, and that every output should hold to exactly one variety. The model has no material saying which forms belong to which area, and its references are not all Central (170 gold answers are tagged ankpa; example turns carry no dialect), so the line asks for one form of each word per answer and, when asked, for the model to say it follows the Central (Idah) usage of its references. The platform's dialect list records Central as general_idah (478 gold answers; Ankpa 170, from one annotator; Ibaji 1; Ogugu 2; 688 unset). Which town counts as Central (Idah, Dekina as in Ejeba 2023's data, or Ankpa) is a question put to the authors, as is which forms were mixed (lexical such as Uñ against Ẹnwu, phonological such as r against l, or orthographic). Retrieval itself can place general_idah and ankpa gold side by side, so the prompt line is the only guard today.",
    source:
      SOURCE_WRITEUP +
      " Evidence grade C: scholarship only (W-4-1 to W-4-3). Default variety: Halim's decision, tasks/prd-salem-writeup-ingest-2026-10-08.md. Gold dialect counts from the Oct 8 review export (1,446 answers).",
    verificationStatus: GRAMMAR_NOTE_STATUS,
  },
];

/** Every draft row, served first. Exported for the static leak check and the
 * unit test; the database is touched only by main(). */
export const V4_5_GRAMMAR_ENTRIES: readonly SeedEntry[] = [...served, ...notes];

/** The rendered size the grammar block gives one row (topic + content). */
export function renderedRowChars(e: SeedEntry): number {
  return `${e.topic}\n${e.content.trim()}`.length;
}

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
        "FAIL: protected set is empty - nothing to check against. Wrong database? NOTHING was inserted.",
      );
      process.exitCode = 1;
      return;
    }
    // Negative control: a real gold planted in a synthetic block MUST be
    // flagged, or the detector is dead and a PASS below would mean nothing.
    // Built in memory, checked, discarded, never printed.
    const spike = checkStatic(
      [
        {
          where: "spiked-gold negative control",
          text: `harmless preamble ${golds[0].answerText} harmless coda`,
        },
      ],
      protectedSet,
    );
    if (spike.pass) {
      console.error(
        "NEGATIVE CONTROL: DEAD - a spiked frozen gold was NOT flagged. NOTHING was inserted.",
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `negative control: LIVE - spiked gold flagged (${spike.hitCount} hit(s), as required)`,
    );
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
      // Dedupe within the v4.5 chunkType: the rows this script owns.
      const existing = await prisma.ragEntry.findFirst({
        where: { language: LANGUAGE, chunkType: e.chunkType, topic: e.topic },
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

    const v45Types = { in: [...V4_5_ONLY_CHUNK_TYPES] };
    const total = await prisma.ragEntry.count({
      where: { language: LANGUAGE, chunkType: v45Types },
    });
    const noteCount = await prisma.ragEntry.count({
      where: {
        language: LANGUAGE,
        chunkType: v45Types,
        verificationStatus: GRAMMAR_NOTE_STATUS,
      },
    });
    console.log(
      `\nv4.5 grammar seed: ${created} created (${embedded} embedded), ${skipped} skipped as already present.`,
    );
    console.log(
      `v4.5-only rows (${V4_5_ONLY_CHUNK_TYPES.join(", ")}) for "${LANGUAGE}" now: ${total}, of which ${noteCount} are notes the block skips. No grammar_rule row was touched.`,
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
