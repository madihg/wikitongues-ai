import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { parseWorkAnswer, RanOutLine, WorkTabs } from "./work-flow";
import { RECORD_STAGES, RecordSteps } from "@/components/lab/record-interface";
import { DEFAULT_WORK_ORDER } from "@/lib/work-flow";

const noop = () => undefined;
const src = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");

describe("the tabs inside Annotate", () => {
  const html = renderToStaticMarkup(
    <WorkTabs
      tabs={["record", "check", "tone", "write"]}
      counts={{ record: 12, check: 0, tone: 45, write: 30 }}
      active="record"
      onPick={noop}
    />,
  );

  it("one button per kind the person has, in order, the open one pressed", () => {
    const names = [...html.matchAll(/data-work="([a-z]+)"/g)].map((m) => m[1]);
    expect(names).toEqual(["record", "check", "tone", "write"]);
    expect(html).toMatch(/aria-pressed="true"[^>]*data-work="record"/);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Kinds of work"');
  });

  it("a number beside each kind with work waiting, none at zero", () => {
    expect(html.match(/data-testid="work-count"/g)).toHaveLength(3);
    expect(html).toContain(">12<");
    expect(html).toContain(">45<");
    expect(html).toContain("Record");
    expect(html).toContain("Tone marks");
    expect(html).toContain("Write &amp; compare");
  });

  it("every tab is a 44px target and scrolls sideways on a phone instead of wrapping", () => {
    expect(html.match(/min-h-\[44px\]/g)?.length).toBe(4);
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("whitespace-nowrap");
  });
});

describe("when a kind runs out", () => {
  it("offers the next kind in one tap, with its number", () => {
    const html = renderToStaticMarkup(
      <RanOutLine kind="record" next="check" count={4} onGo={noop} />,
    );
    expect(html).toContain("Nothing left in Record right now. Next: Check.");
    expect(html).toContain("Go on to Check (4)");
  });

  it("says so plainly when nothing else waits", () => {
    const html = renderToStaticMarkup(
      <RanOutLine kind="write" next={null} count={undefined} onGo={noop} />,
    );
    expect(html).toContain("nothing else is waiting");
    expect(html).not.toContain("<button");
  });
});

describe("reading the server's answer", () => {
  it("keeps known kinds and real numbers only", () => {
    expect(
      parseWorkAnswer({
        order: ["tone", "speech", "write"],
        counts: { write: 3, tone: 2, record: -1, speech: 9, check: "4" },
      }),
    ).toEqual({ order: ["tone", "write"], counts: { write: 3, tone: 2 } });
  });

  it("an empty order falls back to the default; junk is not known", () => {
    expect(parseWorkAnswer({ order: [], counts: {} })?.order).toEqual(DEFAULT_WORK_ORDER);
    expect(parseWorkAnswer(null)).toBeNull();
    expect(parseWorkAnswer({ order: "x", counts: {} })).toBeNull();
  });
});

describe("the flow is one page holding the same screens", () => {
  const flow = src("work/work-flow.tsx");

  it("uses each kind's own screen, and each tells the flow when it runs out", () => {
    for (const piece of [
      "<RecordInterface onEmpty={emptyRecord} />",
      "<CheckInterface onEmpty={emptyCheck} />",
      "<ToneInterface onEmpty={emptyTone} />",
      "<AnnotationInterface onEmpty={emptyWrite} />",
      "<ListenInterface onEmpty={emptyListen} />",
    ]) {
      expect(flow, piece).toContain(piece);
    }
    for (const [file, flag] of [
      ["lab/record-interface.tsx", 'useOnEmpty(queue.status === "complete", onEmpty);'],
      ["lab/check-interface.tsx", 'useOnEmpty(load.status === "done", onEmpty);'],
      ["tone/tone-interface.tsx", 'useOnEmpty(load.status === "done", onEmpty);'],
      ["annotation-interface.tsx", "useOnEmpty(isComplete, onEmpty);"],
      ["lab/listen-interface.tsx", 'useOnEmpty(queue.status === "complete", onEmpty);'],
    ] as const) {
      expect(src(file), file).toContain(flag);
    }
  });

  it("names the open kind of work for honest time, so recording in Annotate counts as recording", () => {
    expect(flow).toContain("return openSurface(WORK_SURFACE[kind]);");
    expect(flow).toContain('if (!kind || kind === "write") return;');
  });

  it("the Annotate page is the flow, and the old Pass 2 page sends people to its tab", () => {
    const page = readFileSync(
      join(__dirname, "..", "..", "app", "(app)", "annotator", "annotate", "page.tsx"),
      "utf8",
    );
    expect(page).toContain("<WorkFlow />");
    const tone = readFileSync(
      join(__dirname, "..", "..", "app", "(app)", "annotator", "tone", "page.tsx"),
      "utf8",
    );
    expect(tone).toContain('redirect(workHref("tone"));');
  });
});

describe("Record, one step at a time", () => {
  it("three steps: your answer, say it in Igala, say it in English", () => {
    expect(RECORD_STAGES.map((s) => s.label)).toEqual([
      "Your answer",
      "Say it in Igala",
      "Say it in English",
    ]);
  });

  it("the step bar ticks the done steps and marks the current one", () => {
    const html = renderToStaticMarkup(<RecordSteps active={1} />);
    expect(html.match(/<li/g)).toHaveLength(3);
    expect(html).toMatch(/aria-current="step"[^>]*>.*Say it in Igala/);
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain("✓");
    expect(html).toContain(">3<");
  });

  it("the steps share the episode frame, keep a take when stepping back, and open on English for a prompt that came back for it", () => {
    const rec = src("lab/record-interface.tsx");
    expect(rec).toContain("<EpisodeHeader left={waitingCount} />");
    expect(rec).toContain("<EpisodeFooter");
    expect(rec).toContain('hidden={current !== "igala"}');
    expect(rec).toContain('hidden={current !== "english"}');
    expect(rec).toContain('const firstStep: RecordStep = task?.igalaDone ? "english" : "answer";');
    // Back is off while a clip is uploading.
    expect(rec).toMatch(/onClick=\{\(\) => setStep\(backTo\)\}\s*disabled=\{anyBusy\}/);
    // The answer step moves on only once there is an answer to read.
    expect(rec).toContain("disabled: !answerReady,");
  });
});
