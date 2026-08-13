import { fullFold, tokenize } from "@/lib/eval/normalize";

/**
 * Pure parsers that turn the cleaned Igala RagEntry vocabulary rows into
 * individual lexeme records for the LexEntry table.
 *
 * WHY THIS LIVES IN src/lib AND NOT IN THE PRISMA SCRIPT
 * ------------------------------------------------------
 * Same split as rag-clean.ts / clean-rag-igala.ts: the transforms are pure and
 * unit-tested here, the DB work happens in prisma/build-lexicon-curated.ts.
 * Importing this file must never touch the database.
 *
 * THE THREE LINE FORMATS (read from the live rows, not guessed)
 * -------------------------------------------------------------
 *   wiktionary  "ábíá /á.bʲá/ — dog; (derogatory) dog, animal"
 *               Igala first, optional /IPA/, em dash, ';'-separated senses.
 *   koelle      "One — ī́nye"
 *               REVERSED: English gloss first, then Koelle's 1854 form.
 *   chikhapo    "ómi — water"
 *               Igala first, no IPA, some lines in raw ASJP notation.
 *
 * Every real list line uses the em dash separator; the em dashes in this file
 * are quoted data, not prose (house rule: our own prose uses " - ").
 */

export type SourceFamily = "wiktionary" | "koelle" | "chikhapo";

export interface ParsedLexeme {
  headword: string;
  gloss: string;
  pos: string | null;
}

/**
 * Confidence per source family, mirroring how much a fluent speaker should
 * trust an unverified line: Wiktionary cites Idakwoji's 2015 lexicon and uses
 * standard orthography; chikhapo is machine-derived phonemic transcription
 * with known mis-glosses; Koelle is an 1854 field transcription taken in
 * Sierra Leone, valuable as attestation but not modern spelling.
 */
export const FAMILY_CONFIDENCE: Record<SourceFamily, number> = {
  wiktionary: 1.0,
  chikhapo: 0.8,
  koelle: 0.6,
};

/**
 * Map a RagEntry.source string to its parser family.
 *
 * The Blench cross-source-variation row is checked FIRST and deliberately
 * returns null: its source string also mentions Wiktionary, but its content is
 * prose ("Leopard: Wiktionary gives ẹ́kọ̀...") written for speakers to
 * adjudicate, not a parseable wordlist.
 */
export function detectFamily(source: string): SourceFamily | null {
  if (source.includes("Blench")) return null;
  if (source.includes("chikhapo")) return "chikhapo";
  if (source.includes("Koelle") || source.includes("polyglottaafricana"))
    return "koelle";
  if (source.includes("en.wiktionary.org")) return "wiktionary";
  return null;
}

/**
 * chikhapo lines skipped outright: cross-source checking flagged these glosses
 * as wrong (obɪǯɪ́m is an ostrich, not an emu; ómi is water, rain is the
 * compound ómi oǯálì). They are surfaced to the community for adjudication
 * separately - see the needs_review entry in seed-rag-igala.ts - so a curated
 * lexicon must not launder them back in as facts.
 */
const CHIKHAPO_BAD_LINES: ReadonlyArray<readonly [string, string]> = [
  ["obɪǯɪ́m", "emu"],
  ["ómi", "rain"],
];

/**
 * chikhapo comma-list synonyms removed from otherwise-good lines, same
 * cross-source flagging as above: óǯí means head (water is ómi), and ɔ̀dɔ̀'s
 * "wall" sense contradicts every other source. Keyed by exact headword.
 */
const CHIKHAPO_BAD_SYNONYMS: ReadonlyMap<string, string> = new Map([
  ["óǯí", "water"],
  ["ɔ̀dɔ̀", "wall"],
]);

/** Senses kept per headword. More than 3 is Wiktionary being encyclopedic. */
const MAX_SENSES = 3;

/** Igala sides longer than this are sentences, not lexemes. */
const MAX_IGALA_WORDS = 4;

/**
 * Splits "form /IPA/ — gloss" at the FIRST em dash. The separator is matched
 * loosely (space before, optional space after) because the Wiktionary rows
 * carry template-residue lines like "Ídá /í.dá/ —, the capital city..." where
 * the space after the dash was eaten by the failed expansion.
 */
const SEPARATOR = /\s+—\s*/;

/** Trailing /IPA/ chunk on the Wiktionary Igala side. Glosses never have it. */
const TRAILING_IPA = /\s*\/[^/]*\/\s*$/;

