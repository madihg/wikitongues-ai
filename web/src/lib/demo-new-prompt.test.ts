import { describe, expect, it } from "vitest";
import {
  annotateSearchWith,
  nextTaskUrl,
  readAnnotateParams,
  startAfter,
} from "./annotate-url";
import {
  DEMO_PREFERENCE_KEY,
  demoStartsOn,
  readDemoPreference,
  type KeyValueStore,
} from "./demo-switch";

/**
 * Demo ignores history, so before "New prompt" every load of a demo page
 * served the same first question. These hold the two rules that fix it, and
 * the rule for who starts in demo.
 */
const queue = ["a", "b", "c"].map((promptId) => ({ promptId }));
const ids = (rows: { promptId: string }[]) => rows.map((r) => r.promptId);

function storeWith(value: string | null): KeyValueStore {
  return {
    getItem: (key) => (key === DEMO_PREFERENCE_KEY ? value : null),
    setItem: () => {},
  };
}

describe("startAfter", () => {
  it("starts the queue after the question on screen, and wraps", () => {
    expect(ids(startAfter(queue, "a"))).toEqual(["b", "c", "a"]);
    expect(ids(startAfter(queue, "c"))).toEqual(["a", "b", "c"]);
  });

  it("leaves the order alone for a missing or unknown id", () => {
    expect(ids(startAfter(queue, null))).toEqual(["a", "b", "c"]);
    expect(ids(startAfter(queue, ""))).toEqual(["a", "b", "c"]);
    expect(ids(startAfter(queue, "zzz"))).toEqual(["a", "b", "c"]);
  });
});

describe("the after parameter", () => {
  it("is sent only with demo, and never with a pinned prompt", () => {
    expect(nextTaskUrl({ demo: "d1", prompt: null, after: "a" })).toBe(
      "/api/annotations/next?demo=d1&after=a",
    );
    expect(nextTaskUrl({ demo: null, prompt: null, after: "a" })).toBe(
      "/api/annotations/next",
    );
    expect(nextTaskUrl({ demo: "d1", prompt: "p", after: "a" })).toBe(
      "/api/annotations/next?demo=d1&prompt=p",
    );
  });

  it("survives a reload: it is read back from the page address", () => {
    const search = annotateSearchWith("?demo=d1", { after: "a" });
    expect(readAnnotateParams(search)).toEqual({
      demo: "d1",
      prompt: null,
      after: "a",
    });
  });
});

describe("who starts in demo", () => {
  it("only the owner, and only when nothing is stored", () => {
    expect(demoStartsOn("madihalim@gmail.com")).toBe(true);
    expect(demoStartsOn("someone@wikitongues.org")).toBe(false);
    expect(demoStartsOn(null)).toBe(false);
    expect(readDemoPreference(storeWith(null), true)).toBe(true);
    expect(readDemoPreference(storeWith(null))).toBe(false);
  });

  it("a stored choice always wins over the default", () => {
    expect(readDemoPreference(storeWith("0"), true)).toBe(false);
    expect(readDemoPreference(storeWith("1"), false)).toBe(true);
  });
});
