import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatColumnBody, secondPassCost } from "./chat-column-body";
import { referenceFormReport } from "@/lib/arena/reference-form";
import {
  initStreamingReplies,
  type StreamingReply,
} from "@/lib/arena/chat-stream";
import { TURN_CUTOFF_NOTICE } from "@/lib/arena/turn-budget";

/**
 * EVERY STATE A COLUMN CAN BE IN, AND WHAT IT SAYS THERE.
 *
 * The state that matters most is the one the incident produced: a turn cut
 * short by the platform time limit, where the column holds real partial output
 * AND an explanation. The old markup rendered those as alternatives, so the
 * reviewer got the explanation only - the empty red card. The first test below
 * is that regression, pinned.
 */

const column = (over: Partial<StreamingReply> = {}): StreamingReply => ({
  ...initStreamingReplies([{ slug: "v41", name: "v4.1" }])[0],
  ...over,
});

const render = (reply: StreamingReply) =>
  renderToStaticMarkup(<ChatColumnBody reply={reply} />);

describe("a column cut short by the time limit", () => {
  const cutOff = column({
    text: "Ẹ nwu ọdudu, this much arrived before",
    error: TURN_CUTOFF_NOTICE,
    done: true,
  });

  it("shows the partial answer AND the explanation, not one or the other", () => {
    const markup = render(cutOff);
    expect(markup).toContain("this much arrived before");
    expect(markup).toContain("time limit");
  });

  it("keeps the answer in the answer style, not folded into the error line", () => {
    const markup = render(cutOff);
    // The partial text is the model's output and reads as such; the note is
    // secondary and marked as the failure.
    expect(markup).toMatch(
      /class="[^"]*text-text-primary[^"]*"[^>]*>Ẹ nwu ọdudu/,
    );
    expect(markup).toMatch(/class="[^"]*text-danger[^"]*"[^>]*>The platform/);
  });

  it("never renders the empty-response placeholder over real text", () => {
    expect(render(cutOff)).not.toContain("(empty response)");
  });
});

describe("the states that existed before the deadline work", () => {
  it("a column still streaming shows its text and no placeholder", () => {
    const markup = render(column({ text: "Wọla " }));
    expect(markup).toContain("Wọla");
    expect(markup).not.toContain("(empty response)");
  });

  it("a column waiting for its first token shows the ellipsis", () => {
    expect(render(column())).toContain("…");
  });

  it("a finished column with no text says so", () => {
    expect(render(column({ done: true }))).toContain("(empty response)");
  });

  it("a column that failed outright shows only the error", () => {
    const markup = render(
      column({ done: true, error: "provider key revoked" }),
    );
    expect(markup).toContain("provider key revoked");
    expect(markup).not.toContain("(empty response)");
    expect(markup).not.toContain("…");
  });
});

describe("the repair round's note", () => {
  const reasons = ["letters that are not in the Igala alphabet"];

  it("says a rewrite is under way while the second attempt streams", () => {
    const markup = render(column({ revisedFor: reasons, text: "ojo " }));
    expect(markup).toContain("Rewriting its answer");
    expect(markup).toContain(reasons[0]);
  });

  it("says it rewrote, past tense, once the column is done", () => {
    const markup = render(
      column({ revisedFor: reasons, text: "ojo daa", done: true }),
    );
    expect(markup).toContain("Rewrote its answer");
  });

  it("says the check flagged the answer when there was no time to rewrite", () => {
    // The reviewer is reading the FLAGGED first answer. Telling her it was
    // rewritten would be false; telling her nothing would be worse.
    const markup = render(
      column({
        revisedFor: reasons,
        revisionApplied: false,
        text: "sooro ada",
        done: true,
      }),
    );
    expect(markup).toContain("The check flagged this answer");
    expect(markup).toContain(reasons[0]);
    expect(markup).toContain("not enough time left");
    expect(markup).not.toContain("Rewrote");
    // And the answer she is reading is still there.
    expect(markup).toContain("sooro ada");
  });

  it("says nothing at all when no revision happened", () => {
    const markup = render(column({ text: "Wọla ọdudu", done: true }));
    expect(markup).not.toContain("Rewrote");
    expect(markup).not.toContain("flagged");
  });
});

