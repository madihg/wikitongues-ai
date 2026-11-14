import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SpeechMeasureAuto } from "./speech-measure-auto";
import { SpeechMeasureHuman } from "./speech-measure-human";
import { SpeechVersions } from "./speech-versions";
import {
  AUTO_LEVELS,
  AUTO_RECOGNITION,
  AUTO_VOICE,
  EMPTY,
  HUMAN,
} from "@/lib/admin/measure/copy";
import type {
  AutoMeasureRow,
  EvalRow,
  SpeechMeasureData,
} from "@/lib/admin/measure/data";
import type { ListenRow } from "@/lib/admin/measure/human";
import {
  EXAM_TIER_MEANING,
  HUMAN_TIER_MEANING,
} from "@/lib/admin/measure/tiers";
import { buildMeasureView, type MeasureParams } from "@/lib/admin/measure/view";

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

const EMPTY_DATA: SpeechMeasureData = {
  held: {
    clips: 131,
    minutes: 16.2,
    speakers: 2,
    examClips: 0,
    examSpeakers: 0,
    unchecked: 131,
  },
  evals: [],
  versions: [],
  levels: {
    clips: 131,
    medianPeakDbfs: -5.1,
    medianSpeechDbfs: -22,
    clippedClips: 0,
  },
  listen: [],
  checks: [],
  toneAnswers: [],
  auto: [],
  autoTableReady: false,
};

const ev = (over: Partial<EvalRow> = {}): EvalRow => ({
  id: "e1",
  modelRef: "asr-1",
  manifestVersion: "1750f67dcd4c1675",
  cer: 0.312,
  werStripped: 0.58,
  werRetained: 0.715,
  ter: 0.2,
  nClips: 62,
  speakers: 3,
  terPooled: 0.44,
  markedVowels: 812,
  onLockedExam: true,
  createdAt: "2026-11-20T02:00:00.000Z",
  ...over,
});

const m = (
  value: number,
  lo: number | null = null,
  hi: number | null = null,
) => ({
  value,
  lo,
  hi,
  n: null,
});
const auto = (over: Partial<AutoMeasureRow>): AutoMeasureRow => ({
  kind: "asr_three_ways",
  modelRef: "human",
  rulerRef: "asr-1",
  manifestVersion: "1750f67dcd4c1675",
  nClips: 62,
  values: {},
  createdAt: "2026-11-20T02:00:00.000Z",
  ...over,
});

let seq = 0;
const round = (winner: string, over: Partial<ListenRow> = {}): ListenRow => {
  seq++;
  return {
    id: `c${seq}`,
    promptId: `p${seq}`,
    annotatorId: "l1",
    recordingAId: `a${seq}`,
    recordingBId: `b${seq}`,
    a: "tts-1",
    b: "human",
    winner,
    axes: null,
    isDemo: false,
    createdAt: "2026-11-21T10:00:00.000Z",
    ...over,
  };
};
const rounds = (n: number, winner: string) =>
  Array.from({ length: n }, () => round(winner));

function page(data: SpeechMeasureData, params: MeasureParams = {}) {
  const view = buildMeasureView(data, params);
  const autoHtml = renderToStaticMarkup(
    <SpeechMeasureAuto
      system={view.system}
      recognition={view.recognition.block}
      voice={view.voice.block}
      voiceSelected={view.voice.selected}
      levels={view.levels}
      held={view.held}
      autoTableReady={view.autoTableReady}
    />,
  );
  const humanHtml = renderToStaticMarkup(
    <SpeechMeasureHuman
      half={view.human}
      checks={view.checks}
      tone={view.tone}
    />,
  );
  const versionsHtml = renderToStaticMarkup(
    <SpeechVersions rows={view.versions} />,
  );
  return {
    view,
    auto: text(autoHtml),
    human: text(humanHtml),
    versions: text(versionsHtml),
    autoHtml,
    humanHtml,
  };
}

