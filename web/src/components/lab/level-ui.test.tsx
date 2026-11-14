import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "r-1", role: "RESEARCHER" } },
    status: "authenticated",
  }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/speak" }));

import { RecordLevelBar, RecordLevelMeter } from "./level-meter";
import { GoodClipGuide } from "./good-clip-guide";
import { RoomCheck, RoomCheckView, type RoomCheckState } from "./room-check";
import { TakeFeedback } from "./take-feedback";
import { RecordClip, type RecordClipProps } from "./record-clip";
import { BAR_EDGES, type RoomReading } from "@/lib/speech/record-levels";
import type { QualityMetrics } from "@/lib/speech/analyse";

/**
 * Story C3, the screen half: the level bar, the room check's three answers,
 * the guide, the small bar on the feedback card, and the fallback with no
 * Web Audio. Fixtures are synthetic.
 */

const dir = __dirname;
const sourceOf = (f: string) => readFileSync(join(dir, f), "utf8");
const noop = () => {};
function tagsOf(html: string, name: string): string[] {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "g"))].map(
    (m) => m[0],
  );
}
const classOf = (tag: string) => /class="([^"]*)"/.exec(tag)?.[1] ?? "";
const styleOf = (html: string, testid: string) =>
  new RegExp(`data-testid="${testid}"[^>]*style="([^"]*)"`).exec(html)?.[1] ?? "";
const TARGET = /min-h-\[44px\]|\bh-14\b/;

const METRICS: QualityMetrics = {
  durationMs: 6100,
  leadingSilenceMs: 300,
  trailingSilenceMs: 600,
  speechShare: 0.8,
  rmsDbfs: -22,
  peakDbfs: -5,
  clippingShare: 0,
  syllables: 9,
  syllablesPerSecond: 2.2,
};

describe("the level bar", () => {
  it("has three zones with a word under each: quiet, good, too loud", () => {
    const html = renderToStaticMarkup(
      <RecordLevelBar peakDbfs={-Infinity} heldPeakDbfs={-Infinity} />,
    );
    expect(html).toContain(">quiet<");
    expect(html).toContain(">good<");
    expect(html).toContain(">too loud<");
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-label="Microphone level"');
    expect(html).toContain('data-zone="idle"');
  });

  it("the good zone is green and the widest", () => {
    const html = renderToStaticMarkup(
      <RecordLevelBar peakDbfs={-Infinity} heldPeakDbfs={-Infinity} />,
    );
    const green = /bg-success-subtle" style="left:([\d.]+)%;width:([\d.]+)%"/.exec(html)!;
    expect(Number(green[1])).toBeCloseTo(BAR_EDGES.greenFrom * 100, 0);
    expect(Number(green[2])).toBeGreaterThan(40);
    const red = /bg-danger-subtle" style="left:([\d.]+)%/.exec(html)!;
    expect(Number(red[1])).toBeCloseTo(BAR_EDGES.redFrom * 100, 0);
  });

  it("fills to the level now and marks the loudest point reached", () => {
    const html = renderToStaticMarkup(
      <RecordLevelBar peakDbfs={-12} heldPeakDbfs={-6} />,
    );
    expect(styleOf(html, "level-fill")).toBe("width:25.1%");
    expect(styleOf(html, "level-peak-mark")).toBe("left:50.1%");
    expect(html).toContain('data-zone="good"');
    expect(html).toContain('aria-valuetext="good"');
  });

  it("the mark holds after the take ends: the fill drops, the mark stays", () => {
    const html = renderToStaticMarkup(
      <RecordLevelBar peakDbfs={-Infinity} heldPeakDbfs={-6} />,
    );
    expect(styleOf(html, "level-fill")).toBe("width:0%");
    expect(styleOf(html, "level-peak-mark")).toBe("left:50.1%");
  });

  it("names the zone the loudest point is in", () => {
    const zone = (held: number) =>
      /data-zone="([^"]*)"/.exec(
        renderToStaticMarkup(<RecordLevelBar peakDbfs={held} heldPeakDbfs={held} />),
      )?.[1];
    expect(zone(-30)).toBe("quiet");
    expect(zone(-8)).toBe("good");
    expect(zone(-0.5)).toBe("too loud");
  });

  it("no mark before any sound", () => {
    const html = renderToStaticMarkup(
      <RecordLevelBar peakDbfs={-Infinity} heldPeakDbfs={-Infinity} />,
    );
    expect(html).not.toContain('data-testid="level-peak-mark"');
  });

  it("the live meter reads every frame from a short window, and keeps the mark between takes", () => {
    const src = sourceOf("level-meter.tsx");
    const live = src.slice(src.indexOf("export function RecordLevelMeter"));
    expect(live).toContain("analyser.fftSize = 1024;"); // about 21 ms at 48 kHz
    expect(live).toContain("requestAnimationFrame(tick)");
    expect(live).toContain("if (peakDbfs > held) held = peakDbfs;");
    // On cleanup (the take ended) the level drops and the held peak stays.
    expect(live).toContain(
      "setLevel({ peakDbfs: -Infinity, heldPeakDbfs: held });",
    );
  });

  it("with no stream, and with no Web Audio, it renders an empty bar and nothing breaks", () => {
    // Server rendering has no AudioContext at all: the same path a browser
    // without Web Audio takes.
    const html = renderToStaticMarkup(<RecordLevelMeter stream={null} />);
    expect(html).toContain('data-testid="record-level-bar"');
    expect(html).toContain('data-zone="idle"');
    const src = sourceOf("level-meter.tsx");
    const live = src.slice(src.indexOf("export function RecordLevelMeter"));
    expect(live).toContain("if (!Ctx) return;");
    expect(live).toMatch(/catch \{\s*return; \/\/ no meter; the take itself is unaffected/);
  });
});

