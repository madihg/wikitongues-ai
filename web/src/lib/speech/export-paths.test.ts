import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { canExportLicensed, canExportOpen, neverLeaves } from "./guard";
import { buildOpenManifest } from "./manifest";
import { licensedRow, openRow } from "./fixtures";
import type { ManifestRow } from "./manifest";

// The export ROUTE is an entry point too: drive it with the database mocked.
const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: { speechRecording: { findMany: vi.fn() } },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { GET as exportRoute } from "@/app/api/lab/speech/export/route";
import { exportOpenManifest } from "../../../scripts/speech/export-manifest";

beforeEach(() => {
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "r1",
    role: "RESEARCHER",
  });
});

/**
 * THE export-path test (design: "Guards as code"). Every function that can
 * let a clip leave the platform is listed here as an entry point that takes
 * rows and returns the rows (by id) it would release. Each entry point must
 * refuse a COMMUNITY-ONLY row and a TEST-SET row, whatever else is true of
 * them. A new export path is added to ENTRY_POINTS in the same commit that
 * creates it.
 */

type EntryPoint = {
  name: string;
  released: (rows: ManifestRow[]) => Promise<string[]> | string[];
};

const gated = {
  consent: { commercialLicensing: true, crossBorder: true },
  gatedDelivery: true,
};

const ENTRY_POINTS: EntryPoint[] = [
  {
    name: "guard.canExportOpen",
    released: (rows) => rows.filter(canExportOpen).map((r) => r.id),
  },
  {
    name: "guard.canExportLicensed (gated delivery context)",
    released: (rows) =>
      rows.filter((r) => canExportLicensed(r, gated)).map((r) => r.id),
  },
  {
    name: "manifest.buildOpenManifest",
    released: (rows) => {
      // Lines carry no id; tag each row's path with its id to read it back.
      const tagged = rows.map((r) => ({ ...r, storagePath: r.id }));
      return buildOpenManifest(tagged).map((l) => l.clip);
    },
  },
  {
    // The route is handed EVERY row regardless of its query, so only the
    // guard stands between a forbidden row and the response.
    name: "route GET /api/lab/speech/export",
    released: async (rows) => {
      mockPrisma.speechRecording.findMany.mockResolvedValue(
        rows.map((r) => ({ ...r, storagePath: r.id })),
      );
      const text = await (await exportRoute()).text();
      return text
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l).clip as string);
    },
  },
  {
    name: "script scripts/speech/export-manifest.ts (exportOpenManifest)",
    released: (rows) =>
      exportOpenManifest(rows.map((r) => ({ ...r, storagePath: r.id })))
        .jsonl.split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l).clip as string),
  },
];

/** Rows that must never leave, each otherwise perfect for BOTH tiers. */
function forbiddenRows(): ManifestRow[] {
  return [
    openRow({ id: "community-open", tier: "community_only" }),
    openRow({
      id: "community-licensed",
      tier: "community_only",
      publishedOpenAt: null,
    }),
    openRow({ id: "testset-open", isTestSet: true }),
    licensedRow({ id: "testset-licensed", isTestSet: true }),
    openRow({
      id: "frozen-prompt",
      prompt: { isHoldout: true, split: "test" },
    }),
  ];
}

describe.each(ENTRY_POINTS)("export entry point: $name", (entry) => {
  it("refuses community_only rows", async () => {
    const out = await entry.released(forbiddenRows());
    expect(out.filter((id) => id.startsWith("community"))).toEqual([]);
  });

  it("refuses test-set rows and rows on frozen prompts", async () => {
    const out = await entry.released(forbiddenRows());
    expect(
      out.filter((id) => id.startsWith("testset") || id === "frozen-prompt"),
    ).toEqual([]);
  });

  it("releases nothing when given only forbidden rows", async () => {
    expect(await entry.released(forbiddenRows())).toEqual([]);
  });

  it("still releases an eligible row of its own tier (the guard is not a blanket no)", async () => {
    const eligible = entry.name.includes("canExportLicensed")
      ? licensedRow({ id: "fine" })
      : openRow({ id: "fine" });
    const out = await entry.released([...forbiddenRows(), eligible]);
    expect(out).toEqual(["fine"]);
  });
});

describe("neverLeaves is the shared floor", () => {
  it("is true for every forbidden row", () => {
    for (const r of forbiddenRows()) expect(neverLeaves(r), r.id).toBe(true);
  });
});

/**
 * The registry above must not rot: every non-test source file in the lab that
 * mentions an export predicate or the manifest builder is a registered entry
 * point, and any route or script with "export" in its path is registered.
 * Add the new path to ENTRY_POINTS and to REGISTERED_FILES together.
 */
const REGISTERED_FILES = [
  "src/lib/speech/guard.ts", // defines the predicates
  "src/lib/speech/manifest.ts", // buildOpenManifest, the one builder
  "src/app/api/lab/speech/export/route.ts", // the export route
  "src/lib/speech/open-rows.ts", // the shared candidate query (narrowing only)
  "scripts/speech/export-manifest.ts", // the export script
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name))
      out.push(full);
  }
  return out;
}

describe("the entry-point registry is complete", () => {
  const web = join(__dirname, "..", "..", "..");
  const roots = ["src/lib/speech", "src/app/api/lab", "scripts/speech"];
  const files = roots.flatMap((r) => {
    try {
      return sourceFiles(join(web, r));
    } catch {
      return []; // a root that does not exist yet
    }
  });

  it("every file that uses the export guard or builder is registered", () => {
    const users = files
      .map((f) => relative(web, f))
      .filter((rel) => {
        const src = readFileSync(join(web, rel), "utf8");
        return /canExportOpen|canExportLicensed|buildOpenManifest|neverLeaves/.test(
          src,
        );
      })
      .filter((rel) => !rel.endsWith("fixtures.ts"));
    for (const rel of users) {
      expect(
        REGISTERED_FILES,
        `${rel} uses the export guard but is not registered`,
      ).toContain(rel);
    }
  });

  it("every route or script with export in its path is registered", () => {
    const exporters = files
      .map((f) => relative(web, f))
      .filter((rel) => /export/i.test(rel));
    for (const rel of exporters) {
      expect(
        REGISTERED_FILES,
        `${rel} looks like an export path but is not registered`,
      ).toContain(rel);
    }
  });

  it("every registered file exists", () => {
    for (const rel of REGISTERED_FILES) {
      expect(() => statSync(join(web, rel)), rel).not.toThrow();
    }
  });
});
