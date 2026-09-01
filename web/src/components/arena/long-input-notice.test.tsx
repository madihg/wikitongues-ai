import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { LongInputNotice } from "./long-input-notice";
import { LONG_INPUT_WARN_CHARS } from "@/lib/arena/turn-budget";

/**
 * THE PRE-FLIGHT WARNING.
 *
 * A long pasted passage drives both halves of the turn's cost - retrieval
 * breadth and generation length - and is what turned a working chat into a
 * bodiless 504. The reviewer is entitled to know that before she presses
 * Enter, and equally entitled to press it anyway: the two properties pinned
 * here are that the warning APPEARS past the threshold, and that nothing about
 * it can stop or alter the message.
 */

const render = (text: string) =>
  renderToStaticMarkup(<LongInputNotice text={text} />);

describe("LongInputNotice", () => {
  it("renders nothing at all for an ordinary question", () => {
    expect(render("How do I greet an elder in the morning?")).toBe("");
    expect(render("")).toBe("");
    expect(render("x".repeat(LONG_INPUT_WARN_CHARS))).toBe("");
  });

  it("appears once the passage crosses the threshold", () => {
    const markup = render("x".repeat(LONG_INPUT_WARN_CHARS + 1));
    expect(markup).not.toBe("");
    expect(markup).toMatch(/time limit/i);
    expect(markup).toMatch(/shorter parts/i);
  });

  it("says the message can be sent as it is", () => {
    // The difference between a warning and a refusal, in the copy itself.
    const markup = render("word ".repeat(LONG_INPUT_WARN_CHARS));
    expect(markup).toMatch(/send it as it is/i);
    expect(markup).not.toMatch(/cannot|blocked|not allowed|truncat/i);
  });

  it("is announced politely rather than as an error", () => {
    const markup = render("x".repeat(LONG_INPUT_WARN_CHARS + 1));
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('role="status"');
    // Not an alert, and not styled as a failure: nothing has gone wrong yet.
    expect(markup).not.toContain("alert");
    expect(markup).not.toContain("text-danger");
  });
});

/**
 * The composer itself, read as source. A rendering test cannot reach the
 * button's disabled expression (the draft lives in state that only a browser
 * ever fills), and this is the property most likely to be broken by a later
 * edit that means well: turning the warning into a gate.
 */
describe("the composer never blocks or edits a long message", () => {
  const source = readFileSync(
    join(process.cwd(), "src", "components", "arena", "model-chat.tsx"),
    "utf8",
  );

  it("renders the notice beside the composer", () => {
    expect(source).toContain("<LongInputNotice text={draft} />");
  });

  it("gates the send button on emptiness and selection only", () => {
    expect(source).toContain(
      "disabled={busy || !draft.trim() || composerBlocked}",
    );
    // No length term anywhere in a disabled or early-return position.
    expect(source).not.toMatch(/disabled=\{[^}]*(length|LONG_INPUT|isLong)/);
    expect(source).not.toMatch(/if\s*\([^)]*isLongChatInput[^)]*\)\s*return/);
  });

  it("never shortens the draft on the way out", () => {
    // Silently truncating a researcher's passage and answering the remainder
    // confidently would be worse than any timeout.
    expect(source).not.toMatch(/draft[^\n]*\.(slice|substring|substr)\(/);
    expect(source).toContain("const question = draft.trim();");
  });
});
