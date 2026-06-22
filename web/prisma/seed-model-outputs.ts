import { PrismaClient, EvalBucket } from "@prisma/client";

const prisma = new PrismaClient();

// Realistic fake Igala outputs per model, keyed by evaluation bucket.
const igalaOutputs: Record<string, Partial<Record<EvalBucket, string>>> = {
  claude: {
    orthography:
      "The Igala word for 'morning' is 'ojo'. In the standard orthography, vowels carry tone diacritics where contrastive: 'ojo' (morning) is distinct from 'ojò' in toned text. The greeting 'Ane ojo' means 'Good morning'.",
    grammar_tone:
      "In Igala: 'Oma je uchu' — The child eats food. Igala follows Subject-Verb-Object order, so 'oma' (child) precedes the verb 'je' (eat), which precedes the object 'uchu' (food). Tone also marks aspect on the verb.",
    lexicon_disambig:
      "The Igala word for 'vehicle' is 'oko' (low-high tone), while 'oko' (high-low tone) means 'farm'. Because Igala is Yoruboid, take care not to import Yoruba lexical forms; the observed confusion in practice is with Idoma.",
    dialectal_fidelity:
      "A common greeting is 'Ane ojo' (Good morning). Across Igala dialects the response and vowel quality vary slightly, but no single prestige standard should be imposed — community variants are all valid.",
    register_honorifics:
      "A younger person greets an elder first, often with prostration (males) or kneeling (females), saying 'Ane ojo, baba' with deferential tone. Failing to greet an elder properly is considered disrespectful.",
    idioms_metaphor:
      "The proverb 'Ogba ku ne oche alo' (the elder who dies leaving no story is truly dead) teaches that a person's legacy lives through the stories and knowledge they pass on, not merely through their lifespan.",
    cultural_values:
      "Egwu masquerade festivals are central to Igala cultural life. Masquerades represent ancestral spirits and appear at festivals and funerals under the authority of the Attah of Igala. They are sacred, not entertainment, and require cultural sensitivity to discuss.",
    authenticity:
      "Ojo du, omo mi — a community blessing wishing you a good day and good fortune, spoken as an elder would, drawing on Igala idiom rather than translating an English template.",
  },
  chatgpt: {
    orthography:
      "In Igala, 'morning' is written as 'ojo'. The Igala writing system uses Latin letters with some diacritics. Spelling can vary because Igala has limited standardized orthography.",
    grammar_tone:
      "The sentence 'The child eats food' in Igala is 'Oma je uchu'. Igala uses Subject-Verb-Object word order like English. It is a tonal language so pitch affects meaning.",
    lexicon_disambig:
      "The Igala word for vehicle relates to 'oko'. Igala is a tonal language in the Yoruboid branch of Niger-Congo, so similar-looking words can differ by tone. Verification with native speakers is recommended.",
    dialectal_fidelity:
      "Igala has regional variation across Kogi State. Greetings like 'Ane ojo' are widely understood, though pronunciation differs by area. There is no single official standard dialect.",
    register_honorifics:
      "In Igala culture, younger people show respect to elders when greeting them. This often involves a respectful posture and polite words. Specific honorific forms would benefit from expert review.",
    idioms_metaphor:
      "Igala proverbs often deal with legacy and wisdom. A common theme is that a person who leaves behind stories and knowledge is remembered, while one who leaves nothing is forgotten.",
    cultural_values:
      "The Egwu masquerade tradition is important in Igala culture. Masquerades appear during festivals and represent spirits and ancestors. The Attah of Igala is the traditional ruler associated with these events.",
    authenticity:
      "A short Igala blessing might wish someone a good day and well-being. Natural phrasing would come from a native speaker rather than a direct translation from English.",
  },
  gemini: {
    orthography:
      "'Morning' in Igala is 'ojo'! Igala uses a Latin-based script. Tone is sometimes marked with diacritics, sometimes left to context, which makes consistent spelling tricky.",
    grammar_tone:
      "'Oma je uchu' means 'The child eats food' in Igala. The structure is Subject (oma) - Verb (je) - Object (uchu). Remember Igala is tonal, so tone can change meaning!",
    lexicon_disambig:
      "Great question! In Igala, 'oko' can mean 'vehicle' or 'farm' depending on tone. Since Igala is closely related to Yoruba, be careful not to mix in Yoruba words by mistake.",
    dialectal_fidelity:
      "Igala-speaking communities have their own local flavors. 'Ane ojo' is a friendly morning greeting you'll hear widely, though the exact pronunciation shifts from place to place.",
    register_honorifics:
      "Respect for elders is huge in Igala culture. A younger person greets an elder first, with a respectful posture and tone. The exact honorific words depend on the relationship.",
    idioms_metaphor:
      "Igala proverbs are full of wisdom about legacy. One idea: the elder who leaves no story behind is truly gone, while stories keep a person alive in the community's memory.",
    cultural_values:
      "Egwu masquerades are a fascinating part of Igala life! They represent ancestral spirits and appear at important ceremonies. They're sacred, so they should be discussed respectfully.",
    authenticity:
      "A heartfelt Igala blessing would wish you a bright day and good fortune. The most authentic version would come straight from a community elder, not an English template.",
  },
  gemma: {
    orthography:
      "I have limited knowledge of Igala orthography. The word for 'morning' may be written as 'ojo', but I'm not fully confident about diacritics. Consult Igala language resources for accuracy.",
    grammar_tone:
      "Igala is a tonal language in the Yoruboid branch. A sentence like 'The child eats food' likely follows Subject-Verb-Object order, but I'm not certain of the exact words.",
    lexicon_disambig:
      "I'm not sure of the precise Igala word for 'vehicle'. Igala is tonal, so tone may distinguish meanings. For reliable vocabulary, consulting native Igala speakers is best.",
    dialectal_fidelity:
      "Igala has dialectal variation, but I don't have detailed knowledge of specific differences. Greetings may vary by region. Expert verification is recommended.",
    register_honorifics:
      "Respect for elders is common in Igala culture, and greetings likely reflect this, but I'm not confident about the specific honorific forms used.",
    idioms_metaphor:
      "I have limited data on specific Igala proverbs. Many African languages use proverbs to express ideas about legacy and wisdom, but I cannot provide a verified example.",
    cultural_values:
      "I have limited knowledge about Igala masquerade traditions. Masquerades are common across West African cultures and often connected to ancestral beliefs.",
    authenticity:
      "I'm not confident enough to compose an authentic Igala blessing. A native speaker would provide the most natural phrasing.",
  },
};

