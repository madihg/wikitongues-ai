import { describe, it, expect } from "vitest";
import {
  calibrateThresholds,
  autoVerdict,
  validateAutorater,
  requiredNForHalfWidth,
  DEFAULT_TIE_MARGIN,
  DEFAULT_INADEQUATE_QUANTILE,
  type HumanCase,
  type OutputSignal,
} from "./autorater";

function signal(
  chrf: number | null,
  opts: Partial<OutputSignal> = {},
): OutputSignal {
  return {
    chrf,
    isIgala: true,
    langTop: "igala",
    langLowConfidence: false,
    failureTags: [],
    ...opts,
  };
}

const ceiling = [0.1, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.9];

describe("calibrateThresholds", () => {
  it("takes the threshold from the human-vs-human distribution, not the labels", () => {
    const t = calibrateThresholds(ceiling);
    expect(t.quantile).toBe(DEFAULT_INADEQUATE_QUANTILE);
    expect(t.tieMargin).toBe(DEFAULT_TIE_MARGIN);
    expect(t.nCeilingSamples).toBe(10);
    // 10th percentile of the sorted ceiling values.
    expect(t.inadequate).toBeCloseTo(0.19, 6);
  });

  it("falls back to a stated constant when there is no ceiling data", () => {
    const t = calibrateThresholds([]);
    expect(t.nCeilingSamples).toBe(0);
    expect(t.inadequate).toBe(0.2);
  });
});

describe("autoVerdict", () => {
  const t = calibrateThresholds(ceiling);

  it("calls both sides inadequate when both are below the threshold", () => {
    expect(autoVerdict(signal(0.05), signal(0.02), t)).toBe("both_inadequate");
  });

  it("calls a tie when the gap is inside the margin", () => {
    expect(autoVerdict(signal(0.7), signal(0.68), t)).toBe("tie");
  });

  it("picks the higher-scoring side when the gap is real", () => {
    expect(autoVerdict(signal(0.7), signal(0.3), t)).toBe("a");
    expect(autoVerdict(signal(0.3), signal(0.7), t)).toBe("b");
  });

  it("treats an unscorable side (no gold) as 0 rather than throwing", () => {
    expect(autoVerdict(signal(null), signal(null), t)).toBe("both_inadequate");
    expect(autoVerdict(signal(null), signal(0.9), t)).toBe("b");
  });
});

describe("requiredNForHalfWidth", () => {
  it("says what sample size an accuracy claim would need", () => {
    expect(requiredNForHalfWidth(0.1)).toBe(97);
    expect(requiredNForHalfWidth(0.05)).toBe(385);
  });
});

