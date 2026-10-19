import { describe, it, expect } from "vitest";
import { canExportLicensed, canExportOpen, neverLeaves } from "./guard";
import { buildOpenManifest } from "./manifest";
import { licensedRow, openRow } from "./fixtures";
import type { ManifestRow } from "./manifest";

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
