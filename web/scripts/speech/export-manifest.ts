import { writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import {
  buildOpenManifest,
  toJsonl,
  type ManifestRow,
} from "../../src/lib/speech/manifest";
import { loadOpenRows } from "../../src/lib/speech/open-rows";

/**
 * Write the OPEN speech manifest (JSONL) for clips that may be published
 * under CC-BY 4.0. Same guard as the export route: rows pass through
 * buildOpenManifest -> canExportOpen, so COMMUNITY-ONLY, test-set, demo,
 * non-consented, unpublished, rights-pending and bad-audio rows never appear,
 * and LICENSED clips are out of scope here (they leave only through the
 * gated delivery path).
 *
 *   npx tsx --env-file=.env.local scripts/speech/export-manifest.ts [--out FILE]
 *
 * Without --out the JSONL goes to stdout and the counts to stderr. The output
 * holds real contributor transcripts, and this repository is public, so --out
 * refuses any path inside the repository work tree.
 */

const REPO_ROOT = resolve(__dirname, "..", "..", "..");

/** Throw if `out` would land inside the repository (real data must not be committable). */
export function assertOutsideRepo(
  out: string,
  repoRoot: string = REPO_ROOT,
): string {
  const full = resolve(out);
  if (full === repoRoot || full.startsWith(repoRoot + sep)) {
    throw new Error(
      "Refusing to write real contributor data inside the repository. Choose a path outside it.",
    );
  }
  return full;
}

export interface ExportResult {
  jsonl: string;
  exported: number;
  /** Candidate rows the guard refused. */
  refused: number;
}

/** The pure core: rows in, guarded JSONL out. Used by main() and by the tests. */
export function exportOpenManifest(rows: ManifestRow[]): ExportResult {
  const lines = buildOpenManifest(rows);
  return {
    jsonl: toJsonl(lines),
    exported: lines.length,
    refused: rows.length - lines.length,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const out = outIdx >= 0 ? args[outIdx + 1] : undefined;
  if (outIdx >= 0 && !out)
    throw new Error("usage: export-manifest.ts [--out FILE]");
  const target = out ? assertOutsideRepo(out) : null;

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const result = exportOpenManifest(await loadOpenRows(prisma));
    if (target) writeFileSync(target, result.jsonl, { mode: 0o600 });
    else process.stdout.write(result.jsonl);
    console.error(
      `exported ${result.exported} clip(s); the guard refused ${result.refused} candidate row(s)` +
        (target ? `; wrote ${target}` : ""),
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when invoked as a script, never when imported by a test.
if (process.argv[1]?.endsWith("export-manifest.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
