import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { EditItem } from "@/lib/answer-edit";
import { AnswerEditorForm, ClipWarning, saveRequests } from "./answer-editor";

/**
 * The edit drawer, held in place by its markup: which boxes each kind of row
 * gets, that the choice is a line of text and never a control, and the two
 * buttons. Saving is held through saveRequests with a stubbed fetch.
 * Invented placeholder texts.
 */

const cold: EditItem = {
  type: "cold",
  id: "c1",
  createdAt: "2026-10-12T08:00:00.000Z",
  answerText: "alpha beta",
  englishGloss: null,
  dialect: "ankpa",
  instructionIg: null,
  provenance: "speaker_authored_sourcefree",
  needsFix: true,
  firstVersion: { text: "alpha", savedAt: "2026-10-12T08:00:00.000Z" },
  clips: [
    { id: "k1", language: "igala", durationMs: 6100, stale: true },
    { id: "k2", language: "english", durationMs: 4000, stale: false },
  ],
};
const pairwise: EditItem = {
  type: "pairwise",
  id: "p1",
  createdAt: "2026-10-12T08:01:00.000Z",
  winner: "b",
  explanation: "B reads better.",
};
const edit: EditItem = {
  type: "edit",
  id: "e1",
  createdAt: "2026-10-12T08:02:00.000Z",
  onOutput: "B",
  originalText: "one two three",
  correctedText: "one TWO three",
  rationale: null,
  segments: [],
  needsFix: true,
};
const listen: EditItem = {
  type: "listen",
  id: "l1",
  createdAt: "2026-10-12T08:03:00.000Z",
  winner: "a",
  note: "A sounds like a person.",
};

const render = (items: EditItem[], recordHref: string | null = null) =>
  renderToStaticMarkup(
    <AnswerEditorForm
      episode={{ promptText: "A test question?", items, recordHref }}
      onCancel={() => {}}
    />,
  );

const textareas = (m: string) =>
  [...m.matchAll(/<textarea[^>]*id="([^"]+)"/g)].map((x) => x[1]);

afterEach(() => vi.unstubAllGlobals());

describe("the edit drawer, by kind of row", () => {
  it("an own answer: the Igala box with the tone keyboard, the meaning, the variety, the question", () => {
    const m = render([cold]);
    expect(m).toContain("A test question?");
    expect(m).toContain("Your answer in Igala");
    expect(m).toContain("What it means / why, in English");
    expect(m).toContain("Which Igala is this?");
    expect(m).toContain('aria-label="Igala tone keyboard"');
    expect(textareas(m)).toEqual([
      "cold:c1-answer",
      "cold:c1-meaning",
      "cold:c1-instruction",
    ]);
    // the meaning box is there although the answer has no meaning yet
    expect(m).toMatch(/<textarea[^>]*id="cold:c1-meaning"[^>]*><\/textarea>/);
    expect(m).toMatch(/<option value="ankpa" selected="">/);
  });

  it("a comparison: the choice is a line that cannot be changed, the why is a box", () => {
    const m = render([pairwise]);
    expect(m).toContain("Why you chose as you did");
    expect(m).toContain("You picked Output B. This cannot be changed.");
    expect(textareas(m)).toEqual(["pairwise:p1-why"]);
    expect(m).toContain("B reads better.");
    // no control anywhere carries the choice
    expect(m).not.toMatch(/<(input|select)[^>]*(winner|Output A)/);
    expect(m).not.toMatch(/type="radio"/);
  });

  it("a correction: the suggesting editor and a reason box, shown even when the reason is empty", () => {
    const m = render([edit]);
    expect(m).toContain("Your correction and reasons (Output B)");
    expect(m).toContain("Why did you make these corrections? In English");
    expect(m).toMatch(/<textarea[^>]*id="edit:e1-rationale"[^>]*><\/textarea>/);
    expect(m).toContain("one TWO three");
  });

  it("a Listen judgment: the reason is a box, the choice is a line", () => {
    const m = render([listen]);
    expect(m).toContain("You picked Clip A. This cannot be changed.");
    expect(textareas(m)).toEqual(["listen:l1-why"]);
  });

  it("a whole episode shows its parts in order: answer, why, correction", () => {
    const m = render([cold, pairwise, edit]);
    const order = [
      "Your answer in Igala",
      "Why you chose as you did",
      "Your correction and reasons",
    ];
    const at = order.map((t) => m.indexOf(t));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
});

describe("the fixed parts", () => {
  it("Cancel and Save changes, both at least 44 px high", () => {
    const m = render([cold]);
    expect(m).toMatch(/<button[^>]*min-h-11[^>]*>Cancel<\/button>/);
    expect(m).toMatch(/<button[^>]*min-h-11[^>]*>Save changes<\/button>/);
  });

  it("an old correction with no reason does not switch Save off", () => {
    const m = render([{ ...edit, rationale: null }, cold]);
    expect(m).not.toMatch(
      /<button[^>]*disabled=""[^>]*>Save changes<\/button>/,
    );
  });

  it("the first version line, folded, with its help", () => {
    const m = render([cold]);
    expect(m).toContain("First version, saved 12 Oct");
    expect(m).toContain(
      "Your first version is kept. It was written before you saw the AI answers.",
    );
    expect(m).toMatch(/aria-expanded="false"[^>]*>Show</);
  });

  it("the clips line and Re-record, only where speech is on", () => {
    const on = render([cold], "/lab/speech");
    expect(on).toContain("Clips: Igala 6.1 s, English 4.0 s");
    expect(on).toContain("The words changed after a clip was recorded.");
    expect(on).toMatch(/<a href="\/lab\/speech"[^>]*>Re-record<\/a>/);
    const off = render([{ ...cold, clips: [] }]);
    expect(off).not.toContain("Clips:");
    expect(off).not.toContain("Re-record");
  });

  it("the clip warning after the words changed", () => {
    const m = renderToStaticMarkup(<ClipWarning recordHref="/speak" />);
    expect(m).toContain(
      "You changed the words. The clip may no longer match. Record it again?",
    );
    expect(m).toMatch(/<a href="\/speak"[^>]*>Re-record<\/a>/);
  });
});

describe("saving", () => {
  it("sends each changed row once, under one save id, and adds up what changed", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      calls.push({ url, body });
      return new Response(
        JSON.stringify({
          success: true,
          changed: Object.keys(body).filter((k) => k !== "saveId"),
          clipsStale: url.includes("/cold/"),
        }),
      );
    });
    const result = await saveRequests([
      { type: "cold", id: "c1", body: { answerText: "x", englishGloss: "y" } },
      { type: "pairwise", id: "p1", body: { explanation: "z" } },
    ]);
    expect(result).toEqual({ changed: 3, clipsStale: true });
    expect(calls.map((c) => c.url)).toEqual([
      "/api/annotator/answers/cold/c1",
      "/api/annotator/answers/pairwise/p1",
    ]);
    expect(calls[0].body.saveId).toBeTruthy();
    expect(calls[0].body.saveId).toBe(calls[1].body.saveId);
  });

  it("a refusal surfaces the server's words", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({ error: "You can only edit your own answers." }),
          { status: 403 },
        ),
    );
    await expect(
      saveRequests([{ type: "cold", id: "c1", body: { answerText: "x" } }]),
    ).rejects.toThrow("You can only edit your own answers.");
  });
});
