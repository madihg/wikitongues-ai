import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "r-1", role: "RESEARCHER" } }, status: "authenticated" }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/lab/speech/studio" }));

import { ChecklistCard, StudioInterface, SummaryCard } from "./studio-interface";
import { LevelBar } from "./level-meter";
import { DecisionCardsView, type DecisionData } from "./decision-card";
import { ListenView, MinimalPairQuestion, type ListenTask } from "./listen-interface";
import { LabBand, LAB_TABS, activeLabTab } from "./lab-band";
import { decisionCards } from "@/lib/speech/decision";
import { summarizeStudio } from "@/lib/speech/studio";

const noop = () => {};
const srcOf = (name: string) => readFileSync(join(__dirname, name), "utf8");

describe("studio checklist", () => {
  it("lists the four items as unchecked 44px cards", () => {
    const html = renderToStaticMarkup(<ChecklistCard checked={{}} onToggle={noop} />);
    for (const t of ["quiet", "microphone", "Water", "clothing noise"]) expect(html).toContain(t);
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(4);
    expect(html).not.toContain("checked");
    expect((html.match(/min-h-\[44px\]/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});

describe("level meter", () => {
  it("is a labelled meter with a peak readout and no warning when quiet", () => {
    const html = renderToStaticMarkup(<LevelBar peakDbfs={-18} rmsDbfs={-30} clipping={false} />);
    expect(html).toContain('role="meter"');
    expect(html).toContain("peak -18 dBFS");
    expect(html).not.toContain("clipping-warning");
    expect(html).toContain("bg-success");
  });
  it("shows the clipping warning in a live region", () => {
    const html = renderToStaticMarkup(<LevelBar peakDbfs={0} rmsDbfs={-10} clipping />);
    expect(html).toContain('data-testid="clipping-warning"');
    expect(html).toContain("Clipping");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("bg-danger");
  });
  it("handles silence (-Infinity) without NaN", () => {
    const html = renderToStaticMarkup(<LevelBar peakDbfs={-Infinity} rmsDbfs={-Infinity} clipping={false} />);
    expect(html).not.toContain("NaN");
  });
});

describe("session summary", () => {
  it("shows minutes recorded, minutes kept and the running total toward the target", () => {
    const summary = summarizeStudio(
      [
        { studioSessionId: "s1", durationMs: 120_000, reviewStatus: "keep" },
        { studioSessionId: "s1", durationMs: 60_000, reviewStatus: null },
      ],
      "s1",
      5,
    );
    const html = renderToStaticMarkup(<SummaryCard summary={summary} hours={5} />);
    expect(html).toContain("3.0 min (2 clips)");
    expect(html).toContain("2.0 min (1 clips)");
    expect(html).toContain("2.0 min of 5 h");
    expect(html).toContain('role="progressbar"');
  });
});

describe("StudioInterface", () => {
  it("renders with recording off, the format statement and no script yet", () => {
    const html = renderToStaticMarkup(<StudioInterface />);
    expect(html).toContain("48 kHz");
    expect(html).toContain("16 kHz");
    expect(html).toContain("community only");
    expect(html).not.toContain('data-testid="record-button"');
  });
  it("keeps the script in memory: the only thing it stores is the session id", () => {
    const src = srcOf("studio-interface.tsx");
    const stores = [...src.matchAll(/localStorage\.(setItem|getItem)\(([^,)]*)/g)].map((m) => m[2].trim());
    expect(stores.every((s) => s === "SESSION_KEY")).toBe(true);
    expect(src).not.toMatch(/sessionStorage|indexedDB/);
  });
});

const TASK: ListenTask = {
  prompt: { id: "p1", promptId: "code_001", text: "Say hello." },
  language: "igala",
  clipA: { id: "a", url: "/a" },
  clipB: { id: "b", url: "/b" },
  minimalPair: { options: [{ text: "kwàba" }, { text: "kwába" }] },
};
const view = (over: Partial<Parameters<typeof ListenView>[0]> = {}) =>
  renderToStaticMarkup(
    <ListenView
      task={TASK}
      winner="a"
      reasons={["wrong_tone"]}
      note=""
      axes={{}}
      busy={false}
      error={null}
      onWinner={noop}
      onToggleReason={noop}
      onNote={noop}
      onAxis={noop}
      onSubmit={noop}
      {...over}
    />,
  );

describe("Listen: tone minimal pair", () => {
  it("asks 'Which word did you hear?' once per clip, with both spellings and Not sure", () => {
    const html = renderToStaticMarkup(
      <MinimalPairQuestion options={TASK.minimalPair!.options} heard={{}} onHeard={noop} />,
    );
    expect(html).toContain("Which word did you hear?");
    expect(html).toContain("Clip A");
    expect(html).toContain("Clip B");
    expect((html.match(/Not sure/g) ?? []).length).toBe(2);
    expect(html).toContain("kwàba");
    expect(html).toContain("kwába");
    expect(html).not.toMatch(/target|foil/i);
  });
  it("holds Submit back until both clips are answered", () => {
    expect(view()).toMatch(/data-testid="submit-button"[^>]*disabled=""/);
    expect(view({ heard: { a: "kwàba" } })).toMatch(/data-testid="submit-button"[^>]*disabled=""/);
    expect(view({ heard: { a: "kwàba", b: null } })).not.toMatch(/data-testid="submit-button"[^>]*disabled=""/);
  });
  it("a prompt without a pair shows no question and submits as before", () => {
    const html = view({ task: { ...TASK, minimalPair: undefined } });
    expect(html).not.toContain("Which word did you hear?");
    expect(html).not.toMatch(/data-testid="submit-button"[^>]*disabled=""/);
  });
});

function row(n: number, listeners: number, voiceWins: number) {
  return Array.from({ length: n }, (_, i) => ({
    a: "tts/job-1",
    b: "human",
    winner: i < voiceWins ? "a" : "b",
    annotatorId: `l${i % listeners}`,
    isDemo: false,
  }));
}
const data = (cards: DecisionData["cards"], acc: DecisionData["toneAccuracy"] = {}): DecisionData => ({
  thresholds: { minJudgments: 300, minListeners: 5, strongJudgments: 600 },
  cards,
  toneAccuracy: acc,
});

describe("decision card", () => {
  it("below the threshold: says not enough judgments, names 600, shows no table", () => {
    const html = renderToStaticMarkup(<DecisionCardsView data={data(decisionCards(row(120, 3, 90)))} />);
    expect(html).toContain("Not enough judgments");
    expect(html).toContain("120 of 300");
    expect(html).toContain("600 judgments is the stronger target");
    expect(html).not.toContain("<table");
    expect(html).toContain('data-status="not_enough"');
  });
  it("at the threshold: a table with 95% intervals and the tone accuracy beside it", () => {
    const html = renderToStaticMarkup(
      <DecisionCardsView
        data={data(decisionCards(row(300, 6, 240)), {
          "tts/job-1": { answered: 10, correct: 8, unsure: 1, accuracy: 0.8 },
        })}
      />,
    );
    expect(html).toContain("95% interval");
    expect(html).toContain("<table");
    expect(html).toContain("is ahead");
    expect(html).toContain("Tone accuracy 80% (8 of 10 heard right)");
    expect(html).toContain("Tone accuracy: no minimal-pair answers yet");
    expect(html).toContain("600 judgments is the stronger target");
  });
  it("with no judgments yet, explains what a pair needs", () => {
    const html = renderToStaticMarkup(<DecisionCardsView data={data([])} />);
    expect(html).toContain("300 judgments from 5");
  });
});

describe("lab band", () => {
  it("has a Studio tab that is active on its own path", () => {
    expect(LAB_TABS.map((t) => t.label)).toContain("Studio");
    expect(activeLabTab("/lab/speech/studio")).toBe("/lab/speech/studio");
    expect(renderToStaticMarkup(<LabBand />)).toContain(">Studio<");
  });
});
