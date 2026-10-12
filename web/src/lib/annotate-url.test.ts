import { describe, it, expect } from "vitest";
import {
  annotatePromptHref,
  annotateSearchWith,
  nextTaskUrl,
  parsePinned,
  pinnedNoticeFor,
  readAnnotateParams,
  type PinnedNoticeKind,
} from "./annotate-url";

/**
 * The annotate page keeps two things in its URL, `demo` and `prompt`, and
 * every control that touches one must leave the other alone: turning demo on
 * for a question opened from review must not lose the question, and going
 * back to the queue must not drop out of demo.
 */

describe("readAnnotateParams", () => {
  it("reads both parameters from a page query string", () => {
    expect(readAnnotateParams("?demo=d1&prompt=ig_test_002")).toEqual({
      demo: "d1",
      prompt: "ig_test_002",
    });
  });

  it("an absent or empty parameter is null", () => {
    expect(readAnnotateParams("")).toEqual({ demo: null, prompt: null });
    expect(readAnnotateParams("?demo=&prompt=")).toEqual({
      demo: null,
      prompt: null,
    });
    expect(readAnnotateParams("?prompt=%20%20")).toEqual({
      demo: null,
      prompt: null,
    });
  });

  it("decodes an encoded code", () => {
    expect(readAnnotateParams("?prompt=a%2Fb%20c").prompt).toBe("a/b c");
  });
});

describe("nextTaskUrl", () => {
  it("is the bare route with no parameter, as it always was", () => {
    expect(nextTaskUrl({ demo: null, prompt: null })).toBe(
      "/api/annotations/next",
    );
  });

  it("with demo alone is the URL the page built before the pin existed", () => {
    // The previous inline code, kept here as the reference.
    const before = (demo: string) =>
      `/api/annotations/next?demo=${encodeURIComponent(demo)}`;
    for (const demo of ["cmf0demo123", "a b", "x&y=z"]) {
      expect(nextTaskUrl({ demo, prompt: null })).toBe(before(demo));
    }
  });

  it("carries the pinned prompt, alone or beside demo", () => {
    expect(nextTaskUrl({ demo: null, prompt: "ig_test_002" })).toBe(
      "/api/annotations/next?prompt=ig_test_002",
    );
    expect(nextTaskUrl({ demo: "d1", prompt: "ig_test_002" })).toBe(
      "/api/annotations/next?demo=d1&prompt=ig_test_002",
    );
  });

  it("encodes a code so it cannot add a parameter of its own", () => {
    const url = nextTaskUrl({ demo: null, prompt: "x&demo=sneaked" });
    expect(url).toBe("/api/annotations/next?prompt=x%26demo%3Dsneaked");
    expect(new URL(url, "http://test").searchParams.get("demo")).toBeNull();
  });

  it("round-trips: what the page URL holds is what the request carries", () => {
    const page = "?demo=d%201&prompt=ig_test_002";
    const sent = new URL(nextTaskUrl(readAnnotateParams(page)), "http://test");
    expect(sent.searchParams.get("demo")).toBe("d 1");
    expect(sent.searchParams.get("prompt")).toBe("ig_test_002");
  });
});

describe("annotatePromptHref", () => {
  it("points the review drawer at the annotate page with the code", () => {
    expect(annotatePromptHref("ig_test_regis_002")).toBe(
      "/annotator/annotate?prompt=ig_test_regis_002",
    );
  });

  it("URL-encodes the code", () => {
    expect(annotatePromptHref("a b&c/d")).toBe(
      "/annotator/annotate?prompt=a%20b%26c%2Fd",
    );
    expect(
      readAnnotateParams(annotatePromptHref("a b&c/d").split("?")[1]).prompt,
    ).toBe("a b&c/d");
  });
});

describe("annotateSearchWith", () => {
  it("adds demo and keeps the pinned prompt", () => {
    expect(annotateSearchWith("?prompt=ig_test_002", { demo: "d1" })).toBe(
      "?prompt=ig_test_002&demo=d1",
    );
  });

  it("removes demo and keeps the pinned prompt", () => {
    expect(
      annotateSearchWith("?demo=d1&prompt=ig_test_002", { demo: null }),
    ).toBe("?prompt=ig_test_002");
  });

  it("removes the pinned prompt and keeps demo", () => {
    expect(
      annotateSearchWith("?demo=d1&prompt=ig_test_002", { prompt: null }),
    ).toBe("?demo=d1");
  });

  it("replaces a demo id rather than adding a second one", () => {
    expect(annotateSearchWith("?demo=old", { demo: "new" })).toBe("?demo=new");
  });

  it("returns an empty string when nothing is left", () => {
    expect(annotateSearchWith("?demo=d1", { demo: null })).toBe("");
    expect(annotateSearchWith("", { prompt: null })).toBe("");
  });

  it("leaves parameters it does not own where they are", () => {
    expect(
      annotateSearchWith("?utm=x&demo=d1&prompt=p", { demo: null }),
    ).toBe("?utm=x&prompt=p");
  });

  it("a key that is not named is not touched, even by an undefined value", () => {
    expect(annotateSearchWith("?demo=d1&prompt=p", {})).toBe(
      "?demo=d1&prompt=p",
    );
  });
});

describe("parsePinned", () => {
  it("accepts each status the route answers with", () => {
    for (const status of [
      "served",
      "already_judged",
      "skipped",
      "not_in_queue",
    ]) {
      expect(parsePinned({ promptId: "ig_test_002", status })).toEqual({
        promptId: "ig_test_002",
        status,
      });
    }
  });

  it("is null for no pin, a malformed pin, or a status it does not know", () => {
    expect(parsePinned(undefined)).toBeNull();
    expect(parsePinned(null)).toBeNull();
    expect(parsePinned("served")).toBeNull();
    expect(parsePinned({ status: "served" })).toBeNull();
    expect(parsePinned({ promptId: 7, status: "served" })).toBeNull();
    expect(parsePinned({ promptId: "p", status: "something_new" })).toBeNull();
  });
});

describe("pinnedNoticeFor", () => {
  const KINDS: PinnedNoticeKind[] = [
    "already_judged",
    "skipped",
    "not_in_queue",
    "forbidden",
  ];

  it("gives every reason a plain sentence", () => {
    for (const kind of KINDS) {
      const { message } = pinnedNoticeFor(kind);
      expect(message.length, kind).toBeGreaterThan(20);
      expect(message.endsWith("."), kind).toBe(true);
      // House style: no em dash in anything a person reads.
      expect(message, kind).not.toContain(String.fromCharCode(0x2014));
    }
  });

  it("offers demo for a judged question only, the one case demo would serve", () => {
    expect(pinnedNoticeFor("already_judged").offerDemo).toBe(true);
    expect(pinnedNoticeFor("skipped").offerDemo).toBe(false);
    expect(pinnedNoticeFor("not_in_queue").offerDemo).toBe(false);
    expect(pinnedNoticeFor("forbidden").offerDemo).toBe(false);
  });

  it("says nothing about WHY a question is not in the queue (a frozen one reads like an unknown one)", () => {
    const { message } = pinnedNoticeFor("not_in_queue");
    expect(message).not.toMatch(/frozen|exam|held|benchmark|holdout/i);
  });
});
