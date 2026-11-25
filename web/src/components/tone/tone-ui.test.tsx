import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OtherChanges,
  ToneEmpty,
  ToneView,
  TONE_COPY,
  type ToneViewProps,
} from "./tone-interface";
import { MarkedVersion, ToneItemCard, ToneSummaryTables } from "./tone-admin";
import { probeToneCount } from "./use-tone-count";
import TonePassPage from "@/app/(app)/annotator/tone/page";
import { WORK_LINE } from "@/lib/work-flow";
import { navForRole } from "@/lib/personas";
import { summarise } from "@/lib/tone/agreement";

/**
 * The Pass 2 screen and the researcher's view, held by their markup.
 * Invented non-words; marks are explicit escapes (\u0301 acute, \u0300
 * grave, \u0323 dot below).
 */

const H = "\u0301";
const L = "\u0300";
const DOT = "\u0323";
const FIRST = `babe ke${DOT} du`;
const noop = () => {};

const view = (over: Partial<ToneViewProps> = {}) =>
  renderToStaticMarkup(
    <ToneView
      task={{
        itemId: "i1",
        promptText: "A test question?",
        firstVersion: FIRST,
        mine: null,
      }}
      text={FIRST}
      unsure={[]}
      unsureOpen={false}
      note=""
      warning={false}
      busy={false}
      error={null}
      hasPrevious={false}
      onText={noop}
      onToggleUnsureOpen={noop}
      onToggleUnsure={noop}
      onNote={noop}
      onUndo={noop}
      onKeep={noop}
      onEditPrevious={noop}
      onSkip={noop}
      onSave={noop}
      {...over}
    />,
  );

function place(markup: string, name: "left" | "middle" | "right"): string {
  const order = ["left", "middle", "right"];
  const start = markup.indexOf(`data-footer-place="${name}"`);
  const next = order[order.indexOf(name) + 1];
  const end = next
    ? markup.indexOf(`data-footer-place="${next}"`, start)
    : markup.length;
  return markup.slice(start, end);
}