describe("with nothing scored and no round (today's state)", () => {
  const p = page(EMPTY_DATA);

  it("renders, says no model has been scored, and counts what we hold", () => {
    expect(p.auto).toContain("No speech model has been scored yet.");
    expect(p.auto).toContain(
      "No exam is locked yet. Lock exam clips in Data, Speech clips.",
    );
    expect(p.auto).toContain(
      "We hold 131 clips, 16.2 minutes, from 2 speakers. 0 are locked as the exam. 131 have not been checked.",
    );
  });

  it("shows the levels the recorder measured, and says what is not measured yet", () => {
    expect(p.auto).toContain("-5.1 dBFS");
    expect(p.auto).toContain("-22.0 dBFS");
    expect(p.auto).toContain("0 of 131");
    expect(p.auto).toContain("Not measured yet");
    expect(p.auto).toContain(EMPTY.workerTableMissing);
  });

  it("the human half states each empty block and the way to the first tier", () => {
    for (const s of [
      EMPTY.noRounds,
      "30 more rounds to reach Early.",
      EMPTY.noScores,
      EMPTY.noChecks,
      EMPTY.noTonePairs,
      EMPTY.noSecondListener,
      EMPTY.noRepeats,
    ]) {
      expect(p.human).toContain(s);
    }
  });

  it("prints no percentage anywhere", () => {
    expect(p.human).not.toMatch(/\d%/);
    expect(p.auto).not.toMatch(/\d%/);
  });

  it("the versions table says there is none yet", () => {
    expect(p.versions).toContain("No version yet.");
  });

  it("the voice side says no voice has been measured, and names what nobody computes yet", () => {
    const v = page(EMPTY_DATA, { system: "tts" });
    expect(v.auto).toContain("No voice has been measured yet.");
    expect(v.auto).toContain(
      "Not computed yet: Predicted listening score, Same voice, Pitch follows the tone marks.",
    );
  });
});

describe("the automatic half with a score", () => {
  it("a hand-run score is a smoke test: grey numbers, the tier word, no claim", () => {
    const p = page({
      ...EMPTY_DATA,
      evals: [
        ev({
          cer: 0.4176,
          terPooled: 0.956,
          markedVowels: 365,
          nClips: 72,
          speakers: 2,
          onLockedExam: false,
        }),
      ],
    });
    expect(p.auto).toContain("Clips scored: 72 clips, 2 speakers.");
    expect(p.auto).toContain("Smoke test");
    expect(p.auto).toContain("These clips are not a locked exam.");
    expect(p.auto).toContain("41.8%");
    expect(p.auto).toContain("95.6%");
    expect(p.auto).toContain("on 365 marked vowels");
    expect(p.auto).not.toMatch(/better|worse|tied at this size/);
  });

  it("every percentage shows its range when one is stored, and says so when it is not", () => {
    const p = page({
      ...EMPTY_DATA,
      evals: [ev()],
      auto: [auto({ values: { cer: m(0.312, 0.27, 0.35) } })],
      autoTableReady: true,
    });
    expect(p.auto).toContain("31.2%");
    expect(p.auto).toContain("27 to 35");
    expect(p.auto).toContain("not stored");
    expect(p.auto).toContain("Exam: 62 clips, 3 speakers.");
    expect(p.auto).not.toContain(EMPTY.workerTableMissing);
  });

  it("calls a difference better only when the ranges leave no doubt, else tied at this size", () => {
    const data: SpeechMeasureData = {
      ...EMPTY_DATA,
      evals: [
        ev(),
        ev({
          id: "e0",
          modelRef: "base",
          cer: 0.42,
          werStripped: 0.6,
          createdAt: "2026-11-19T02:00:00.000Z",
        }),
      ],
      auto: [
        auto({
          values: {
            cer: m(0.312, 0.27, 0.35),
            werStripped: m(0.58, 0.52, 0.64),
          },
        }),
        auto({
          rulerRef: "base",
          values: { cer: m(0.42, 0.38, 0.46), werStripped: m(0.6, 0.54, 0.66) },
        }),
      ],
      autoTableReady: true,
    };
    const p = page(data);
    expect(p.view.recognition.compare).toBe("base");
    expect(p.auto).toContain("Against base");
    expect(p.auto).toContain("-10.8 points better");
    expect(p.auto).toContain("-2.0 points tied at this size");
    // Asking for no comparison removes the column.
    expect(page(data, { vs: "none" }).auto).not.toContain("Against base");
  });

  it("refuses to compare two versions scored on different exams, and says why", () => {
    const p = page({
      ...EMPTY_DATA,
      evals: [
        ev(),
        ev({
          id: "e0",
          modelRef: "base",
          manifestVersion: "another-exam",
          cer: 0.9,
          createdAt: "2026-11-01T02:00:00.000Z",
        }),
      ],
    });
    expect(p.auto).not.toContain("Against base");
    expect(p.auto).toContain("Two exams are never compared.");
  });

  it("the voice block leads with the gap to a person", () => {
    const p = page(
      {
        ...EMPTY_DATA,
        auto: [
          auto({
            kind: "tts_round_trip",
            modelRef: "tts-1",
            rulerRef: "the-recogniser",
            nClips: 72,
            values: {
              systemCer: m(0.61),
              humanCer: m(0.4176),
              cerGap: m(0.1924, 0.151, 0.236),
            },
          }),
        ],
        autoTableReady: true,
      },
      { system: "tts" },
    );
    expect(p.auto).toContain(
      "72 sentences, each said by the model and by a person.",
    );
    expect(p.auto).toContain("+19.2 points");
    expect(p.auto).toContain("15.1 to 23.6");
    expect(p.auto).toContain("model 61.0%, person 41.8%");
    // The recogniser gets 41.8 of 100 letters wrong on people: too blurry.
    expect(p.auto).toContain(
      "This number cannot tell a voice from a person yet.",
    );
    expect(p.auto).toContain(
      "The recogniser gets 41.8 of 100 letters wrong on people's own clips, so a voice in another language can land in the same place.",
    );
    expect(p.auto).toContain("It is not a pass.");
    expect(p.auto).not.toMatch(/passes|passed the gate/i);
  });

  it("with a sharp recogniser and enough sentences, the gap is read as a gap", () => {
    const p = page(
      {
        ...EMPTY_DATA,
        auto: [
          auto({
            kind: "tts_round_trip",
            modelRef: "tts-1",
            rulerRef: "the-recogniser",
            nClips: 60,
            values: {
              systemCer: m(0.21),
              humanCer: m(0.116),
              cerGap: m(0.094, 0.04, 0.15),
            },
          }),
        ],
        autoTableReady: true,
      },
      { system: "tts" },
    );
    expect(p.auto).toContain("Read the gap, not the two numbers.");
    expect(p.auto).not.toContain("cannot tell a voice from a person");
    // Too few sentences is blurry too.
    const few = page(
      {
        ...EMPTY_DATA,
        auto: [
          auto({
            kind: "tts_round_trip",
            modelRef: "tts-1",
            nClips: 21,
            values: { systemCer: m(0.21), humanCer: m(0.116) },
          }),
        ],
      },
      { system: "tts" },
    );
    expect(few.auto).toContain(
      "This number cannot tell a voice from a person yet.",
    );
  });
});

