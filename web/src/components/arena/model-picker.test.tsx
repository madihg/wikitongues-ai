import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ModelPicker, type ScoresState } from "./model-picker";
import {
  MAX_COMPARE_MODELS,
  defaultChatSelection,
  rankChatCandidates,
  type PickerCandidate,
} from "@/lib/arena/chat-picker";

/**
 * The picker's interaction logic (single-select replace, compare cap, URL
 * round-trip) is pinned by the pure-function tests in chat-picker.test.ts and
 * chat-selection.test.ts. What static markup can hold in place is what a
 * reader could be misled about: the leader must render first and preselected,
 * scores must be visible per row, the compare affordance must disable at the
 * cap, the long tail must sit behind a disclosure, and every control must be
 * reachable (real buttons, labelled).
 */

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

// Registry order deliberately differs from score order.
const FIELD: PickerCandidate[] = [
  cand("a-rag-v2", "A + RAG v2", "rag", "rag-v2"),
  cand("b-rag-v4", "B + RAG v4", "rag", "rag-v4"),
  cand("c-baseline", "Plain C", "baseline"),
  cand("d-sft", "D fine-tune", "sft"),
];

const SCORES = new Map<string, number | null>([
  ["A + RAG v2", 61.2],
  ["B + RAG v4", 92.7],
  ["Plain C", 12.4],
  ["D fine-tune", 74.9],
]);

function render({
  scores = SCORES as ReadonlyMap<string, number | null> | null,
  selected,
  scoresState = "ready" as ScoresState,
}: {
  scores?: ReadonlyMap<string, number | null> | null;
  selected?: string[];
  scoresState?: ScoresState;
} = {}): string {
  const ranked = rankChatCandidates(FIELD, scores);
  return renderToStaticMarkup(
    <ModelPicker
      ranked={ranked}
      selected={selected ?? defaultChatSelection(ranked)}
      scoresState={scoresState}
      onSelectOnly={() => {}}
      onAddCompare={() => {}}
      onRemove={() => {}}
      onCopyLink={() => {}}
      copied={false}
      droppedUnknown={[]}
    />,
  );
}

describe("ModelPicker", () => {
  it("renders the top scorer first and preselected by default", () => {
    const html = render();
    // The leader falls out of the mocked scores (B), never registry order (A).
    expect(html.indexOf("B + RAG v4")).toBeLessThan(
      html.indexOf("D fine-tune"),
    );
    expect(html.indexOf("D fine-tune")).toBeLessThan(
      html.indexOf("A + RAG v2"),
    );
    // Exactly one row is pressed, and it is the leader: the pressed row's
    // chip carries the selected styling right after the leader's name.
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    const pressedAt = html.indexOf('aria-pressed="true"');
    expect(html.indexOf("B + RAG v4", pressedAt)).toBeLessThan(
      html.indexOf("D fine-tune", pressedAt),
    );
    // Its removable chip is rendered too.
    expect(html).toContain("Remove B + RAG v4 from the conversation");
  });

  it("shows each row's live score and approach label", () => {
    const html = render();
    for (const score of ["92.7", "74.9", "61.2", "12.4"]) {
      expect(html).toContain(score);
    }
    expect(html).toContain("retrieval v4");
    expect(html).toContain("untouched");
  });

  it("offers + compare on unselected rows and none on the selected one", () => {
    const html = render();
    // 4 rows, 1 selected: 3 compare affordances, all enabled below the cap.
    expect(html.match(/\+ compare<\/button>/g)).toHaveLength(3);
    expect(html).not.toContain('disabled=""');
  });

  it("disables + compare at the cap instead of allowing a fourth column", () => {
    const html = render({
      selected: ["b-rag-v4", "d-sft", "a-rag-v2"].slice(0, MAX_COMPARE_MODELS),
    });
    // The one remaining unselected row's compare button is disabled.
    expect(html.match(/\+ compare<\/button>/g)).toHaveLength(1);
    expect(html).toContain('disabled=""');
  });

  it("folds baselines behind a show-all disclosure", () => {
    const html = render();
    expect(html).toContain("<details");
    expect(html).toContain("Show all models");
    // The baseline renders inside the details block; the leader before it.
    expect(html.indexOf("Plain C")).toBeGreaterThan(html.indexOf("<details"));
    expect(html.indexOf("B + RAG v4")).toBeLessThan(html.indexOf("<details"));
  });

  it("announces the fallback ordering when scores are unavailable", () => {
    const html = render({ scores: null, scoresState: "error", selected: [] });
    expect(html).toContain("Live scores unavailable");
    // versionLabel desc: the v4 arm still leads the list.
    expect(html.indexOf("B + RAG v4")).toBeLessThan(html.indexOf("A + RAG v2"));
    // With nothing scored the tail is not drawn - collapsing everything would
    // hide all the models.
    expect(html).not.toContain("<details");
  });

  it("renders a loading state while scores fetch", () => {
    const html = render({ scores: null, scoresState: "loading", selected: [] });
    expect(html).toContain("Loading live agreement scores");
  });
});
