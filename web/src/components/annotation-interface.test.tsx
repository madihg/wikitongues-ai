import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

// The signed-in role, for the render tests of the Demo switch at the end of
// this file. The structural tests above them read the source and ignore it.
const { sessionRole } = vi.hoisted(() => ({
  sessionRole: { current: "ANNOTATOR" as string | undefined },
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u-1", role: sessionRole.current } },
    status: "authenticated",
  }),
}));

import { AnnotationInterface } from "./annotation-interface";

/**
 * Structural proof of the 2026-08-28 rework (the no-tab flow) at the source
 * level - the interface's first paint is gated on a fetch effect, so like the
 * corrections-interface check in suggesting-editor.test.tsx, the invariants
 * are held against the component source:
 *
 *   1. The whole post-verdict sequence - required loser tags, the suggesting
 *      editor on the chosen output, the explicit "nothing to correct" act,
 *      and the required English rationale - lives INSIDE the pairwise step:
 *      one scrolling page, right after the choice.
 *   2. No modal stacks anywhere in the episode.
 *   3. The sequence's tap targets declare >= 40px heights (house rule).
 *   4. No annotator-facing link to the removed /annotator/corrections tab.
 */

const src = readFileSync(join(__dirname, "annotation-interface.tsx"), "utf8");

/** The JSX of the pairwise step only (verdict -> tags -> fix -> why). */
function pairwiseSlice(): string {
  const start = src.indexOf('{step === "pairwise" && (');
  const end = src.indexOf("STEP: score");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("the post-verdict sequence (one scrolling page)", () => {
  it("tags, the editor on the chosen output, 'nothing to correct', and the rationale all render on the pairwise step", () => {
    const slice = pairwiseSlice();
    // (i) required failure tags beside the losing output
    expect(slice).toContain("lost - why?");
    expect(slice).toContain("(required)");
    // (ii) the suggesting editor on the chosen output + the explicit skip
    expect(slice).toContain("<SuggestingEditor");
    expect(slice).toContain("Nothing to correct");
    // (iii) the English why for corrections
    expect(slice).toContain("Why did you make these corrections?");
  });

  it("the score step no longer carries the winner-correction box (it moved up, not duplicated)", () => {
    const scoreOn = src.slice(src.indexOf("STEP: score"));
    expect(scoreOn).not.toContain("Correct this response");
    expect(scoreOn).not.toContain("The winner has a small fixable error");
  });

  it("no modal stacks anywhere in the episode", () => {
    expect(src).not.toContain('role="dialog"');
    expect(src).not.toContain("aria-modal");
    expect(src).not.toContain("inset-0"); // no full-screen overlay layer
  });

  it("every tappable element of the sequence declares a >= 40px target (or is a padded card)", () => {
    const classAttrs = [
      ...pairwiseSlice().matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g),
    ].map((m) => m[1] ?? m[2]);
    const tappable = classAttrs.filter((c) => c.includes("cursor-pointer"));
    expect(tappable.length).toBeGreaterThan(0);
    for (const cls of tappable) {
      expect(cls, `tappable classes: ${cls}`).toMatch(
        // min-h-10 = 40px chips; min-h-[44px] buttons; p-6 output cards
        // (24px padding around multi-line text is far past the floor).
        /(min-h-10|min-h-\[4[4-9]px\]|\bp-6\b)/,
      );
    }
  });
});

describe("the no-tab flow", () => {
  it("the episode never links annotators to the removed corrections tab", () => {
    expect(src).not.toContain("/annotator/corrections");
  });

  it("the required-act gates are wired into Continue, not just Submit", () => {
    const slice = pairwiseSlice();
    expect(slice).toContain("!tagsOk");
    expect(slice).toContain("!correctionResolved");
  });
});

/**
 * The worked example beside "Why?" (2026-10-13). This repository is public
 * and the example is shown to every annotator, so it must never carry a real
 * Igala answer: the one it had was a frozen-benchmark gold answer, whole. It
 * is schematic now - the slot where the Igala word goes is an English
 * description in square brackets. The proof against the real protected set is
 * scripts/leak-check-files.ts on the component; this holds the shape so a
 * real word cannot be typed back in unnoticed.
 */