describe("the human half", () => {
  it("under 30 rounds: counts only, the tier word, and the distance to the next", () => {
    const p = page({
      ...EMPTY_DATA,
      listen: [...rounds(3, "a"), ...rounds(5, "b")],
    });
    expect(p.human).toContain("8 rounds, 8 sentences, 1 listener");
    expect(p.human).toContain("Too few");
    expect(p.human).toContain("3 of 8");
    expect(p.human).toContain("too few rounds for a percentage");
    expect(p.human).toContain("22 more rounds to reach Early.");
    expect(p.human).not.toMatch(/\d%/);
    expect(p.human).toContain(EMPTY.oneListener);
  });

  it("from 30 rounds: the percentage with its range and its count, ties beside it", () => {
    const p = page({
      ...EMPTY_DATA,
      listen: [
        ...rounds(9, "a"),
        ...rounds(24, "b"),
        ...rounds(5, "tie"),
        ...rounds(2, "both_unusable"),
      ],
    });
    expect(p.human).toContain("Early");
    expect(p.human).toContain("27%");
    expect(p.human).toMatch(/\d+ to \d+, 9 of 33/);
    expect(p.human).toContain("Chose the person 24. Tie 5. Both unusable 2.");
    expect(p.human).toContain("Voice: tts-1.");
  });

  it("demo rounds are in no number", () => {
    const p = page({
      ...EMPTY_DATA,
      listen: [
        ...rounds(3, "a"),
        ...rounds(40, "a").map((r) => ({ ...r, isDemo: true })),
      ],
    });
    expect(p.human).toContain("3 rounds");
    expect(p.human).not.toMatch(/\d%/);
  });

  it("the Check table: counts under 30, and the model column says why it is empty", () => {
    const p = page({
      ...EMPTY_DATA,
      checks: [
        ...Array.from({ length: 10 }, (_, i) => ({
          recordingId: `r${i}`,
          reviewerId: "rev",
          verdict: i < 8 ? "matches" : "does_not_match",
          level: i < 8 ? null : "tone",
          system: "human",
          isDemo: false,
        })),
      ],
    });
    expect(p.human).toContain("Person (10 checked)");
    expect(p.human).toContain("8 of 10");
    expect(p.human).toContain("Right word, the tone is off");
    expect(p.human).toContain(EMPTY.noModelChecks);
    expect(p.human).not.toMatch(/\d%/);
  });
});

