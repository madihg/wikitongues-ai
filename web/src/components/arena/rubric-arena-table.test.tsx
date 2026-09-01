import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RubricArenaView,
  type EraView,
  type RubricArenaData,
} from "./rubric-arena-table";
import {
  MIN_DECIDED_PER_CANDIDATE,
  buildEraSlice,
  derivePivotAt,
  eraSplit,
  type ArenaComparisonRow,
  type ArenaEra,
} from "@/lib/arena/era";
import { BUCKETS } from "@/lib/buckets";

/**
 * The table draws numbers computed in src/lib/arena/era.ts, so the fixtures
 * here run through the real slice builder rather than being hand-written: if
 * the gate or the window changed, these renders would change with it.
 *
 * What a static render can hold in place is exactly what a reader could be
 * misled by: the default window must be the post-pivot one, a candidate below
 * the gate must appear as a count and never as a strength, an empty window
 * must produce a sentence rather than a grid of 50s and dashes, and every
 * honesty marker that existed before this change must still be on the page.
 */

const day = (d: number) => new Date(Date.UTC(2026, 7, d, 12, 0, 0));

function row(
  a: string,
  b: string,
  outcome: string,
  d: number,
  opts: {
    bucket?: ArenaComparisonRow["bucket"];
    aInPool?: boolean;
    bInPool?: boolean;
  } = {},
): ArenaComparisonRow {
  return {
    candidateA: a,
    candidateB: b,
    outcome,
    bucket: opts.bucket ?? "authenticity",
    createdAt: day(d),
    aInPool: opts.aInPool ?? false,
    bInPool: opts.bInPool ?? false,
  };
}

const POOL = { aInPool: true, bInPool: true };

const NAMES: Record<string, string> = {
  "pool-rag": "Gemini + RAG v4",
  "pool-base": "Bare Gemini",
  "old-x": "Old Claude",
  "old-y": "Old GPT",
  "never-run": "Registered But Unrun",
};
const CANDIDATE_IDS = Object.keys(NAMES);

function meta(id: string) {
  return {
    id,
    name: NAMES[id] ?? id,
    slug: id,
    family: "test-family",
    kind: id.includes("rag") ? "rag" : "baseline",
    versionLabel: null,
    color: null,
    isChampion: false,
    ragEnabled: id.includes("rag"),
    inPairingPool: id.startsWith("pool"),
  };
}

/** Mirrors the join the API route does, so the component is exercised on the
 * shape it is actually served. */
function view(slice: ReturnType<typeof buildEraSlice>): EraView {
  return {
    ...slice,
    rows: slice.rows.map((r) => ({ ...r, candidate: meta(r.candidateId) })),
    belowGate: slice.belowGate.map((s) => ({
      ...s,
      candidate: meta(s.candidateId),
    })),
  };
}

function data(
  rows: ArenaComparisonRow[],
  candidateIds = CANDIDATE_IDS,
): RubricArenaData {
  const pivotAt = derivePivotAt(rows);
  const sincePivot = buildEraSlice(rows, {
    era: "since_pivot",
    pivotAt,
    candidateIds,
  });
  const allTime = buildEraSlice(rows, {
    era: "all_time",
    pivotAt,
    candidateIds,
  });
  return {
    buckets: BUCKETS.map((b) => ({
      key: b.key,
      num: b.num,
      short: b.short,
      label: b.label,
    })),
    pivotAt: pivotAt ? pivotAt.toISOString() : null,
    eras: { since_pivot: view(sincePivot), all_time: view(allTime) },
    split: eraSplit(allTime, sincePivot),
    totals: {
      candidates: candidateIds.length,
      pairwise: allTime.comparisons,
      rubric: 12,
      overallDistinguishable: allTime.overallDistinguishable,
    },
  };
}

/** The shape of the real corpus in miniature: a long rejected-both era, then a
 * decided post-pivot era, plus one straggler decided vote for a retired arm. */
