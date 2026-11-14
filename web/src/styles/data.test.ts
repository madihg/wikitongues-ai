import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Rollout step 5 of the design tokens: the data colours.
 *
 * Side A and side B of a blind pair, and the four series colours, must stay
 * apart for a speaker with protan, deutan or tritan colour vision, and must
 * be readable where they are used as text. Simulation: Machado et al. 2009,
 * severity 1.0, on linear RGB; distance in CIELAB.
 */
const SRC = join(process.cwd(), "src");
const css = (rel: string) => readFileSync(join(SRC, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const vars = new Map<string, string>();
for (const file of ["styles/tokens.css", "styles/tokens.compat.platform.css"]) {
  for (const block of css(file).matchAll(/(?:^|\n):root\s*\{([^}]*)\}/g)) {
    for (const d of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars.set(d[1], d[2].trim());
  }
}
function hex(name: string): string {
  let value = vars.get(name);
  for (let hops = 0; value && value.startsWith("var(") && hops < 10; hops++) value = vars.get(value.slice(4, -1).trim());
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(name + " does not resolve to a colour: " + value);
  return value.toLowerCase();
}
const linear = (colour: string) =>
  [1, 3, 5].map((i) => {
    const c = parseInt(colour.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
const luminance = (colour: string) => {
  const [r, g, b] = linear(colour);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const VISION: Record<string, number[][]> = {
  normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
function lab(colour: string, matrix: number[][]): number[] {
  const rgb = linear(colour);
  const [r, g, b] = matrix.map((row) => Math.min(1, Math.max(0, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2])));
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.9505);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.089);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
function closest(names: string[]): { distance: number; pair: string } {
  let best = { distance: Infinity, pair: "" };
  for (const [vision, matrix] of Object.entries(VISION)) {
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const [p, q] = [lab(hex(names[i]), matrix), lab(hex(names[j]), matrix)];
        const distance = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
        if (distance < best.distance) best = { distance, pair: `${names[i]} / ${names[j]} (${vision})` };
      }
    }
  }
  return best;
}

describe("design tokens, step 5: data colours", () => {
  it("side A and side B stay far apart under every kind of colour vision", () => {
    expect(closest(["--pick-a", "--pick-b"]).distance).toBeGreaterThan(60);
  });

  it("the four series colours stay at least 25 apart under every kind of colour vision", () => {
    const worst = closest(["--wt-data-1", "--wt-data-2", "--wt-data-3", "--wt-data-4"]);
    expect(worst.distance, worst.pair).toBeGreaterThan(25);
  });

  it("A and B are readable as text on every surface, and every mark is 3:1 on a card", () => {
    for (const fg of ["--pick-a", "--pick-b", "--score-lo", "--score-mid", "--score-hi"]) {
      for (const bg of ["--background", "--surface", "--surface-sunken"]) {
        expect(contrast(hex(fg), hex(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const mark of ["--wt-data-1", "--wt-data-2", "--wt-data-3", "--wt-data-4", "--wt-data-neutral", "--wt-data-highlight"]) {
      expect(contrast(hex(mark), hex("--surface")), mark).toBeGreaterThanOrEqual(3);
    }
  });

  it("the compat file pins nothing any more", () => {
    expect([...css("styles/tokens.compat.platform.css").matchAll(/--[\w-]+\s*:/g)].length).toBe(0);
  });
});
