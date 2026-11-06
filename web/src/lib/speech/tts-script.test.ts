import { describe, it, expect } from "vitest";
import {
  WORDS_PER_MINUTE,
  buildScript,
  countWords,
  coverageReport,
  dedupeKey,
  eligibleForScript,
  isOutsideRepo,
  lengthStats,
  scriptToJsonl,
  selectSentences,
  splitSentences,
  type ScriptCandidate,
} from "./tts-script";
import { toneStrip } from "./normalise";

// Every word below is invented; English words stand in for borrowed ones.
const base = (over: Partial<ScriptCandidate> = {}): ScriptCandidate => ({
  id: "a1",
  promptCode: "xx_001",
  text: "kwa gbo chi nwa kpe",
  prompt: { isHoldout: false, split: "train" },
  isDemo: false,
  consentTraining: true,
  verificationStatus: "single_annotator",
  ...over,
});

describe("eligibility (the split guard)", () => {
  it("refuses holdout, test split, demo, no consent and seed rows", () => {
    expect(eligibleForScript(base())).toBe(true);
    expect(eligibleForScript(base({ prompt: { isHoldout: true, split: "train" } }))).toBe(false);
    expect(eligibleForScript(base({ prompt: { isHoldout: false, split: "test" } }))).toBe(false);
    expect(eligibleForScript(base({ isDemo: true }))).toBe(false);
    expect(eligibleForScript(base({ consentTraining: false }))).toBe(false);
    expect(eligibleForScript(base({ verificationStatus: "seed" }))).toBe(false);
    expect(eligibleForScript(base({ text: "   " }))).toBe(false);
  });

  it("keeps a frozen answer out of the selection and counts it", () => {
    const sel = selectSentences([
      base({ id: "a", text: "gwa kpe nwa chi gbo" }),
      base({ id: "b", prompt: { isHoldout: true, split: "train" }, text: "different words in this one" }),
      base({ id: "c", prompt: { isHoldout: false, split: "test" }, text: "another set of words here" }),
      base({ id: "d", isDemo: true, text: "demo words go here now" }),
    ]);
    expect(sel.sentences.map((s) => s.text)).toEqual(["gwa kpe nwa chi gbo"]);
    expect(sel.counts.answersRefused).toBe(3);
    expect(sel.counts.answersEligible).toBe(1);
  });
});

describe("sentences and dedupe", () => {
  it("splits an answer into sentences", () => {
    expect(splitSentences("kwa gbo chi. nwa kpe gwa! the market ok?")).toEqual([
      "kwa gbo chi.",
      "nwa kpe gwa!",
      "the market ok?",
    ]);
  });

  it("deduplicates by tone-stripped form and keeps the more marked copy", () => {
    const marked = "kw\u00e0 gb\u1ecd\u0301 chi nwa kpe";
    const sel = selectSentences([
      base({ id: "a", text: "kwa gb\u1ecd chi nwa kpe" }),
      base({ id: "b", text: marked }),
      base({ id: "c", text: "KWA gb\u1ecd chi nwa kpe." }),
    ]);
    expect(sel.sentences).toHaveLength(1);
    expect(sel.sentences[0].text).toBe(marked);
    expect(sel.counts.sentencesDuplicate).toBe(2);
    expect(dedupeKey(marked)).toBe(dedupeKey("kwa gb\u1ecd chi nwa kpe"));
  });

  it("drops sentences that are too short or too long for one clip", () => {
    const long = Array.from({ length: 25 }, (_, i) => `w${i}`).join(" ");
    const sel = selectSentences([base({ id: "a", text: `kwa gbo. ${long}. gwa kpe chi nwa` })]);
    expect(sel.sentences.map((s) => s.text)).toEqual(["gwa kpe chi nwa"]);
    expect(sel.counts.sentencesTooShort).toBe(1);
    expect(sel.counts.sentencesTooLong).toBe(1);
  });

  it("keeps English words in the sentence", () => {
    const sel = selectSentences([base({ text: "gwa the market kpe chi" })]);
    expect(sel.sentences[0].text).toContain("market");
  });

  it("is deterministic whatever order the rows arrive in", () => {
    const rows = [
      base({ id: "b", text: "one two three four" }),
      base({ id: "a", text: "five six seven eight" }),
    ];
    expect(selectSentences(rows).sentences).toEqual(selectSentences([...rows].reverse()).sentences);
  });
});

// A stand-in restorer that adds a grave on the first "a" and refuses "BAD".
const fakeRestore = (calls?: string[]) => async (t: string) => {
  calls?.push(t);
  if (t.includes("BAD")) throw new Error("violation");
  return t.replace("a", "a\u0300");
};
const isViolation = (e: unknown) => e instanceof Error && e.message === "violation";