function corpus(): ArenaComparisonRow[] {
  const rows: ArenaComparisonRow[] = [];
  for (let i = 0; i < 8; i++) {
    rows.push(row("old-x", "old-y", "both_inadequate", 1 + i));
  }
  for (let i = 0; i < 7; i++) {
    rows.push(row("pool-rag", "pool-base", "a", 20 + i, POOL));
  }
  for (let i = 0; i < 3; i++) {
    rows.push(
      row("pool-rag", "pool-base", "b", 25 + i, {
        ...POOL,
        bucket: "cultural_values",
      }),
    );
  }
  rows.push(row("pool-rag", "old-x", "a", 28, { aInPool: true }));
  return rows;
}

function render(
  d: RubricArenaData,
  initialEra?: ArenaEra,
  showExplainer = false,
): string {
  return renderToStaticMarkup(
    <RubricArenaView
      data={d}
      initialEra={initialEra}
      showExplainer={showExplainer}
    />,
  );
}

/** Visible prose only, whitespace collapsed, so a sentence assertion cannot be
 * defeated by markup or satisfied by a style attribute. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&apos;|&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

describe("RubricArenaTable - the era filter", () => {
  it("defaults to the post-pivot window and counts only its comparisons", () => {
    const txt = textOf(render(data(corpus())));
    // 11 post-pivot comparisons, 11 decided; the 8 rejected-both ones are out.
    expect(txt).toContain("11 blind comparisons in this window");
    expect(txt).toContain("11 decided (100%)");
    expect(txt).not.toContain("19 blind comparisons in this window");
  });

  it("offers both windows as real buttons, with each window's volume", () => {
    const html = render(data(corpus()));
    expect(html).toContain('aria-label="Comparison window"');
    expect(html).toContain("Since the annotation pivot");
    expect(html).toContain("All time");
    // The selected one is pressed, the other is not.
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(1);
    const txt = textOf(html);
    expect(txt).toContain("Since the annotation pivot 11");
    expect(txt).toContain("All time 19");
  });

  it("dates the window from the data and says so", () => {
    const txt = textOf(render(data(corpus())));
    expect(txt).toContain("Since the annotation pivot on 2026-08-20");
    expect(txt).toContain(
      "derived from the first comparison involving a system in today's pairing pool, not typed in here",
    );
  });

  it("states the split that justifies the default", () => {
    const txt = textOf(render(data(corpus())));
    // Post-pivot: 11 of 11 decided. Pre-pivot: 0 of 8.
    expect(txt).toContain(
      "11 of 11 blind comparisons produced a decided winner (100%)",
    );
    expect(txt).toContain("Before it, 0 of 8 (0%)");
  });

  it("shows the retired era's rows when all time is selected", () => {
    const all = textOf(render(data(corpus()), "all_time"));
    expect(all).toContain("19 blind comparisons in this window");
    // Old Claude clears the gate over all time only if it has the votes; here
    // it does not, so it is a counted shortfall in both windows.
    expect(all).toContain("Old Claude");
  });

  it("says there is no pivot rather than inventing one", () => {
    const rows = [row("old-x", "old-y", "a", 3)];
    const txt = textOf(render(data(rows, ["old-x", "old-y"])));
    expect(txt).toContain("No candidate is in the pairing pool yet");
  });
});

describe("RubricArenaTable - the sparsity gate", () => {
  it("draws a row only for candidates above the threshold", () => {
    const html = render(data(corpus()));
    expect(html).toContain("<table");
    const body = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));
    expect(body).toContain("Gemini + RAG v4");
    expect(body).toContain("Bare Gemini");
    expect(body).not.toContain("Old Claude");
  });

  it("lists the candidates below it with their own counts", () => {
    const txt = textOf(render(data(corpus())));
    expect(txt).toContain("Not enough decided votes yet");
    // Old Claude: exactly one decided vote inside the window.
    expect(txt).toContain("Old Claude 1 decided / 1 compared");
    // A registered candidate with nothing in the window is still listed.
    expect(txt).toContain("Registered But Unrun 0 decided / 0 compared");
  });

  it("interpolates the threshold rather than restating it in prose", () => {
    const txt = textOf(render(data(corpus())));
    expect(txt).toContain(
      `fewer than ${MIN_DECIDED_PER_CANDIDATE} decided votes in this window`,
    );
    expect(txt).toContain(
      `at least ${MIN_DECIDED_PER_CANDIDATE} decided votes here`,
    );
  });

  it("says the gate governs rows, not whose votes count", () => {
    const txt = textOf(render(data(corpus())));
    expect(txt).toContain(
      "the gate decides who gets a row, never whose votes count",
    );
  });
});

describe("RubricArenaTable - the empty window", () => {
  const barren = () => [
    row("pool-rag", "pool-base", "both_inadequate", 20, POOL),
    row("pool-rag", "pool-base", "tie", 21, POOL),
    row("pool-rag", "pool-base", "a", 22, POOL),
  ];

  it("renders a sentence and the counts instead of a grid of 50s", () => {
    const html = render(data(barren(), ["pool-rag", "pool-base"]));
    expect(html).not.toContain("<table");
    const txt = textOf(html);
    expect(txt).toContain(
      `No candidate has reached ${MIN_DECIDED_PER_CANDIDATE} decided votes in this window`,
    );
    expect(txt).toContain("3 blind comparisons, of which 1 produced a decided");
    expect(txt).toContain("1 were rejected as inadequate on both sides");
    expect(txt).toContain("1 came back an explicit tie");
    expect(txt).toContain("reads like a wall of ties");
  });

  it("states what would change it", () => {
    const txt = textOf(render(data(barren(), ["pool-rag", "pool-base"])));
    expect(txt).toContain("decided winners accumulating on the frozen");
    expect(txt).toContain(
      `One candidate reaching ${MIN_DECIDED_PER_CANDIDATE} decided votes here is enough`,
    );
  });

  it("still lists every candidate and its count", () => {
    const txt = textOf(render(data(barren(), ["pool-rag", "pool-base"])));
    expect(txt).toContain("Gemini + RAG v4 1 decided / 3 compared");
    expect(txt).toContain("Bare Gemini 1 decided / 3 compared");
  });
});

describe("RubricArenaTable - honesty markers kept", () => {
  it("keeps the neutral-50, ns, provisional-triangle and dash legend", () => {
    const txt = textOf(render(data(corpus())));
    expect(txt).toContain("50 means no evidence either way");
    expect(txt).toContain("not a score of 50 percent");
    expect(txt).toContain("ns means not statistically distinguishable");
    expect(txt).toContain("▲ △ mark the best and second best");
    expect(txt).toContain("provisional while");
    expect(txt).toContain("- means no votes in that category in this window");
  });

  it("marks a cell the fit cannot separate with ns", () => {
    // An even split cannot separate the two arms at this sample size.
    const even = [
      ...Array.from({ length: 6 }, (_, i) =>
        row("pool-rag", "pool-base", "a", 20 + i, POOL),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        row("pool-rag", "pool-base", "b", 26 + i, POOL),
      ),
    ];
    const html = render(data(even, ["pool-rag", "pool-base"]));
    expect(html).toContain(">ns<");
    expect(html).toContain(
      "Not statistically distinguishable at this sample size",
    );
  });

  it("names the categories it did not draw instead of showing dashes", () => {
    const txt = textOf(render(data(corpus())));
    // Only authenticity and cultural values have votes post-pivot.
    expect(txt).toMatch(/categories are not drawn because no comparison/);
    expect(txt).toContain("Spelling");
    expect(txt).not.toContain("no votes in that category yet");
  });

  it("never labels anything an LLM judgment", () => {
    const txt = textOf(render(data(corpus()))).toLowerCase();
    expect(txt).toContain("human pairwise");
    expect(txt).not.toContain("llm-as-judge");
    expect(txt).not.toContain("judge score");
  });
});
