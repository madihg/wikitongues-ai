import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Rollout step 3 of the design tokens: colour.
 *
 * Every text colour is at least 4.5:1 on every surface it is used on, and
 * every control edge and the focus ring are at least 3:1 (WCAG 2.x). The
 * values are read from the token files as shipped, compat file included, so
 * a pinned value that fails cannot hide.
 */
const SRC = join(process.cwd(), "src");
const css = (rel: string) => readFileSync(join(SRC, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function declarations(text: string, into = new Map<string, string>()) {
  // Top-level :root blocks only; the reduced-motion block holds no colours.
  for (const block of text.matchAll(/(?:^|\n):root\s*\{([^}]*)\}/g)) {
    for (const d of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) into.set(d[1], d[2].trim());
  }
  return into;
}
const vars = declarations(css("styles/tokens.compat.platform.css"), declarations(css("styles/tokens.css")));

function hex(name: string): string {
  let value = vars.get(name);
  for (let hops = 0; value && value.startsWith("var(") && hops < 10; hops++) {
    value = vars.get(value.slice(4, -1).trim());
  }
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(name + " does not resolve to a colour: " + value);
  return value.toLowerCase();
}
function luminance(colour: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(colour.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(hex(a)), luminance(hex(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ["--background", "--surface", "--surface-sunken"];
// [foreground, background, least ratio]
const PAIRS: [string, string, number][] = [
  ...["--text-primary", "--text-secondary", "--text-tertiary", "--text-muted", "--accent-text", "--success", "--warning", "--danger"].flatMap(
    (fg) => SURFACES.map((bg) => [fg, bg, 4.5] as [string, string, number]),
  ),
  ["--text-primary", "--accent-subtle", 4.5],
  ["--accent-text", "--accent-subtle", 4.5],
  ["--accent-contrast", "--accent", 4.5],
  ["--accent-contrast", "--accent-hover", 4.5],
  ["--success", "--success-subtle", 4.5],
  ["--warning", "--warning-subtle", 4.5],
  ["--danger", "--danger-subtle", 4.5],
  ["--wt-on-state-fill", "--wt-danger-fill", 4.5],
  ["--wt-ink-on-inverse", "--wt-inverse", 4.5],
  // Edges of things you can press or type in, and the focus ring.
  ["--border-strong", "--surface", 3],
  ["--border-strong", "--background", 3],
  ["--wt-focus", "--surface", 3],
  ["--wt-focus", "--background", 3],
  ["--accent", "--background", 3],
];

describe("design tokens, step 3: colour", () => {
  it("every text colour, control edge and focus ring meets its contrast floor", () => {
    const failing = PAIRS.map(([fg, bg, least]) => ({ fg, bg, least, got: ratio(fg, bg) }))
      .filter((p) => p.got < p.least)
      .map((p) => `${p.fg} on ${p.bg}: ${p.got.toFixed(2)}, needs ${p.least}`);
    expect(failing).toEqual([]);
  });

  it("the accent is the Wikitongues violet and its text is white", () => {
    expect(hex("--accent")).toBe("#3814a5");
    expect(hex("--accent-contrast")).toBe("#ffffff");
  });

  it("focus is a 2px outline in the accent, not a pale shadow", () => {
    const globals = css("app/globals.css");
    const rule = globals.match(/:focus-visible\s*\{([^}]*)\}/);
    expect(rule?.[1]).toMatch(/outline:\s*var\(--wt-focus-width\)\s+solid\s+var\(--wt-focus\)/);
    expect(vars.get("--ring")).toBe("0 0 0 var(--wt-focus-width) var(--wt-focus)");
    expect(globals.match(/::selection\s*\{([^}]*)\}/)?.[1]).toMatch(/background:\s*var\(--wt-accent-tint\)/);
  });
});