describe("validateAutorater - the skew problem, stated numerically", () => {
  // Mirrors production: 775 both_inadequate, 5 decided, 1 tie.
  const cases: HumanCase[] = [];
  for (let i = 0; i < 775; i++) {
    cases.push({
      comparisonId: `c${i}`,
      promptId: `p${i % 43}`,
      winner: "both_inadequate",
      a: signal(0.05),
      b: signal(0.04),
    });
  }
  cases.push(
    {
      comparisonId: "d1",
      promptId: "p1",
      winner: "a",
      a: signal(0.9),
      b: signal(0.1),
    },
    {
      comparisonId: "d2",
      promptId: "p2",
      winner: "b",
      a: signal(0.1),
      b: signal(0.9),
    },
    {
      comparisonId: "d3",
      promptId: "p3",
      winner: "a",
      a: signal(0.1),
      b: signal(0.9),
    },
    {
      comparisonId: "d4",
      promptId: "p4",
      winner: "b",
      a: signal(0.05),
      b: signal(0.04),
    },
    {
      comparisonId: "d5",
      promptId: "p5",
      winner: "a",
      a: signal(0.8),
      b: signal(0.2),
    },
    {
      comparisonId: "t1",
      promptId: "p6",
      winner: "tie",
      a: signal(0.5),
      b: signal(0.49),
    },
  );

  const t = calibrateThresholds(ceiling);
  const v = validateAutorater(cases, t);

  it("reports the overall agreement with an n and an interval", () => {
    expect(v.overall.n).toBe(781);
    expect(v.overall.accuracy.mean).toBeGreaterThan(0.9);
    expect(v.overall.accuracy.ciHigh).toBeGreaterThan(v.overall.accuracy.ciLow);
  });

  it("reports the majority baseline right next to it", () => {
    expect(v.majorityBaseline.label).toBe("both_inadequate");
    expect(v.majorityBaseline.accuracy).toBeCloseTo(775 / 781, 6);
  });

  it("gives kappa CREDIT when the autorater really does discriminate", () => {
    // In this fixture the autorater gets 4 of the 5 decided cases right, so it
    // is doing more than the base rate and kappa says so. This is the control
    // for the degenerate case below.
    expect(v.kappaInadequate).toBeGreaterThan(0.7);
    expect(v.headline).toContain("kappa");
  });

  it("gives kappa ~0 to a constant predictor, which is the production shape", () => {
    // Every output scores below threshold - which is what actually happens on
    // this corpus - so the autorater says "both inadequate" every single time.
    // Raw agreement is 99.2%. Kappa is 0. The report must lead with kappa.
    const degenerate: HumanCase[] = cases.map((c) => ({
      ...c,
      a: signal(0.02),
      b: signal(0.01),
    }));
    const dv = validateAutorater(degenerate, t);
    expect(dv.overall.accuracy.mean).toBeCloseTo(775 / 781, 6);
    expect(dv.kappaInadequate).toBe(0);
    expect(dv.headline).toContain("reproducing the base rate");
    expect(dv.decided.agree).toBe(0);
  });

  it("segments the decided comparisons and says they cannot support a claim", () => {
    expect(v.decided.n).toBe(5);
    expect(v.decided.accuracy.underpowered).toBe(true);
    expect(v.decided.note).toMatch(/CANNOT support an accuracy claim/);
    expect(v.decided.note).toContain("97");
  });

  it("separates decided comparisons the autorater could actually score", () => {
    // In this fixture every side carries a chrF, so the two agree. The
    // production corpus is the interesting case: most decided comparisons sit
    // on prompts with no gold at all.
    expect(v.decidedScorable.n).toBe(5);

    const unscorable = validateAutorater(
      [
        {
          comparisonId: "u1",
          promptId: "p",
          winner: "a",
          a: signal(null),
          b: signal(null),
        },
      ],
      t,
    );
    expect(unscorable.decided.n).toBe(1);
    expect(unscorable.decidedScorable.n).toBe(0);
    expect(unscorable.decidedScorable.note).toMatch(
      /never been given a fair test/,
    );
  });

  it("segments the both-inadequate comparisons", () => {
    expect(v.bothInadequate.n).toBe(775);
    expect(v.bothInadequate.agree).toBe(775);
  });

  it("builds a human-vs-auto confusion table", () => {
    expect(v.confusion.both_inadequate.both_inadequate).toBe(775);
    expect(Object.keys(v.confusion).sort()).toEqual([
      "a",
      "b",
      "both_inadequate",
      "tie",
    ]);
  });

  it("produces a headline safe to quote verbatim", () => {
    expect(v.headline).toMatch(/agrees with native speakers on \d+\.\d%/);
    expect(v.headline).toContain("n=781");
    expect(v.headline).toContain("Only 5 comparison(s) name a winner");
    expect(v.headline).toContain("sit on a prompt with community gold");
  });
});

describe("validateAutorater - the language gate against failure tags", () => {
  it("says plainly when there is NO language ground truth at all", () => {
    const v = validateAutorater(
      [
        {
          comparisonId: "x",
          promptId: "p",
          winner: "both_inadequate",
          a: signal(0.1),
          b: signal(0.1),
        },
      ],
      calibrateThresholds(ceiling),
    );
    expect(v.langGate.nTagged).toBe(0);
    expect(v.langGate.note).toMatch(/NO human ground truth/);
  });

  it("measures recall against not_igala / wrong_language tags", () => {
    const cases: HumanCase[] = [
      {
        comparisonId: "1",
        promptId: "p",
        winner: "both_inadequate",
        a: signal(0.1, { isIgala: false, failureTags: ["not_igala"] }),
        b: signal(0.1, { isIgala: true, failureTags: ["wrong_language"] }),
      },
      {
        comparisonId: "2",
        promptId: "p",
        winner: "both_inadequate",
        a: signal(0.1, { isIgala: false, failureTags: ["not_igala"] }),
        b: signal(0.1, { isIgala: true, failureTags: ["tone_marks"] }),
      },
    ];
    const v = validateAutorater(cases, calibrateThresholds(ceiling));
    expect(v.langGate.nTagged).toBe(3);
    expect(v.langGate.nTaggedDetected).toBe(2);
    expect(v.langGate.recall.mean).toBeCloseTo(2 / 3, 6);
    expect(v.langGate.recall.underpowered).toBe(true);
    expect(v.langGate.note).toMatch(/uninformative/);
    // The non-language-tagged output is the only false-alarm probe we have.
    expect(v.langGate.nOtherTagged).toBe(1);
    expect(v.langGate.nOtherFlagged).toBe(0);
  });
});

describe("validateAutorater - degenerate input", () => {
  it("does not throw or NaN on an empty corpus", () => {
    const v = validateAutorater([], calibrateThresholds([]));
    expect(v.overall.n).toBe(0);
    expect(v.headline).toMatch(/entirely unvalidated/);
    expect(Number.isFinite(v.kappaInadequate)).toBe(true);
  });
});
