import { describe, it, expect, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

// The signed-in role: the lab components do not read it, but the app shell
// they render inside does, so the mock mirrors the other component tests.
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "r-1", role: "RESEARCHER" } },
    status: "authenticated",
  }),
}));
const { mockPathname } = vi.hoisted(() => ({
  mockPathname: { current: "/lab/speech" },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname.current,
}));

import { RecordInterface } from "./record-interface";
import { RecordClip, type RecordClipProps } from "./record-clip";
import { TakeFeedback } from "./take-feedback";
import { SayItBlock } from "./say-it-block";
import { SessionLine } from "./session-line";
import type { QualityMetrics } from "@/lib/speech/analyse";
import {
  AnswerBox,
  Countdown,
  RecordButton,
  SaveBar,
  TierChoice,
  Timer,
  UploadProgress,
  VoiceCloningOptIn,
} from "./record-parts";
import { ConsentGate, type ConsentDoc } from "./consent-gate";
import {
  ListenView,
  SpeechAxesRow,
  type ListenTask,
} from "./listen-interface";
import {
  DEFAULT_QUERY,
  RecordingsView,
  recordingsQueryString,
  type RecordingItem,
} from "./recordings-interface";
import { AXES_BLOCK_LABEL, SPEECH_AXES } from "@/lib/speech/speech-axes";
import { LabBand, LAB_TABS, activeLabTab } from "./lab-band";

/**
 * Proof of the Speech Lab screens' invariants (design: "Record tab",
 * "Listen tab", "Accessibility"). Two kinds of check, like
 * annotation-interface.test.tsx: the source is read for structure (what
 * state starts as, what is never written), and the pieces are rendered to
 * markup for behaviour (what is disabled, what appears). Fixtures are
 * synthetic English.
 */

const dir = __dirname;
const sourceOf = (f: string) => readFileSync(join(dir, f), "utf8");
const labSources = readdirSync(dir)
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))
  .map((f) => ({ name: f, src: sourceOf(f) }));

// ---------- fixtures ---------------------------------------------------

const DOC: ConsentDoc = {
  currentVersion: "2026-10-19-v1",
  written: [
    {
      id: "withdraw",
      heading: "You can stop at any time",
      body: "Withdrawal comes first.",
    },
    { id: "what", heading: "What we ask you to do", body: "Record yourself." },
  ],
  oral: [
    { id: "withdraw", heading: "First: you can stop", body: "Spoken form." },
  ],
  questions: [
    {
      key: "commercialLicensing",
      label: "Licensing",
      question: "Companies may use licensed clips.",
    },
    {
      key: "crossBorder",
      label: "Other countries",
      question: "Clips may go abroad.",
    },
    {
      key: "voiceCloning",
      label: "Voice cloning",
      question: "A copy of my voice may be made.",
    },
    {
      key: "speakerId",
      label: "Speaker identity",
      question: "Link clips to me.",
    },
  ],
  igalaPlaceholder: "[Igala version to be written]",
};

const TASK: ListenTask = {
  prompt: { id: "p-1", promptId: "code_001", text: "Say hello." },
  language: "igala",
  clipA: { id: "clip-a", url: "https://storage.example/a?token=t" },
  clipB: { id: "clip-b", url: "https://storage.example/b?token=t" },
};

const ITEM: RecordingItem = {
  id: "rec-1",
  promptId: "code_001",
  promptText: "Say hello.",
  answerText: "an english stand-in",
  language: "igala",
  quality: null,
  flags: [],
  speaker: "spk_0123456789ab",
  dialect: null,
  durationMs: 4200,
  tier: "community_only",
  consentVersion: "2026-10-19-v1",
  reviewStatus: null,
  rightsStatus: "pending",
  url: "/api/lab/speech/recording/rec-1/audio",
};

const METRICS: QualityMetrics = {
  durationMs: 5000,
  leadingSilenceMs: 300,
  trailingSilenceMs: 600,
  speechShare: 0.8,
  rmsDbfs: -22,
  peakDbfs: -5,
  clippingShare: 0,
  syllables: 9,
  syllablesPerSecond: 2.2,
};

const CLIP_PROPS: RecordClipProps = {
  language: "igala",
  promptCode: "code_001",
  textToRead: "a stand-in answer",
  textLabel: "Read your answer out loud.",
  textIsIgala: true,
  syllableText: "a stand-in answer",
  answer: null,
  consentOk: false,
  offReason: "Read and accept the consent above to turn recording on.",
  licensedAllowed: true,
  cloningAllowed: false,
  onSaved: () => {},
};

