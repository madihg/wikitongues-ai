import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface SeedEntry {
  language: string;
  chunkType: string;
  topic: string;
  content: string;
}

const igalaEntries: SeedEntry[] = [
  // Vocabulary
  {
    language: "igala",
    chunkType: "vocabulary",
    topic: "Basic greetings",
    content:
      "Ane ojo — Good morning. Ane ale — Good afternoon/evening. Ojoolo — Welcome. A common response to greetings is 'Aa' (yes/acknowledgement) or repeating the greeting back.",
  },
  {
    language: "igala",
    chunkType: "vocabulary",
    topic: "Family terms",
    content:
      "Ata — Father. Ene — Mother. Omo — Child. Egbon — Elder sibling. Aburo — Younger sibling. Oji — Husband. Aya — Wife. Igala kinship terms reflect a patrilineal system where the father's lineage determines clan membership.",
  },
  {
    language: "igala",
    chunkType: "vocabulary",
    topic: "Numbers 1-10",
    content:
      "Okpa — 1. Eji — 2. Eta — 3. Ele — 4. Elu — 5. Efa — 6. Eje — 7. Ejo — 8. Ila — 9. Igbe — 10. Numbers in Igala follow a decimal system.",
  },
  {
    language: "igala",
    chunkType: "vocabulary",
    topic: "Common verbs",
    content:
      "Je — to eat. Mu — to drink. Lo — to go. Wa — to come. Gbo — to hear/understand. Ma — to know. Che — to do/make. Kwo — to die. Du — to be good. Fu — to give.",
  },
  // Grammar rules
  {
    language: "igala",
    chunkType: "grammar_rule",
    topic: "Tonal patterns",
    content:
      "Igala is a tonal language with three level tones: High (H), Mid (M), and Low (L). Tone distinguishes meaning: 'oko' with high-low means 'farm', while 'oko' with low-high means 'vehicle'. Grammatical tone also marks tense and aspect on verbs.",
  },
  {
    language: "igala",
    chunkType: "grammar_rule",
    topic: "Sentence structure",
    content:
      "Igala follows Subject-Verb-Object (SVO) word order. Example: 'Oma je uchu' — The child eats food. Adjectives follow the noun they modify. Questions are formed by intonation or by adding question particles.",
  },
  {
    language: "igala",
    chunkType: "grammar_rule",
    topic: "Noun classes and pluralization",
    content:
      "Igala does not use noun class prefixes like Bantu languages. Pluralization is often indicated by context, numerals, or quantifiers rather than morphological marking on the noun itself. 'Oma' can mean 'child' or 'children' depending on context.",
  },
  // Cultural notes
  {
    language: "igala",
    chunkType: "cultural_note",
    topic: "Masquerade festivals (Egwu)",
    content:
      "Egwu masquerade festivals are central to Igala cultural life. Masquerades represent ancestral spirits and appear during festivals, funerals, and important ceremonies. The Attah of Igala (paramount ruler) presides over major masquerade events. Speaking about masquerades requires cultural sensitivity — they are sacred, not performance.",
  },
  {
    language: "igala",
    chunkType: "cultural_note",
    topic: "Naming ceremonies",
    content:
      "Igala naming ceremonies occur on the seventh day after birth. Names carry deep meaning and often reflect circumstances of birth, family aspirations, or religious beliefs. Examples: 'Ameh' (born during harvest), 'Onuh' (born on a market day), 'Idakwo' (father's lineage protects). The ceremony involves elders, prayers, and sharing kola nuts.",
  },
  {
    language: "igala",
    chunkType: "cultural_note",
    topic: "Greetings and respect culture",
    content:
      "Greetings in Igala culture are elaborate and context-dependent. Younger people greet elders first, often with prostration (males) or kneeling (females). Time of day, activity being performed, and social relationship all influence the greeting form. Failing to greet properly is considered disrespectful.",
  },
  // Example dialogues
  {
    language: "igala",
    chunkType: "example_dialogue",
    topic: "Market interaction",
    content:
      "A: Ane ojo! (Good morning!)\nB: Ane ojo! Ojo du? (Good morning! How is the morning?)\nA: Ojo du. Elo ni oma-a? (Morning is fine. How much is this?)\nB: Igbe naira. (Ten naira.)\nA: O du. Ma fu mi. (That's good. Give it to me.)",
  },
  {
    language: "igala",
    chunkType: "example_dialogue",
    topic: "Introducing yourself",
    content:
      "A: Ojoolo! Ene mi ni... (Welcome! My name is...)\nB: Ojoolo! Ene mi ni... Mi wa lati... (Welcome! My name is... I come from...)\nA: O du. A ma che? (Good. What do you do?)\nB: Mi che uka. (I am a farmer.)",
  },
  // Translation pairs
  {
    language: "igala",
    chunkType: "translation_pair",
    topic: "Common expressions",
    content:
      "Thank you — O che. Please — Ejoo. I'm sorry — Ma binu. How are you? — Ojo du? I am fine — Mi du. Where are you going? — Ibo lo n lo? Come here — Wa bi. I don't understand — Mi o gbo.",
  },
];

async function main() {
  console.log("Seeding RAG entries...");

  for (const entry of igalaEntries) {
    await prisma.ragEntry.create({
      data: {
        language: entry.language,
        chunkType: entry.chunkType,
        topic: entry.topic,
        content: entry.content,
        source: "seed",
        verificationStatus: "seed",
        // embedding: null — not generating embeddings without API key
      },
    });
  }

  console.log(`Seeded ${igalaEntries.length} Igala entries.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
