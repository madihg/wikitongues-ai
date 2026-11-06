import { createHash } from "node:crypto";
import { baseMime, recordingPath } from "../../src/lib/speech/storage";

/**
 * Copy clips that live only in Postgres into the private bucket (US-038).
 *
 *   npx tsx --env-file=.env.local scripts/speech/backfill-storage.ts [--dry-run]
 *
 * For each uploaded row with bytes and no storageKey: check the bytes still
 * hash to checksumSha256, upload them, download them back, verify the sha256
 * of what came back equals checksumSha256, and only then set storageKey.
 * Bytes are never deleted or changed. Needs SUPABASE_SERVICE_ROLE_KEY and
 * SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL); SPEECH_STORAGE is not needed
 * here. Output is ids and counts only, never audio or text.
 */

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

export interface BackfillRow {
  id: string;
  mimeType: string;
  checksumSha256: string | null;
  bytes: Uint8Array;
}

export interface BackfillDeps {
  put: (key: string, bytes: Uint8Array, mime: string) => Promise<void>;
  download: (key: string) => Promise<Uint8Array>;
  mark: (id: string, key: string) => Promise<void>;
}

export interface BackfillResult {
  total: number;
  moved: number;
  failed: { id: string; reason: string }[];
}

/** The pure core: rows in, copies verified, rows marked. Used by main() and the tests. */
export async function backfillRows(
  rows: BackfillRow[],
  deps: BackfillDeps,
  opts: { dryRun: boolean },
): Promise<BackfillResult> {
  const result: BackfillResult = { total: rows.length, moved: 0, failed: [] };
  if (opts.dryRun) return result;
  for (const row of rows) {
    const fail = (reason: string) => result.failed.push({ id: row.id, reason });
    if (!row.checksumSha256) {
      fail("no checksumSha256 to verify against");
      continue;
    }
    if (sha256(row.bytes) !== row.checksumSha256) {
      fail("row bytes do not match checksumSha256");
      continue;
    }
    try {
      const key = recordingPath(row.id, row.mimeType);
      try {
        await deps.put(key, row.bytes, baseMime(row.mimeType));
      } catch {
        // An object left by an earlier run is fine if it verifies below.
      }
      const back = await deps.download(key);
      if (sha256(back) !== row.checksumSha256) {
        fail("checksum mismatch after upload");
        continue;
      }
      await deps.mark(row.id, key);
      result.moved++;
    } catch (e) {
      fail(e instanceof Error ? e.message : "error");
    }
  }
  return result;
}

async function main() {
  const dryRun = process.argv.slice(2).includes("--dry-run");
  const { PrismaClient } = await import("@prisma/client");
  const { putClip, downloadClip } =
    await import("../../src/lib/speech/storage-supabase");
  const prisma = new PrismaClient();
  try {
    const pending = await prisma.speechRecording.findMany({
      where: {
        bytes: { not: null },
        storageKey: null,
        uploadedAt: { not: null },
      },
      select: { id: true, mimeType: true, checksumSha256: true },
      orderBy: { createdAt: "asc" },
    });
    console.error(`${pending.length} clip(s) have bytes and no storageKey`);

    async function* withBytes(): AsyncGenerator<BackfillRow> {
      for (const p of pending) {
        const full = await prisma.speechRecording.findUnique({
          where: { id: p.id },
          select: { bytes: true },
        });
        if (full?.bytes) yield { ...p, bytes: new Uint8Array(full.bytes) };
      }
    }
    // One row in memory at a time: run the core per row.
    const total: BackfillResult = {
      total: pending.length,
      moved: 0,
      failed: [],
    };
    const deps: BackfillDeps = {
      put: putClip,
      download: downloadClip,
      mark: async (id, key) => {
        await prisma.speechRecording.updateMany({
          where: { id, storageKey: null },
          data: { storageKey: key },
        });
      },
    };
    if (!dryRun) {
      for await (const row of withBytes()) {
        const r = await backfillRows([row], deps, { dryRun: false });
        total.moved += r.moved;
        total.failed.push(...r.failed);
      }
    }
    console.error(
      dryRun
        ? `dry run: would copy ${total.total} clip(s); nothing written`
        : `moved ${total.moved} of ${total.total}; ${total.failed.length} failed`,
    );
    for (const f of total.failed) console.error(`failed ${f.id}: ${f.reason}`);
    if (total.failed.length) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when invoked as a script, never when imported by a test.
if (process.argv[1]?.endsWith("backfill-storage.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
