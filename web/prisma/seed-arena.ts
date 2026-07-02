import { PrismaClient, type CandidateKind } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Seed the arena's baseline candidate registry. These are the closed-API
 * variants that run today; fine-tuned open-weights variants get registered
 * automatically by the flywheel later. Run: pnpm seed:arena
 */

interface CandidateSeed {
  name: string;
  slug: string;
  family: string;
  provider: string;
  baseModelId: string;
  kind: CandidateKind;
  ragEnabled?: boolean;
  useSystemPrompt?: boolean;
  systemPrompt?: string;
  color: string;
  versionLabel?: string;
}

const IGALA_SYSTEM =
  "You are a careful Igala language assistant. Igala is a tonal West Benue-Congo " +
  "language of Kogi State, Nigeria. Honor Igala orthography (including tone and " +
  "underdot diacritics), register and honorifics, and cultural values. Never confuse " +
  "Igala with neighboring languages, and say when you are unsure rather than guessing.";

const CANDIDATES: CandidateSeed[] = [
  {
    name: "Claude Opus 4.8",
    slug: "claude-sonnet-4-5-baseline",
    family: "claude",
    provider: "anthropic",
    baseModelId: "claude-opus-4-8",
    kind: "baseline",
    color: "#b5512f",
  },
  {
    name: "GPT-4.1",
    slug: "gpt-4o-baseline",
    family: "gpt",
    provider: "openai",
    baseModelId: "gpt-4.1",
    kind: "baseline",
    color: "#4f7a5e",
  },
  {
    name: "Gemini 2.5 Flash",
    slug: "gemini-2-0-flash-baseline",
    family: "gemini",
    provider: "google",
    baseModelId: "gemini-2.5-flash",
    kind: "baseline",
    color: "#3f5a8a",
  },
  {
    name: "Claude Opus 4.8 + Igala RAG",
    slug: "claude-sonnet-4-5-rag",
    family: "claude",
    provider: "anthropic",
    baseModelId: "claude-opus-4-8",
    kind: "rag",
    ragEnabled: true,
    useSystemPrompt: true,
    systemPrompt: IGALA_SYSTEM,
    color: "#e0a21f",
    versionLabel: "rag",
  },
  {
    name: "Gemini 2.5 Flash + Igala RAG",
    slug: "gemini-2-0-flash-rag",
    family: "gemini",
    provider: "google",
    baseModelId: "gemini-2.5-flash",
    kind: "rag",
    ragEnabled: true,
    useSystemPrompt: true,
    systemPrompt: IGALA_SYSTEM,
    color: "#9c6a13",
    versionLabel: "rag",
  },
];

async function main() {
  for (const c of CANDIDATES) {
    await prisma.candidateModel.upsert({
      where: { slug: c.slug },
      update: {
        name: c.name,
        family: c.family,
        provider: c.provider,
        baseModelId: c.baseModelId,
        kind: c.kind,
        ragEnabled: c.ragEnabled ?? false,
        useSystemPrompt: c.useSystemPrompt ?? false,
        systemPrompt: c.systemPrompt ?? null,
        color: c.color,
        versionLabel: c.versionLabel ?? null,
        isPublic: true,
        language: "igala",
      },
      create: {
        name: c.name,
        slug: c.slug,
        family: c.family,
        provider: c.provider,
        baseModelId: c.baseModelId,
        kind: c.kind,
        ragEnabled: c.ragEnabled ?? false,
        useSystemPrompt: c.useSystemPrompt ?? false,
        systemPrompt: c.systemPrompt ?? null,
        color: c.color,
        versionLabel: c.versionLabel ?? null,
        isPublic: true,
        language: "igala",
      },
    });
    console.log(`  candidate: ${c.name}`);
  }
  console.log(`Seeded ${CANDIDATES.length} baseline candidates.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
