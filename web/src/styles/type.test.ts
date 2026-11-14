import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { describe, expect, it } from "vitest";

/**
 * Rollout step 2 of the design tokens: type.
 *
 * One self-hosted Inter file draws every Igala letter and tone mark, Igala
 * text is out of the mono class, and nothing is set smaller than 12px.
 */
const WEB = process.cwd();
const SRC = join(WEB, "src");
const globals = readFileSync(join(SRC, "app/globals.css"), "utf8");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(css|tsx?)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

/** The code points a WOFF2 file maps, read from its cmap table. */
function woff2CodePoints(file: Buffer): Set<number> {
  if (file.toString("latin1", 0, 4) !== "wOF2") throw new Error("not a WOFF2 file");
  const numTables = file.readUInt16BE(12);
  const compressedSize = file.readUInt32BE(20);
  let at = 48;
  const base128 = () => {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const byte = file[at++];
      value = (value << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) break;
    }
    return value >>> 0;
  };
  // Known-tag indexes we care about: 0 cmap, 10 glyf, 11 loca. 63 means a tag follows.
  const tables: { cmap: boolean; length: number }[] = [];
  for (let t = 0; t < numTables; t++) {
    const flags = file[at++];
    const index = flags & 0x3f;
    const version = flags >> 6;
    let tag = "";
    if (index === 63) {
      tag = file.toString("latin1", at, at + 4);
      at += 4;
    }
    const origLength = base128();
    const glyfOrLoca = index === 10 || index === 11;
    const transformed = glyfOrLoca ? version === 0 : version !== 0;
    const length = transformed ? base128() : origLength;
    tables.push({ cmap: index === 0 || tag === "cmap", length });
  }
  const data = brotliDecompressSync(file.subarray(at, at + compressedSize));
  let offset = 0;
  for (const table of tables) {
    if (table.cmap) break;
    offset += table.length;
  }
  const cmap = data.subarray(offset);
  const points = new Set<number>();
  const subtables = cmap.readUInt16BE(2);
  for (let i = 0; i < subtables; i++) {
    const sub = cmap.subarray(cmap.readUInt32BE(8 + i * 8));
    const format = sub.readUInt16BE(0);
    if (format === 12) {
      const groups = sub.readUInt32BE(12);
      for (let g = 0; g < groups; g++) {
        const start = sub.readUInt32BE(16 + g * 12);
        const end = sub.readUInt32BE(20 + g * 12);
        for (let c = start; c <= end; c++) points.add(c);
      }
    } else if (format === 4) {
      const segments = sub.readUInt16BE(6) / 2;
      for (let seg = 0; seg < segments; seg++) {
        const end = sub.readUInt16BE(14 + seg * 2);
        const start = sub.readUInt16BE(16 + segments * 2 + seg * 2);
        if (end === 0xffff) continue;
        for (let c = start; c <= end; c++) points.add(c);
      }
    }
  }
  return points;
}

// The Igala letters and tone marks in use, composed and decomposed.
const IGALA =
  "àáèéẹẹ̀ẹ́ẹ̄ìíòóọọ̀ọ́ọ̄ùúñṅńǹḿm̀ÀÁÈÉẸẸ̀Ẹ́ÌÍÒÓỌỌ̀Ọ́ÙÚÑṄ";

describe("design tokens, step 2: type", () => {
  it("loads one self-hosted Inter file and nothing from Google Fonts", () => {
    expect(globals).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(globals).toMatch(/@font-face\s*\{[^}]*font-family:\s*"Inter"[^}]*InterVariable-wt\.woff2/);
    expect(statSync(join(WEB, "public/fonts/InterVariable-wt.woff2")).size).toBeGreaterThan(50_000);
    expect(readFileSync(join(WEB, "public/fonts/Inter-LICENSE.txt"), "utf8")).toMatch(/SIL Open Font License/i);
  });

  it("the Inter file holds every Igala letter and every combining tone mark", () => {
    const points = woff2CodePoints(readFileSync(join(WEB, "public/fonts/InterVariable-wt.woff2")));
    const wanted = new Set<number>();
    for (const form of ["NFC", "NFD"] as const) {
      for (const ch of IGALA.normalize(form)) wanted.add(ch.codePointAt(0)!);
    }
    const missing = [...wanted].filter((c) => !points.has(c)).map((c) => "U+" + c.toString(16).toUpperCase());
    expect(missing).toEqual([]);
    // The marks themselves: grave, acute, macron, dot above, dot below.
    for (const mark of [0x300, 0x301, 0x304, 0x307, 0x323]) expect(points.has(mark)).toBe(true);
  });

  it("Igala text has its own rule, in the Igala face, apart from the mono rule", () => {
    const igala = globals.match(/\.igala,\s*\[lang="ig"\]\s*\{([^}]*)\}/);
    expect(igala?.[1]).toMatch(/font-family:\s*var\(--wt-font-igala\)/);
    const mono = globals.match(/\.font-mono\s*\{([^}]*)\}/);
    expect(mono?.[1]).toMatch(/font-family:\s*var\(--wt-font-mono\)/);
    expect(globals).not.toMatch(/\.font-mono,\s*\.igala/);
  });

  it("no text is set smaller than 12px with an arbitrary size", () => {
    const small: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, "utf8");
      const hit = text.match(/text-\[(?:[0-9]|1[01])px\]/);
      if (hit) small.push(file.slice(SRC.length + 1) + ": " + hit[0]);
    }
    expect(small).toEqual([]);
  });

  it("the speaker's own Igala is marked lang=ig where it is written and shown", () => {
    for (const file of [
      "components/answer-editor.tsx",
      "components/annotation-interface.tsx",
      "components/my-work-rows.tsx",
      "components/lab/record-interface.tsx",
    ]) {
      expect(readFileSync(join(SRC, file), "utf8"), file).toMatch(/lang="ig"/);
    }
    // The constant that styles Igala in the episode no longer names the mono class.
    expect(readFileSync(join(SRC, "components/annotation-interface.tsx"), "utf8")).toMatch(/const textFont = "igala"/);
  });
});
