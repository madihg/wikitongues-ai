import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EpisodeFooter,
  EpisodeHeader,
  FRAME_MAIN,
  FRAME_QUIET,
  SavedStrip,
} from "./episode-frame";

/**
 * The shared frame: three footer places that never move, the "Saved" strip
 * and the header line. Position is held through the markup: the three
 * places always exist, in one order, with one set of layout classes, so a
 * screen cannot put its Back where another puts its Skip.
 */

const places = (m: string) =>
  [...m.matchAll(/data-footer-place="(\w+)"/g)].map((x) => x[1]);
const placeClass = (m: string, name: string) =>
  m.match(new RegExp(`data-footer-place="${name}" class="([^"]*)"`))?.[1] ?? "";

describe("the footer bar", () => {
  const full = renderToStaticMarkup(
    <EpisodeFooter
      left={<button className={FRAME_QUIET}>Back</button>}
      middle={<button className={FRAME_QUIET}>Skip this prompt</button>}
      right={<button className={FRAME_MAIN}>Submit &amp; next</button>}
    />,
  );
  const mainOnly = renderToStaticMarkup(
    <EpisodeFooter
      right={<button className={FRAME_MAIN}>Send verdict</button>}
    />,
  );

  it("always has the three places, left, middle, right, even when two are empty", () => {
    expect(places(full)).toEqual(["left", "middle", "right"]);
    expect(places(mainOnly)).toEqual(["left", "middle", "right"]);
  });

  it("the places carry the same layout on every screen", () => {
    for (const name of ["left", "middle", "right"]) {
      expect(placeClass(mainOnly, name)).toBe(placeClass(full, name));
    }
  });

  it("from 640 px: one row, left at the start, middle centred, right at the end", () => {
    expect(full).toContain("sm:grid-cols-[1fr_auto_1fr]");
    expect(placeClass(full, "left")).toContain("sm:order-1");
    expect(placeClass(full, "left")).toContain("justify-self-start");
    expect(placeClass(full, "middle")).toContain("sm:order-2");
    expect(placeClass(full, "middle")).toContain("sm:justify-self-center");
    expect(placeClass(full, "right")).toContain("sm:order-3");
    expect(placeClass(full, "right")).toContain("sm:justify-self-end");
  });

  it("at 360 px: the main button takes the first row, Back and Skip sit under it", () => {
    expect(full).toContain("grid-cols-2");
    expect(placeClass(full, "right")).toContain("order-1");
    expect(placeClass(full, "right")).toContain("col-span-2");
    expect(placeClass(full, "left")).toContain("order-2");
    expect(placeClass(full, "middle")).toContain("order-3");
    expect(FRAME_MAIN).toContain("w-full");
    expect(FRAME_MAIN).toContain("sm:w-auto");
  });

  it("every place and both button styles are at least 44 px high", () => {
    for (const name of ["left", "middle", "right"]) {
      expect(placeClass(full, name)).toContain("min-h-[44px]");
    }
    expect(FRAME_QUIET).toContain("min-h-[44px]");
    expect(FRAME_MAIN).toContain("min-h-[44px]");
  });
});

describe("the Saved strip", () => {
  it("shows the first 40 characters of the prompt and the word Edit", () => {
    const m = renderToStaticMarkup(
      <SavedStrip
        promptText="How do you greet an elder in the morning when you meet them?"
        onEdit={() => {}}
      />,
    );
    expect(m).toContain(
      "Saved: &quot;How do you greet an elder in the morning...&quot;",
    );
    expect(m).toMatch(/<button[^>]*min-h-\[44px\][^>]*>Edit<\/button>/);
  });

  it("a short prompt is shown whole", () => {
    const m = renderToStaticMarkup(
      <SavedStrip promptText="Greet an elder." onEdit={() => {}} />,
    );
    expect(m).toContain("Saved: &quot;Greet an elder.&quot;");
  });
});

describe("the header line", () => {
  it("the name on the left, N left on the right", () => {
    const m = renderToStaticMarkup(<EpisodeHeader name="Listen" left={12} />);
    expect(m).toContain("Listen");
    expect(m).toContain("12 left");
    expect(m.indexOf("Listen")).toBeLessThan(m.indexOf("12 left"));
  });

  it("hides the count when it is not known", () => {
    const m = renderToStaticMarkup(<EpisodeHeader name="Check" left={null} />);
    expect(m).not.toContain("left<");
  });
});
