import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";

/**
 * Seed RAG entries for the Igala CONCORD (grammatical agreement) system, from
 * Ejeba, Salem Ochala (2023) "Ígálâ Concord System", Journal of West African
 * Languages, Anniversary Volume 50 — https://journalofwestafricanlanguages.org
 *
 * WHY THIS IS A SEPARATE SCRIPT, AND WHY IT PARAPHRASES
 * -----------------------------------------------------
 * JWAL articles are free to read and carry CC BY-NC 4.0. The NonCommercial
 * clause would follow ingested text into any model we later serve, so the
 * project's standing line (see seed-rag-igala.ts and tasks/igala-corpus-
 * sources.md) is that NC-licensed sources are cited and described, never copied.
 *
 * These entries therefore state the GRAMMATICAL FACTS in our own words with
 * attribution. Facts about a language are not copyrightable; Ejeba's prose is.
 * Nothing below is a quotation, and the paper's Igala-language abstract — which
 * is genuinely valuable parallel data — is deliberately NOT reproduced here.
 * Getting that abstract under a usable licence is a permission ask, now
 * tractable because the paper carries a direct address: salem.ejeba@gmail.com
 *
 * SCOPE LIMIT, STATED HONESTLY
 * ----------------------------
 * These entries encode what the abstract and introduction establish. The full
 * paper contains the actual concord PARADIGMS (the tables of agreeing forms),
 * which are the part a model would most benefit from and which have NOT been
 * extracted. An annotator or researcher should treat these as orientation, not
 * as a complete description. `verificationStatus` is external_sourced: this is
 * published scholarship, not community-verified usage.
 *
 * Idempotent and create-only: skips any entry whose (language, topic) already
 * exists, never updates or deletes.
 *
 * Run:  npx tsx --env-file=.env.local prisma/seed-rag-igala-concord.ts
 */

const prisma = new PrismaClient();

const LANGUAGE = "igala";

const SOURCE =
  "Ejeba, Salem Ochala (2023) 'Ígálâ Concord System', Journal of West African Languages, Anniversary Volume 50. University of Port Harcourt, Nigeria. Free full text at https://journalofwestafricanlanguages.org (CC BY-NC 4.0). Paraphrased with attribution, not reproduced. Author contact: salem.ejeba@gmail.com";

interface SeedEntry {
  chunkType: string;
  topic: string;
  content: string;
  source: string;
  verificationStatus: string;
}

