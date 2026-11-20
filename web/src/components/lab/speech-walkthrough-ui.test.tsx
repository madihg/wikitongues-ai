import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WalkthroughView } from "./speech-walkthrough";
import {
  WALKTHROUGH_STEPS,
  canMoveOn,
  cluesFoundBefore,
} from "@/lib/speech/walkthrough";

const noop = () => {};
const view = (index: number, tapped: number | null = null) =>
  renderToStaticMarkup(
    <WalkthroughView
      index={index}
      tapped={tapped}
      onTap={noop}
      onNext={noop}
      onBack={noop}
      onClose={noop}
    />,
  );
const at = (key: string) => WALKTHROUGH_STEPS.findIndex((s) => s.key === key);

describe("Speech walkthrough", () => {
  it("covers the three jobs, Igala then English, and ends on Check", () => {
    const text = WALKTHROUGH_STEPS.flatMap((s) => [s.title, ...s.lines]).join(" ");
    expect(text).toMatch(/in Igala/);
    expect(text).toMatch(/English/);
    expect(WALKTHROUGH_STEPS.filter((s) => s.findsClue).map((s) => s.clue)).toEqual([
      "record",
      "check",
      "listen",
    ]);
    expect(WALKTHROUGH_STEPS.at(-1)?.next).toBe("Start checking");
  });

  it("every question has exactly one right answer and a reply for each tap", () => {
    for (const s of WALKTHROUGH_STEPS) {
      if (!s.question) continue;
      expect(s.question.choices.filter((c) => c.correct)).toHaveLength(1);
      for (const c of s.question.choices) expect(c.reply.length).toBeGreaterThan(0);
    }
  });

  it("waits for the right tap before moving on", () => {
    const s = WALKTHROUGH_STEPS[at("check")];
    const right = s.question!.choices.findIndex((c) => c.correct);
    const wrong = s.question!.choices.findIndex((c) => !c.correct);
    expect(canMoveOn(s, null)).toBe(false);
    expect(canMoveOn(s, wrong)).toBe(false);
    expect(canMoveOn(s, right)).toBe(true);
    expect(canMoveOn(WALKTHROUGH_STEPS[0], null)).toBe(true);
    expect(view(at("check"), null)).toMatch(/disabled=""/);
    expect(view(at("check"), wrong)).toContain(s.question!.choices[wrong].reply);
  });

  it("fills the clue strip as clues are found", () => {
    expect(cluesFoundBefore(0)).toEqual([]);
    expect(cluesFoundBefore(at("check"))).toEqual(["record"]);
    expect(cluesFoundBefore(WALKTHROUGH_STEPS.length)).toEqual([
      "record",
      "check",
      "listen",
    ]);
    const last = view(WALKTHROUGH_STEPS.length - 1);
    expect(last).toContain('data-testid="clue-listen" data-found="1"');
    expect(last).toContain('href="/speak/check"');
  });

  it("never uses an em dash", () => {
    const all = JSON.stringify(WALKTHROUGH_STEPS);
    expect(all).not.toContain("\u2014");
  });
});
