import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { DoneBlock, WaitingBlock } from "./home-blocks";
import { WAITING_COPY, type WaitingCounts } from "@/lib/waiting";

const zero: WaitingCounts = {
  annotate: 0, record: 0, listen: 0, check: 0, tone: 0, fix: 0, fixTotal: 0,
};
const render = (counts: WaitingCounts | undefined, placeholder = "…") =>
  renderToStaticMarkup(
    <WaitingBlock counts={counts} placeholder={placeholder} />,
  );

describe("WaitingBlock", () => {
  it("has the heading, and one card per kind of work that is waiting", () => {
    const html = render({ ...zero, annotate: 12, record: 310, listen: 20 });
    expect(html).toContain("Waiting for you");
    expect(html).toContain("Annotate");
    expect(html).toContain("Prompts to answer and compare");
    expect(html).toContain("Record your answers");
    expect(html).toContain("310");
    expect(html).toContain('href="/speak"');
    expect(html).toContain('href="/speak/listen"');
    expect(html).not.toContain("Clips from other speakers to check");
    expect(html).not.toContain("Pass 2: tone marks");
    expect(html).not.toContain("Your answers to fix");
    expect(html).not.toContain(WAITING_COPY.empty);
  });

  it("an annotator with speech off sees the Annotate card and no speech card", () => {
    const html = render({ ...zero, annotate: 5 });
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('href="/annotator/annotate"');
    expect(html).not.toMatch(/speak|lab\/speech/);
  });

  it("with every queue at zero the empty line shows and Annotate shows 0", () => {
    const html = render(zero);
    expect(html).toContain(
      "Nothing is waiting right now. We will add more soon. You can still improve your earlier answers in My Work.",
    );
    expect(html).toContain("Annotate");
    expect(html).toMatch(/text-3xl[^>]*>0</);
  });

  it("while loading it shows the Annotate card with a placeholder and no empty line", () => {
    const html = render(undefined);
    expect(html).toContain("Annotate");
    expect(html).toContain("…");
    expect(html).not.toContain(WAITING_COPY.empty);
  });

  it("the old name of the card is gone: the card is the door to Annotate", () => {
    expect(render({ ...zero, annotate: 3 })).not.toContain("Queue Remaining");
  });
});

describe("DoneBlock", () => {
  it("keeps the two names annotators know and adds clips when speech is on", () => {
    const html = renderToStaticMarkup(
      <DoneBlock completed={510} coldAnswers={458} clips={113} showClips placeholder="…" />,
    );
    expect(html).toContain("What you have done");
    expect(html).toContain("Comparisons Completed");
    expect(html).toContain("510");
    expect(html).toContain("Gold Answers Written");
    expect(html).toContain("458");
    expect(html).toContain("Clips recorded");
    expect(html).toContain("113");
  });

  it("no clips line for an account with speech off and no clips", () => {
    const html = renderToStaticMarkup(
      <DoneBlock completed={1} coldAnswers={2} clips={0} showClips={false} placeholder="…" />,
    );
    expect(html).not.toContain("Clips recorded");
  });
});
