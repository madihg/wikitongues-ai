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
