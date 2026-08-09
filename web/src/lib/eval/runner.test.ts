import { describe, it, expect } from "vitest";
import {
  runEval,
  headToHead,
  REPORT_CAVEATS,
  type EvalPromptInput,
  type EvalOutputInput,
} from "./runner";
import { buildLanguageIdModel } from "./langid";

const langModel = buildLanguageIdModel({
  igalaTexts: [
    "ọdudu",
    "Ọma lẹ a jẹ ñwu",
    "Imọtọ",
    "Agba ọjọ ki pẹnẹ",
    "Aka ma gbọ ñ oñwu chi ukwu imọtọ",
    "Abẹ le ñw'ọjọ",
    "Ujẹñwu",
    "Uchu",
  ],
  englishTexts: [
    "Translate 'I drink water' into Igala.",
    "Give the Igala word for 'hand'.",
    "Write a short natural Igala blessing as a community member would say it.",
  ],
});

const prompts: EvalPromptInput[] = [
  {
    promptId: "p1",
    bucket: "orthography",
    text: "Give the Igala word for 'vehicle'.",
    golds: ["ọdudu", "Ọdudu", "ódùdù"],
  },
  {
    promptId: "p2",
    bucket: "orthography",
    text: "Give the Igala word for 'car'.",
    golds: ["imọtọ", "Imoto"],
  },
  {
    promptId: "p3",
    bucket: "grammar_tone",
    text: "Translate 'the child eats food'.",
    golds: ["Ọma lẹ a jẹ ñwu", "Ọma lẹ aj'ẹñwu"],
  },
  {
    // Single gold: scorable, but contributes NO ceiling.
    promptId: "p4",
    bucket: "grammar_tone",
    text: "Translate 'thank you'.",
    golds: ["Agba ọjọ ki pẹnẹ"],
  },
  {
    // No gold at all: must not enter reference aggregates.
    promptId: "p5",
    bucket: "cultural_values",
    text: "Explain the Egwu masquerade.",
    golds: [],
  },
];

function outputsFor(
  candidateId: string,
  candidateName: string,
  texts: Record<string, string>,
): EvalOutputInput[] {
  return Object.entries(texts).map(([promptId, text]) => ({
    candidateId,
    candidateName,
    promptId,
    text,
  }));
}

const perfect = outputsFor("good", "Copies the gold", {
  p1: "ọdudu",
  p2: "imọtọ",
  p3: "Ọma lẹ a jẹ ñwu",
  p4: "Agba ọjọ ki pẹnẹ",
  p5: "Ọma lẹ a jẹ ñwu",
});

const englishy = outputsFor("bad", "Answers in English", {
  p1: "The Igala word for vehicle is used every day.",
  p2: "The Igala word for car is a common everyday term.",
  p3: "The child eats the food, which is the correct translation here.",
  p4: "Thank you very much for the question you have asked me.",
  p5: "The Egwu masquerade festivals are deeply rooted in the community.",
});

describe("runEval - shape and honesty invariants", () => {
  const report = runEval({
    prompts,
    outputs: [...perfect, ...englishy],
    langModel,
    generatedAt: "2026-08-09T00:00:00.000Z",
  });

  it("counts prompts and gold coverage", () => {
    expect(report.nPrompts).toBe(5);
    expect(report.nPromptsWithGold).toBe(4);
  });

  it("carries the caveats verbatim", () => {
    expect(report.caveats).toEqual([...REPORT_CAVEATS]);
  });

  it("puts an n and an interval on every aggregate cell", () => {
    for (const cand of report.candidates) {
      for (const cell of cand.overall) {
        expect(cell.best.n).toBeGreaterThan(0);
        expect(cell.best.ciLow).toBeLessThanOrEqual(cell.best.mean);
        expect(cell.best.ciHigh).toBeGreaterThanOrEqual(cell.best.mean);
      }
    }
  });

  it("excludes gold-less prompts from reference metrics but not the language gate", () => {
    const good = report.candidates.find((c) => c.candidateId === "good")!;
    // 5 outputs seen by the language gate ...
    expect(good.n).toBe(5);
    expect(good.language.igalaShare.n).toBe(5);
    // ... but only the 4 gold-backed prompts feed chrF.
    expect(good.overall.find((c) => c.metric === "chrf")!.best.n).toBe(4);
  });

  it("ranks the gold-copying candidate above the English one on chrF", () => {
    const chrfOf = (id: string) =>
      report.candidates
        .find((c) => c.candidateId === id)!
        .overall.find((c) => c.metric === "chrf")!.best.mean;
    expect(chrfOf("good")).toBeGreaterThan(chrfOf("bad"));
    expect(report.candidates[0].candidateId).toBe("good");
  });

  it("catches the English answers with the language gate", () => {
    const bad = report.candidates.find((c) => c.candidateId === "bad")!;
    expect(bad.language.englishLikeShare.mean).toBe(1);
    expect(bad.language.igalaShare.mean).toBe(0);
    const good = report.candidates.find((c) => c.candidateId === "good")!;
    expect(good.language.igalaShare.mean).toBeGreaterThan(0.5);
  });

  it("breaks results down by prompt category", () => {
    const good = report.candidates.find((c) => c.candidateId === "good")!;
    const buckets = good.byCategory.map((c) => c.bucket);
    expect(buckets).toEqual(["grammar_tone", "orthography"]);
    // cultural_values had no gold, so it cannot appear as a scored category.
    expect(buckets).not.toContain("cultural_values");
  });
});

