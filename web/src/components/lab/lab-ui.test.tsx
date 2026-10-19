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
import { ListenView, type ListenTask } from "./listen-interface";
import { RecordingsView, type RecordingItem } from "./recordings-interface";
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
  clipA: { id: "clip-a", url: "https://storage.example/a?token=t" },
  clipB: { id: "clip-b", url: "https://storage.example/b?token=t" },
};

const ITEM: RecordingItem = {
  id: "rec-1",
  promptId: "code_001",
  promptText: "Say hello.",
  answerText: "an english stand-in",
  speaker: "spk_0123456789ab",
  dialect: null,
  durationMs: 4200,
  tier: "community_only",
  consentVersion: "2026-10-19-v1",
  reviewStatus: null,
  rightsStatus: "pending",
  url: "https://storage.example/r?token=t",
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
  const html = renderToStaticMarkup(<RecordInterface />);

  it("renders the record button DISABLED before consent is known or given", () => {
    const [button] = tagsOf(html, "button").filter((t) =>
      t.includes('data-testid="record-button"'),
    );
    expect(button).toBeDefined();
    expect(button).toMatch(DISABLED);
  });

  it("tells the visitor why, and shows no tier cards, Save or Keep yet", () => {
    expect(html).toContain("Read and accept the consent above");
    expect(html).not.toContain('name="tier"');
    expect(html).not.toContain('data-testid="save-button"');
    expect(html).not.toContain(">Keep<");
  });

  it("the source enables recording only on granted consent and a locked answer", () => {
    const src = sourceOf("record-interface.tsx");
    expect(src).toContain('const consentOk = consent.status === "granted"');
    expect(src).toMatch(/canRecord =\s*consentOk\s*&&\s*answerReady/);
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
    const src = sourceOf("record-interface.tsx");
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
    expect(sourceOf("record-interface.tsx")).toContain("useState(false)");
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
    expect(sourceOf("record-interface.tsx")).toMatch(
      /if \(!take \|\| !task \|\| tier === null\) return/,
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
    expect(sourceOf("record-interface.tsx")).toContain(
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
      busy={false}
      error={null}
      onWinner={noop}
      onToggleReason={noop}
      onNote={noop}
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
      filter=""
      exporting={false}
      message={null}
      onFilter={noop}
      onFlag={noop}
      onExport={noop}
    />,
  );

  it("shows the pseudonym, tier, consent version and an inline player", () => {
    expect(html).toContain("spk_0123456789ab");
    expect(html).toContain("Community only");
    expect(html).toContain("2026-10-19-v1");
    expect(html).toContain("<audio");
    expect(html).toContain("https://storage.example/r?token=t");
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
        filter=""
        exporting={false}
        message={null}
        onFilter={noop}
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
    expect(sourceOf("record-interface.tsx")).toContain('aria-live="polite"');
    expect(sourceOf("listen-interface.tsx")).toContain('aria-live="polite"');
  });
});
