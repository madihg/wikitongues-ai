import { describe, it, expect } from "vitest";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  assertOutsideRepo,
  exportOpenManifest,
} from "../../../scripts/speech/export-manifest";
import { licensedRow, openRow } from "./fixtures";

/**
 * The script's pure core, on a synthetic fixture: no database, no files
 * written. The same guard as the route, proved from this entry point too
 * (the shared proof is export-paths.test.ts).
 */

const FIXTURE = [
  openRow({ id: "ok-1", storagePath: "clips/ok-1.webm" }),
  openRow({
    id: "ok-2",
    storagePath: "clips/ok-2.webm",
    annotatorId: "speaker-account-2",
  }),
  openRow({
    id: "community",
    storagePath: "clips/community.webm",
    tier: "community_only",
  }),
  openRow({
    id: "testset",
    storagePath: "clips/testset.webm",
    isTestSet: true,
  }),
  openRow({
    id: "frozen",
    storagePath: "clips/frozen.webm",
    prompt: { isHoldout: true, split: "test" },
  }),
  openRow({ id: "demo", storagePath: "clips/demo.webm", isDemo: true }),
  openRow({
    id: "noconsent",
    storagePath: "clips/noconsent.webm",
    consentId: null,
  }),
  openRow({
    id: "bad",
    storagePath: "clips/bad.webm",
    reviewStatus: "bad_audio",
  }),
  openRow({
    id: "pending",
    storagePath: "clips/pending.webm",
    rightsStatus: "pending",
  }),
  licensedRow({ id: "licensed", storagePath: "clips/licensed.webm" }),
];

describe("exportOpenManifest (scripts/speech/export-manifest.ts)", () => {
  it("exports exactly the guard-approved rows and counts the refusals", () => {
    const result = exportOpenManifest(FIXTURE);
    const clips = result.jsonl
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l).clip);
    expect(clips).toEqual(["clips/ok-1.webm", "clips/ok-2.webm"]);
    expect(result.exported).toBe(2);
    expect(result.refused).toBe(8);
  });

  it("a frozen prompt and a non-consented row never reach the manifest", () => {
    const text = exportOpenManifest(FIXTURE).jsonl;
    expect(text).not.toContain("frozen.webm");
    expect(text).not.toContain("noconsent.webm");
  });

  it("every line is CC-BY-4.0 OPEN with a pseudonymous speaker", () => {
    for (const l of exportOpenManifest(FIXTURE).jsonl.trim().split("\n")) {
      const line = JSON.parse(l);
      expect(line.tier).toBe("open");
      expect(line.license).toBe("CC-BY-4.0");
      expect(line.speaker).toMatch(/^spk_/);
      expect(l).not.toContain("speaker-account");
    }
  });

  it("an empty candidate list gives an empty file", () => {
    expect(exportOpenManifest([])).toEqual({
      jsonl: "",
      exported: 0,
      refused: 0,
    });
  });
});

describe("assertOutsideRepo", () => {
  const repo = resolve("/work/repo");

  it("refuses a path inside the repository, at any depth", () => {
    expect(() => assertOutsideRepo("/work/repo/out.jsonl", repo)).toThrow(
      /inside the repository/,
    );
    expect(() =>
      assertOutsideRepo("/work/repo/web/tmp/out.jsonl", repo),
    ).toThrow();
    expect(() => assertOutsideRepo("/work/repo", repo)).toThrow();
  });

  it("allows a path outside it, including a sibling that shares a name prefix", () => {
    expect(assertOutsideRepo(join(tmpdir(), "out.jsonl"), repo)).toBe(
      join(tmpdir(), "out.jsonl"),
    );
    expect(assertOutsideRepo("/work/repo-other/out.jsonl", repo)).toBe(
      "/work/repo-other/out.jsonl",
    );
  });
});
