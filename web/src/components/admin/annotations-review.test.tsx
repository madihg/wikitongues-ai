import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ColdBody,
  EditBody,
  PairwiseBody,
  PromptSection,
} from "./annotations-review";

/**
 * The review drawer's "Annotate this prompt": a researcher reading a judgment
 * can open the same question in the real episode. What static markup can
 * hold in place is where the link goes and how it leaves: the annotate page
 * with the prompt's public code, in a new tab, so the review list keeps its
 * filters, its page and the open drawer.
 */

const render = (prompt: {
  promptId: string;
  text: string;
  bucket: string | null;
}) => renderToStaticMarkup(<PromptSection prompt={prompt} />);

/** The one anchor in the section, as its opening tag. */
function linkTag(markup: string): string {
  const tags = markup.match(/<a\b[^>]*>/g) ?? [];
  expect(tags).toHaveLength(1);
  return tags[0] ?? "";
}

describe("the drawer's PROMPT section", () => {
  const markup = render({
    promptId: "ig_test_regis_002",
    text: "How would you greet an elder in the morning?",
    bucket: "register_honorifics",
  });

  it("still shows the code, the category and the prompt text", () => {
    expect(markup).toContain("ig_test_regis_002");
    expect(markup).toContain("register_honorifics");
    expect(markup).toContain("How would you greet an elder in the morning?");
  });

  it('links "Annotate this prompt" to the annotate page with the code', () => {
    expect(markup).toContain("Annotate this prompt");
    expect(linkTag(markup)).toContain(
      'href="/annotator/annotate?prompt=ig_test_regis_002"',
    );
  });

  it("opens in a new tab, rel-guarded, and says so to a screen reader", () => {
    const tag = linkTag(markup);
    expect(tag).toContain('target="_blank"');
    expect(tag).toContain('rel="noopener noreferrer"');
    expect(markup).toContain("(opens in a new tab)");
  });

  it("URL-encodes a code that needs it", () => {
    const tag = linkTag(
      render({ promptId: "a b&c/d", text: "A question.", bucket: null }),
    );
    // & is the HTML escape of the attribute; the URL itself has no bare
    // space, ampersand or slash from the code.
    expect(tag).toContain('href="/annotator/annotate?prompt=a%20b%26c%2Fd"');
  });

  it("is there for a prompt with no category and no text too", () => {
    const bare = render({ promptId: "ig_test_bare", text: "", bucket: null });
    expect(linkTag(bare)).toContain(
      'href="/annotator/annotate?prompt=ig_test_bare"',
    );
  });

  it("is quiet: a bordered secondary control, never the accent button", () => {
    const tag = linkTag(markup);
    expect(tag).toContain("border-border-strong");
    expect(tag).toContain("text-text-secondary");
    expect(tag).not.toContain("bg-accent");
  });
});

/**
 * The drawer mounts behind a fetch, so that every event type gets the link is
 * held against the source: the section is rendered once, by the body shared
 * by pairwise, cold and edit details, and not inside any one of them.
 */
describe("every event type gets the link", () => {
  const src = readFileSync(join(__dirname, "annotations-review.tsx"), "utf8");

  it("DetailBody renders the section before it branches on the type", () => {
    const body = src.slice(src.indexOf("function DetailBody("));
    const section = body.indexOf("<PromptSection prompt={detail.prompt} />");
    const firstBranch = body.indexOf('detail.type === "pairwise"');
    expect(section).toBeGreaterThan(-1);
    expect(firstBranch).toBeGreaterThan(section);
  });

  it("the link is written once, through the shared URL helper", () => {
    expect(src.match(/annotatePromptHref\(/g)).toHaveLength(1);
    expect(src).toContain("href={annotatePromptHref(prompt.promptId)}");
    // No second, hand-built copy of the URL anywhere in the file.
    expect(src).not.toContain("/annotator/annotate");
  });
});

/**
 * The cause of what Agnes reported on Nov 10, held as a render test. She
 * holds the RESEARCHER role and edits in this drawer. Before: the English
 * meaning was a paragraph, the reason was a paragraph that was not rendered
 * at all when empty, and the written "why" was a paragraph. Now, on the
 * reader's OWN rows (isOwn), each is a box with a Save button. On another
 * person's row nothing changed. Invented placeholder texts.
 */
describe("the drawer on your own rows: meaning, reason and why are boxes", () => {
  const base = {
    id: "row1",
    createdAt: "2026-10-12T08:00:00.000Z",
    editable: true,
    annotator: { id: "u1", name: "A Speaker", email: "a@example.org" },
    prompt: null,
  };
  const cold = {
    ...base,
    type: "cold" as const,
    answerText: "alpha beta",
    englishGloss: null,
    provenance: "speaker_authored_sourcefree",
    consentBenchmark: true,
    consentTraining: true,
    verificationStatus: "single_annotator",
  };
  const edit = {
    ...base,
    type: "edit" as const,
    model: "model-x",
    originalText: "one two",
    correctedText: "one TWO",
    rationale: null,
    provenance: null,
    consentBenchmark: true,
    consentTraining: true,
    verificationStatus: "single_annotator",
  };
  const out = { id: "o", model: "m", text: "out", isWinner: false };
  const pairwise = {
    ...base,
    type: "pairwise" as const,
    editable: false,
    winner: "a",
    confidence: null,
    explanation: "A is right.",
    outputA: { ...out, isWinner: true },
    outputB: out,
    context: { rubricAxes: [], edits: [], coldAnswers: [] },
  };
  const boxes = (m: string) =>
    [...m.matchAll(/<textarea[^>]*id="edit-[a-z]+-row1-(\w+)"/g)].map(
      (x) => x[1],
    );
  const noop = () => {};

  it("own answer: the meaning is a box even when empty", () => {
    const own = renderToStaticMarkup(
      <ColdBody detail={{ ...cold, isOwn: true }} onSaved={noop} />,
    );
    expect(boxes(own)).toEqual(["answerText", "englishGloss"]);
    const other = renderToStaticMarkup(
      <ColdBody detail={{ ...cold, isOwn: false }} onSaved={noop} />,
    );
    expect(boxes(other)).toEqual(["answerText"]);
    expect(other).toContain("Not given - this answer predates");
  });

  it("own correction: the reason is a box even when empty (it was not shown at all)", () => {
    const own = renderToStaticMarkup(
      <EditBody detail={{ ...edit, isOwn: true }} onSaved={noop} />,
    );
    expect(boxes(own)).toEqual(["correctedText", "rationale"]);
    expect(own).toContain("Rationale");
    const other = renderToStaticMarkup(
      <EditBody detail={{ ...edit, isOwn: false }} onSaved={noop} />,
    );
    expect(boxes(other)).toEqual(["correctedText"]);
    expect(other).not.toContain("Rationale");
  });

  it("own comparison: the why is a box, the pick stays read-only", () => {
    const own = renderToStaticMarkup(
      <PairwiseBody detail={{ ...pairwise, isOwn: true }} onSaved={noop} />,
    );
    expect(boxes(own)).toEqual(["explanation"]);
    expect(own).toContain("Pairwise picks are read-only");
    expect(own).not.toMatch(/type="radio"|<select/);
    const other = renderToStaticMarkup(
      <PairwiseBody detail={{ ...pairwise, isOwn: false }} />,
    );
    expect(boxes(other)).toEqual([]);
    expect(other).toContain("A is right.");
  });
});