describe("the Pass 2 screen", () => {
  it("the old page opens the Tone marks tab of Annotate, which carries the instruction word for word", () => {
    // Pass 2 moved into the one Annotate flow on 2026-11-24.
    expect(() => TonePassPage()).toThrow(/NEXT_REDIRECT/);
    try {
      TonePassPage();
    } catch (e) {
      expect(String((e as { digest?: string }).digest)).toContain(
        "/annotator/annotate?work=tone",
      );
    }
    expect(WORK_LINE.tone).toBe(
      "Pass 2: add tone marks. This is a second pass over answers that are already done. Some are yours, some are from other people. Add tone marks only. The first version stays saved.",
    );
  });

  it("shows the prompt, the first version read-only, and an editable copy filled with it", () => {
    const m = view();
    expect(m).toContain("A test question?");
    expect(m).toContain("First version");
    expect(m).toMatch(/<p data-testid="tone-first-version"[^>]*>babe k/);
    expect(m).toContain("Add the tone marks here");
    const boxes = m.match(/<textarea[^>]*>[^<]*<\/textarea>/g) ?? [];
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toContain('id="tone-box"');
    // filled with the first version exactly as it is
    expect(boxes[0]).toContain(FIRST);
  });

  it("the tone keyboard is the same component, right under the box", () => {
    const m = view();
    const box = m.indexOf('id="tone-box"');
    const keys = m.indexOf('aria-label="Igala tone keyboard"');
    expect(box).toBeGreaterThan(-1);
    expect(keys).toBeGreaterThan(box);
    expect(m.slice(box, keys)).not.toContain("<label");
  });

  it("the footer bar: Edit previous, Skip this one, Save & next, in their places", () => {
    const m = view({ hasPrevious: true });
    expect(place(m, "left")).toContain("Edit previous");
    expect(place(m, "middle")).toContain("Skip this one");
    expect(place(m, "right")).toContain("Save &amp; next");
    expect(place(m, "right")).toContain('data-testid="tone-save"');
    // with nothing saved before, the left place is empty and the others stay
    const first = view({ hasPrevious: false });
    expect(place(first, "left")).not.toContain("<button");
    expect(place(first, "middle")).toContain("Skip this one");
  });

  it("I am not sure about a word: a tick box, then every word as a 44 px button", () => {
    const group = 'aria-label="Pick the word you are not sure about"';
    const closed = view();
    expect(closed).toContain("I am not sure about a word");
    expect(closed).not.toContain(group);
    const open = view({ unsureOpen: true, unsure: [1] });
    const words = open.slice(
      open.indexOf(group),
      open.indexOf('for="tone-note"'),
    );
    const chips = [
      ...words.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>/g),
    ];
    expect(chips.map((c) => c[1])).toEqual(["false", "true", "false"]);
    expect(chips.every((c) => c[0].includes("min-h-[44px]"))).toBe(true);
  });

  it("the warning has the brief's two buttons and shows what else changed", () => {
    const m = view({ warning: true, text: `ba${H}be ko du` });
    expect(m).toContain('data-testid="tone-warning"');
    expect(m).toContain("Undo the other changes");
    expect(m).toContain("Keep it and flag it as a correction");
    expect(view()).not.toContain('data-testid="tone-warning"');
  });

  it("what else changed is shown with tone taken out of both sides", () => {
    const m = renderToStaticMarkup(
      <OtherChanges firstVersion={FIRST} text={`ba${H}be ko du${L}`} />,
    );
    // the tone marks on the unchanged words are not a difference
    expect(m).toMatch(/<span>babe <\/span>/);
    expect(m).toMatch(/line-through[^>]*>k[^<]*<\/span>/);
    expect(m).toMatch(/text-success[^>]*>ko<\/span>/);
  });

  it("never says who wrote the first version or who else marks it", () => {
    const m = view({ hasPrevious: true, unsureOpen: true }).toLowerCase();
    for (const word of [
      "annotator",
      "author",
      "written by",
      "marker",
      "agree",
    ]) {
      expect(m, word).not.toContain(word);
    }
  });

  it("the empty state", () => {
    expect(renderToStaticMarkup(<ToneEmpty />)).toContain(TONE_COPY.empty);
    expect(TONE_COPY.empty).toBe("No answers to mark right now.");
  });
});

describe("the Pass 2 screen, wired (source)", () => {
  const src = readFileSync(join(__dirname, "tone-interface.tsx"), "utf8");

  it("runs the tone-only guard before anything is sent", () => {
    const save = src.slice(src.indexOf("const save = () => {"));
    const guard = save.indexOf("isToneOnlyChange(task.firstVersion, text)");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(save.indexOf("void send(false)"));
  });

  it("the server's own guard also opens the warning", () => {
    expect(src).toContain(
      'res.status === 409 && j?.code === "non_tone_change"',
    );
  });

  it("Undo puts the first version's words back and keeps the new marks; Keep sends the flag", () => {
    expect(src).toContain("setText(projectToneOnto(task.firstVersion, text))");
    expect(src).toContain("onKeep={() => void send(true)}");
  });

  it("Edit previous reopens the item saved last, never the one on screen", () => {
    expect(src).toContain(
      "hasPrevious={lastSaved !== null && lastSaved.id !== task.itemId}",
    );
    expect(src).toContain(
      "onEditPrevious={() => lastSaved && void fetchTask(lastSaved.id)}",
    );
    expect(src).toContain('lastSavedKey("tone")');
  });

  it("skipping a reopened item sends nothing: it is already saved", () => {
    const skip = src.slice(src.indexOf("const skip = async"));
    expect(skip.indexOf("if (!load.reopened)")).toBeLessThan(
      skip.indexOf("/api/annotator/tone/skip"),
    );
  });

  it("the screen cannot pull the database into the browser", () => {
    expect(src).not.toMatch(/import \{[^}]*\} from "@\/lib\/tone\/tone-pass"/);
    expect(src).toContain(
      'import type { ToneTask } from "@/lib/tone/tone-pass"',
    );
  });
});

