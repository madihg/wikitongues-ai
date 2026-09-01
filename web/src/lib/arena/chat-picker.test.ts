import { describe, it, expect } from "vitest";
import {
  MAX_COMPARE_MODELS,
  addCompare,
  defaultChatSelection,
  partitionPicker,
  rankChatCandidates,
  removeModel,
  selectOnly,
  type PickerCandidate,
} from "./chat-picker";

function cand(
  slug: string,
  name: string,
  kind = "rag",
  versionLabel: string | null = null,
): PickerCandidate {
  return {
    slug,
    name,
    kind,
    ragEnabled: kind === "rag",
    approach: kind === "baseline" ? "untouched" : "retrieval v4",
    versionLabel,
  };
}

// Registry order is deliberately NOT score order, so any test that finds the
// leader first proves the sort did it, not the input.
const FIELD: PickerCandidate[] = [
  cand("a-rag-v2", "A + RAG v2", "rag", "rag-v2"),
  cand("b-rag-v4", "B + RAG v4", "rag", "rag-v4"),
  cand("c-baseline", "Plain C", "baseline"),
  cand("d-sft", "D fine-tune", "sft"),
  cand("e-rag-v3", "E + RAG v3", "rag", "rag-v3"),
];

const SCORES = new Map<string, number | null>([
  ["A + RAG v2", 61.2],
  ["B + RAG v4", 92.7],
  ["Plain C", 12.4],
  ["D fine-tune", 74.9],
  // "E + RAG v3" deliberately absent: an unscored arm.
]);

describe("rankChatCandidates", () => {
  it("sorts by live agreement score descending, unscored last", () => {
    const ranked = rankChatCandidates(FIELD, SCORES);
    expect(ranked.map((r) => r.slug)).toEqual([
      "b-rag-v4",
      "d-sft",
      "a-rag-v2",
      "c-baseline",
      "e-rag-v3",
    ]);
    expect(ranked[0].score).toBe(92.7);
    expect(ranked.at(-1)?.score).toBeNull();
  });

  it("falls back to versionLabel descending when scores are unavailable", () => {
    const ranked = rankChatCandidates(FIELD, null);
    // rag-v4 > rag-v3 > rag-v2 > no label; ties break by name.
    expect(ranked.map((r) => r.slug)).toEqual([
      "b-rag-v4",
      "e-rag-v3",
      "a-rag-v2",
      "d-sft",
      "c-baseline",
    ]);
  });
});

describe("defaultChatSelection", () => {
  it("preselects the top scorer alone - the leader falls out of the data", () => {
    // Requirement 1: whichever model the mocked scores rank first is the
    // default, with nothing else selected.
    expect(defaultChatSelection(rankChatCandidates(FIELD, SCORES))).toEqual([
      "b-rag-v4",
    ]);
  });

  it("still yields a single sensible default when scores are unavailable", () => {
    expect(defaultChatSelection(rankChatCandidates(FIELD, null))).toEqual([
      "b-rag-v4",
    ]);
  });

  it("returns empty for an empty field instead of inventing a model", () => {
    expect(defaultChatSelection([])).toEqual([]);
  });
});

describe("selectOnly", () => {
  it("replaces the whole selection with the tapped model (radio semantics)", () => {
    // Whatever was selected before, a tap means "talk to this one".
    expect(selectOnly("d-sft")).toEqual(["d-sft"]);
  });
});

describe("addCompare", () => {
  it("appends up to the cap, preserving order", () => {
    let sel = selectOnly("b-rag-v4");
    sel = addCompare(sel, "d-sft");
    sel = addCompare(sel, "a-rag-v2");
    expect(sel).toEqual(["b-rag-v4", "d-sft", "a-rag-v2"]);
    expect(sel).toHaveLength(MAX_COMPARE_MODELS);
  });

  it("refuses to exceed the cap", () => {
    const full = ["b-rag-v4", "d-sft", "a-rag-v2"];
    expect(addCompare(full, "e-rag-v3")).toEqual(full);
  });

  it("refuses duplicates", () => {
    expect(addCompare(["b-rag-v4"], "b-rag-v4")).toEqual(["b-rag-v4"]);
  });
});

describe("removeModel", () => {
  it("removes only the named chip", () => {
    expect(removeModel(["b-rag-v4", "d-sft"], "b-rag-v4")).toEqual(["d-sft"]);
  });
});

describe("partitionPicker", () => {
  it("keeps scored non-baseline arms primary and folds the long tail", () => {
    const { primary, tail } = partitionPicker(
      rankChatCandidates(FIELD, SCORES),
    );
    expect(primary.map((r) => r.slug)).toEqual([
      "b-rag-v4",
      "d-sft",
      "a-rag-v2",
    ]);
    // Baselines and unscored legacy arms are the collapsed tail.
    expect(tail.map((r) => r.slug)).toEqual(["c-baseline", "e-rag-v3"]);
  });

  it("shows everything when nothing qualifies as primary", () => {
    // Scores unavailable: a fully collapsed picker would hide all models.
    const { primary, tail } = partitionPicker(rankChatCandidates(FIELD, null));
    expect(primary).toHaveLength(FIELD.length);
    expect(tail).toEqual([]);
  });
});