describe("the worked example beside 'Why?' is schematic", () => {
  /** The example sentence as the annotator reads it. */
  function whyExample(): string {
    const at = pairwiseSlice().indexOf("Example:</span>");
    expect(at).toBeGreaterThan(-1);
    const m = pairwiseSlice()
      .slice(at)
      .match(/<span className="italic">([\s\S]*?)<\/span>/);
    expect(m).not.toBeNull();
    return m![1].replace(/&apos;/g, "'").replace(/\s+/g, " ").trim();
  }

  it("says what kind of sentence to write, with a bracketed stand-in for the Igala word", () => {
    expect(whyExample()).toBe(
      "In Igala, the word for 'morning' is [the right Igala word].",
    );
  });

  it("quotes nothing but the English gloss: no Igala word is given away", () => {
    const quoted = [...whyExample().matchAll(/'([^']+)'/g)].map((q) => q[1]);
    expect(quoted).toEqual(["morning"]);
    // Whatever stands where the Igala word goes is in square brackets.
    expect(whyExample()).toMatch(/ is \[[^\]]+\]\.$/);
  });
});

/**
 * The Demo switch and the question opened from review (2026-10-12).
 *
 * Annotators are mid-queue while this ships, so the first property is that
 * the page they get is the page they had: no switch, and the same markup.
 * A static render reaches the first paint (the loading state), which is
 * enough to hold the role gate; the behaviour behind the switch lives in
 * src/lib/demo-switch.ts and src/lib/annotate-url.ts with its own tests, and
 * how the component wires them is held against the source, as above.
 */
describe("the Demo switch is a researcher's control", () => {
  const renderAs = (role: string | undefined) => {
    sessionRole.current = role;
    return renderToStaticMarkup(<AnnotationInterface />);
  };

  // The first paint exactly as it was before the switch existed.
  const LOADING_BEFORE =
    '<div class="flex items-center justify-center py-20"><div class="text-sm text-text-tertiary">Loading next annotation task...</div></div>';

  it("an annotator's first paint is byte for byte what it was: no switch", () => {
    expect(renderAs("ANNOTATOR")).toBe(LOADING_BEFORE);
  });

  it("no role, or any role but RESEARCHER, gets no switch either", () => {
    for (const role of [undefined, "LEARNER", "researcher"]) {
      expect(renderAs(role), String(role)).toBe(LOADING_BEFORE);
    }
  });

  it("a researcher gets a real switch: a button, role=switch, aria-checked, labelled Demo", () => {
    const markup = renderAs("RESEARCHER");
    const tag = markup.match(/<button\b[^>]*role="switch"[^>]*>/)?.[0];
    expect(tag).toBeDefined();
    expect(tag).toContain('type="button"');
    // Off until the page has read the URL and the stored choice.
    expect(tag).toContain('aria-checked="false"');
    expect(tag).toContain('aria-describedby="demo-switch-help"');
    expect(markup).toMatch(/<button\b[^>]*role="switch"[^>]*>Demo</);
    // The page under it is unchanged.
    expect(markup.endsWith(LOADING_BEFORE)).toBe(true);
  });

  it("says in one line what the position means, and starts on 'counted'", () => {
    const markup = renderAs("RESEARCHER");
    expect(markup).toContain(
      '<span id="demo-switch-help" class="text-xs text-text-tertiary">Your answers count.</span>',
    );
    expect(markup).not.toContain("Saved as demo, never counted.");
  });

  it("cannot be flipped while a question is loading", () => {
    const tag = renderAs("RESEARCHER").match(
      /<button\b[^>]*role="switch"[^>]*>/,
    )?.[0];
    expect(tag).toContain("disabled");
  });
});