describe("buildScript", () => {
  const sentences = Array.from({ length: 40 }, (_, i) => ({
    promptCode: "xx_001",
    text: `kwa gbo chi nwa kpe n${i}`,
  }));

  it("stops at the target length and restores lazily", async () => {
    const calls: string[] = [];
    // 0.01 h = 0.6 min = 78 words; six words a sentence -> 13 sentences.
    const out = await buildScript(sentences, 0.01, fakeRestore(calls), isViolation);
    expect(out.lines).toHaveLength(13);
    expect(calls).toHaveLength(13);
    expect(out.reachedTarget).toBe(true);
    expect(out.words / WORDS_PER_MINUTE).toBeCloseTo(out.minutes, 10);
    expect(out.lines.every((l) => toneStrip(l.text) !== l.text)).toBe(true);
  });

  it("skips and counts violations, keeps already-marked text as written", async () => {
    const out = await buildScript(
      [
        { promptCode: "p", text: "kwa BAD chi nwa kpe" },
        { promptCode: "p", text: "kw\u00e1 gbo chi nwa kpe" },
        { promptCode: "p", text: "gwa kpe chi nwa gbo" },
      ],
      1,
      fakeRestore(),
      isViolation,
    );
    expect(out.restore).toMatchObject({ attempted: 2, restored: 1, alreadyMarked: 1, violations: 1, failed: 0 });
    expect(out.lines.map((l) => l.text)).toEqual(["kw\u00e1 gbo chi nwa kpe", "gw\u00e0 kpe chi nwa gbo"]);
    expect(out.reachedTarget).toBe(false);
  });

  it("counts a failed call apart from a violation", async () => {
    const out = await buildScript(
      [{ promptCode: "p", text: "kwa gbo chi nwa kpe" }],
      1,
      async () => {
        throw new Error("network");
      },
      isViolation,
    );
    expect(out.restore.failed).toBe(1);
    expect(out.lines).toHaveLength(0);
  });

  it("never lets two sentences that differ only in tone both in", async () => {
    const out = await buildScript(
      [
        { promptCode: "p", text: "kwa gbo chi nwa kpe" },
        { promptCode: "p", text: "kw\u00e0 gbo chi nwa kpe" },
      ],
      1,
      async (t) => t.replace("a", "a\u0300"),
      isViolation,
    );
    expect(out.lines).toHaveLength(1);
  });
});

describe("coverage and length report", () => {
  const lines = [
    { promptCode: "p", text: "kwa gwa nwa" },
    { promptCode: "p", text: "chi gba kpe e\u0323 o\u0323" },
  ];
  it("counts digraphs, dotted vowels and letters, and names what is missing", () => {
    const c = coverageReport(lines);
    expect(c.digraphs).toMatchObject({ kw: 1, gw: 1, nw: 1, ch: 1, gb: 1, kp: 1 });
    expect(c.dottedVowels["\u1eb9"]).toBe(1);
    expect(c.dottedVowels["\u1ecd"]).toBe(1);
    expect(c.dottedVowels["\u1ecb"]).toBe(0);
    expect(c.missing).toContain("\u1ecb");
    expect(c.missing).toContain("z");
    expect(c.missing).not.toContain("kw");
  });

  it("ignores tone marks when counting", () => {
    const c = coverageReport([{ promptCode: "p", text: "kw\u00e0 g\u00e0b" }]);
    expect(c.digraphs.kw).toBe(1);
  });

  it("gives length statistics in words", () => {
    const s = lengthStats([
      { promptCode: "p", text: "one two three" },
      { promptCode: "p", text: "one two three four five" },
      { promptCode: "p", text: "one two three four" },
    ]);
    expect(s).toMatchObject({ sentences: 3, wordsMin: 3, wordsMedian: 4, wordsMax: 5 });
    expect(s.wordsMean).toBeCloseTo(4, 10);
    expect(lengthStats([]).sentences).toBe(0);
  });

  it("counts words, not punctuation", () => {
    expect(countWords("kwa , gbo !")).toBe(2);
  });
});

describe("output location and format", () => {
  it("refuses a path inside the repo and accepts one outside", () => {
    expect(isOutsideRepo("/repo/web/out.jsonl", "/repo")).toBe(false);
    expect(isOutsideRepo("/repo/../elsewhere/out.jsonl", "/repo")).toBe(true);
    expect(isOutsideRepo("/Users/x/Documents/script.jsonl", "/repo")).toBe(true);
  });

  it("writes one JSON object per line", () => {
    const text = scriptToJsonl([
      { promptCode: "xx_001", text: "kwa gbo chi" },
      { promptCode: "xx_002", text: "gwa kpe nwa" },
    ]);
    const rows = text.trim().split("\n").map((l) => JSON.parse(l));
    expect(rows).toEqual([
      { n: 1, promptCode: "xx_001", text: "kwa gbo chi" },
      { n: 2, promptCode: "xx_002", text: "gwa kpe nwa" },
    ]);
    expect(toneStrip(rows[0].text)).toBe(rows[0].text);
  });
});
