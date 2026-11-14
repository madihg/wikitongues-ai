import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Rollout step 1 of the design tokens: tokens.css plus tokens.compat.platform.css
 * replace the :root block that used to sit in globals.css, and nothing moves.
 *
 * TODAY is that old block, resolved to plain values (cut from main at 99d453a).
 * The second test is the whole promise of step 1: every name the app could read
 * before still resolves to the value it had. A later step that means to change a
 * value deletes its block from the compat file and its row from TODAY in the
 * same commit. Step 3 (colour) took 21 rows out: text, edges, the accent, the
 * state text colours, info and the focus ring.
 */
const TODAY: Record<string, string> = {
  "--wt-ochre-50": "#fdf6e9",
  "--wt-ochre-100": "#f9e7c2",
  "--wt-ochre-200": "#f2cf86",
  "--wt-ochre-300": "#ebb84e",
  "--wt-ochre-400": "#e0a21f",
  "--wt-ochre-500": "#c4881a",
  "--wt-ochre-600": "#9c6a13",
  "--wt-ochre-700": "#744f10",
  "--wt-ink-950": "#1a1714",
  "--wt-ink-900": "#26211c",
  "--wt-ink-800": "#3a332c",
  "--wt-ink-700": "#544a40",
  "--wt-clay-500": "#b5512f",
  "--wt-sage-500": "#4f7a5e",
  "--wt-indigo-500": "#3f5a8a",
  "--background": "#fbf8f2",
  "--surface": "#ffffff",
  "--surface-raised": "#ffffff",
  "--foreground": "#26211c",
  "--text-primary": "#26211c",
  "--text-secondary": "#544a40",
  "--success-subtle": "#e7f3ec",
  "--warning-subtle": "#fdf2dc",
  "--danger": "#b23b32",
  "--danger-subtle": "#fbeae8",
  "--pick-a": "#3f5a8a",
  "--pick-b": "#b5512f",
  "--score-lo": "#b23b32",
  "--score-mid": "#b5790f",
  "--score-hi": "#2f7d54",
  "--radius-sm": "4px",
  "--radius": "8px",
  "--radius-lg": "12px",
  "--radius-xl": "16px",
  "--shadow-sm": "0 1px 2px rgba(26, 23, 20, 0.06)",
  "--shadow": "0 1px 3px rgba(26, 23, 20, 0.08), 0 1px 2px rgba(26, 23, 20, 0.04)",
  "--shadow-md": "0 4px 12px rgba(26, 23, 20, 0.08)",
  "--shadow-lg": "0 12px 32px rgba(26, 23, 20, 0.12)",
  "--transition-default": "0.18s cubic-bezier(0.4, 0, 0.2, 1)",
};

const SRC = join(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

/** Removes comments and every at-rule block, so only top-level rules remain. */
function topLevel(css: string): string {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let out = "";
  let i = 0;
  while (i < plain.length) {
    if (plain[i] === "@") {
      const brace = plain.indexOf("{", i);
      const semi = plain.indexOf(";", i);
      if (semi !== -1 && (brace === -1 || semi < brace)) {
        i = semi + 1;
        continue;
      }
      let depth = 0;
      let j = brace;
      for (; j < plain.length; j++) {
        if (plain[j] === "{") depth++;
        else if (plain[j] === "}" && --depth === 0) break;
      }
      i = j + 1;
      continue;
    }
    out += plain[i++];
  }
  return out;
}

/** Custom properties set in top-level :root blocks. A later one wins. */
function rootDeclarations(css: string, into = new Map<string, string>()) {
  for (const block of topLevel(css).matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const d of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      into.set(d[1], d[2].replace(/\s+/g, " ").trim());
    }
  }
  return into;
}

function resolve(name: string, vars: Map<string, string>, seen: string[] = []): string {
  if (seen.includes(name)) throw new Error("cycle: " + [...seen, name].join(" -> "));
  const value = vars.get(name);
  if (value === undefined) throw new Error(name + " is not defined");
  return value
    .replace(/var\((--[\w-]+)\)/g, (_, inner: string) => resolve(inner, vars, [...seen, name]))
    .toLowerCase();
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(css|tsx?)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

const tokens = read("styles/tokens.css");
const compat = read("styles/tokens.compat.platform.css");
const globals = read("app/globals.css");
// The order globals.css imports them in: the compat file comes second and wins.
const shipped = rootDeclarations(compat, rootDeclarations(tokens));

describe("design tokens, step 1", () => {
  it("globals.css imports the tokens, then the compat file, and has no :root block of its own", () => {
    const tokensAt = globals.indexOf('@import "../styles/tokens.css";');
    const compatAt = globals.indexOf('@import "../styles/tokens.compat.platform.css";');
    expect(tokensAt).toBeGreaterThan(-1);
    expect(compatAt).toBeGreaterThan(tokensAt);
    expect(rootDeclarations(globals).size).toBe(0);
  });

  it("every name the old :root block set still resolves to the value it had", () => {
    const moved: string[] = [];
    for (const [name, was] of Object.entries(TODAY)) {
      let now: string;
      try {
        now = resolve(name, shipped);
      } catch (e) {
        now = (e as Error).message;
      }
      if (now !== was) moved.push(name + ": was " + was + ", now " + now);
    }
    expect(moved).toEqual([]);
  });

  it("the compat file only pins names that tokens.css defines", () => {
    const defined = rootDeclarations(tokens);
    const extra = [...rootDeclarations(compat).keys()].filter((name) => !defined.has(name));
    expect(extra).toEqual([]);
  });

  it("every token resolves, with no missing name and no cycle", () => {
    for (const name of shipped.keys()) expect(() => resolve(name, shipped)).not.toThrow();
  });

  it("every custom property the app reads is defined somewhere", () => {
    const defined = new Set<string>();
    const reads = new Map<string, string>();
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, "utf8");
      // Set in CSS (any block), or from a style prop in TSX.
      for (const m of text.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
      for (const m of text.matchAll(/["'](--[\w-]+)["']/g)) defined.add(m[1]);
      for (const m of text.matchAll(/var\(\s*(--[\w-]+)/g)) {
        if (!reads.has(m[1])) reads.set(m[1], file.slice(SRC.length + 1));
      }
    }
    const missing = [...reads]
      .filter(([name]) => !defined.has(name) && !name.startsWith("--tw-"))
      .map(([name, file]) => name + " (first read in " + file + ")");
    expect(missing).toEqual([]);
  });
});