const noop = () => {};

/** Boolean attributes as React renders them (a class named disabled:... must not match). */
const DISABLED = /\sdisabled=""/;
const CHECKED = /\schecked=""/;

/** Opening tags of one element name in rendered markup. */
function tagsOf(html: string, name: string): string[] {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "g"))].map(
    (m) => m[0],
  );
}
function classOf(tag: string): string {
  return /class="([^"]*)"/.exec(tag)?.[1] ?? "";
}
/** A 44px target: min-h-[44px], or the 56px record button (h-14). */
const TARGET = /min-h-\[44px\]|\bh-14\b/;

// ---------- Record: consent and the record button ----------------------

describe("Record: consent gates recording", () => {
  const html = renderToStaticMarkup(<RecordClip {...CLIP_PROPS} />);

  it("renders the record button DISABLED before consent is known or given", () => {
    const [button] = tagsOf(html, "button").filter((t) =>
      t.includes('data-testid="record-button"'),
    );
    expect(button).toBeDefined();
    expect(button).toMatch(DISABLED);
  });

  it("tells the visitor why, and shows no tier cards, Save or Keep yet", () => {
    expect(html).toContain("Read and accept the consent above");
    expect(html).not.toContain('name="tier');
    expect(html).not.toContain('data-testid="save-button"');
    expect(html).not.toContain(">Keep<");
  });

  it("the page itself renders no clip until a prompt has loaded", () => {
    const page = renderToStaticMarkup(<RecordInterface />);
    expect(page).not.toContain('data-testid="record-button"');
    expect(page).toContain("Loading a prompt");
  });

  it("the source enables recording only on granted consent and a locked answer", () => {
    const iface = sourceOf("record-interface.tsx");
    expect(iface).toContain('const consentOk = consent.status === "granted"');
    expect(iface).toContain("Lock your answer to turn recording on.");
    expect(sourceOf("record-clip.tsx")).toMatch(
      /canRecord =\s*consentOk\s*&&\s*offReason === null/,
    );
  });
});

describe("ConsentGate", () => {
  const html = renderToStaticMarkup(
    <ConsentGate doc={DOC} busy={false} error={null} onAccept={noop} />,
  );

  it("explains withdrawal first", () => {
    expect(html.indexOf("You can stop at any time")).toBeGreaterThan(-1);
    expect(html.indexOf("You can stop at any time")).toBeLessThan(
      html.indexOf("What we ask you to do"),
    );
  });

  it("nothing is pre-checked: four separate unchecked boxes plus an unchecked agree box", () => {
    const inputs = tagsOf(html, "input");
    expect(inputs).toHaveLength(5);
    for (const i of inputs) {
      expect(i).toContain('type="checkbox"');
      expect(i).not.toMatch(CHECKED);
    }
  });

  it("offers the oral script in a collapsible Read aloud block, closed by default", () => {
    expect(html).toContain("<details");
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toContain("Read aloud");
    expect(html).toContain("Spoken form.");
  });

  it("Accept is disabled until the agree box is ticked", () => {
    const [accept] = tagsOf(html, "button");
    expect(accept).toMatch(DISABLED);
  });

  it("carries the version and the Igala placeholder, never Igala text", () => {
    expect(html).toContain("2026-10-19-v1");
    expect(html).toContain("[Igala version to be written]");
  });
});

// ---------- Record: tier, save, countdown ------------------------------

