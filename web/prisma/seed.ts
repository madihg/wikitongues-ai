import { PrismaClient, PromptCategory, DifficultyLevel } from "@prisma/client";
import { hash } from "bcryptjs";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

const prisma = new PrismaClient();

const categoryMap: Record<string, PromptCategory> = {
  real_world_use: "real_world_use",
  words_concepts: "words_concepts",
  frontier_aspirations: "frontier_aspirations",
  abstract_vs_everyday: "abstract_vs_everyday",
};

const difficultyMap: Record<string, DifficultyLevel> = {
  basic: "basic",
  intermediate: "intermediate",
  advanced: "advanced",
};

async function main() {
  console.log("Seeding database...");

  // Create test users
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

  console.log("Created test users");

  // Add annotator languages
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

  await prisma.annotatorLanguage.upsert({
    where: {
      userId_language: { userId: annotator.id, language: "lebanese_arabic" },
    },
    update: {},
    create: {
      userId: annotator.id,
      language: "lebanese_arabic",
      expertiseLevel: "native",
    },
  });

  console.log("Added annotator languages");

  // Import prompts from YAML files
  const promptsDir = join(__dirname, "../../data/prompts");
  const files = readdirSync(promptsDir).filter(
    (f) => f.endsWith(".yaml") && f !== "schema.yaml",
  );

  let promptCount = 0;

  for (const file of files) {
    const content = readFileSync(join(promptsDir, file), "utf-8");
    const data = parse(content);

    if (!data?.prompts) continue;

    for (const prompt of data.prompts) {
      await prisma.prompt.upsert({
        where: { promptId: prompt.id },
        update: {},
        create: {
          promptId: prompt.id,
          category: categoryMap[prompt.category],
          language: prompt.language,
          text: prompt.text,
          sourceLanguage: prompt.source_language || null,
          targetCulture: prompt.target_culture || null,
          expectedCulturalContext: prompt.expected_cultural_context || null,
          difficultyLevel:
            difficultyMap[prompt.difficulty_level] || "intermediate",
        },
      });
      promptCount++;
    }

    console.log(`Imported prompts from ${file}`);
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
