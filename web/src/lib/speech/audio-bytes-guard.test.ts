import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { OPEN_ROWS_QUERY } from "./open-rows";

/**
 * `bytes` (the audio) and `quality` are columns on SpeechRecording, and
 * Prisma returns every scalar column unless a query says `select`. So the
 * rule is structural: no query on speech recordings may omit a select, and
 * only the audio endpoint may select `bytes`. A list, an export, a queue or
 * the session line can then never carry audio, whatever a response shape
 * later does with the row.
 */

const web = join(__dirname, "..", "..", "..");

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name))
      out.push(full);
  }
  return out;
}

/** The text of the call starting at `open` (the index of its "("). */
function callText(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open);
}

const AUDIO_ROUTE = "src/app/api/lab/speech/recording/[id]/audio/route.ts";
const files = ["src", "scripts"].flatMap((r) => sources(join(web, r)));

describe("audio bytes stay out of every list and export", () => {
  it("the open-manifest query selects explicit fields, never bytes or quality", () => {
    expect(OPEN_ROWS_QUERY.select).not.toHaveProperty("bytes");
    expect(OPEN_ROWS_QUERY.select).not.toHaveProperty("quality");
  });

  it("every read of speechRecording names a select", () => {
    const re = /speechRecording\s*\.\s*(findMany|findFirst|findUnique)\s*\(/g;
    let reads = 0;
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(re)) {
        reads++;
        const call = callText(src, m.index! + m[0].length - 1);
        // The shared open-manifest query is checked by name above.
        if (call.trim() === "(OPEN_ROWS_QUERY)") continue;
        expect(call, `${relative(web, f)}: ${m[1]} without select`).toMatch(
          /\bselect\s*:/,
        );
        expect(call, `${relative(web, f)}: uses include`).not.toMatch(
          /\binclude\s*:/,
        );
      }
    }
    expect(reads).toBeGreaterThan(5);
  });

  it("only the audio endpoint selects bytes", () => {
    for (const f of files) {
      const rel = relative(web, f);
      if (rel === AUDIO_ROUTE) continue;
      const src = readFileSync(f, "utf8");
      expect(src, rel).not.toMatch(/\bbytes\s*:\s*true/);
    }
    const audio = readFileSync(join(web, AUDIO_ROUTE), "utf8");
    expect(audio).toMatch(/bytes:\s*true/);
  });

  it("no query pulls recordings in through a relation", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, relative(web, f)).not.toMatch(
        /\b(include|select)\s*:\s*\{[^}]*\bspeechRecordings\s*:/,
      );
    }
  });

  it("no list or export response mentions bytes", () => {
    for (const rel of [
      "src/app/api/lab/speech/recordings/route.ts",
      "src/app/api/lab/speech/export/route.ts",
      "src/app/api/lab/speech/listen/next/route.ts",
      "src/app/api/lab/speech/today/route.ts",
      "src/lib/speech/manifest.ts",
    ]) {
      const code = readFileSync(join(web, rel), "utf8")
        .split("\n")
        .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
        .join("\n");
      expect(code, rel).not.toMatch(/\bbytes\b/);
    }
  });
});
