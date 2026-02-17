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

const lebaneseArabicEntries: SeedEntry[] = [
  // Vocabulary
  {
    language: "lebanese_arabic",
    chunkType: "vocabulary",
    topic: "Basic greetings",
    content:
      "Marhaba (مرحبا) — Hello. Kifak/Kifik (كيفك) — How are you? (m/f). Mniiha/Mniih (منيحة/منيح) — I'm good (f/m). Ahla w sahla (اهلا و سهلا) — Welcome. Sabah el-kheir (صباح الخير) — Good morning. Masa el-kheir (مسا الخير) — Good evening.",
  },
  {
    language: "lebanese_arabic",
    chunkType: "vocabulary",
    topic: "Family terms",
    content:
      "Bayye (بيّي) — My father. Emme (إمّي) — My mother. Khayyé (خيّي) — My brother. Ekhte (أختي) — My sister. Jedde (جدّي) — My grandfather. Teta (تيتا) — My grandmother. Ammo (عمّو) — Paternal uncle. Khalo (خالو) — Maternal uncle. 'Aayle (عيلة) — Family.",
  },
  {
    language: "lebanese_arabic",
    chunkType: "vocabulary",
    topic: "Food and dining",
    content:
      "Akil (أكل) — Food. Khubez (خبز) — Bread. Mayy (مي) — Water. Ahwe (قهوة) — Coffee. Tabkha (طبخة) — Cooked dish. Tfaddal/Tfaddali (تفضّل/تفضّلي) — Please, go ahead / help yourself (m/f). Sahtein (صحتين) — Bon appetit (lit. 'two healths').",
  },
  {
    language: "lebanese_arabic",
    chunkType: "vocabulary",
    topic: "Common verbs",
    content:
      "Haki/Ehki (حكي/إحكي) — to speak/talk. Akol (آكُل) — to eat. Eshrab (إشرب) — to drink. Rouh (روح) — to go. Ta'a (تعا) — to come. Baddé (بدّي) — I want. Fhimt (فهمت) — I understood. Ma ba'ref (ما بعرف) — I don't know.",
  },
  // Grammar rules
  {
    language: "lebanese_arabic",
    chunkType: "grammar_rule",
    topic: "Verb conjugation basics",
    content:
      "Lebanese Arabic simplifies MSA verb conjugation. Present tense uses 'b-' prefix: b-ehki (I speak), bt-ehki (you speak), bi-yehki (he speaks), bt-ehki (she speaks). Future uses 'rah' or 'ha': rah rouh (I will go). Negation wraps the verb: ma b-ehki (I don't speak).",
  },
  {
    language: "lebanese_arabic",
    chunkType: "grammar_rule",
    topic: "Levantine pronoun system",
    content:
      "Ana (أنا) — I. Enta/Ente (إنتَ/إنتِ) — You (m/f). Huwwe (هوّي) — He. Hiyye (هيّي) — She. Nehna (نحنا) — We. Entu (إنتو) — You (pl). Hennen (هنّي) — They. Possessive suffixes: -é (my), -ak/-ik (your m/f), -o/-a (his/her), -na (our), -kon (your pl), -on (their).",
  },
  {
    language: "lebanese_arabic",
    chunkType: "grammar_rule",
    topic: "Question formation",
    content:
      "Questions often use intonation alone. Common question words: Shu (شو) — What. Min (مين) — Who. Wen (وين) — Where. Eymta (إيمتا) — When. Lesh (ليش) — Why. Kif (كيف) — How. Adesh (أديش) — How much. Kam (كم) — How many. Example: Wen rayih? (Where are you going?)",
  },
  // Cultural notes
  {
    language: "lebanese_arabic",
    chunkType: "cultural_note",
    topic: "Hospitality customs",
    content:
      "Lebanese hospitality (dayfe) is a core cultural value. Guests are offered coffee (ahwe) or tea immediately upon arrival. Refusing food or drink can be seen as impolite — it's customary to accept at least a small amount. The host will insist multiple times (the 'three refusals' custom). When visiting, bringing sweets or flowers is appreciated.",
  },
  {
    language: "lebanese_arabic",
    chunkType: "cultural_note",
    topic: "Code-switching and multilingualism",
    content:
      "Lebanese speakers frequently code-switch between Arabic, French, and English, sometimes within a single sentence. 'Hi, kifak, ça va?' is a famous example blending English, Arabic, and French. This trilingual heritage reflects Lebanon's Ottoman, French Mandate, and modern globalized history. Formal contexts use more MSA; casual speech is heavily mixed.",
  },
  {
    language: "lebanese_arabic",
    chunkType: "cultural_note",
    topic: "Religious and sectarian sensitivity",
    content:
      "Lebanon has 18 recognized religious sects. Language use can reflect religious background — some Christian communities use more French loanwords, while Muslim communities may use more MSA-influenced forms. Greetings can vary: 'Salam' vs 'Marhaba'. It is important to use neutral, inclusive language unless context is clear.",
  },
  // Example dialogues
  {
    language: "lebanese_arabic",
    chunkType: "example_dialogue",
    topic: "Ordering at a restaurant",
    content:
      "A: Marhaba! Shu fi lyom? (Hello! What's available today?)\nB: Fi tabbouleh, fattoush, w meshwi. (There's tabbouleh, fattoush, and grilled meat.)\nA: Tabbouleh w meshwi, iza btireed. (Tabbouleh and grilled meat, please.)\nB: Tekram! Shi tene? (Of course! Anything else?)\nA: Mayy bass. Shukran. (Just water. Thanks.)\nB: Sahtein! (Bon appetit!)",
  },
  {
    language: "lebanese_arabic",
    chunkType: "example_dialogue",
    topic: "Meeting someone new",
    content:
      "A: Ahla w sahla! Shu esmak? (Welcome! What's your name?)\nB: Esme Ahmad. W ente? (My name is Ahmad. And you?)\nA: Ana Maya. Tsharrafna. (I'm Maya. Nice to meet you.)\nB: Ahla fik. Men wen ente? (Nice to meet you too. Where are you from?)\nA: Ana min Beirut. (I'm from Beirut.)",
  },
  // Translation pairs
  {
    language: "lebanese_arabic",
    chunkType: "translation_pair",
    topic: "Common expressions",
    content:
      "Thank you — Merci / Shukran (شكرا). Please — Iza btireed (إذا بتريد). I'm sorry — Sorry / Aasif (آسف). Excuse me — Ba'ed iznak (بعد إذنك). No problem — Mafi mushkle (ما في مشكلة). God willing — Inshallah (إنشاءالله). I love you — Bhibbak/Bhibbik (بحبّك). Goodbye — Bye / Yalla bye / Allah ma'ak (الله معك).",
  },
  {
    language: "lebanese_arabic",
    chunkType: "translation_pair",
    topic: "Everyday phrases",
    content:
      "What time is it? — Adesh el-se'a? (أديش الساعة؟). I'm hungry — Jou'an/Jou'ane (جوعان/جوعانة). Let's go — Yalla (يلّا). Slow down — Shway shway (شوي شوي). It doesn't matter — Ma'lesh (معلش). I miss you — Eshta'tellak/Eshta'tellik (اشتقتلّك). That's enough — Khalas (خلص).",
  },
];

async function main() {
  console.log("Seeding RAG entries...");

  const allEntries = [...igalaEntries, ...lebaneseArabicEntries];

  for (const entry of allEntries) {
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

  const igalaCount = igalaEntries.length;
  const lbCount = lebaneseArabicEntries.length;
  console.log(
    `Seeded ${igalaCount} Igala entries and ${lbCount} Lebanese Arabic entries (${igalaCount + lbCount} total).`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
