import { describe, expect, it } from "vitest";
import {
  FRONTIER_SLUGS,
  FRONTIER_TARGETS,
  servingModeFor,
} from "./frontier-targets";

describe("FRONTIER_TARGETS", () => {
  it("registers exactly the six frontier slugs", () => {
    expect(FRONTIER_SLUGS).toEqual([
      "gemini-3-1-pro",
      "gemini-3-1-pro-rag",
      "gemini-3-1-pro-rag-v2",
      "claude-opus-5",
      "claude-opus-5-rag",
      "claude-opus-5-rag-v2",
    ]);
  });

  it("pins temperature 0 and the 4096 reasoning-trace budget on every arm", () => {
    // A silently non-zero temperature would make any cross-arm comparison
    // partly a decoding comparison; 1024 tokens starves reasoning models.
    for (const t of FRONTIER_TARGETS) {
      expect(t.decodingParams).toEqual({ temperature: 0, maxTokens: 4096 });
    }
  });

  it("keeps baseModelId identical within a family so shape comparisons isolate the serving path", () => {
    const byFamily = new Map<string, Set<string>>();
    for (const t of FRONTIER_TARGETS) {
      const set = byFamily.get(t.family) ?? new Set();
      set.add(t.baseModelId);
      byFamily.set(t.family, set);
    }
    for (const [, ids] of byFamily) expect(ids.size).toBe(1);
    expect(
      FRONTIER_TARGETS.find((t) => t.slug === "gemini-3-1-pro")?.baseModelId,
    ).toBe("gemini-3.1-pro-preview");
    expect(
      FRONTIER_TARGETS.find((t) => t.slug === "claude-opus-5")?.baseModelId,
    ).toBe("claude-opus-5");
  });

  it("gives every base model the three canonical shapes", () => {
    for (const family of ["gemini", "claude"]) {
      const shapes = FRONTIER_TARGETS.filter((t) => t.family === family).map(
        (t) => servingModeFor(t),
      );
      expect(shapes.sort()).toEqual(["baseline", "rag-v1", "rag-v2"]);
    }
  });

  it("marks shapes consistently: kind, ragEnabled and versionLabel agree", () => {
    for (const t of FRONTIER_TARGETS) {
      const mode = servingModeFor(t);
      if (mode === "baseline") {
        expect(t.kind).toBe("baseline");
        expect(t.ragEnabled).toBe(false);
        expect(t.versionLabel).toBeNull();
      } else {
        expect(t.kind).toBe("rag");
        expect(t.ragEnabled).toBe(true);
        expect(t.versionLabel).toBe(mode === "rag-v2" ? "rag-v2" : "rag");
      }
    }
  });

  it("only rag-v2 rows carry lineage, and each parent slug resolves to the v1 sibling", () => {
    const bySlug = new Map(FRONTIER_TARGETS.map((t) => [t.slug, t]));
    for (const t of FRONTIER_TARGETS) {
      if (servingModeFor(t) === "rag-v2") {
        expect(t.parentSlug).not.toBeNull();
        const parent = bySlug.get(t.parentSlug!);
        expect(parent).toBeDefined();
        expect(servingModeFor(parent!)).toBe("rag-v1");
        expect(parent!.family).toBe(t.family);
        // The registration script upserts in list order and resolves parent
        // ids from rows it has already written, so the parent must precede
        // its child.
        expect(FRONTIER_SLUGS.indexOf(parent!.slug)).toBeLessThan(
          FRONTIER_SLUGS.indexOf(t.slug),
        );
      } else {
        expect(t.parentSlug).toBeNull();
      }
    }
  });

  it("names follow the arena convention", () => {
    const nameOf = (slug: string) =>
      FRONTIER_TARGETS.find((t) => t.slug === slug)!.name;
    expect(nameOf("gemini-3-1-pro")).toBe("Gemini 3.1 Pro");
    expect(nameOf("gemini-3-1-pro-rag")).toBe("Gemini 3.1 Pro + Igala RAG");
    expect(nameOf("gemini-3-1-pro-rag-v2")).toBe(
      "Gemini 3.1 Pro + Igala RAG v2",
    );
    expect(nameOf("claude-opus-5")).toBe("Claude Opus 5");
    expect(nameOf("claude-opus-5-rag")).toBe("Claude Opus 5 + Igala RAG");
    expect(nameOf("claude-opus-5-rag-v2")).toBe("Claude Opus 5 + Igala RAG v2");
  });
});

describe("servingModeFor", () => {
  it("mirrors the chat route's branch: rag-v2 label wins over ragEnabled", () => {
    // Same precedence as src/app/api/arena/chat/route.ts, where the v2 path
    // is selected on versionLabel alone.
    expect(servingModeFor({ ragEnabled: true, versionLabel: "rag-v2" })).toBe(
      "rag-v2",
    );
    expect(servingModeFor({ ragEnabled: false, versionLabel: "rag-v2" })).toBe(
      "rag-v2",
    );
    expect(servingModeFor({ ragEnabled: true, versionLabel: "rag" })).toBe(
      "rag-v1",
    );
    expect(servingModeFor({ ragEnabled: true, versionLabel: null })).toBe(
      "rag-v1",
    );
    expect(servingModeFor({ ragEnabled: false, versionLabel: null })).toBe(
      "baseline",
    );
    expect(servingModeFor({ ragEnabled: false, versionLabel: "rag" })).toBe(
      "baseline",
    );
  });
});
