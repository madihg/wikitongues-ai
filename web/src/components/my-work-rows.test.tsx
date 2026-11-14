import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MyWorkFilter, MyWorkRows, type HistoryRow } from "./my-work-rows";

/**
 * My Work: every row keeps its labels and gains an Edit button; the filter
 * offers "Needs a meaning or a reason". Invented placeholder texts.
 */

const rows: HistoryRow[] = [
  {
    kind: "pairwise",
    id: "p1",
    createdAt: "2026-10-12T08:01:00.000Z",
    bucketLabel: "Orthography",
    promptText: "First question?",
    winner: "b",
    confidence: null,
    explanation: "B reads better.",
    outputA: "out a",
    outputB: "out b",
  },
  {
    kind: "cold",
    id: "c1",
    createdAt: "2026-10-12T08:00:00.000Z",
    bucketLabel: "Orthography",
    promptText: "Second question?",
    answerText: "alpha beta",
    englishGloss: null,
    provenance: "speaker_authored_sourcefree",
    needsFix: true,
  },
  {
    kind: "edit",
    id: "e1",
    createdAt: "2026-10-12T08:02:00.000Z",
    bucketLabel: "Orthography",
    promptText: "Third question?",
    originalText: "one two",
    correctedText: "one TWO",
    rationale: "The second word is a name, so it takes a capital.",
    needsFix: false,
  },
];

const render = (expanded: string | null = null) =>
  renderToStaticMarkup(
    <MyWorkRows
      rows={rows}
      expanded={expanded}
      onToggle={() => {}}
      onEdit={() => {}}
    />,
  );

describe("My Work rows", () => {
  it("keeps the three kinds and their summaries as they were", () => {
    const m = render();
    for (const label of ["Comparison", "Gold answer", "Correction"]) {
      expect(m).toContain(label);
    }
    expect(m).toContain("Picked B");
    expect(m).toContain("Your own answer");
    expect(m).toContain("Winner corrected");
  });

  it("every row has an Edit button, at least 44 px high, named by its prompt", () => {
    const m = render();
    const edits = [
      ...m.matchAll(
        /<button[^>]*aria-label="Edit: ([^"]+)"[^>]*>Edit<\/button>/g,
      ),
    ];
    expect(edits.map((e) => e[1])).toEqual([
      "First question?",
      "Second question?",
      "Third question?",
    ]);
    expect(edits.every((e) => e[0].includes("min-h-11"))).toBe(true);
  });

  it("marks only the rows that need a meaning or a reason", () => {
    const m = render();
    expect(m.match(/No meaning yet/g)).toHaveLength(1);
    expect(m).not.toContain("Reason is short");
  });

  it("an open answer shows its meaning, or says how to add it", () => {
    expect(render("c1")).toContain("Not given yet. Press Edit to add it.");
    expect(render("e1")).toContain(
      "The second word is a name, so it takes a capital.",
    );
  });
});

describe("My Work filter", () => {
  it("offers All and Needs a meaning or a reason, one pressed", () => {
    const m = renderToStaticMarkup(
      <MyWorkFilter value="fix" onChange={() => {}} />,
    );
    expect(m).toMatch(/aria-pressed="false"[^>]*>All</);
    expect(m).toMatch(/aria-pressed="true"[^>]*>Needs a meaning or a reason</);
  });
});
