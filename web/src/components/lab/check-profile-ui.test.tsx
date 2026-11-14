import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckView, TranscriptCompare, type CheckViewProps } from "./check-interface";
import { ProfileView } from "./profile-form";
import type { SpeakerProfileInput } from "@/lib/speech/profile";
import { SPEAK_TABS, activeSpeakTab } from "./lab-band";

const task = {
  recording: { id: "c1", url: "/api/lab/speech/recording/c1/audio" },
  prompt: { promptId: "code_001", text: "Say hello." },
  answer: { text: "ada ba ode", words: ["ada", "ba", "ode"] },
};
const noop = () => undefined;
const view = (over: Partial<CheckViewProps> = {}) =>
  renderToStaticMarkup(
    <CheckView
      task={task}
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

describe("Check screen", () => {
  it("before a verdict shows the audio, the written answer and three verdicts, and no transcript", () => {
    const html = view();
    expect(html).toContain('data-testid="check-audio"');
    expect(html).toContain("ada ba ode".split(" ")[0]);
    for (const label of ["Matches", "Does not match", "Cannot hear it"]) {
      expect(html).toContain(`>${label}<`);
    }
    expect(html).not.toContain('data-testid="check-transcript"');
    expect(html).not.toContain("Machine heard");
    expect(html).not.toContain('data-testid="check-change"');
  });

  it("Send stays disabled until a verdict is picked", () => {
    expect(view()).toMatch(/<button[^>]*data-testid="check-send"[^>]*\sdisabled=""/);
    expect(view({ picked: "matches" })).not.toMatch(
      /<button[^>]*data-testid="check-send"[^>]*\sdisabled=""/,
    );
  });

  it("does not match lets the reviewer point at a word", () => {
    const html = view({ picked: "does_not_match", wrongWord: 1 });
    expect(html).toContain("Pick the word that does not match");
    expect(html).toMatch(/aria-pressed="true"[^>]*>ba</);
  });

  it("shows the five level chips only for Does not match", () => {
    const chips = /aria-label="On what level does it not match"/;
    expect(view()).not.toMatch(chips);
    expect(view({ picked: "matches" })).not.toMatch(chips);
    expect(view({ picked: "cannot_hear" })).not.toMatch(chips);
    const html = view({ picked: "does_not_match" });
    expect(html).toMatch(chips);
    for (const label of [
      "A different word was said",
      "Right word, a sound is off",
      "Right word, the tone is off",
      "Words missing or added",
      "Something else, say what in the note",
    ]) {
      expect(html).toContain(`>${label}<`);
    }
  });

  it("with Does not match, Send stays disabled until a level is picked", () => {
    const disabled = /<button[^>]*data-testid="check-send"[^>]*\sdisabled=""/;
    expect(view({ picked: "does_not_match" })).toMatch(disabled);
    const html = view({ picked: "does_not_match", level: "tone" });
    expect(html).not.toMatch(disabled);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Right word, the tone is off</);
  });

  it("says a dialect pronunciation still matches, under Matches", () => {
    expect(view()).toContain("A dialect pronunciation of the same word still matches.");
  });

  it("offers an optional note with a 280 counter for every verdict", () => {
    for (const picked of ["matches", "does_not_match", "cannot_hear"] as const) {
      const html = view({ picked, note: "abc" });
      expect(html).toMatch(/<input[^>]*id="check-note"[^>]*maxLength="280"/);
      expect(html).toContain("3/280");
    }
  });

  it("after the verdict it shows the transcript with differing words marked, and Change my verdict", () => {
    const html = view({ sent: "matches", transcript: "ada ku ode" });
    expect(html).toContain('data-testid="check-transcript"');
    expect(html).toContain("Machine heard");
    expect(html.match(/<mark/g)).toHaveLength(2); // "ba" written, "ku" heard
    expect(html).toContain('data-testid="check-change"');
    expect(html).toContain('data-testid="check-next"');
  });

  it("says so when no transcript exists, and when the words agree marks nothing", () => {
    expect(view({ sent: "matches", transcript: null })).toContain(
      'data-testid="check-no-transcript"',
    );
    const same = renderToStaticMarkup(
      <TranscriptCompare answer="ada ba" transcript="Ada, ba" />,
    );
    expect(same).not.toContain("<mark");
    expect(same).toContain("The machine heard the same words.");
  });

  it("asks for the transcript only after the verdict is sent", () => {
    const src = readFileSync(join(__dirname, "check-interface.tsx"), "utf8");
    const submit = src.indexOf("/api/lab/speech/check/submit");
    const transcript = src.indexOf("/api/lab/speech/check/transcript");
    expect(submit).toBeGreaterThan(-1);
    expect(transcript).toBeGreaterThan(submit);
    expect(src.match(/check\/transcript/g)).toHaveLength(1);
  });
});

describe("Speaker profile form", () => {
  const value: SpeakerProfileInput = {
    dialect: null,
    ageBand: null,
    gender: null,
    mayShareDemographics: false,
  };
  const html = (v = value) =>
    renderToStaticMarkup(
      <ProfileView
        value={v}
        busy={false}
        saved={false}
        error={null}
        onChange={noop}
        onSave={noop}
      />,
    );

  it("every select offers Prefer not to say, and the share switch starts off", () => {
    const out = html();
    expect(out.match(/Prefer not to say/g)).toHaveLength(3);
    expect(out).toMatch(/<input[^>]*type="checkbox"(?![^>]*checked)/);
    expect(out).toContain("Off by");
  });

  it("shows the saved choices and a checked switch", () => {
    const out = html({
      dialect: "ankpa",
      ageBand: "30_44",
      gender: "woman",
      mayShareDemographics: true,
    });
    expect(out).toContain("checked");
    expect(out).toMatch(/<option value="ankpa" selected/);
  });
});

describe("Speak band", () => {
  it("has Speak, Listen, Check and Profile, and highlights the right one", () => {
    expect(SPEAK_TABS.map((t) => t.label)).toEqual(["Speak", "Listen", "Check", "Profile"]);
    expect(activeSpeakTab("/speak")).toBe("/speak");
    expect(activeSpeakTab("/speak/check")).toBe("/speak/check");
    expect(activeSpeakTab("/speak/check/extra")).toBe("/speak/check");
    expect(activeSpeakTab("/lab/speech")).toBeNull();
  });
});