describe("the Demo switch, wired (source)", () => {
  /** The body of one function declared in the component. */
  function fnBody(signature: string): string {
    const start = src.indexOf(signature);
    expect(start, signature).toBeGreaterThan(-1);
    const end = src.indexOf("\n  }\n", start);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
  }

  it("is offered on the role alone, through the shared rule", () => {
    expect(src).toContain(
      "const researcher = canUseDemoSwitch(session?.user?.role);",
    );
    expect(src).toContain("const demoSwitch = researcher ? (");
  });

  it("shows, and submits under, one and the same piece of state", () => {
    // What the switch displays...
    expect(src).toContain("const demoOn = !!demoSessionId;");
    expect(src).toContain("aria-checked={demoOn}");
    // ...is what decides whether the server stores the episode as demo.
    expect(src).toContain("demoSessionId: demoSessionId ?? undefined,");
  });

  it("carries both helper lines and keeps the Demo mode banner's wording", () => {
    expect(src).toContain(
      '{demoOn ? "Saved as demo, never counted." : "Your answers count."}',
    );
    expect(src).toContain('<span className="font-semibold">Demo mode</span>');
    expect(src).toContain(
      "Nothing here is saved to training data or the benchmark - it&apos;s",
    );
  });

  it("the switch and its confirm buttons are >= 44px targets", () => {
    const block = src.slice(
      src.indexOf("const demoSwitch = researcher ? ("),
      src.indexOf(") : null;", src.indexOf("const demoSwitch = researcher")),
    );
    const buttons = [...block.matchAll(/<button[\s\S]*?className="([^"]*)"/g)];
    expect(buttons).toHaveLength(3); // the switch, "Turn demo on/off", "Keep working"
    for (const [, cls] of buttons) {
      expect(cls).toContain("min-h-[44px]");
      expect(cls).toContain("cursor-pointer");
    }
  });

  it("asks before switching only when the episode has input, and asks in the page", () => {
    const request = fnBody("function requestDemo(next: boolean) {");
    expect(request).toContain("const unsaved = episodeHasInput();");
    expect(fnBody("function episodeHasInput(): boolean {")).toContain(
      "episodeHasUnsavedInput({",
    );
    expect(request).toContain("if (unsaved) setDemoConfirm(next);");
    expect(request).toContain("else void applyDemo(next);");
    // In the page: the episode has no modal, and this does not add one.
    expect(src).not.toContain("window.confirm");
    expect(src).not.toContain("confirm(");
  });

  it("in demo, a skip and a flag are not sent at all: the guard sits before the request", () => {
    for (const sig of [
      "async function skipPrompt() {",
      "async function submitFlag() {",
    ]) {
      const body = fnBody(sig);
      const guard = body.indexOf("if (!skipAndFlagAreSent(!!demoSessionId)) {");
      const post = body.indexOf("await fetch(");
      expect(guard, sig).toBeGreaterThan(-1);
      expect(post, sig).toBeGreaterThan(guard);
      expect(body.slice(guard, post), sig).toContain("return;");
    }
  });

  it("Back to my queue asks first when there is work on the page, in the page", () => {
    const back = fnBody("function backToQueue() {");
    expect(back).toContain("if (episodeHasInput()) setLeaveConfirm(true);");
    expect(back).toContain("else leaveForQueue();");
    expect(src).toContain("{pinnedPromptId && leaveConfirm && (");
    expect(src).toContain("Leave this question");
  });

  it("a typed flag reason counts as work on the page", () => {
    expect(fnBody("function episodeHasInput(): boolean {")).toContain(
      "flagReason.trim().length > 0",
    );
  });

  it("turning demo off with work on the page says it will count if submitted", () => {
    expect(src).toContain("and it will count if you submit it.");
  });

  it("hands focus back to the switch after a flip", () => {
    expect(src).toContain("ref={demoSwitchRef}");
    expect(fnBody("async function applyDemo(next: boolean) {")).toContain(
      "refocusDemoSwitch.current = true;",
    );
    expect(src).toContain("demoSwitchRef.current?.focus();");
  });

  it("turning on confirms a session first, then moves URL, state and preference together", () => {
    const apply = fnBody("async function applyDemo(next: boolean) {");
    const on = apply.slice(apply.indexOf("if (next) {"), apply.indexOf("} else {"));
    const off = apply.slice(apply.indexOf("} else {"));
    const order = (body: string, ...parts: string[]) => {
      let at = -1;
      for (const part of parts) {
        const found = body.indexOf(part, at + 1);
        expect(found, part).toBeGreaterThan(at);
        at = found;
      }
    };
    order(
      on,
      "const id = await startDemoSession();",
      "writeDemoPreference(browserStore(), true);",
      "replaceAnnotateSearch({ demo: id });",
      "setDemoSessionId(id);",
    );
    order(
      off,
      "writeDemoPreference(browserStore(), false);",
      "replaceAnnotateSearch({ demo: null });",
      "setDemoSessionId(null);",
      "await fetchNext();",
    );
    // Only `demo` is named in either direction, so a pinned question stays.
    expect(apply).not.toContain("prompt:");
  });

  it("a failed turn-on leaves the page counted and says so", () => {
    const apply = fnBody("async function applyDemo(next: boolean) {");
    const failed = apply.slice(apply.indexOf("} catch {"));
    expect(failed).toContain(
      'setDemoError("Demo could not be turned on. Your answers still count.");',
    );
    expect(failed).not.toContain("setDemoSessionId");
  });

  it("switching never deletes a draft: the own answer survives it as it survives a pair change", () => {
    expect(fnBody("async function applyDemo(next: boolean) {")).not.toContain(
      "clearDraft",
    );
    expect(fnBody("function requestDemo(next: boolean) {")).not.toContain(
      "clearDraft",
    );
    expect(fnBody("function backToQueue() {")).not.toContain("clearDraft");
    // The only removals are still the two in clearDraft itself.
    expect(src.match(/sessionStorage\.removeItem/g)).toHaveLength(2);
  });

  it("on load, settles demo for a researcher BEFORE the first task is asked for", () => {
    const effect = src.slice(
      src.indexOf("const urlDemo = readAnnotateParams(window.location.search).demo;"),
      src.indexOf("}, [fetchNext, researcher, startDemoSession]);"),
    );
    expect(effect).toContain("if (researcher && urlDemo) {");
    expect(effect).toContain("shouldAutoApplyDemo({");
    expect(effect.indexOf("await startDemoSession()")).toBeLessThan(
      effect.indexOf("fetchNext()"),
    );
    // One fetch per load, at the end, whichever branch ran.
    expect(effect.match(/fetchNext\(\)/g)).toHaveLength(1);
  });
});

