import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { PromptSection } from "./annotations-review";

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