describe("runEval - the inter-gold ceiling", () => {
  const report = runEval({ prompts, outputs: perfect, langModel });

  it("counts which prompts can and cannot yield a ceiling", () => {
    // p1, p2, p3 have >= 2 golds; p4 has 1; p5 has 0.
    expect(report.ceiling.nPromptsWithCeiling).toBe(3);
    expect(report.ceiling.nPromptsWithoutCeiling).toBe(2);
  });

  it("reports a ceiling strictly below 1 - humans do not agree perfectly", () => {
    const chrf = report.ceiling.overall.find((c) => c.metric === "chrf")!;
    expect(chrf.best.mean).toBeLessThan(1);
    expect(chrf.best.mean).toBeGreaterThan(0);
  });

  it("exposes the raw human-vs-human chrF values for threshold calibration", () => {
    expect(report.ceiling.allGoldChrf.length).toBe(3 + 2 + 2);
  });
});

describe("headToHead", () => {
  const report = runEval({
    prompts,
    outputs: [...perfect, ...englishy],
    langModel,
    generatedAt: "2026-08-09T00:00:00.000Z",
  });

  it("pairs only on prompts both candidates answered WITH gold", () => {
    const pair = report.headToHead.find(
      (h) => h.candidateA === "good" && h.candidateB === "bad",
    )!;
    expect(pair.nPaired).toBe(4);
  });

  it("refuses to call a 4-prompt difference distinguishable", () => {
    // n = 4 is below the bootstrap minimum, so no interval exists and the
    // answer must be "not distinguishable", however large the raw gap.
    const pair = report.headToHead.find(
      (h) => h.candidateA === "good" && h.candidateB === "bad",
    )!;
    const chrf = pair.cells.find((c) => c.metric === "chrf")!;
    expect(chrf.delta.mean).toBeGreaterThan(0.4);
    expect(chrf.delta.underpowered).toBe(true);
    expect(chrf.delta.distinguishable).toBe(false);
  });

  it("becomes distinguishable once there are enough prompts", () => {
    // Same two systems, 12 prompts instead of 4.
    const many: EvalPromptInput[] = Array.from({ length: 12 }, (_, i) => ({
      promptId: `q${i}`,
      bucket: "orthography",
      text: "Give the Igala word.",
      golds: ["ọdudu", "ódùdù"],
    }));
    const a = many.map((p) => ({
      candidateId: "good",
      candidateName: "good",
      promptId: p.promptId,
      text: "ọdudu",
    }));
    const b = many.map((p) => ({
      candidateId: "bad",
      candidateName: "bad",
      promptId: p.promptId,
      text: "The Igala word for that is a common everyday term.",
    }));
    const r = runEval({ prompts: many, outputs: [...a, ...b], langModel });
    const pair = r.headToHead.find(
      (h) => h.candidateA === "good" && h.candidateB === "bad",
    )!;
    const chrf = pair.cells.find((c) => c.metric === "chrf")!;
    expect(chrf.delta.distinguishable).toBe(true);
    expect(chrf.delta.ciLow).toBeGreaterThan(0);
  });

  it("is antisymmetric: A-vs-B is the negation of B-vs-A", () => {
    const ab = report.headToHead.find(
      (h) => h.candidateA === "good" && h.candidateB === "bad",
    )!;
    const ba = report.headToHead.find(
      (h) => h.candidateA === "bad" && h.candidateB === "good",
    )!;
    const chrfAb = ab.cells.find((c) => c.metric === "chrf")!.delta.mean;
    const chrfBa = ba.cells.find((c) => c.metric === "chrf")!.delta.mean;
    expect(chrfAb).toBeCloseTo(-chrfBa, 10);
  });

  it("returns nPaired 0 when two candidates share no scored prompts", () => {
    const a = runEval({
      prompts,
      outputs: outputsFor("x", "x", { p1: "ọdudu" }),
      langModel,
    }).candidates[0];
    const b = runEval({
      prompts,
      outputs: outputsFor("y", "y", { p3: "Ọma lẹ a jẹ ñwu" }),
      langModel,
    }).candidates[0];
    expect(headToHead(a, b).nPaired).toBe(0);
  });
});

describe("runEval - reproducibility", () => {
  it("produces byte-identical output for identical input", () => {
    const args = {
      prompts,
      outputs: [...perfect, ...englishy],
      langModel,
      generatedAt: "2026-08-09T00:00:00.000Z",
    };
    expect(JSON.stringify(runEval(args))).toBe(JSON.stringify(runEval(args)));
  });
});
