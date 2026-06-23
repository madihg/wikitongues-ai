import {
  PrismaClient,
  EvalBucket,
  DifficultyLevel,
  PromptSplit,
} from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

interface SeedPrompt {
  promptId: string;
  bucket: EvalBucket;
  text: string;
  difficultyLevel: DifficultyLevel;
  split: PromptSplit;
  isHoldout: boolean;
  provenance: string;
  targetCulture?: string;
  expectedCulturalContext?: string;
}

// A small Igala-only seed catalogue. Prompts spread across the 8 EvalBucket
// values, with a handful marked as held-out test prompts.
const prompts: SeedPrompt[] = [
  {
    promptId: "ig_orth_001",
    bucket: "orthography",
    text: "Write the Igala word for 'morning' with correct spelling and diacritics.",
    difficultyLevel: "basic",
    split: "train",
    isHoldout: false,
    provenance: "community_authored",
  },
  {
    promptId: "ig_gram_001",
    bucket: "grammar_tone",
    text: "Translate 'The child eats food' into Igala, keeping correct SVO word order.",
    difficultyLevel: "intermediate",
    split: "train",
    isHoldout: false,
    provenance: "community_authored",
  },
  {
    promptId: "ig_lex_001",
    bucket: "lexicon_disambig",
    text: "Give the Igala word for 'vehicle' and explain how tone distinguishes it from 'farm'.",
    difficultyLevel: "advanced",
    split: "dev",
    isHoldout: false,
    provenance: "community_authored",
  },
  {
    promptId: "ig_dial_001",
    bucket: "dialectal_fidelity",
    text: "Provide a greeting that varies across Igala dialects and note the differences.",
    difficultyLevel: "intermediate",
    split: "train",
    isHoldout: false,
    provenance: "community_authored",
  },
  {
    promptId: "ig_reg_001",
    bucket: "register_honorifics",
    text: "Show how a younger person should respectfully greet an elder in Igala.",
    difficultyLevel: "intermediate",
    split: "test",
    isHoldout: true,
    provenance: "community_authored",
    expectedCulturalContext:
      "Igala greetings are hierarchical; younger people greet elders first, often with prostration or kneeling.",
  },
  {
    promptId: "ig_idiom_001",
    bucket: "idioms_metaphor",
    text: "Explain the meaning of a common Igala proverb about legacy and the value of stories.",
    difficultyLevel: "advanced",
    split: "test",
    isHoldout: true,
    provenance: "community_authored",
  },
  {
    promptId: "ig_cult_001",
    bucket: "cultural_values",
    text: "Describe the cultural significance of Egwu masquerade festivals in Igala society.",
    difficultyLevel: "advanced",
    split: "test",
    isHoldout: true,
    provenance: "community_authored",
    targetCulture: "Igala",
    expectedCulturalContext:
      "Masquerades represent ancestral spirits and are sacred, not entertainment.",
  },
  {
    promptId: "ig_auth_001",
    bucket: "authenticity",
    text: "Write a short, natural Igala blessing as a community member would say it, not back-translated from English.",
    difficultyLevel: "intermediate",
    split: "train",
    isHoldout: false,
    provenance: "community_authored",
  },
];

async function main() {
  console.log("Seeding database...");

  // Create test users (login still works with password "password")
  const annotatorHash = await hash("password", 12);
  const researcherHash = await hash("password", 12);

  const annotator = await prisma.user.upsert({
    where: { email: "annotator@test.com" },
    update: {},
    create: {
      email: "annotator@test.com",
      name: "Test Annotator",
      passwordHash: annotatorHash,
      role: "ANNOTATOR",
    },
  });

  await prisma.user.upsert({
    where: { email: "researcher@test.com" },
    update: {},
    create: {
      email: "researcher@test.com",
      name: "Test Researcher",
      passwordHash: researcherHash,
      role: "RESEARCHER",
    },
  });

  // Owner account (Halim) — RESEARCHER role + owner privileges (can switch personas).
  const ownerHash = await hash(process.env.OWNER_PASSWORD || "password", 12);
  await prisma.user.upsert({
    where: { email: "madihalim@gmail.com" },
    update: { role: "RESEARCHER" },
    create: {
      email: "madihalim@gmail.com",
      name: "Halim Madi",
      passwordHash: ownerHash,
      role: "RESEARCHER",
    },
  });

  console.log("Created users (incl. owner madihalim@gmail.com)");

  // Add annotator language (Igala only)
  await prisma.annotatorLanguage.upsert({
    where: {
      userId_language: { userId: annotator.id, language: "igala" },
    },
    update: {},
    create: {
      userId: annotator.id,
      language: "igala",
      expertiseLevel: "native",
    },
  });

  console.log("Added annotator language");

  let promptCount = 0;
  for (const prompt of prompts) {
    await prisma.prompt.upsert({
      where: { promptId: prompt.promptId },
      update: {},
      create: {
        promptId: prompt.promptId,
        bucket: prompt.bucket,
        language: "igala",
        text: prompt.text,
        targetCulture: prompt.targetCulture ?? null,
        expectedCulturalContext: prompt.expectedCulturalContext ?? null,
        difficultyLevel: prompt.difficultyLevel,
        split: prompt.split,
        isHoldout: prompt.isHoldout,
        provenance: prompt.provenance,
        createdById: annotator.id,
      },
    });
    promptCount++;
  }

  console.log(`Seeded ${promptCount} prompts total`);
  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