/**
 * Clean one sense string. Returns null when nothing usable remains.
 *
 * The cleanups all target Wiktionary template residue that survived the RAG
 * clean: empty parens "( )" / "(ex. )", a leading comma where the template
 * output vanished, and clauses truncated mid-phrase ("the capital of the"),
 * which we detect by a dangling function word at the end.
 */
export function cleanSense(sense: string): string | null {
  const t = sense
    .replace(/\(\s*(?:ex\.)?\s*\)/g, "")
    .replace(/^[,.\s]+/, "")
    .replace(/!+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!t) return null;
  if (/\b(?:the|a|an|of|to)$/i.test(t)) return null;
  return t;
}

/**
 * Split a gloss field into senses on ';' only (commas separate synonyms
 * WITHIN a sense and are kept together), clean each, drop duplicates, cap at
 * MAX_SENSES.
 */
export function splitSenses(gloss: string): string[] {
  const out: string[] = [];
  for (const raw of gloss.split(";")) {
    const cleaned = cleanSense(raw);
    if (cleaned && !out.includes(cleaned)) out.push(cleaned);
    if (out.length === MAX_SENSES) break;
  }
  return out;
}

/**
 * Part of speech only where the source actually signals it; null otherwise.
 * Koelle topics are excluded from the verbs rule on purpose: his "verbs and
 * short sentences" section holds inflected sentences ("I go"), and tagging a
 * sentence as a verb would be wrong.
 */
export function inferPos(
  family: SourceFamily,
  topic: string,
  headword: string,
  sense: string,
): string | null {
  // "(transitive|stative) to hear" - the label sits before the "to" test.
  const bare = sense.replace(/^\([^)]*\)\s*/, "");
  if (/^to\s/.test(bare)) return "verb";
  if (/numerals/i.test(topic)) return "num";
  if (family !== "koelle" && /verbs/i.test(topic)) return "verb";
  // chikhapo cites verbs with the é- verbal prefix, even outside verb rows.
  if (family === "chikhapo" && headword.startsWith("é-")) return "verb";
  if (family === "koelle" && /adjectives/i.test(topic)) return "adj";
  return null;
}

/**
 * Parse one RagEntry's content into lexemes. Non-list lines (the NOTATION KEY
 * / INCOMPLETE LIST preambles, the per-row description paragraphs) carry no
 * " — " separator, so they fall out of the line match; the explicit prefix
 * check is belt-and-braces in case a future preamble quotes an entry.
 */
export function parseVocabularyContent(
  content: string,
  topic: string,
  family: SourceFamily,
): ParsedLexeme[] {
  const out: ParsedLexeme[] = [];
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(?:NOTATION KEY|INCOMPLETE LIST)/.test(line)) continue;
    const sep = line.match(SEPARATOR);
    if (!sep || sep.index === undefined) continue;

    const left = line.slice(0, sep.index).trim();
    const right = line.slice(sep.index + sep[0].length).trim();
    if (!left || !right) continue;

    // Koelle's list runs English-to-Igala; the other two run Igala-to-English.
    const igalaSide =
      family === "koelle" ? right : left.replace(TRAILING_IPA, "").trim();
    const glossSide = family === "koelle" ? left : right;
    if (!igalaSide || !glossSide) continue;

    // Raw ASJP notation (digit 5 = ny, tilde = digraph-as-one-segment) must
    // never become a headword: a model retrieving "e5a" will emit the digit
    // inside an "Igala" word. Decoded forms exist elsewhere in the corpus.
    if (/[5~]/.test(igalaSide)) continue;

    // Sentences are ParallelPair material, not lexemes.
    if (igalaSide.split(/\s+/).length > MAX_IGALA_WORDS) continue;

    if (
      family === "chikhapo" &&
      CHIKHAPO_BAD_LINES.some(([h, g]) => h === igalaSide && g === glossSide)
    )
      continue;

    for (const sense of splitSenses(glossSide)) {
      let gloss = sense;
      if (family === "chikhapo") {
        const bad = CHIKHAPO_BAD_SYNONYMS.get(igalaSide);
        if (bad) {
          gloss = gloss
            .split(",")
            .map((s) => s.trim())
            .filter((s) => fullFold(s) !== bad)
            .join(", ");
          if (!gloss) continue;
        }
      }
      out.push({
        headword: igalaSide,
        gloss,
        pos: inferPos(family, topic, igalaSide, gloss),
      });
    }
  }
  return out;
}

