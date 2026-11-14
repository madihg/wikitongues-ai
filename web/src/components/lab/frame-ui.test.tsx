import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ListenEmpty,
  ListenIntro,
  ListenView,
  LISTEN_INTRO_KEY,
  type ListenTask,
} from "./listen-interface";
import { CheckEmpty, CheckView, type CheckViewProps } from "./check-interface";

/**
 * Listen and Check in the shared episode frame (annotator experience spec,
 * section 8). What was already there is held by lab-ui.test.tsx,
 * studio-ui.test.tsx and check-profile-ui.test.tsx, unchanged. This file
 * holds what is new: the footer bar's three places, the first-visit card,
 * the empty states, and that the "Saved" strip can only reach the reason.
 * Invented placeholder texts.
 */

const noop = () => {};
const task: ListenTask = {
  prompt: { id: "p1", promptId: "ig_test_001", text: "A test question?" },
  language: "igala",
  clipA: { id: "ra", url: "/api/lab/speech/recording/ra/audio" },
  clipB: { id: "rb", url: "/api/lab/speech/recording/rb/audio" },
};
const listen = (over: Partial<Parameters<typeof ListenView>[0]> = {}) =>
  renderToStaticMarkup(
    <ListenView
      task={task}
      winner={null}
      reasons={[]}
      note=""
      axes={{ a: {}, b: {} }}
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

const checkTask = {
  recording: { id: "r1", url: "/api/lab/speech/recording/r1/audio" },
  prompt: { promptId: "ig_test_001", text: "A test question?" },
  answer: { text: "alpha beta", words: ["alpha", "beta"] },
};
const check = (over: Partial<CheckViewProps> = {}) =>
  renderToStaticMarkup(
    <CheckView
      task={checkTask}
      sent={null}
      picked={null}
      wrongWord={null}
      level={null}
      note=""
      busy={false}
      error={null}
      transcript={undefined}
      onPick={noop}
      onWrongWord={noop}
      onLevel={noop}
      onNote={noop}
      onSend={noop}
      onChange={noop}
      onNext={noop}
      {...over}
    />,
  );

/** The inner markup of one footer place. */
function place(markup: string, name: "left" | "middle" | "right"): string {
  const order = ["left", "middle", "right"];
  const start = markup.indexOf(`data-footer-place="${name}"`);
  expect(start, `no ${name} place`).toBeGreaterThan(-1);
  const next = order[order.indexOf(name) + 1];
  const end = next
    ? markup.indexOf(`data-footer-place="${next}"`, start)
    : markup.length;
  return markup.slice(start, end);
}

describe("Listen in the frame", () => {
  it("the footer bar has its three places; Submit is on the right, with its word unchanged", () => {
    const m = listen();
    expect(m.match(/data-episode-footer/g)).toHaveLength(1);
    expect(place(m, "right")).toContain('data-testid="submit-button"');
    expect(place(m, "right")).toMatch(/>Submit<\/button>/);
    expect(place(m, "left")).not.toContain("<button");
    expect(place(m, "middle")).not.toContain("<button");
  });

  it("Edit previous sits on the left when there is a last judgment", () => {
    const m = listen({ footerLeft: <button>Edit previous</button> });
    expect(place(m, "left")).toContain("Edit previous");
    expect(place(m, "right")).not.toContain("Edit previous");
  });

  it("the first-visit card says what the work is, word for word, and never which clip is the machine", () => {
    const m = renderToStaticMarkup(<ListenIntro onStart={noop} />);
    for (const line of [
      "You will hear two clips of the same sentence.",
      "Pick the one that sounds more like a real Igala speaker.",
      "Some clips are people. Some are a machine. We do not tell you which.",
      "Please be strict.",
    ]) {
      expect(m).toContain(line);
    }
    expect(m).toMatch(/<button[^>]*min-h-\[44px\][^>]*>Start<\/button>/);
  });

  it("the card is shown once: Start writes the flag, the page reads it", () => {
    const src = readFileSync(join(__dirname, "listen-interface.tsx"), "utf8");
    expect(src).toContain('localStorage.getItem(LISTEN_INTRO_KEY) === "1"');
    expect(src).toContain('localStorage.setItem(LISTEN_INTRO_KEY, "1")');
    expect(LISTEN_INTRO_KEY).toBe("wt-listen-intro-seen");
    // the pair is not shown under the card
    expect(src).toContain('queue.status === "task" && intro === true');
    expect(src).toContain('queue.status === "task" && intro === false');
  });

  it("the empty state", () => {
    const m = renderToStaticMarkup(<ListenEmpty done={7} />);
    expect(m).toContain("No clips to compare right now.");
    expect(m).toContain("You have judged 7.");
  });

  it("the Saved strip opens the judgment just sent, as a Listen row: reason only", () => {
    const src = readFileSync(join(__dirname, "listen-interface.tsx"), "utf8");
    expect(src).toContain('lastSavedKey("listen")');
    expect(src).toContain('target={{ type: "listen", id: lastSaved.id }}');
    // remembered from the submit's own answer, before the next pair loads
    const submit = src.slice(src.indexOf("const submit = async"));
    expect(submit.indexOf("id: j.id")).toBeGreaterThan(-1);
    expect(submit.indexOf("id: j.id")).toBeLessThan(
      submit.lastIndexOf("await loadNext()"),
    );
  });

  it("the page still names no model, speaker or tier anywhere in its markup", () => {
    const m = listen({ footerLeft: <button>Edit previous</button> });
    for (const word of [
      "model",
      "tts",
      "synth",
      "machine",
      "tier",
      "speaker",
    ]) {
      expect(m.toLowerCase(), word).not.toContain(word);
    }
  });
});

describe("Check in the frame", () => {
  it("before the verdict: Send verdict on the right", () => {
    const m = check({ picked: "matches" });
    expect(place(m, "right")).toContain('data-testid="check-send"');
    expect(place(m, "right")).toContain("Send verdict");
    expect(place(m, "left")).not.toContain("<button");
  });

  it("after the verdict: Change my verdict on the left (this screen's Edit previous), Next clip on the right", () => {
    const m = check({ sent: "matches", transcript: null });
    expect(place(m, "left")).toContain('data-testid="check-change"');
    expect(place(m, "left")).toContain("Change my verdict");
    expect(place(m, "right")).toContain('data-testid="check-next"');
    expect(place(m, "right")).toContain("Next clip");
  });

  it("the empty state", () => {
    const m = renderToStaticMarkup(<CheckEmpty />);
    expect(m).toContain("No clips to check right now.");
    expect(m).toContain('data-testid="check-done"');
  });
});