describe("the sidebar line", () => {
  const labels = (links: { label: string; count?: number }[]) =>
    links.map((l) =>
      l.count === undefined ? l.label : `${l.label} (${l.count})`,
    );

  it("is absent until the person has been given tone items", () => {
    for (const role of ["ANNOTATOR", "RESEARCHER"]) {
      expect(labels(navForRole(role, null))).not.toContain(
        "Pass 2: tone marks",
      );
      expect(
        labels(navForRole(role, null, { tone: null })).join("|"),
      ).not.toContain("Pass 2");
    }
  });

  it("is never its own line: tone items given to a person count on Annotate, where the Tone marks tab is", () => {
    // Pass 2 moved into the one Annotate flow on 2026-11-24.
    const annotator = labels(navForRole("ANNOTATOR", null, { tone: 30 }));
    expect(annotator).toEqual(["Dashboard", "Annotate (30)", "My Work", "Rubric"]);
    for (const role of ["ANNOTATOR", "RESEARCHER"]) {
      const withSpeech = labels(
        navForRole(role, null, {
          lab: true,
          tone: 4,
          waiting: { annotate: 2, speech: 7 },
        }),
      );
      expect(withSpeech.slice(0, 4), role).toEqual([
        "Dashboard",
        "Annotate (13)",
        "My Work",
        "Rubric",
      ]);
    }
    // Every item marked: no number from tone.
    expect(labels(navForRole("RESEARCHER", null, { tone: 0 }))).toContain("Annotate");
  });

  it("the count is what waits; nothing given yet, or any failure, shows no line", async () => {
    const answer = (body: unknown, ok = true) =>
      (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
    expect(await probeToneCount(answer({ waiting: 30, done: 0 }))).toBe(30);
    expect(await probeToneCount(answer({ waiting: 0, done: 12 }))).toBe(0);
    expect(await probeToneCount(answer({ waiting: 0, done: 0 }))).toBeNull();
    expect(await probeToneCount(answer({}, false))).toBeNull();
    expect(
      await probeToneCount((async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch),
    ).toBeNull();
  });
});

describe("the researcher's view", () => {
  const versions = [
    { annotatorId: "m1", text: `ba${H}be${L}` },
    { annotatorId: "m2", text: `ba${L}be${L}` },
  ];
  const data = {
    summary: summarise([
      { itemId: "i1", cells: ["homograph:zzz"], required: 2, versions },
    ]),
    names: { m1: "Marker One", m2: "Marker Two" },
    assigned: 2,
    skipped: 0,
    items: [
      {
        itemId: "i1",
        setName: "tone-set-v1",
        cells: ["homograph:zzz"],
        required: 2,
        status: "needs_third" as const,
        firstVersion: "babe",
        versions: versions.map((v) => ({
          ...v,
          flagged: false,
          flagText: null,
          unsureWords: [],
          note: null,
        })),
        differing: [1],
        agreed: null,
      },
    ],
  };

  it("marks the letters whose tone the markers disagree on, and only those", () => {
    const m = renderToStaticMarkup(
      <MarkedVersion text={`ba${H}be${L}`} differing={[1]} />,
    );
    expect(m.match(/<mark/g)).toHaveLength(1);
    expect(m).toMatch(/<mark[^>]*>\u00E1<\/mark>/);
  });

  it("shows items per marker, each pair with its kappa, each cell, and the homograph family", () => {
    const m = renderToStaticMarkup(<ToneSummaryTables data={data} />);
    expect(m).toContain("Items done per marker");
    expect(m).toContain("Marker One and Marker Two");
    expect(m).toContain("Cohen&#x27;s kappa");
    expect(m).toContain("Fleiss&#x27; kappa over");
    expect(m).toContain("homograph:zzz");
    expect(m).toContain("not agreed yet, first version shown");
    expect(m).toContain("Needs a third marker");
  });

  it("an item card puts the versions side by side under the first version", () => {
    const m = renderToStaticMarkup(
      <ToneItemCard item={data.items[0]} names={data.names} />,
    );
    expect(m).toContain("First version");
    expect(m.indexOf("Marker One")).toBeLessThan(m.indexOf("Marker Two"));
    expect(m.match(/<mark/g)).toHaveLength(2);
    // without the decide handler there is no form
    expect(m).not.toContain("<textarea");
  });
});