function getOutput(bucket: EvalBucket, model: string): string {
  return (
    igalaOutputs[model]?.[bucket] ??
    `Sample ${model} output for an Igala ${bucket} prompt.`
  );
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const modelConfigs = [
  { alias: "claude", modelId: "claude-sonnet-4-5-20250929" },
  { alias: "chatgpt", modelId: "gpt-4o" },
  { alias: "gemini", modelId: "gemini-2.0-flash" },
  { alias: "gemma", modelId: "gemma-2-9b-it" },
];

async function main() {
  console.log("Seeding model outputs...");

  const prompts = await prisma.prompt.findMany({
    orderBy: { promptId: "asc" },
  });

  if (prompts.length === 0) {
    console.log("No prompts found. Run the main seed first.");
    return;
  }

  let created = 0;
  let skipped = 0;

  for (const prompt of prompts) {
    for (const model of modelConfigs) {
      // Check if already exists
      const existing = await prisma.modelOutput.findFirst({
        where: {
          promptId: prompt.id,
          model: model.alias,
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      const outputText = getOutput(prompt.bucket, model.alias);

      await prisma.modelOutput.create({
        data: {
          promptId: prompt.id,
          model: model.alias,
          modelId: model.modelId,
          bucket: prompt.bucket,
          outputText,
          tokenCountIn: randomInt(50, 200),
          tokenCountOut: randomInt(100, 500),
          latencyMs: randomInt(500, 5000),
        },
      });

      created++;
    }
  }

  console.log(
    `Done! Created ${created} model outputs, skipped ${skipped} existing.`,
  );
  console.log(
    `Total prompts: ${prompts.length}, models: ${modelConfigs.length}`,
  );
  console.log(`Expected: ${prompts.length * modelConfigs.length} outputs`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
