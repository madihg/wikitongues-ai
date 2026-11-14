import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The honest-time migrations are written here and applied by a human, so the
 * repo proves their shape: each creates exactly the one table the schema
 * declares, touches no existing table, and down.sql removes it again.
 */
const root = join(__dirname, "..", "..", "prisma");
const schema = readFileSync(join(root, "schema.prisma"), "utf8");
const read = (dir: string, file: string) =>
  readFileSync(join(root, "migrations", dir, file), "utf8");

const MIGRATIONS = [
  {
    dir: "20261113150000_activity_ping",
    model: "ActivityPing",
    columns: ["userId", "minute", "surface", "activeSeconds", "isDemo", "createdAt", "updatedAt"],
  },
  {
    dir: "20261113151000_time_note",
    model: "TimeNote",
    columns: ["userId", "weekStart", "day", "note", "createdAt"],
  },
];

describe.each(MIGRATIONS)("migration $dir", ({ dir, model, columns }) => {
  const up = read(dir, "migration.sql");
  const down = read(dir, "down.sql");
  const block = schema.slice(schema.indexOf(`model ${model} {`));
  const modelBody = block.slice(0, block.indexOf("\n}"));

  it("creates the table with every column the schema declares", () => {
    expect(schema).toContain(`model ${model} {`);
    expect(up).toContain(`CREATE TABLE "${model}"`);
    for (const c of columns) {
      expect(modelBody).toMatch(new RegExp(`\\n\\s+${c}\\s`));
      expect(up).toContain(`"${c}"`);
    }
  });

  it("is additive: one new table, no existing table altered, nothing dropped", () => {
    expect(up.match(/CREATE TABLE/g)).toHaveLength(1);
    expect(up).not.toMatch(/ALTER TABLE/i);
    expect(up).not.toMatch(/\bDROP\b/i);
    expect(up).not.toMatch(/\b(DELETE|UPDATE|TRUNCATE)\b/i);
    expect(up).toContain('SET search_path TO "wikitongues"');
  });

  it("down.sql removes exactly that table", () => {
    expect(down).toContain(`DROP TABLE IF EXISTS "${model}"`);
    expect(down.match(/DROP TABLE/g)).toHaveLength(1);
    expect(down).toContain('SET search_path TO "wikitongues"');
  });
});

describe("ActivityPing", () => {
  it("has one row per person, minute, kind of work and demo flag", () => {
    expect(read("20261113150000_activity_ping", "migration.sql")).toContain(
      'CREATE UNIQUE INDEX "ActivityPing_userId_minute_surface_isDemo_key" ON "ActivityPing"("userId", "minute", "surface", "isDemo")',
    );
  });
});
