import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckView, FIX_COPY, type CheckViewProps } from "./check-interface";

const props = (over: Partial<CheckViewProps> = {}): CheckViewProps => ({
  task: {
    recording: { id: "c1", url: "/a.webm" },
    prompt: { promptId: "p1", text: "Say hello." },
    answer: { text: "ada ba", words: ["ada", "ba"] },
  },
  sent: "does_not_match",
  picked: null,
  wrongWord: null,
  level: null,
  note: "",
  busy: false,
  error: null,
  transcript: null,
  onPick: () => {},
  onWrongWord: () => {},
  onLevel: () => {},
  onNote: () => {},
  onSend: () => {},
  onChange: () => {},
  onNext: () => {},
  onFixed: () => {},
  ...over,
});

describe("Check: the lead's fix", () => {
  it("a lead who sent 'Does not match' is offered the fix", () => {
    const html = renderToStaticMarkup(<CheckView {...props({ canFix: true })} />);
    expect(html).toContain(FIX_COPY.open);
  });

  it("any other checker is not", () => {
    expect(renderToStaticMarkup(<CheckView {...props()} />)).not.toContain(FIX_COPY.open);
  });

  it("nor is a lead whose verdict was 'Matches'", () => {
    const html = renderToStaticMarkup(
      <CheckView {...props({ canFix: true, sent: "matches" })} />,
    );
    expect(html).not.toContain(FIX_COPY.open);
  });
});
