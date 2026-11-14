import type { PrismaClient } from "@prisma/client";

/**
 * Seed the third-party audio register (US-039) with the three outside sources
 * under consideration. Run by hand, not a migration:
 *
 *   npx tsx --env-file=.env.local scripts/speech/seed-rights-register.ts
 *
 * Idempotent: a source already in the register (matched by name) is left
 * exactly as it is, so a status a researcher has set is never reset. Every row
 * starts "pending". The licence text is a placeholder until someone reads the
 * source's actual terms and pastes them in; the open questions are the things
 * that must be answered before the status can leave pending.
 */
export const RIGHTS_SEED = [
  {
    name: "GRN Words of Life (45 min)",
    sourceRef: "grn-words-of-life",
    licenseText:
      "Not yet read. Paste the licence or permission text here once obtained.",
    notes:
      "Does the licence permit redistribution of segments? Does it permit model training? Who at GRN confirms in writing?",
  },
  {
    name: "Hypa-Speech-10k",
    sourceRef: "hypa-speech-10k",
    licenseText:
      "Not yet read. Paste the dataset licence text here once checked.",
    notes:
      "Which licence applies to the Igala part? Does it permit training and redistribution of segments? Is attribution required?",
  },
  {
    name: "Lanfrica / NaijaVoices",
    sourceRef: "lanfrica-naijavoices",
    licenseText:
      "Not yet read. Paste the dataset licence text here once checked.",
    notes:
      "Which licence applies to the Igala part? Does it permit training and redistribution of segments? Who holds the speakers' consent?",
  },
] as const;

type Db = Pick<PrismaClient, "thirdPartyAudioSource">;

/** Create the sources that are missing; return how many were created. */
export async function seedRightsRegister(db: Db): Promise<number> {
  let created = 0;
  for (const s of RIGHTS_SEED) {
    const found = await db.thirdPartyAudioSource.findFirst({
      where: { name: s.name },
      select: { id: true },
    });
    if (found) continue;
    await db.thirdPartyAudioSource.create({
      data: { ...s, rightsStatus: "pending" },
    });
    created++;
  }
  return created;
}

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const created = await seedRightsRegister(prisma);
    console.error(
      `rights register: ${created} source(s) created, ${RIGHTS_SEED.length - created} already there`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when invoked as a script, never when imported by a test.
if (process.argv[1]?.endsWith("seed-rights-register.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