const entries: SeedEntry[] = [
  {
    chunkType: "grammar_rule",
    topic: "Igala concord — the four agreement relationships in the clause",
    content:
      "Igala has a grammatical concord (agreement) system. Ejeba (2023) identifies four distinct concord relationships in the Igala minimal clause:\n\n1. Subject-verb concord\n2. Object-verb concord\n3. Verb-modifying verb concord\n4. Verb-mass noun concord\n\nThe presence of object-verb concord is worth noting: many languages agree only between subject and verb, so a learner or a model transferring habits from English or from Yoruba should not assume the verb is invariant with respect to its object.\n\nThe governing generalisation is NUMBER. Igala marks a singular/plural distinction on verb forms, and the agreement rules below determine which form is licensed.\n\nPractical consequence for writing Igala: choosing a verb form is not independent of the noun phrases around it. A sentence can be lexically correct and still be ungrammatical because the verb does not agree.\n\nCaveat: this entry states the shape of the system as given in the paper's abstract and introduction. The full paradigms — the actual tables of agreeing forms — are in the body of the paper and have not yet been extracted into this database.",
    source: SOURCE,
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "grammar_rule",
    topic: "Igala number agreement — animacy, clitics, and count vs mass nouns",
    content:
      "Three rules govern how number agreement works in Igala, per Ejeba (2023):\n\nANIMACY SPLIT. Igala specifies plurality differently for animate and inanimate noun phrases. The rule for pluralising and agreeing with a noun phrase depends on whether its referent is animate. Do not assume one plural strategy covers both.\n\nPLURAL VERBS ARE OBLIGATORY WITH PLURAL ARGUMENTS. Plural noun phrases and plural pronominal clitics are licensed only to occur with plural forms of verbs. This holds whether the plural element is overt (visible in the sentence) or covert (understood but unexpressed). So a dropped or implied plural subject still requires the plural verb form — the agreement is with the grammatical feature, not with the visible word.\n\nCOUNT VERSUS MASS. The semantic side of the agreement system is sensitive to the count/mass distinction. Mass nouns (substances such as water, sand, or flour, which are not naturally counted) participate in their own concord relationship with the verb — this is the fourth type, verb-mass noun concord. Treating a mass noun as an ordinary countable plural will produce the wrong agreement.\n\nWhy this matters for evaluating model output: a frontier model with no Igala training will produce a fixed verb form regardless of the number, animacy or countability of its arguments, because it is pattern-matching surface strings rather than applying concord. Systematic agreement errors are a signal that the model is copying vocabulary without the grammar.",
    source: SOURCE,
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "grammar_rule",
    topic:
      "Igala concord in complex predicates, and the t-/r- consonantal alternation",
    content:
      "COMPLEX PREDICATES. Igala allows constructions with more than one verb: separate verb constructions and serial verb constructions. In these, the modifying verb agrees with the MAIN verb in grammatical number. Agreement therefore propagates through the predicate, not just between a noun and its verb.\n\nTHE CONSONANTAL ALTERNATION. In certain constructions, concord is signalled in the modifying verb by nothing more than its INITIAL CONSONANT. Ejeba (2023) describes bound concordial elements manifesting as a t- / r- alternation in Igala under agreement-imposed alternation.\n\nEjeba flags this as typologically rare, because it means a phonological element (a single consonant) has direct access to a semantic property (number). In most languages agreement is carried by an affix or a whole word form, not by one segment at the start of a stem.\n\nPRACTICAL CONSEQUENCE. Two Igala verb forms may differ by a single opening consonant and be grammatically non-interchangeable. This is a real hazard for character-overlap metrics such as chrF: a wrong initial consonant is a near-invisible penalty (one character in a short word) while being a complete grammatical error. It is also a hazard for anyone transcribing Igala by ear, and for a model copying a retrieved example without understanding why that form was chosen.\n\nThis is a strong argument for native judgment over automatic scoring on Igala: the metric barely notices the difference that a speaker would call wrong.",
    source: SOURCE,
    verificationStatus: "external_sourced",
  },
  {
    chunkType: "language_metadata",
    topic:
      "Igala grammatical scholarship — Ejeba, what is open, and what to ask for",
    content:
      "The leading modern authority on Igala grammar is Salem Ochala Ejeba (University of Port Harcourt).\n\nWHAT IS OPENLY READABLE:\n- Ejeba (2023), 'Ígálâ Concord System', Journal of West African Languages, Anniversary Volume 50. Free full text; the whole JWAL archive is free. Licence CC BY-NC 4.0, so it can be cited and paraphrased but its text must not be ingested into a corpus for a commercially served model.\n\nWHAT IS PAYWALLED:\n- Ejeba (2016), 'A Grammar of Igala', PhD, University of Port Harcourt; published 2017 as 'A Grammar of Ígálâ', M&J Grand Orbit, 268 pp, ISBN 9789785420876. Glottolog lists it as the most extensive description of the language. Paywalled at JSTOR (j.ctvh8qz34), Project MUSE (book/49701) and African Books Collective. It gives Igala 28 consonants and 7 vowels.\n\nNAME CORRECTION: the author is Salem Ochala Ejeba. An earlier project brief recorded 'Sunday Adejo Ejeba', which is wrong.\n\nCLASSIFICATION, per Ejeba (2023): Igala is a West Benue-Congo language spoken mainly in Kogi State, Nigeria. It is closely related to Yoruba and Itsekiri, and the three together form the Yoruboid subgroup (Akinkugbe 1978; Capo 1989). This relatedness is why untrained models substitute Yoruba when asked for Igala, and why Yoruba-exposed base models are the best transfer candidates — the same fact cuts both ways.\n\nTHE ASK, IF WE CONTACT HIM (salem.ejeba@gmail.com, printed on the 2023 paper): not the book. Ask for the EXAMPLE SENTENCES and the concord paradigms — the illustrative data behind the grammar. Example sentences are the exact shape a retrieval layer needs, and they are the part a scholar is most likely to share. Ask separately about the Igala-language abstracts in his JWAL papers, which are genuine parallel Igala-English prose, under a licence that permits our use.",
    source: SOURCE,
    verificationStatus: "external_sourced",
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

async function main() {
  // pgvector lives in the "extensions" schema while DATABASE_URL pins
  // search_path to "wikitongues", so BOTH the cast and the operator are
  // schema-qualified. This is the same fix as src/lib/rag.ts:58. Qualifying is
  // preferred over `SET search_path` because it cannot be undone by a pooled
  // connection handing us a different session.
  let vectorSupported = true;
  try {
    await prisma.$queryRawUnsafe(
      `SELECT ('[1,2,3]'::extensions.vector OPERATOR(extensions.<=>) '[1,2,4]'::extensions.vector) AS d`,
    );
  } catch {
    vectorSupported = false;
    console.warn("pgvector unreachable — entries will be created unembedded.");
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
      // Degrade to an unembedded row rather than throwing: the content is still
      // reachable by keyword, and a later run backfills the vector.
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
    `\nIgala concord seed: ${created} created (${embedded} embedded), ${skipped} skipped as already present.`,
  );
  console.log(`RagEntry rows for "${LANGUAGE}" now: ${total}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
