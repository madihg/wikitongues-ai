import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..", "..", "prisma");
const dir = join(root, "migrations", "20261106130000_speech_studio");
const up = readFileSync(join(dir, "migration.sql"), "utf8");
const down = readFileSync(join(dir, "down.sql"), "utf8");
const schema = readFileSync(join(root, "schema.prisma"), "utf8");

describe("speech studio migration", () => {
  it("starts with the search path and is additive", () => {
    expect(up).toContain('SET search_path TO "wikitongues", "extensions", "public"');
    expect(down).toContain('SET search_path TO "wikitongues", "extensions", "public"');
    expect(up).not.toMatch(/DROP\s+(TABLE|COLUMN|INDEX)/i);
    expect(up).not.toMatch(/ALTER COLUMN|RENAME|NOT NULL DEFAULT.*ALTER/i);
  });
  it("adds the studio columns and both tables, and the schema declares them", () => {
    for (const col of ["studioSessionId", "studioText"]) {
      expect(up).toContain(`"${col}" TEXT`);
      expect(schema).toContain(col);
      expect(down).toContain(`DROP COLUMN IF EXISTS "${col}"`);
    }
    for (const m of ["SpeechMinimalPair", "SpeechMinimalPairAnswer"]) {
      expect(up).toContain(`CREATE TABLE "${m}"`);
      expect(schema).toContain(`model ${m} {`);
      expect(down).toContain(`DROP TABLE IF EXISTS "${m}"`);
    }
  });
  it("alters only SpeechRecording", () => {
    const alters = [...up.matchAll(/ALTER TABLE "(\w+)"/g)].map((m) => m[1]);
    expect(new Set(alters)).toEqual(new Set(["SpeechRecording"]));
  });
});