describe("a question opened from review, wired (source)", () => {
  it("the fetch for the next task is built from the page URL by the shared helper", () => {
    expect(src).toContain(
      "const params = readAnnotateParams(window.location.search);",
    );
    expect(src).toContain("const res = await fetch(nextTaskUrl(params));");
    // The old inline URL building is gone, not kept beside the new one.
    expect(src).not.toContain("/api/annotations/next");
  });

  it("says where the question came from and offers the way back", () => {
    expect(src).toContain("Opened from review:");
    expect(src).toContain("{pinnedPromptId && (");
    expect(src.match(/Back to my queue/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("shows one notice, with demo offered only where the helper says so, when it is not served", () => {
    expect(src).toContain("const notice = pinnedNoticeFor(pinnedNotice.kind);");
    expect(src).toContain("{notice.offerDemo && researcher && (");
    expect(src).toContain("Try it in demo");
  });

  it("a 403 on a pinned question is a notice with the way back, not a retry loop", () => {
    expect(src).toContain("if (res.status === 403 && params.prompt) {");
    expect(src).toContain(
      'setPinnedNotice({ promptId: params.prompt, kind: "forbidden" });',
    );
  });

  it("lets go of the pin after a submit, a skip and a flag, before the next fetch", () => {
    const releases = [...src.matchAll(/clearDraft\(\);\n\s+releasePin\(\);\n\s+await fetchNext\(\);/g)];
    expect(releases).toHaveLength(3);
    expect(src).toContain(
      "if (pinnedPromptId) replaceAnnotateSearch({ prompt: null });",
    );
  });

  it("changes the URL in place, with the null state Next's router expects", () => {
    expect(src).toContain("window.history.replaceState(\n    null,");
    expect(src).not.toContain("window.location.href =");
    expect(src).not.toContain("window.location.assign");
    expect(src).not.toContain("location.reload");
  });
});