/**
 * English function words, filtered out before the coverage check because they
 * carry no lexical content to look up. Deliberately our own list: langid.ts's
 * ENGLISH_FUNCTION_WORDS is tuned for language-ID scoring and purity.ts's is
 * frozen for Rung A comparability; neither should grow to serve coverage.
 */
const FUNCTION_WORDS = new Set(
  `a an the and or but nor so if than then rather that this these those there
   here it its is are was were be been being am do does did done have has had
   having will would shall should may might must can could of to in on at by
   for with from into onto as about over under between within without not no
   i me my mine we our ours us you your yours he him she her his hers they
   them their theirs who whom whose which what when where why how also too
   very such each some any all both few more most other another only own
   same`.split(/\s+/),
);

/**
 * Task-scaffolding words from the frozen prompts ("Translate ... into Igala,
 * keeping correct word order"). They name the TASK, not lexical content, so
 * counting them as misses would understate coverage of what the prompts
 * actually ask about; counting them as hits would be worse. Curated against
 * the 43 frozen prompts - borderline words (say, short, natural, morning...)
 * stay content on purpose because the lexicon could legitimately cover them.
 */
const PROMPT_META_WORDS = new Set(
  `translate translated translation write writing spell spelled spelling give
   word words igala english language correct correctly tone tones mark marks
   diacritic diacritics dotted vowel vowels sentence structure order agreement
   tense past future form clause relative keeping using showing making sure
   paying attention provide explain describe show note notes back-translated
   borrowing neighbouring confirm true numbers`.split(/\s+/),
);

/**
 * Distinct folded content words of one prompt: the words the coverage metric
 * asks the lexicon to know. Folding matches glossFolded's own key space.
 */
export function promptContentWords(text: string): string[] {
  const seen = new Set<string>();
  for (const tok of tokenize(text)) {
    const w = fullFold(tok);
    if (!w || !/\p{L}/u.test(w)) continue;
    if (FUNCTION_WORDS.has(w) || PROMPT_META_WORDS.has(w)) continue;
    seen.add(w);
  }
  return [...seen];
}

/**
 * Transliterate phonemic transcription into standard Igala orthography.
 *
 * Why this exists: the chikhapo lexicon (and stretches of Koelle 1854) write
 * Igala in phonemic notation - ɛ ɔ ǯ ŋ, nasal tildes, macrons - not in the
 * 1980 standard orthography. Serving those forms in the rag-v2 dictionary
 * block told the model "copy this spelling character for character" about
 * spellings no Igala speaker uses, which is precisely the meaning-changing
 * spelling failure Agnes flagged in the 2026-08-11 live test (Ojọ vs Ojọn,
 * Onokotu vs Nokotu). The mapping below is the documented chikhapo→orthography
 * correspondence from the corpus audit: ɛ→ẹ, ɔ→ọ, ǯ→j, plus ŋ→ñ (the velar
 * nasal the orthography writes ñ) and removal of the notation-only diacritics
 * (macron = mid tone, which standard Igala leaves unmarked; tilde = phonemic
 * nasality, which the orthography does not write on vowels). Acute and grave
 * tone marks are real orthography and pass through untouched.
 *
 * Applied at RENDER time, not by rewriting LexEntry rows: the stored rows keep
 * the source's own notation so provenance stays auditable, and every consumer
 * of the lexicon gets the orthographic form through this one function.
 */
export function toOrthography(form: string): string {
  return (
    form
      .normalize("NFD")
      // Notation-only combining marks: macron (mid tone - unmarked in the
      // orthography), tilde (phonemic nasality), and the ASJP-era length
      // colon. Dot-below (U+0323) and acute/grave survive - they are real.
      .replace(/[̄̃ː:]/g, "")
      .normalize("NFC")
      .replace(/ɛ/g, "ẹ")
      .replace(/Ɛ/g, "Ẹ")
      .replace(/ɔ/g, "ọ")
      .replace(/Ɔ/g, "Ọ")
      .replace(/ǯ/g, "j")
      .replace(/ʤ/g, "j")
      .replace(/ŋm/g, "ñm")
      .replace(/ŋw/g, "ñw")
      .replace(/ŋ/g, "ñ")
      .replace(/ɪ/g, "i")
      .replace(/ʊ/g, "u")
  );
}
