import { describe, it, expect, vi } from "vitest";
import { run, type ScriptDeps } from "../../../scripts/speech/build-tts-script";
import type { ScriptCandidate } from "./tts-script";

// Invented words; the fixture covers dedupe, the split guard and the report.
const cand = (id: string, text: string, over: Partial<ScriptCandidate> = {}): ScriptCandidate => ({
  id,
  promptCode: `xx_${id}`,
  text,
  prompt: { isHoldout: false, split: "train" },
  isDemo: false,
  consentTraining: true,
  verificationStatus: "single_annotator",
  ...over,
});

function deps(rows: ScriptCandidate[], over: Partial<ScriptDeps> = {}) {
  const written: Array<[string, string]> = [];
  const d: ScriptDeps = {
    loadCandidates: async () => rows,
    restore: async (t) => t.replace("a", "à"),
    isViolation: () => false,
    write: (p, b) => written.push([p, b]),
    repoRoot: "/repo",
    ...over,
  };
  return { d, written };
}

const args = { hours: 0.01, dryRun: false, runId: "r1", out: "/elsewhere/script.jsonl" };

const rows = [
  cand("a", "kwa gbo chi nwa kpe. gwa chi kpe nwa gbo"),
  cand("b", "KWA gbo chi nwa kpe"),
  cand("c", "frozen words in this answer here", { prompt: { isHoldout: true, split: "train" } }),
  cand("d", "test split words in this one", { prompt: { isHoldout: false, split: "test" } }),
  cand("e", "demo words in this one too", { isDemo: true }),
];

describe("build-tts-script run", () => {
  it("writes a deduplicated script without frozen or demo answers, and reports numbers", async () => {
    const { d, written } = deps(rows);
    const lines = await run(d, args);
    expect(written).toHaveLength(1);
    const [path, body] = written[0];
    expect(path).toBe("/elsewhere/script.jsonl");
    const texts = body.trim().split("\n").map((l) => JSON.parse(l).text as string);
    expect(texts).toHaveLength(2);
    expect(body).not.toMatch(/frozen|demo|test split/);
    const report = lines.join("\n");
    expect(report).toContain("answersRefused=3");
    expect(report).toContain("sentencesDuplicate=1");
    expect(report).toContain("script_sentences=2");
    expect(report).toMatch(/digraph_kw=\d/);
    expect(report).toMatch(/dotted_vowel_/);
    expect(report).toMatch(/length_wordsMedian=/);
    // numbers and unit names only: no sentence text on stdout
    expect(report).not.toMatch(/gbo chi/);
  });

  it("--dry-run calls no LLM and writes nothing", async () => {
    const restore = vi.fn();
    const { d, written } = deps(rows, { restore });
    const lines = await run(d, { ...args, dryRun: true, out: undefined });
    expect(restore).not.toHaveBeenCalled();
    expect(written).toEqual([]);
    expect(lines.join("\n")).toContain("dry_run=true");
  });

  it("refuses an output path inside the repo, and a missing one", async () => {
    const { d } = deps(rows);
    await expect(run(d, { ...args, out: "/repo/web/script.jsonl" })).rejects.toThrow(/outside the repository/);
    await expect(run(d, { ...args, out: undefined })).rejects.toThrow(/--out is required/);
    await expect(run(d, { ...args, hours: 0 })).rejects.toThrow(/--hours/);
  });
});
