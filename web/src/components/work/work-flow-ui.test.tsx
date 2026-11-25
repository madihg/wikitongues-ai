import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { parseWorkAnswer, RanOutLine, withEmptied, WorkTabs } from "./work-flow";
import { RECORD_STAGES, RecordSteps } from "@/components/lab/record-interface";
import { DEFAULT_WORK_ORDER, DEFAULT_WORK_RUN } from "@/lib/work-flow";

const noop = () => undefined;
const src = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");

describe("the filter above the work", () => {
  const tabs = ["record", "check", "write", "tone"] as const;
  const counts = { record: 12, check: 0, tone: 45, write: 30 };
  const one = renderToStaticMarkup(
    <WorkTabs
      tabs={[...tabs]}
      counts={counts}
      active="record"
      mixed={false}
      onAll={noop}
      onPick={noop}
    />,
  );
  const all = renderToStaticMarkup(
    <WorkTabs
      tabs={[...tabs]}
      counts={counts}
      active="check"
      mixed
      onAll={noop}
      onPick={noop}
    />,
  );

  it("All first, then one button per kind the person has, in order", () => {
    const names = [...one.matchAll(/data-work="([a-z]+)"/g)].map((m) => m[1]);
    expect(names).toEqual(["all", "record", "check", "write", "tone"]);
    expect(one).toContain('aria-label="Kinds of work"');
  });

  it("one kind picked: that kind is pressed, All is not", () => {
    expect(one).toMatch(/aria-pressed="true"[^>]*data-work="record"/);
    expect(one).toMatch(/aria-pressed="false"[^>]*data-work="all"/);
    expect(one.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it("the stream: All is pressed, and the kind on screen carries a dot, not a press", () => {
    expect(all).toMatch(/aria-pressed="true"[^>]*data-work="all"/);
    expect(all.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(all).toMatch(/data-work="check" data-current="true"/);
    expect(all).toContain("(on screen now)");
  });

  it("a number beside each kind with work waiting, none at zero", () => {
    expect(one.match(/data-testid="work-count"/g)).toHaveLength(3);
    expect(one).toContain(">12<");
    expect(one).toContain(">45<");
    expect(one).toContain("Tone marks");
    expect(one).toContain("Write &amp; compare");
  });

  it("every button is a 44px target and the row scrolls sideways on a phone", () => {
    expect(one.match(/min-h-\[44px\]/g)?.length).toBe(5);
    expect(one).toContain("overflow-x-auto");
    expect(one).toContain("whitespace-nowrap");
  });

  it("while the microphone is on, every kind but the one on screen waits", () => {
    const html = renderToStaticMarkup(
      <WorkTabs
        tabs={[...tabs]}
        counts={counts}
        active="record"
        mixed
        locked
        onAll={noop}
        onPick={noop}
      />,
    );
    expect(html.match(/disabled=""/g)).toHaveLength(3);
    expect(html).not.toMatch(/disabled=""[^>]*data-work="record"/);
  });
});

describe("a kind whose screen found nothing", () => {
  it("counts as zero until the server's number grows past what it was", () => {
    const counts = { record: 4, check: 3, write: 9 };
    expect(withEmptied(counts, { check: 3 })).toEqual({ record: 4, check: 0, write: 9 });
    // New clips to check came in since.
    expect(withEmptied({ ...counts, check: 5 }, { check: 3 }).check).toBe(5);
    expect(withEmptied(counts, {})).toEqual(counts);
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
  it("keeps known kinds and real numbers only; runs fall back to the defaults", () => {
    expect(
      parseWorkAnswer({
        order: ["tone", "speech", "write"],
        counts: { write: 3, tone: 2, record: -1, speech: 9, check: "4" },
        runs: { record: 4, check: 0, tone: 2.5, speech: 3 },
      }),
    ).toEqual({
      order: ["tone", "write"],
      runs: { ...DEFAULT_WORK_RUN, record: 4 },
      counts: { write: 3, tone: 2 },
    });
  });

  it("an empty order falls back to the default; junk is not known", () => {
    expect(parseWorkAnswer({ order: [], counts: {} })?.order).toEqual(DEFAULT_WORK_ORDER);
    expect(parseWorkAnswer(null)).toBeNull();
    expect(parseWorkAnswer({ order: "x", counts: {} })).toBeNull();
  });
});

describe("the flow is one page holding the same screens", () => {
  const flow = src("work/work-flow.tsx");

  it("uses each kind's own screen, and each says when it runs out and when a task is done", () => {
    for (const piece of [
      "<CheckInterface onEmpty={onEmpty} onDone={onDone} />",
      "<ToneInterface onEmpty={onEmpty} onDone={onDone} active={on} />",
      "<AnnotationInterface onEmpty={onEmpty} onDone={onDone} active={on} />",
      "<ListenInterface onEmpty={onEmpty} onDone={onDone} />",
    ]) {
      expect(flow, piece).toContain(piece);
    }
    expect(flow).toMatch(/<RecordInterface\s+onEmpty=\{onEmpty\}\s+onDone=\{onDone\}/);
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

  it("a task counts as done only once it is saved", () => {
    // Record: both clips saved, then Next prompt. Skip is not done.
    expect(src("lab/record-interface.tsx")).toMatch(
      /disabled: !promptDone \|\| anyBusy,\s+onClick: \(\) => \{[^}]*onDone\?\.\(\);\s+nextPrompt\(\);/,
    );
    // Check: "Next clip" shows only after the verdict is saved.
    expect(src("lab/check-interface.tsx")).toMatch(/onNext=\{\(\) => \{[^}]*onDone\?\.\(\);\s+void fetchNext\(\);/);
    // Tone marks: a new item saved, not a saved one reopened.
    expect(src("tone/tone-interface.tsx")).toContain("if (!reopened) onDone?.();");
    // Text: after the submit succeeded, before the next prompt loads.
    expect(src("annotation-interface.tsx")).toMatch(/releasePin\(\);\s+onDone\?\.\(\);\s+await fetchNext\(\);/);
    // Listen: after the judgment is saved (a 409 elsewhere is not counted).
    expect(src("lab/listen-interface.tsx")).toMatch(/setBusy\(false\);\s+onDone\?\.\(\);\s+await loadNext\(\);/);
  });

  it("a screen once shown stays mounted and hidden, so moving away loses nothing (review of #121)", () => {
    expect(flow).not.toContain("<div key={kind}>");
    expect(flow).toContain("hidden={k !== kind}");
    expect(flow).toContain("{shown.map((k) => (");
  });

  it("a hidden screen is quiet: media paused, the text screen's keys off, Tone's timer stopped", () => {
    expect(flow).toContain('querySelectorAll("audio, video")');
    expect(flow).toContain(".pause();");
    expect(src("annotation-interface.tsx")).toContain(
      'if (!active || step !== "pairwise" || !task) return;',
    );
    const tone = src("tone/tone-interface.tsx");
    expect(tone).toContain('const inView = active && document.visibilityState === "visible";');
    expect(tone).toContain('document.visibilityState === "visible" && activeRef.current');
  });

  it("while Record has the microphone on or a clip uploading, the other kinds wait", () => {
    expect(flow).toContain('if (recordLive && kind === "record" && k !== "record") {');
    expect(flow).toContain("Finish this recording first");
    const rec = src("lab/record-interface.tsx");
    expect(rec).toContain("const live = anyBusy || recording.igala || recording.english;");
    expect(src("lab/record-clip.tsx")).toContain('const recordingNow = recorder.state === "recording";');
  });

  it("the stream moves on only between tasks, and says so to a screen reader", () => {
    expect(flow).toContain("const next = streamNext(plan, left, k, n);");
    expect(flow).toContain('aria-live="polite"');
    expect(flow).toContain("setAnnounce(`Now: ${WORK_LABEL[next]}.`);");
  });

  it("an address with its own text episode opens Write; ?work= opens one kind", () => {
    expect(flow).toContain("const asked = workAskedBy(window.location.search);");
  });

  it("names the kind on screen for honest time, so recording in Annotate counts as recording", () => {
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

  it("editing the answer after a take says it drops the take, and does (review of #121)", () => {
    const rec = src("lab/record-interface.tsx");
    expect(rec).toContain("onTakeChange={setIgalaHasTake}");
    expect(rec).toContain("Editing the answer throws the take away, because it read the old words.");
    expect(rec).toMatch(/setEditingAnswer\(false\);\s+setRound\(\(r\) => r \+ 1\);\s+void loadNext\(\);/);
  });
});