describe("the level bar on a clip", () => {
  const PROPS: RecordClipProps = {
    language: "igala",
    promptCode: "code_001",
    textToRead: "a stand-in answer",
    textLabel: "Read your answer out loud.",
    textIsIgala: true,
    syllableText: "a stand-in answer",
    answer: null,
    consentOk: true,
    offReason: null,
    licensedAllowed: true,
    cloningAllowed: false,
    onSaved: noop,
  };

  it("sits under the Record button on every ordinary clip", () => {
    const html = renderToStaticMarkup(<RecordClip {...PROPS} />);
    expect(html.indexOf('data-testid="record-level-bar"')).toBeGreaterThan(
      html.indexOf('data-testid="record-button"'),
    );
  });

  it("a studio take keeps its own meter and does not get a second one", () => {
    const html = renderToStaticMarkup(
      <RecordClip {...PROPS} studio={{ sessionId: "sess_12345678", text: "a line" }} />,
    );
    expect(html).not.toContain('data-testid="record-level-bar"');
  });

  it("Record, Stop, the 30 second limit, the card, Keep, Re-record and Discard are all still there", () => {
    const src = sourceOf("record-clip.tsx");
    for (const piece of [
      "<RecordButton",
      "<Countdown elapsedMs={recorder.elapsedMs}",
      "<TakeFeedback metrics={metrics} status={analysis} />",
      'data-testid="keep-button"',
      "Re-record",
      "Discard",
    ]) {
      expect(src, piece).toContain(piece);
    }
    expect(src).not.toMatch(/keep-button"[^>]*disabled/);
  });
});

describe("the feedback card", () => {
  it("keeps the numbers line and gains a small bar picture beside it", () => {
    const html = renderToStaticMarkup(
      <TakeFeedback metrics={METRICS} status="done" />,
    );
    expect(html).toContain("6.1 s, level -22 dBFS, peak -5 dBFS");
    expect(html).toContain('data-testid="take-level-bar"');
    expect(html.indexOf('data-testid="take-level-bar"')).toBeGreaterThan(
      html.indexOf("peak -5 dBFS"),
    );
    // The picture marks the take's loudest point on the same zones.
    expect(styleOf(html, "level-peak-mark")).toBe("left:56.2%");
    expect(html).toContain("bg-success-subtle");
  });

  it("shows the two new lines in plain words", () => {
    const quiet = renderToStaticMarkup(
      <TakeFeedback metrics={{ ...METRICS, rmsDbfs: -32 }} status="done" />,
    );
    expect(quiet).toContain(
      "A little quiet: move a little closer to the microphone.",
    );
    expect(quiet).toContain('data-verdict="a_little_quiet"');
    const noisy = renderToStaticMarkup(
      <TakeFeedback metrics={{ ...METRICS, snrDb: 12 }} status="done" />,
    );
    expect(noisy).toContain(
      "Noisy room: we can hear noise behind your voice. Try a quieter place.",
    );
    const fine = renderToStaticMarkup(
      <TakeFeedback metrics={{ ...METRICS, snrDb: 25 }} status="done" />,
    );
    expect(fine).not.toContain("Noisy room");
    expect(fine).toContain("Good take");
  });

  it("with no analysis it still shows the existing line, and no bar", () => {
    const html = renderToStaticMarkup(
      <TakeFeedback metrics={null} status="done" />,
    );
    expect(html).toContain("This browser could not check the take.");
    expect(html).not.toContain('data-testid="take-level-bar"');
  });
});

describe("the room check", () => {
  const reading = (verdict: RoomReading["verdict"]): RoomReading => ({
    noiseDbfs: -50,
    verdict,
    at: "2026-11-13T09:00:00.000Z",
  });
  const view = (state: RoomCheckState) =>
    renderToStaticMarkup(
      <RoomCheckView state={state} onCheck={noop} onRecordAnyway={noop} />,
    );

  it("asks for three seconds of quiet", () => {
    const html = view({ status: "idle" });
    expect(html).toContain("Stay quiet for 3 seconds.");
    expect(html).toContain(">Check my room<");
    expect(html).toContain('aria-live="polite"');
  });

  it("quiet: one line, no buttons", () => {
    const html = view({ status: "done", reading: reading("quiet") });
    expect(html).toContain("Your room is quiet. Good.");
    expect(tagsOf(html, "button")).toHaveLength(0);
  });

  it("some noise: one line that says it is fine to go on, no buttons", () => {
    const html = view({ status: "done", reading: reading("some_noise") });
    expect(html).toContain(
      "There is some noise. It is fine to go on. A quieter place is better.",
    );
    expect(tagsOf(html, "button")).toHaveLength(0);
  });

  it("noisy: the line, then Check again and Record anyway", () => {
    const html = view({ status: "done", reading: reading("noisy") });
    expect(html).toContain(
      "Your room is noisy. Close the window or turn off the fan, then try again.",
    );
    expect(html).toContain(">Check again<");
    expect(html).toContain(">Record anyway<");
    for (const b of tagsOf(html, "button")) expect(classOf(b)).toMatch(TARGET);
  });

  it("after Record anyway the line stays and the buttons go", () => {
    const html = view({ status: "dismissed", reading: reading("noisy") });
    expect(html).toContain("Your room is noisy.");
    expect(tagsOf(html, "button")).toHaveLength(0);
  });

  it("when the browser cannot listen it says so and recording goes on", () => {
    const html = view({ status: "unavailable" });
    expect(html).toContain(
      "This browser could not check the room. You can still record.",
    );
  });

  it("starts idle, once per sitting, and asks again when the microphone changes", () => {
    expect(renderToStaticMarkup(<RoomCheck />)).toContain("Check my room");
    const src = sourceOf("room-check.tsx");
    expect(src).toContain("const reading = readRoomReading();");
    expect(src).toContain('"devicechange", onDevice');
    expect(src).toContain("writeRoomReading(null);");
    expect(src).toContain("writeRoomReading(reading);");
    // It listens with the recorder's own microphone settings.
    expect(src).toContain("audio: captureConstraints(captureMode()),");
  });

  it("never blocks: it is not wired to any record button or off reason", () => {
    const page = sourceOf("record-interface.tsx");
    expect(page).toContain("<RoomCheck />");
    const off = page.slice(page.indexOf("const offReason"), page.indexOf("const answerRef"));
    expect(off.toLowerCase()).not.toContain("room");
    expect(sourceOf("record-clip.tsx")).not.toContain("RoomCheck");
  });
});

describe("the guide", () => {
  const html = renderToStaticMarkup(<GoodClipGuide />);

  it("is a closed fold under the link How to get a good clip", () => {
    expect(html).toContain("<details");
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toContain("How to get a good clip");
    expect(classOf(tagsOf(html, "summary")[0])).toMatch(TARGET);
  });

  it("lists the five steps and the closing line", () => {
    expect(html.match(/<li>/g)).toHaveLength(5);
    expect(html).toContain("Keep it in the green.");
    expect(html).toContain("A quiet clip is fine. A noisy clip is hard to use.");
  });

  it("is on the Record page and in the Say it block", () => {
    expect(sourceOf("record-interface.tsx")).toContain("<GoodClipGuide />");
    expect(sourceOf("say-it-block.tsx")).toContain("<GoodClipGuide />");
  });
});

describe("design rules on the new pieces", () => {
  it("tokens only, no modal layer, no em dash, 44px targets", () => {
    for (const f of [
      "level-meter.tsx",
      "room-check.tsx",
      "good-clip-guide.tsx",
      "english-translation.tsx",
      "tier-default.tsx",
    ]) {
      const src = sourceOf(f);
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, f).not.toMatch(/\brgb\(/);
      expect(src, f).not.toContain('role="dialog"');
      expect(src, f).not.toContain("inset-0");
      expect(src.includes(String.fromCharCode(0x2014)), f).toBe(false);
    }
  });
});
