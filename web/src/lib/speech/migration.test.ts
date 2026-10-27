import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The Speech Lab migration is generated, reviewed and applied by a human, so
 * the repo proves its shape: every Speech Lab model and enum in schema.prisma
 * is created by migration.sql and removed by down.sql, and neither file
 * carries a destructive statement outside down.sql.
 */
const root = join(__dirname, "..", "..", "..", "prisma");
const dir = join(root, "migrations", "20261019120000_speech_lab");
const up = readFileSync(join(dir, "migration.sql"), "utf8");
const down = readFileSync(join(dir, "down.sql"), "utf8");
const schema = readFileSync(join(root, "schema.prisma"), "utf8");

const MODELS = [
  "Consent",
  "ConsentGrant",
  "SpeechRecording",
  "SpeechComparison",
];
const ENUMS = ["DataTier", "SourceType", "RightsStatus", "ConsentMethod"];

describe("speech lab migration", () => {
  it("creates every model and enum the schema declares", () => {
    for (const m of MODELS) {
      expect(schema).toContain(`model ${m} {`);
      expect(up).toContain(`CREATE TABLE "${m}"`);
    }
    for (const e of ENUMS) {
      expect(schema).toContain(`enum ${e} {`);
      expect(up).toContain(`CREATE TYPE "${e}"`);
    }
  });

  it("down.sql drops exactly what up creates, children first", () => {
    for (const m of MODELS)
      expect(down).toContain(`DROP TABLE IF EXISTS "${m}"`);
    for (const e of ENUMS) expect(down).toContain(`DROP TYPE IF EXISTS "${e}"`);
    expect(down.indexOf('"SpeechComparison"')).toBeLessThan(
      down.indexOf('"SpeechRecording"'),
    );
    expect(down.indexOf('"SpeechRecording"')).toBeLessThan(
      down.indexOf('"Consent"'),
    );
  });

  it("the up migration never drops or alters existing tables", () => {
    expect(up).not.toMatch(/DROP\s+(TABLE|COLUMN|INDEX)/i);
    expect(up).not.toMatch(
      /ALTER TABLE "(?!Consent|SpeechRecording|SpeechComparison|ConsentGrant)/,
    );
  });

  it("tier defaults to community_only and consent flags default to false", () => {
    expect(up).toContain(`"tier" "DataTier" NOT NULL DEFAULT 'community_only'`);
    for (const f of [
      "commercialLicensing",
      "crossBorder",
      "voiceCloning",
      "speakerId",
    ]) {
      expect(up).toContain(`"${f}" BOOLEAN NOT NULL DEFAULT false`);
    }
    expect(up).toContain(`"voiceCloningOptIn" BOOLEAN NOT NULL DEFAULT false`);
  });
});

/**
 * The second slice is four additive columns. Same discipline: the up file
 * only adds, the down file only drops what the up file added, and the
 * schema declares exactly those columns.
 */
describe("speech lab 2 migration", () => {
  const dir2 = join(root, "migrations", "20261026120000_speech_lab_2");
  const up2 = readFileSync(join(dir2, "migration.sql"), "utf8");
  const down2 = readFileSync(join(dir2, "down.sql"), "utf8");

  it("adds language, bytes and quality to SpeechRecording and axes to SpeechComparison", () => {
    expect(up2).toContain('ALTER TABLE "SpeechRecording"');
    expect(up2).toContain('ADD COLUMN     "bytes" BYTEA');
    expect(up2).toContain(`ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'igala'`);
    expect(up2).toContain('ADD COLUMN     "quality" JSONB');
    expect(up2).toContain('ALTER TABLE "SpeechComparison" ADD COLUMN     "axes" JSONB');
    expect(schema).toMatch(/bytes\s+Bytes\?/);
    expect(schema).toMatch(/language\s+String\s+@default\("igala"\)/);
    expect(schema).toMatch(/quality\s+Json\?/);
    expect(schema).toMatch(/axes\s+Json\?/);
  });

  it("is additive only: nothing dropped, no other table touched, existing clips default to igala", () => {
    const code = up2
      .split("\n")
      .filter((l) => !l.startsWith("--"))
      .join("\n");
    expect(code).not.toMatch(/DROP\s/i);
    expect(code).not.toMatch(/\bRENAME\b|\bALTER COLUMN\b|\bSET NOT NULL\b/i);
    const tables = [...code.matchAll(/ALTER TABLE "(\w+)"/g)].map((m) => m[1]);
    expect(new Set(tables)).toEqual(
      new Set(["SpeechRecording", "SpeechComparison"]),
    );
    // Must not touch the table the datasource-form diff wrongly wanted to drop.
    expect(code).not.toContain("englishTsv");
    expect(code).not.toContain("ParallelPair");
  });

  it("down.sql drops exactly the four columns and nothing else", () => {
    for (const [table, col] of [
      ["SpeechComparison", "axes"],
      ["SpeechRecording", "quality"],
      ["SpeechRecording", "language"],
      ["SpeechRecording", "bytes"],
    ]) {
      expect(down2).toContain(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "${col}"`);
    }
    expect(down2).not.toMatch(/DROP TABLE|DROP TYPE/i);
  });
});
