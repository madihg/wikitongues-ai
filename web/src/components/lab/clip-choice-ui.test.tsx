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

import {
  CLIP_CHOICE_NOTE,
  ClipChoiceCard,
  ClipChoiceChange,
  ClipChoiceLine,
  YourClipsView,
} from "./tier-default";
import { TierChoice, VoiceCloningOptIn } from "./record-parts";

/**
 * Story C1: the clip choice is asked once, straight after consent, and
 * remembered. These prove the screen half: the same three cards and words,
 * nothing preselected, the quiet line with Change, and that the per-clip
 * invariants of lab-ui.test.tsx still hold. Fixtures are synthetic English.
 */

const dir = __dirname;
const sourceOf = (f: string) => readFileSync(join(dir, f), "utf8");
const noop = () => {};
const DISABLED = /\sdisabled=""/;
const CHECKED = /\schecked=""/;
function tagsOf(html: string, name: string): string[] {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "g"))].map(
    (m) => m[0],
  );
}
const classOf = (tag: string) => /class="([^"]*)"/.exec(tag)?.[1] ?? "";
const TARGET = /min-h-\[44px\]|\bh-14\b/;

describe("the clip choice card, asked once after consent", () => {
  const html = renderToStaticMarkup(
    <ClipChoiceCard
      licensedAllowed
      cloningAllowed
      busy={false}
      error={null}
      onSave={noop}
    />,
  );

  it("asks about your clips, with the three cards and words the speaker has seen", () => {
    expect(html).toContain("What happens to your clips? (choose one)");
    expect(html).not.toContain("What happens to this clip?");
    for (const text of [
      "Stays with my community",
      "Only used inside the Igala tools. Never shared.",
      "Licensed to AI labs",
      "Shared under a signed contract. You are paid a share. You can withdraw later.",
      "Open to everyone",
      "Published under CC-BY 4.0. Permanent once published.",
    ]) {
      expect(html, text).toContain(text);
    }
    // Community first, Open last: the order she knows, never Open first.
    expect(html.indexOf("Stays with my community")).toBeLessThan(
      html.indexOf("Licensed to AI labs"),
    );
    expect(html.indexOf("Licensed to AI labs")).toBeLessThan(
      html.indexOf("Open to everyone"),
    );
  });

  it("preselects nothing: three unchecked radios and an unchecked voice box", () => {
    const inputs = tagsOf(html, "input");
    expect(inputs).toHaveLength(4);
    for (const i of inputs) expect(i).not.toMatch(CHECKED);
    expect(inputs.filter((i) => i.includes('type="radio"'))).toHaveLength(3);
  });

  it("Save my choice is off until one card is picked", () => {
    const save = tagsOf(html, "button").find((t) =>
      t.includes('data-testid="save-choice-button"'),
    )!;
    expect(save).toMatch(DISABLED);
    expect(html).toContain(">Save my choice<");
    const src = sourceOf("tier-default.tsx");
    expect(src).toContain("disabled={tier === null || busy}");
    expect(src).not.toMatch(/defaultChecked/);
    expect(src).not.toMatch(/setTier\(\s*["']/); // no code path sets a literal tier
    expect(src).not.toMatch(/useState<Tier \| null>\(\s*["']/);
  });

  it("carries the voice copy wording for all clips, and the note", () => {
    expect(html).toContain(
      "Also allow a synthetic copy of my voice to be made from my clips.",
    );
    expect(html).toContain(CLIP_CHOICE_NOTE);
    expect(CLIP_CHOICE_NOTE).toBe(
      "We will use this for every clip you save. You can change it at any time, for one clip or for all of them.",
    );
  });

  it("greys a choice the consent answers do not allow, with the existing line", () => {
    const blocked = renderToStaticMarkup(
      <ClipChoiceCard
        licensedAllowed={false}
        cloningAllowed={false}
        busy={false}
        error={null}
        onSave={noop}
      />,
    );
    const licensed = tagsOf(blocked, "input").find((t) =>
      t.includes('value="licensed"'),
    )!;
    expect(licensed).toMatch(DISABLED);
    expect(blocked).toContain("Your consent answers do not allow licensing.");
    expect(blocked).toContain("Your consent answers do not allow voice cloning.");
  });

  it("when changing, starts on the speaker's own earlier choice and offers Cancel", () => {
    const changing = renderToStaticMarkup(
      <ClipChoiceCard
        licensedAllowed
        cloningAllowed
        busy={false}
        error={null}
        initial={{ tier: "community_only", voiceCloning: false }}
        onCancel={noop}
        onSave={noop}
      />,
    );
    const checked = tagsOf(changing, "input").filter((t) => CHECKED.test(t));
    expect(checked).toHaveLength(1);
    expect(checked[0]).toContain('value="community_only"');
    expect(changing).toContain(">Cancel<");
    expect(html).not.toContain(">Cancel<");
  });

  it("shows a save error in an alert", () => {
    const failed = renderToStaticMarkup(
      <ClipChoiceCard
        licensedAllowed
        cloningAllowed
        busy={false}
        error="Could not save your choice. Try again."
        onSave={noop}
      />,
    );
    expect(failed).toMatch(/role="alert"[^>]*>Could not save your choice/);
  });
});

describe("the quiet line on a clip", () => {
  it("reads 'This clip: Stays with my community.' with a Change link and no cards", () => {
    const html = renderToStaticMarkup(
      <ClipChoiceLine
        choice={{ tier: "community_only", voiceCloning: false }}
        onChange={noop}
      />,
    );
    expect(html.replace(/<[^>]+>/g, "")).toBe(
      "This clip: Stays with my community.Change",
    );
    expect(html).toContain('data-testid="clip-choice-change"');
    expect(tagsOf(html, "input")).toHaveLength(0);
  });

  it("names each choice by its card title, and says so when a voice copy is allowed", () => {
    for (const [tier, title] of [
      ["licensed", "Licensed to AI labs"],
      ["open", "Open to everyone"],
    ] as const) {
      expect(
        renderToStaticMarkup(
          <ClipChoiceLine choice={{ tier, voiceCloning: false }} onChange={noop} />,
        ),
      ).toContain(title);
    }
    expect(
      renderToStaticMarkup(
        <ClipChoiceLine
          choice={{ tier: "open", voiceCloning: true }}
          onChange={noop}
        />,
      ),
    ).toContain("A synthetic copy of my voice may be made.");
  });
});

describe("Change on a clip", () => {
  const html = renderToStaticMarkup(
    <ClipChoiceChange
      name="tier-igala"
      current={{ tier: "community_only", voiceCloning: false }}
      licensedAllowed
      cloningAllowed
      busy={false}
      error={null}
      onOnlyThis={noop}
      onAll={noop}
      onCancel={noop}
    />,
  );

  it("opens the same three cards, about this clip, in the clip's own radio group", () => {
    expect(html).toContain("What happens to this clip? (choose one)");
    const radios = tagsOf(html, "input").filter((t) => t.includes('type="radio"'));
    expect(radios).toHaveLength(3);
    for (const r of radios) expect(r).toContain('name="tier-igala"');
  });

  it("has the two buttons, in the spec's words", () => {
    expect(html).toContain(">Only this clip<");
    expect(html).toContain(">All my clips from now on<");
  });

  it("neither button works until a card is picked", () => {
    const none = renderToStaticMarkup(
      <ClipChoiceChange
        name="tier-igala"
        current={null}
        licensedAllowed
        cloningAllowed
        busy={false}
        error={null}
        onOnlyThis={noop}
        onAll={noop}
        onCancel={noop}
      />,
    );
    for (const id of ["choice-only-this", "choice-all"]) {
      const b = tagsOf(none, "button").find((t) => t.includes(`data-testid="${id}"`))!;
      expect(b, id).toMatch(DISABLED);
    }
  });
});

describe("RecordClip with a remembered choice", () => {
  const src = sourceOf("record-clip.tsx");

  it("shows the line instead of the cards once a choice is remembered", () => {
    expect(src).toMatch(/rememberedChoice === null \? \(\s*<>\s*<TierChoice/);
    expect(src).toContain("<ClipChoiceLine");
    expect(src).toContain("<ClipChoiceChange");
  });

  it("Save is ready after Keep: the tier comes from the remembered choice", () => {
    expect(src).toContain("const choice = resolveClipChoice(");
    expect(src).toMatch(
      /const tier: Tier \| null = studio \? STUDIO_TIER : \(choice\?\.tier \?\? null\)/,
    );
    // Save stays off while the Change panel is open, so a half-made change is never saved.
    expect(src).toContain("tier={changing ? null : tier}");
  });

  it("still starts with no tier of its own and still refuses to save without one", () => {
    expect(src).toContain("useState<Tier | null>(null)");
    expect(src).toMatch(/if \(!take \|\| tier === null\) return/);
    expect(src).not.toMatch(/setTier\(\s*["']/);
    expect(src).not.toMatch(/rememberedChoice\s*=\s*\{/); // the default prop is null, never a tier
    expect(src).toContain("rememberedChoice = null,");
  });

  it("Only this clip sets this clip alone; All my clips goes through the parent's save", () => {
    expect(src).toMatch(
      /onOnlyThis=\{\(c\) => \{\s*setTier\(c\.tier\);\s*setVoiceCloning\(c\.voiceCloning\);/,
    );
    const only = src.slice(src.indexOf("onOnlyThis="), src.indexOf("onAll="));
    expect(only).not.toContain("onRememberChoice");
    expect(src).toContain("void onRememberChoice(c).then((ok) => {");
  });

  it("a new take forgets the last clip's own choice", () => {
    const drop = src.slice(src.indexOf("const dropTake"), src.indexOf("const canRecord"));
    expect(drop).toContain("setTier(null)");
    expect(drop).toContain("setChanging(false)");
  });

  it("voice cloning is sent only when chosen AND allowed by consent", () => {
    expect(src).toContain(
      "const cloningOptIn = !studio && choice?.voiceCloning === true && cloningAllowed;",
    );
    expect(src).toContain("voiceCloningOptIn: cloningOptIn,");
  });
});

describe("the pages ask once, after consent, and gate recording on the answer", () => {
  for (const f of ["record-interface.tsx", "say-it-block.tsx"]) {
    it(`${f}: the card shows only when consent is granted and no choice is remembered`, () => {
      const src = sourceOf(f);
      expect(src).toContain(
        'const choiceNeeded = consentOk && clipChoice.status === "needed";',
      );
      expect(src).toMatch(/\{choiceNeeded && \(\s*<ClipChoiceCard/);
      // After the consent gate in the markup: consent first, then the choice.
      expect(src.indexOf("<ClipChoiceCard")).toBeGreaterThan(
        src.indexOf("<ConsentGate"),
      );
      expect(src).toContain("rememberedChoice={rememberedChoice}");
      expect(src).toContain("onRememberChoice={saveClipChoice}");
    });
  }

  it("a speaker who has not chosen cannot record, so cannot save", () => {
    expect(sourceOf("record-interface.tsx")).toContain(
      "Choose what happens to your clips above to turn recording on.",
    );
    expect(sourceOf("say-it-block.tsx")).toContain(
      "Choose what happens to your clips to turn recording on, or skip.",
    );
  });

  it("the hook asks again after a new consent, and falls back to per-clip cards if the server cannot say", () => {
    const hook = sourceOf("use-lab-consent.ts");
    expect(hook).toContain('"/api/lab/speech/clip-choice"');
    const accept = hook.slice(hook.indexOf("const accept"), hook.indexOf("const saveClipChoice"));
    expect(accept).toContain('{ status: "needed" }');
    expect(hook).toContain('setClipChoice({ status: "unavailable" })');
    for (const f of ["record-interface.tsx", "say-it-block.tsx"]) {
      expect(sourceOf(f), f).toContain(
        'clipChoice.status === "set" ? clipChoice.choice : null',
      );
    }
  });
});

describe("Profile: Your clips", () => {
  const view = (
    state: Parameters<typeof YourClipsView>[0]["state"],
    changing = false,
  ) =>
    renderToStaticMarkup(
      <YourClipsView
        state={state}
        licensedAllowed
        cloningAllowed
        busy={false}
        error={null}
        changing={changing}
        onChange={noop}
        onCancel={noop}
        onSave={noop}
      />,
    );

  it("shows the current choice and Change", () => {
    const html = view({
      status: "set",
      choice: { tier: "community_only", voiceCloning: false },
    });
    expect(html).toContain(">Your clips<");
    expect(html.replace(/<[^>]+>/g, "")).toContain(
      "Your clips: Stays with my community.Change",
    );
    expect(tagsOf(html, "input")).toHaveLength(0);
  });

  it("Change opens the same card, starting on the current choice", () => {
    const html = view(
      { status: "set", choice: { tier: "open", voiceCloning: false } },
      true,
    );
    expect(html).toContain("What happens to your clips? (choose one)");
    const checked = tagsOf(html, "input").filter((t) => CHECKED.test(t));
    expect(checked).toHaveLength(1);
    expect(checked[0]).toContain('value="open"');
  });

  it("asks with nothing preselected when no choice is remembered", () => {
    const html = view({ status: "needed" });
    expect(html).toContain('data-testid="clip-choice-card"');
    for (const i of tagsOf(html, "input")) expect(i).not.toMatch(CHECKED);
  });

  it("before consent it only says where the choice is made", () => {
    const html = view({ status: "no_consent" });
    expect(html).toContain("when you first record");
    expect(tagsOf(html, "input")).toHaveLength(0);
  });

  it("the Profile page renders it under the form", () => {
    const page = readFileSync(
      join(dir, "..", "..", "app", "(app)", "speak", "profile", "page.tsx"),
      "utf8",
    );
    expect(page.indexOf("<YourClips />")).toBeGreaterThan(
      page.indexOf("<ProfileForm />"),
    );
  });
});

describe("the per-clip cards keep their words", () => {
  it("TierChoice still asks about this clip unless told otherwise", () => {
    const html = renderToStaticMarkup(
      <TierChoice value={null} onChange={noop} licensedAllowed />,
    );
    expect(html).toContain("What happens to this clip? (choose one)");
    const box = renderToStaticMarkup(
      <VoiceCloningOptIn checked={false} allowed onChange={noop} />,
    );
    expect(box).toContain(
      "Also allow a synthetic copy of my voice to be made from this clip.",
    );
  });
});

describe("44px targets on the new pieces", () => {
  it("every button and every card label is at least 44px", () => {
    const html = [
      renderToStaticMarkup(
        <ClipChoiceCard
          licensedAllowed
          cloningAllowed
          busy={false}
          error={null}
          onCancel={noop}
          onSave={noop}
        />,
      ),
      renderToStaticMarkup(
        <ClipChoiceLine
          choice={{ tier: "open", voiceCloning: false }}
          onChange={noop}
        />,
      ),
      renderToStaticMarkup(
        <ClipChoiceChange
          name="tier-igala"
          current={null}
          licensedAllowed
          cloningAllowed
          busy={false}
          error={null}
          onOnlyThis={noop}
          onAll={noop}
          onCancel={noop}
        />,
      ),
    ].join("\n");
    const buttons = tagsOf(html, "button");
    expect(buttons.length).toBeGreaterThan(5);
    for (const b of buttons) expect(classOf(b), b.slice(0, 100)).toMatch(TARGET);
    for (const l of tagsOf(html, "label")) {
      expect(classOf(l), l.slice(0, 100)).toMatch(TARGET);
    }
  });
});