describe("Record: the tier choice", () => {
  it("pre-selects nothing", () => {
    const html = renderToStaticMarkup(
      <TierChoice value={null} onChange={noop} licensedAllowed />,
    );
    const radios = tagsOf(html, "input");
    expect(radios).toHaveLength(3);
    for (const r of radios) {
      expect(r).toContain('type="radio"');
      expect(r).not.toMatch(CHECKED);
    }
  });

  it("checks exactly the chosen card", () => {
    const html = renderToStaticMarkup(
      <TierChoice value="open" onChange={noop} licensedAllowed />,
    );
    const checked = tagsOf(html, "input").filter((t) => CHECKED.test(t));
    expect(checked).toHaveLength(1);
    expect(checked[0]).toContain('value="open"');
  });

  it("carries the three one-sentence explanations", () => {
    const html = renderToStaticMarkup(
      <TierChoice value={null} onChange={noop} licensedAllowed />,
    );
    expect(html).toContain("Only used inside the Igala tools. Never shared.");
    expect(html).toContain(
      "Shared under a signed contract. You are paid a share. You can withdraw later.",
    );
    expect(html).toContain(
      "Published under CC-BY 4.0. Permanent once published.",
    );
  });

  it("disables the licensed card when consent does not allow licensing", () => {
    const html = renderToStaticMarkup(
      <TierChoice value={null} onChange={noop} licensedAllowed={false} />,
    );
    const licensed = tagsOf(html, "input").find((t) =>
      t.includes('value="licensed"'),
    )!;
    expect(licensed).toMatch(DISABLED);
    expect(html).toContain("do not allow licensing");
  });

  it("the container starts with no tier and never defaults one", () => {
    const src = sourceOf("record-clip.tsx");
    expect(src).toContain("useState<Tier | null>(null)");
    expect(src).not.toMatch(/defaultChecked/);
    expect(src).not.toMatch(/setTier\(\s*["']/); // no code path sets a literal tier
  });

  it("the voice cloning box is separate and unchecked", () => {
    const html = renderToStaticMarkup(
      <VoiceCloningOptIn checked={false} allowed onChange={noop} />,
    );
    const [box] = tagsOf(html, "input");
    expect(box).toContain('type="checkbox"');
    expect(box).not.toMatch(CHECKED);
    expect(sourceOf("record-clip.tsx")).toContain("useState(false)");
  });
});

describe("Record: the save control", () => {
  it("is disabled until a tier is chosen", () => {
    const none = renderToStaticMarkup(
      <SaveBar tier={null} busy={false} onSave={noop} />,
    );
    expect(tagsOf(none, "button")[0]).toMatch(DISABLED);
    for (const tier of ["community_only", "licensed", "open"] as const) {
      const chosen = renderToStaticMarkup(
        <SaveBar tier={tier} busy={false} onSave={noop} />,
      );
      expect(tagsOf(chosen, "button")[0]).not.toMatch(DISABLED);
    }
  });

  it("stays disabled while a save is running", () => {
    const busy = renderToStaticMarkup(
      <SaveBar tier="open" busy onSave={noop} />,
    );
    expect(tagsOf(busy, "button")[0]).toMatch(DISABLED);
  });

  it("the container's save requires a tier before anything is sent", () => {
    expect(sourceOf("record-clip.tsx")).toMatch(
      /if \(!take \|\| tier === null\) return/,
    );
  });
});

describe("Record: the countdown and the timer", () => {
  it("shows nothing before 25 seconds", () => {
    const html = renderToStaticMarkup(<Countdown elapsedMs={10_000} />);
    expect(html).not.toContain("left");
  });

  it("appears for the last five seconds and counts down", () => {
    expect(renderToStaticMarkup(<Countdown elapsedMs={25_000} />)).toContain(
      "5 s left",
    );
    expect(renderToStaticMarkup(<Countdown elapsedMs={26_200} />)).toContain(
      "4 s left",
    );
    expect(renderToStaticMarkup(<Countdown elapsedMs={29_900} />)).toContain(
      "1 s left",
    );
  });

  it("is a polite live region even when empty, so changes are announced", () => {
    const html = renderToStaticMarkup(<Countdown elapsedMs={0} />);
    expect(html).toContain('aria-live="polite"');
  });

  it("the timer is mono and the live dot respects reduced motion", () => {
    const html = renderToStaticMarkup(<Timer elapsedMs={7400} recording />);
    expect(html).toContain("font-mono");
    expect(html).toContain("0:07.4");
    expect(html).toContain("motion-safe:animate-pulse");
    expect(html).not.toMatch(/(^|[\s"])animate-pulse/);
    expect(html).toContain("bg-danger");
  });

  it("the container wires the 30 second cap and the countdown", () => {
    expect(sourceOf("record-clip.tsx")).toContain(
      "<Countdown elapsedMs={recorder.elapsedMs}",
    );
    expect(sourceOf("use-recorder.ts")).toContain("MAX_DURATION_MS");
    expect(sourceOf("use-recorder.ts")).toMatch(
      /if \(e >= MAX_DURATION_MS\) stop\(\)/,
    );
  });

  it("the record button is the 56px control and relabels to Stop", () => {
    const idle = renderToStaticMarkup(
      <RecordButton recording={false} disabled={false} onClick={noop} />,
    );
    const live = renderToStaticMarkup(
      <RecordButton recording disabled={false} onClick={noop} />,
    );
    expect(classOf(tagsOf(idle, "button")[0])).toMatch(/\bh-14\b.*\bw-14\b/);
    expect(idle).toContain(">Record<");
    expect(live).toContain(">Stop<");
  });

  it("upload progress is a labelled progressbar in a live region", () => {
    const html = renderToStaticMarkup(<UploadProgress pct={42.4} />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="42"');
    expect(html).toContain('aria-live="polite"');
  });
});

// ---------- Listen -----------------------------------------------------

const listen = (over: Partial<Parameters<typeof ListenView>[0]> = {}) =>
  renderToStaticMarkup(
    <ListenView
      task={TASK}
      winner={null}
      reasons={[]}
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

describe("Listen", () => {
  it("shows the prompt, both players in the arena colours, and four choices", () => {
    const html = listen();
    expect(html).toContain("Say hello.");
    expect(html).toContain("border-pick-a");
    expect(html).toContain("border-pick-b");
    expect(html).toContain('aria-label="Play clip A"');
    expect(html).toContain('aria-label="Play clip B"');
    for (const label of [">A<", ">B<", ">Tie<", ">Both unusable<"])
      expect(html).toContain(label);
    expect(
      tagsOf(html, "button").filter((t) => t.includes('role="radio"')),
    ).toHaveLength(4);
  });

  it("offers the five reason chips", () => {
    const html = listen();
    for (const r of [
      "Wrong word",
      "Wrong tone",
      "Unclear",
      "Robotic",
      "Wrong pronunciation",
    ]) {
      expect(html).toContain(`>${r}<`);
    }
  });

  it("selects nothing by default and keeps Submit disabled", () => {
    const html = listen();
    expect(html).not.toContain('aria-checked="true"');
    expect(html).not.toContain('aria-pressed="true"');
    const submit = tagsOf(html, "button").find((t) =>
      t.includes('data-testid="submit-button"'),
    )!;
    expect(submit).toMatch(DISABLED);
  });

  it("Submit needs both a choice and at least one reason", () => {
    const find = (h: string) =>
      tagsOf(h, "button").find((t) =>
        t.includes('data-testid="submit-button"'),
      )!;
    expect(find(listen({ winner: "a" }))).toMatch(DISABLED);
    expect(find(listen({ reasons: ["robotic"] }))).toMatch(DISABLED);
    expect(find(listen({ winner: "tie", reasons: ["robotic"] }))).not.toMatch(
      DISABLED,
    );
  });

  it("is blind: no tier, speaker or source anywhere in the markup", () => {
    const html = listen();
    for (const word of [
      "tier",
      "speaker",
      "synth",
      "human",
      "community",
      "licensed",
    ]) {
      expect(html.toLowerCase(), word).not.toContain(word);
    }
  });

  it("the page asks the server for the pair; it does not compute one", () => {
    const src = sourceOf("listen-interface.tsx");
    expect(src).toContain("/api/lab/speech/listen/next");
    expect(src).not.toContain("assignedPair");
  });
});

// ---------- Recordings -------------------------------------------------

describe("Recordings", () => {
  const html = renderToStaticMarkup(
    <RecordingsView
      items={[ITEM]}
      query={DEFAULT_QUERY}
      exporting={false}
      message={null}
      onQuery={noop}
      onFlag={noop}
      onExport={noop}
    />,
  );

  it("shows the pseudonym, tier, consent version and an inline player", () => {
    expect(html).toContain("spk_0123456789ab");
    expect(html).toContain("Community only");
    expect(html).toContain("2026-10-19-v1");
    expect(html).toContain("<audio");
    expect(html).toContain("/api/lab/speech/recording/rec-1/audio");
  });

  it("has the three one-tap flags and the export button", () => {
    for (const label of [
      ">Bad audio<",
      ">Wrong text<",
      ">Keep<",
      ">Export open manifest<",
    ]) {
      expect(html).toContain(label);
    }
  });

  it("says plainly that only OPEN, cleared clips are exported", () => {
    expect(html).toContain("Community-only and test-set clips never leave");
  });
});

// ---------- The band ---------------------------------------------------

describe("LabBand", () => {
  it("is the 56px ink band with LAB, Speech and the three tabs", () => {
    mockPathname.current = "/lab/speech/listen";
    const html = renderToStaticMarkup(<LabBand />);
    const [header] = tagsOf(html, "header");
    expect(classOf(header)).toMatch(/\bh-14\b/);
    expect(classOf(header)).toContain("bg-foreground");
    expect(classOf(header)).toContain("text-background");
    expect(html).toContain("LAB");
    expect(html).toContain("tracking-widest");
    for (const tab of LAB_TABS) expect(html).toContain(`>${tab.label}<`);
  });

  it("marks the current tab", () => {
    mockPathname.current = "/lab/speech/recordings";
    const html = renderToStaticMarkup(<LabBand />);
    const current = tagsOf(html, "a").filter((t) =>
      t.includes('aria-current="page"'),
    );
    expect(current).toHaveLength(1);
    expect(current[0]).toContain('href="/lab/speech/recordings"');
  });

  it("activeLabTab: Record only on its exact path", () => {
    expect(activeLabTab("/lab/speech")).toBe("/lab/speech");
    expect(activeLabTab("/lab/speech/listen")).toBe("/lab/speech/listen");
    expect(activeLabTab("/lab/speech/recordings/x")).toBe(
      "/lab/speech/recordings",
    );
    expect(activeLabTab("/lab/other")).toBeNull();
  });
});

// ---------- Targets and motion, across every lab component -------------

describe("44px minimum targets", () => {
  const allHtml = [
    renderToStaticMarkup(<RecordInterface />),
    renderToStaticMarkup(<RecordClip {...CLIP_PROPS} />),
    renderToStaticMarkup(
      <SayItBlock
        promptCode="code_001"
        promptText="Say hello."
        igalaText="a stand-in answer"
        glossText=""
        onClipSaved={noop}
        onDone={noop}
      />,
    ),
    renderToStaticMarkup(
      <SpeechAxesRow winner="a" scores={{ tone: 3 }} onScore={noop} />,
    ),
    renderToStaticMarkup(<TakeFeedback metrics={METRICS} status="done" />),
    renderToStaticMarkup(<SessionLine />),
    renderToStaticMarkup(
      <RecordButton recording={false} disabled={false} onClick={noop} />,
    ),
    renderToStaticMarkup(
      <TierChoice value={null} onChange={noop} licensedAllowed />,
    ),
    renderToStaticMarkup(
      <VoiceCloningOptIn checked={false} allowed onChange={noop} />,
    ),
    renderToStaticMarkup(<SaveBar tier="open" busy={false} onSave={noop} />),
    renderToStaticMarkup(<AnswerBox value="x" onChange={noop} onLock={noop} />),
    renderToStaticMarkup(
      <ConsentGate doc={DOC} busy={false} error={null} onAccept={noop} />,
    ),
    listen({ winner: "a", reasons: ["robotic"] }),
    renderToStaticMarkup(
      <RecordingsView
        items={[ITEM]}
        query={DEFAULT_QUERY}
        exporting={false}
        message={null}
        onQuery={noop}
        onFlag={noop}
        onExport={noop}
      />,
    ),
    (() => {
      mockPathname.current = "/lab/speech";
      return renderToStaticMarkup(<LabBand />);
    })(),
  ].join("\n");

  it("every rendered button, summary, link and text area is at least 44px", () => {
    for (const name of ["button", "summary", "a", "textarea"]) {
      const tags = tagsOf(allHtml, name);
      expect(tags.length, name).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(classOf(tag), `${name}: ${tag.slice(0, 120)}`).toMatch(TARGET);
      }
    }
  });

  it("every radio and checkbox card is a 44px label", () => {
    const labels = tagsOf(allHtml, "label").filter((t) =>
      classOf(t).includes("cursor-pointer"),
    );
    expect(labels.length).toBeGreaterThan(0);
    for (const tag of labels)
      expect(classOf(tag), tag.slice(0, 120)).toMatch(TARGET);
  });

  it("in the source, every cursor-pointer element declares a 44px (or 56px) target", () => {
    for (const { name, src } of labSources) {
      const classAttrs = [
        ...src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g),
      ].map((m) => m[1] ?? m[2]);
      // A native checkbox or radio (accent-[...]) sits inside a label that is
      // the 44px target, checked above, so the inner control is exempt.
      for (const cls of classAttrs.filter(
        (c) => c.includes("cursor-pointer") && !c.includes("accent-["),
      )) {
        expect(cls, `${name}: ${cls}`).toMatch(TARGET);
      }
    }
  });
});

describe("accessibility and design rules", () => {
  it("never pulses unconditionally and never uses the pulse without motion-safe", () => {
    for (const { name, src } of labSources) {
      for (const m of src.matchAll(/animate-pulse/g)) {
        expect(src.slice(m.index! - 12, m.index!), name).toContain(
          "motion-safe:",
        );
      }
    }
  });

  it("uses design tokens only: no raw colour values in the lab components", () => {
    for (const { name, src } of labSources) {
      expect(src, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, name).not.toMatch(/\brgb\(/);
    }
  });

  it("has no em dashes and no emoji in the lab components", () => {
    for (const { name, src } of labSources) {
      expect(src.includes(String.fromCharCode(0x2014)), `${name} em dash`).toBe(
        false,
      );
      expect(/\p{Extended_Pictographic}/u.test(src), `${name} emoji`).toBe(
        false,
      );
    }
  });

  it("uses no modal layer", () => {
    for (const { name, src } of labSources) {
      expect(src, name).not.toContain('role="dialog"');
      expect(src, name).not.toContain("inset-0");
    }
  });

  it("the live regions exist: countdown, upload status, results", () => {
    expect(sourceOf("record-parts.tsx")).toContain('aria-live="polite"');
    expect(sourceOf("record-clip.tsx")).toContain('aria-live="polite"');
    expect(sourceOf("take-feedback.tsx")).toContain('aria-live="polite"');
    expect(sourceOf("session-line.tsx")).toContain('aria-live="polite"');
    expect(sourceOf("listen-interface.tsx")).toContain('aria-live="polite"');
  });
});

// ---------- Slice 2: clips, feedback, the episode block, axes ----------

describe("RecordClip: one component for both languages", () => {
  it("says which language it records and the words to say", () => {
    const igala = renderToStaticMarkup(<RecordClip {...CLIP_PROPS} />);
    expect(igala).toContain("Say it in Igala");
    expect(igala).toContain('data-testid="clip-igala"');
    expect(igala).toContain("igala "); // the Igala face for Igala text
    const english = renderToStaticMarkup(
      <RecordClip
        {...CLIP_PROPS}
        language="english"
        textIsIgala={false}
        textToRead="Say hello."
      />,
    );
    expect(english).toContain("Say it in English");
    expect(english).toContain('data-testid="clip-english"');
  });

  it("gives each clip its own tier radio group so two clips never fight over one", () => {
    const src = sourceOf("record-clip.tsx");
    expect(src).toContain("name={`tier-${language}`}");
    expect(sourceOf("record-parts.tsx")).toContain("name={name}");
  });

  it("the Record page and the episode block both use it, and neither re-implements recording", () => {
    for (const f of ["record-interface.tsx", "say-it-block.tsx"]) {
      const src = sourceOf(f);
      expect(src, f).toContain("<RecordClip");
      expect(src, f).not.toContain("useRecorder");
      expect(src, f).not.toContain("MediaRecorder");
    }
  });

  it("uploads in two steps: the row, then the audio as the PUT body (no signed URL, no multipart)", () => {
    const src = sourceOf("record-clip.tsx");
    expect(src).toContain('"/api/lab/speech/recording"');
    expect(src).toContain('xhr.open("PUT", url)');
    expect(src).toContain("xhr.send(blob)");
    expect(src).not.toContain("FormData");
    expect(src).not.toMatch(/uploadUrl|signed|sha256/i);
  });

  it("stores the take metrics and the retake count with the clip", () => {
    const src = sourceOf("record-clip.tsx");
    expect(src).toContain("retakes: retakesRef.current");
    expect(src).toContain("analyseBlob(take.blob, syllableText, language)");
  });

  it("shows the feedback before Keep, and Keep is never disabled by a warning", () => {
    const src = sourceOf("record-clip.tsx");
    expect(src.indexOf("<TakeFeedback")).toBeGreaterThan(-1);
    expect(src.indexOf("<TakeFeedback")).toBeLessThan(
      src.indexOf('data-testid="keep-button"'),
    );
    expect(src).not.toMatch(/keep-button"[^>]*disabled/);
  });
});

describe("TakeFeedback", () => {
  it("a clean take reads as one good line", () => {
    const html = renderToStaticMarkup(
      <TakeFeedback metrics={METRICS} status="done" />,
    );
    expect(html).toContain("Good take: clear level, 4.1 s for 9 syllables");
    expect(html).toContain('data-verdict="good"');
    expect(html).toContain("level -22 dBFS");
  });

  it("each problem is named in plain language", () => {
    const html = renderToStaticMarkup(
      <TakeFeedback
        metrics={{
          ...METRICS,
          rmsDbfs: -45,
          clippingShare: 0.05,
          trailingSilenceMs: 10,
        }}
        status="done"
      />,
    );
    expect(html).toContain("Too quiet: hold the phone closer and try again");
    expect(html).toContain("Clipped: speak a little further from the microphone");
    expect(html).toContain(
      "Cut short: the clip ends while you are still speaking",
    );
    expect(html).not.toContain("Good take");
  });

  it("says so when the browser could not analyse, and while it is checking", () => {
    expect(
      renderToStaticMarkup(<TakeFeedback metrics={null} status="done" />),
    ).toContain("could not check the take");
    const checking = renderToStaticMarkup(
      <TakeFeedback metrics={null} status="analysing" />,
    );
    expect(checking).toContain("Checking the take");
    expect(checking).toContain('aria-live="polite"');
  });
});

describe("the episode's Say it block", () => {
  const block = (glossText: string) =>
    renderToStaticMarkup(
      <SayItBlock
        promptCode="code_001"
        promptText="Say hello."
        igalaText="a stand-in answer"
        glossText={glossText}
        onClipSaved={noop}
        onDone={noop}
      />,
    );

  it("has two clips, one per language, and is optional", () => {
    const html = block("what it means");
    expect(html).toContain('data-testid="say-it-block"');
    expect(html).toContain('data-testid="clip-igala"');
    expect(html).toContain('data-testid="clip-english"');
    expect(html).toContain("Optional");
  });

  it("never blocks: Skip for now is there before anything is recorded", () => {
    const html = block("what it means");
    const skip = tagsOf(html, "button").find((t) =>
      t.includes('data-testid="say-it-continue"'),
    )!;
    expect(skip).not.toMatch(DISABLED);
    expect(html).toContain(">Skip for now<");
  });

  it("reads the locked English meaning when there is one", () => {
    const html = block("what it means");
    expect(html).toContain("what it means");
    expect(html).toContain("Now say what it means, in English.");
  });

  it("with no meaning, shows the English prompt to read and says so", () => {
    const html = block("   ");
    expect(html).toContain("Say hello.");
    expect(html).toContain(
      "You wrote no English meaning, so read the English question instead.",
    );
  });

  it("is wired only for researchers with the flag on, after the lock and before the outputs", () => {
    const src = readFileSync(join(dir, "..", "annotation-interface.tsx"), "utf8");
    expect(src).toContain("useSpeechLayer(researcher)");
    expect(src).toMatch(/if \(speechLayer && coldAnswer\.trim\(\)\) \{\s*setSayIt\(true\);\s*return;/);
    // The block renders inside the locked first step, not in the pairwise step.
    const first = src.indexOf("<SayItBlock");
    expect(first).toBeGreaterThan(src.indexOf('{/* STEP: prompt / cold-authoring'));
    expect(first).toBeLessThan(src.indexOf("{/* STEP: blind pairwise */}"));
    expect(src.match(/<SayItBlock/g)).toHaveLength(1);
  });

  it("the hook asks the server only for researchers", () => {
    const src = sourceOf("use-speech-layer.ts");
    expect(src).toContain("if (!researcher)");
    expect(src).toContain("/api/lab/flags");
  });

  it("clips are attached to the saved answer only after the episode is submitted", () => {
    const src = readFileSync(join(dir, "..", "annotation-interface.tsx"), "utf8");
    const submit = src.indexOf('fetch("/api/annotations/submit"');
    const attach = src.indexOf("attachSpeechClips(task.prompt.promptId)");
    expect(submit).toBeGreaterThan(-1);
    expect(attach).toBeGreaterThan(submit);
  });
});

describe("Listen: language and the provisional speech axes", () => {
  it("shows the language of the pair", () => {
    expect(listen()).toContain("Igala clips");
    expect(
      listen({ task: { ...TASK, language: "english" } }),
    ).toContain("English clips");
  });

  it("shows no axes before a verdict, and none for both unusable", () => {
    expect(listen()).not.toContain('data-testid="speech-axes"');
    expect(listen({ winner: "both_unusable" })).not.toContain(
      'data-testid="speech-axes"',
    );
  });

  it("after a verdict, offers the five axes under the exact provisional label", () => {
    const html = listen({ winner: "a", reasons: ["robotic"] });
    expect(html).toContain('data-testid="speech-axes"');
    // The label is the config's text, with the apostrophe escaped by React.
    expect(html).toContain(AXES_BLOCK_LABEL.replace("'", "&#x27;"));
    expect(AXES_BLOCK_LABEL).toBe(
      "Provisional speech axes, Lydia's rubric layer replaces these",
    );
    for (const axis of SPEECH_AXES) {
      expect(html).toContain(`data-axis="${axis.key}"`);
      expect(html).toContain(`>${axis.label}`);
    }
  });

  it("each axis offers N/A and 0 to 5 as 44px radio buttons, nothing preselected", () => {
    const html = renderToStaticMarkup(
      <SpeechAxesRow winner="b" scores={{}} onScore={noop} />,
    );
    const radios = tagsOf(html, "button");
    expect(radios).toHaveLength(5 * 7);
    for (const r of radios) {
      expect(r).toContain('role="radio"');
      expect(r).toContain('aria-checked="false"');
      expect(classOf(r)).toMatch(/min-h-\[44px\].*min-w-\[44px\]/);
    }
    expect(html).toContain(">N/A<");
    expect(html).toContain("Scored on the winner, clip B.");
  });

  it("marks the chosen scores, and says both clips on a tie", () => {
    const html = renderToStaticMarkup(
      <SpeechAxesRow
        winner="tie"
        scores={{ tone: 3, pace: "na" }}
        onScore={noop}
      />,
    );
    expect(html).toContain("Scored on both clips (a tie).");
    expect(html.match(/aria-checked="true"/g)).toHaveLength(2);
  });

  it("axes are optional: Submit does not wait for them", () => {
    const submit = tagsOf(
      listen({ winner: "a", reasons: ["robotic"] }),
      "button",
    ).find((t) => t.includes('data-testid="submit-button"'))!;
    expect(submit).not.toMatch(DISABLED);
  });

  it("the page sends axes only with a usable verdict", () => {
    const src = sourceOf("listen-interface.tsx");
    expect(src).toContain('winner !== "both_unusable"');
    expect(src).toContain("{ axes }");
  });
});

describe("Recordings: language, take metrics, filters and sort", () => {
  const withQuality = {
    ...ITEM,
    language: "english" as const,
    quality: METRICS,
    flags: ["too_quiet" as const],
  };
  const html = renderToStaticMarkup(
    <RecordingsView
      items={[withQuality]}
      query={DEFAULT_QUERY}
      exporting={false}
      message={null}
      onQuery={noop}
      onFlag={noop}
      onExport={noop}
    />,
  );

  it("shows the language and the take metrics on each card", () => {
    expect(html).toContain("English");
    expect(html).toContain('data-testid="quality-line"');
    expect(html).toContain("level -22 dBFS");
    expect(html).toContain("too quiet");
  });

  it("offers language and take-warning filters and a sort", () => {
    expect(html).toContain('aria-label="Filter by language"');
    expect(html).toContain(">Clipped<");
    expect(html).toContain(">Quietest first<");
  });

  it("says when a clip has no transcript attached", () => {
    const orphan = renderToStaticMarkup(
      <RecordingsView
        items={[{ ...ITEM, answerText: null }]}
        query={DEFAULT_QUERY}
        exporting={false}
        message={null}
        onQuery={noop}
        onFlag={noop}
        onExport={noop}
      />,
    );
    expect(orphan).toContain("No transcript attached.");
  });

  it("builds the list query from the filters, leaving defaults out", () => {
    expect(recordingsQueryString(DEFAULT_QUERY)).toBe("");
    expect(
      recordingsQueryString({
        status: "keep",
        language: "english",
        flag: "clipped",
        sort: "quietest",
      }),
    ).toBe("?status=keep&language=english&flag=clipped&sort=quietest");
  });
});

describe("the session line", () => {
  it("is a polite live region under the Lab header, empty until it loads", () => {
    const html = renderToStaticMarkup(<SessionLine />);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('data-testid="session-line"');
    expect(html).not.toContain("Today:");
  });

  it("the layout renders it under the band", () => {
    const layout = readFileSync(
      join(dir, "..", "..", "app", "(app)", "lab", "speech", "layout.tsx"),
      "utf8",
    );
    expect(layout.indexOf("<SessionLine />")).toBeGreaterThan(
      layout.indexOf("<LabBand />"),
    );
  });
});

describe("busy notification cannot loop (regression, 2026-10-27)", () => {
  const clip = readFileSync(join(__dirname, "record-clip.tsx"), "utf8");
  it("the busy effect depends on `uploading` only and calls through a ref", () => {
    expect(clip).toContain("onBusyChangeRef.current?.(uploading);\n  }, [uploading]);");
    expect(clip).not.toContain("[uploading, onBusyChange]");
  });
  it("both parents keep the same state object when the value is unchanged", () => {
    for (const f of ["record-interface.tsx", "say-it-block.tsx"]) {
      const src = readFileSync(join(__dirname, f), "utf8");
      expect(src, f).toContain("s.igala === b ? s : { ...s, igala: b }");
      expect(src, f).toContain("s.english === b ? s : { ...s, english: b }");
      expect(src, f).not.toContain("setBusy((s) => ({ ...s, igala: b }))");
    }
  });
});