/**
 * THE REFERENCE FORM BENEATH THE ANSWER (rag-v4-5 only). The second pass's
 * rendering is shown under its own label, quieter than the answer and never
 * in the answer's style, with the mechanical report and what the pass cost as
 * small print. A column with no rendering says nothing about one.
 */
describe("the reference form beneath the answer", () => {
  const report = referenceFormReport("Ma k'ọla wa", "Mà k'ọ́lá wà");
  const rendered = (over: Record<string, unknown> = {}) => ({
    text: "Mà k'ọ́lá wà",
    report,
    latencyMs: 4200,
    tokensIn: 300,
    tokensOut: 50,
    ...over,
  });

  it("shows the rendering under its own label, with the answer still in the answer style", () => {
    const markup = render(
      column({ text: "Ma k'ọla wa", done: true, referenceForm: rendered() }),
    );
    expect(markup).toContain("Reference form (second pass, not judged)");
    expect(markup).toContain("Mà k&#x27;ọ́lá wà");
    expect(markup).toMatch(
      /class="[^"]*text-text-primary[^"]*"[^>]*>Ma k&#x27;ọla wa/,
    );
    // The rendering is quieter than the answer, never styled as the answer.
    expect(markup).toMatch(
      /class="[^"]*text-text-secondary[^"]*"[^>]*>Mà k&#x27;ọ́lá wà/,
    );
  });

  it("prints the toned share, the apostrophes left and what the second pass cost", () => {
    const markup = render(
      column({ text: "Ma k'ọla wa", done: true, referenceForm: rendered() }),
    );
    expect(markup).toContain("100% of 3 words toned");
    expect(markup).toContain("1 apostrophe left");
    expect(markup).toContain("second pass 4.2s, 350 tokens");
  });

  it("shows the rendering with only the cost when the report did not arrive", () => {
    const markup = render(
      column({
        text: "Ma k'ọla wa",
        done: true,
        referenceForm: rendered({ text: "Mà kí ọ́lá wà", report: null }),
      }),
    );
    expect(markup).toContain("Mà kí ọ́lá wà");
    expect(markup).not.toContain("words toned");
    expect(markup).toContain("second pass 4.2s");
  });

  it("shows no small print at all when neither the report nor the cost arrived", () => {
    const markup = render(
      column({
        text: "Ma k'ọla wa",
        done: true,
        referenceForm: rendered({
          report: null,
          latencyMs: null,
          tokensIn: null,
          tokensOut: null,
        }),
      }),
    );
    expect(markup).toContain("Reference form (second pass, not judged)");
    expect(markup).not.toContain("second pass ");
    expect(markup).not.toContain("words toned");
  });

  it("says nothing at all on a column with no reference form", () => {
    const markup = render(column({ text: "Ma k'ọla wa", done: true }));
    expect(markup).not.toContain("Reference form");
  });
});

describe("secondPassCost", () => {
  it("says seconds and tokens in plus out, leaving out what is missing, never inventing a zero", () => {
    expect(
      secondPassCost({ latencyMs: 4200, tokensIn: 300, tokensOut: 50 }),
    ).toBe("second pass 4.2s, 350 tokens");
    expect(
      secondPassCost({ latencyMs: 4200, tokensIn: null, tokensOut: 50 }),
    ).toBe("second pass 4.2s");
    expect(
      secondPassCost({ latencyMs: null, tokensIn: 300, tokensOut: 50 }),
    ).toBe("second pass 350 tokens");
    expect(
      secondPassCost({ latencyMs: null, tokensIn: null, tokensOut: null }),
    ).toBeNull();
  });
});
