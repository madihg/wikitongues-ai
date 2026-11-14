import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Rollout step 4 of the design tokens: shape.
 *
 * Two radii (8px for a control, 12px for a card), no shadow on anything that
 * sits on the page, one shadow for things that float, and no dark theme block
 * that nothing ever switched on.
 */
const SRC = join(process.cwd(), "src");
const strip = (rel: string) => readFileSync(join(SRC, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const globals = strip("app/globals.css");
const tokens = strip("styles/tokens.css");
const compat = strip("styles/tokens.compat.platform.css");
const value = (css: string, name: string) => css.match(new RegExp(name + "\\s*:\\s*([^;]+);"))?.[1].trim();

describe("design tokens, step 4: shape", () => {
  it("every radius utility lands on one of the two radii", () => {
    const theme = globals.match(/@theme inline\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    const radii = [...theme.matchAll(/(--radius[\w-]*)\s*:\s*([^;]+);/g)].map((m) => m[2].trim());
    expect(radii.length).toBe(6);
    for (const r of radii) expect(["var(--wt-radius-control)", "var(--wt-radius-card)"]).toContain(r);
    expect(value(tokens, "--wt-radius-control")).toBe("8px");
    expect(value(tokens, "--wt-radius-card")).toBe("12px");
  });

  it("nothing that sits on the page casts a shadow; only overlays do", () => {
    expect(value(tokens, "--wt-shadow-none")).toBe("none");
    expect(value(tokens, "--shadow-sm")).toBe("var(--wt-shadow-none)");
    expect(value(tokens, "--shadow")).toBe("var(--wt-shadow-none)");
    expect(value(tokens, "--shadow-md")).toBe("var(--wt-shadow-overlay)");
    expect(value(tokens, "--shadow-lg")).toBe("var(--wt-shadow-overlay)");
    expect(compat).not.toMatch(/--shadow|--radius/);
  });

  it("there is no dark theme block and nothing sets data-theme", () => {
    expect(globals).not.toMatch(/data-theme/);
  });
});