describe("one plain sentence per number, one tap away", () => {
  it("every label on both halves has its explanation button", () => {
    const p = page(
      { ...EMPTY_DATA, evals: [ev()], listen: rounds(40, "a") },
      {},
    );
    const labelled = (html: string, label: string) =>
      html.includes(`aria-label="What &quot;${label}&quot; means"`);
    for (const t of Object.values(AUTO_RECOGNITION)) {
      expect(labelled(p.autoHtml, t.label), t.label).toBe(true);
    }
    for (const t of Object.values(AUTO_LEVELS)) {
      expect(labelled(p.autoHtml, t.label), t.label).toBe(true);
    }
    for (const t of Object.values(HUMAN)) {
      expect(labelled(p.humanHtml, t.label), t.label).toBe(true);
    }
    // The sample word is explained too.
    expect(labelled(p.autoHtml, "Early")).toBe(true);
    expect(labelled(p.humanHtml, "Early")).toBe(true);
  });

  it("the sentences are plain: short, no em dash, no unexplained acronym", () => {
    const all = [
      ...Object.values(AUTO_RECOGNITION),
      ...Object.values(AUTO_VOICE),
      ...Object.values(AUTO_LEVELS),
      ...Object.values(HUMAN),
    ];
    for (const t of all) {
      expect(t.meaning.trim().endsWith(".")).toBe(true);
      for (const s of [t.label, t.meaning, t.trust]) {
        expect(s).not.toContain(String.fromCharCode(0x2014));
        expect(s).not.toMatch(/\b(CER|WER|TER|MOS|SNR|ASR|TTS|F0|dBFS)\b/);
      }
    }
    for (const s of [
      ...Object.values(EXAM_TIER_MEANING),
      ...Object.values(HUMAN_TIER_MEANING),
      ...Object.values(EMPTY),
    ]) {
      expect(s).not.toContain(String.fromCharCode(0x2014));
    }
  });

  it("the key sentences are the spec's, word for word", () => {
    expect(AUTO_RECOGNITION.cer.meaning).toBe(
      "Out of 100 letters the speaker said, the model wrote this many wrong. Tone marks are ignored.",
    );
    expect(AUTO_RECOGNITION.ter.meaning).toBe(
      "Out of 100 vowels that carry a tone mark, this many came back with the wrong mark or with none.",
    );
    expect(HUMAN.preference.meaning).toBe(
      "A listener heard the model and a person say the same sentence, without knowing which was which. This is how often they chose the model. 50% would mean they cannot tell the two apart.",
    );
    expect(HUMAN.check.meaning).toBe(
      "A second speaker reads the text, listens, and says whether the clip matches. When it does not, they say on which level.",
    );
    expect(HUMAN.agreement.meaning).toBe(
      "When two people judged the same round, how often they made the same choice, corrected for luck. 0 is luck, 1 is full agreement.",
    );
  });
});

describe("buildMeasureView: which version is on screen", () => {
  const data: SpeechMeasureData = {
    ...EMPTY_DATA,
    evals: [
      ev(),
      ev({
        id: "e2",
        modelRef: "asr-2",
        createdAt: "2026-11-27T02:00:00.000Z",
      }),
    ],
    listen: rounds(2, "a"),
  };

  it("opens on recognition, on the newest scored version when none is promoted", () => {
    const v = buildMeasureView(data);
    expect(v.system).toBe("asr");
    expect(v.recognition.selected).toBe("asr-2");
    // The human half is always about a voice.
    expect(v.human.modelRef).toBe("tts-1");
  });

  it("takes the version asked for, and ignores one that does not exist", () => {
    expect(buildMeasureView(data, { v: "asr-1" }).recognition.selected).toBe(
      "asr-1",
    );
    expect(buildMeasureView(data, { v: "'; drop" }).recognition.selected).toBe(
      "asr-2",
    );
  });

  it("lists every version once in the table, with its exam id", () => {
    const v = buildMeasureView(data);
    expect(v.versions.map((r) => `${r.system}:${r.modelRef}`)).toEqual([
      "asr:asr-2",
      "asr:asr-1",
      "tts:tts-1",
    ]);
    expect(v.versions[0].exam).toBe("1750f67d");
    expect(v.versions[2].listeners).toEqual({
      chosen: 2,
      decided: 2,
      rounds: 2,
      tier: "Too few",
    });
  });
});

describe("the quality check measures, it never decides", () => {
  it("the row says on screen that the check is not calibrated yet", () => {
    expect(AUTO_LEVELS.rejected.label).toContain("not calibrated yet");
    expect(AUTO_LEVELS.rejected.meaning).toContain(
      "no clip is blocked, hidden or removed because of it",
    );
    expect(page(EMPTY_DATA).auto).toContain("(not calibrated yet)");
  });

  it("no page, component or route calls the clip quality gate", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const SRC = join(process.cwd(), "src");
    const users: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (
          /\.tsx?$/.test(name) &&
          !/\.test\.tsx?$/.test(name) &&
          /\bgateVerdict\b/.test(readFileSync(full, "utf8"))
        ) {
          users.push(full.slice(SRC.length));
        }
      }
    };
    walk(SRC);
    // Defined in one file and used by nothing in the app: the gate cannot
    // block a save, hide a clip or drop it from a list.
    expect(users).toEqual(["/lib/speech/quality-gates.ts"]);
  });
});
