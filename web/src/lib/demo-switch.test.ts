import { describe, it, expect, vi } from "vitest";
import {
  DEMO_FLAG_NOT_SAVED,
  DEMO_SKIP_NOT_SAVED,
  DEMO_PREFERENCE_KEY,
  DEMO_SESSION_KEY,
  DEMO_SESSIONS_PATH,
  browserStore,
  canUseDemoSwitch,
  createDemoSession,
  demoSessionLabel,
  ensureDemoSession,
  episodeHasUnsavedInput,
  listDemoSessionIds,
  readDemoPreference,
  readRememberedSession,
  rememberSession,
  shouldAutoApplyDemo,
  skipAndFlagAreSent,
  writeDemoPreference,
  type EpisodeInput,
  type Fetcher,
  type KeyValueStore,
} from "./demo-switch";

/**
 * The Demo switch decides whether a researcher's episode is counted, so the
 * rules that matter are held here without a browser: which demo session it
 * works under (the remembered one only if the server still lists it), what
 * it remembers, when it applies itself on load, and when it asks first.
 */

/** A localStorage stand-in. */
function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const store: NonNullable<KeyValueStore> = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
  return { store, data };
}

/** A store whose every call throws, as a blocked or full storage does. */
const brokenStore: NonNullable<KeyValueStore> = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("quota");
  },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** A fake demo-sessions API: GET lists `listed`, POST creates `created`. */
function fakeApi(listed: string[], created = "new-session") {
  const fetcher = vi.fn<Fetcher>(async (_input, init) =>
    init?.method === "POST"
      ? json({
          session: { id: created },
          annotateUrl: `/annotator/annotate?demo=${created}`,
        })
      : json({ sessions: listed.map((id) => ({ id, label: "a session" })) }),
  );
  const posts = () =>
    fetcher.mock.calls.filter(([, init]) => init?.method === "POST");
  const gets = () =>
    fetcher.mock.calls.filter(([, init]) => init?.method !== "POST");
  return { fetcher, posts, gets };
}

const TODAY = new Date(2026, 9, 12, 15, 30); // 12 October 2026, local time

describe("canUseDemoSwitch", () => {
  it("is for the RESEARCHER role and nobody else", () => {
    expect(canUseDemoSwitch("RESEARCHER")).toBe(true);
    for (const role of ["ANNOTATOR", "LEARNER", "researcher", "", null]) {
      expect(canUseDemoSwitch(role), String(role)).toBe(false);
    }
    expect(canUseDemoSwitch(undefined)).toBe(false);
  });
});

describe("demoSessionLabel", () => {
  it('reads "Researcher demo, YYYY-MM-DD" for the day it is made', () => {
    expect(demoSessionLabel(TODAY)).toBe("Researcher demo, 2026-10-12");
  });

  it("pads single-digit months and days", () => {
    expect(demoSessionLabel(new Date(2027, 0, 5))).toBe(
      "Researcher demo, 2027-01-05",
    );
  });
});

describe("the remembered session and the preference", () => {
  it("uses the two documented localStorage keys", () => {
    expect(DEMO_SESSION_KEY).toBe("wt-demo-session");
    expect(DEMO_PREFERENCE_KEY).toBe("wt-demo-on");
  });

  it("a browser that never touched the switch is OFF, with no session", () => {
    const { store } = memoryStore();
    expect(readDemoPreference(store)).toBe(false);
    expect(readRememberedSession(store)).toBeNull();
  });

  it("the preference is written on and off, and read back", () => {
    const { store, data } = memoryStore();
    writeDemoPreference(store, true);
    expect(data.get(DEMO_PREFERENCE_KEY)).toBe("1");
    expect(readDemoPreference(store)).toBe(true);
    writeDemoPreference(store, false);
    expect(data.get(DEMO_PREFERENCE_KEY)).toBe("0");
    expect(readDemoPreference(store)).toBe(false);
  });

  it("only the exact stored value means ON", () => {
    for (const value of ["true", "yes", "on", "0", ""]) {
      const { store } = memoryStore({ [DEMO_PREFERENCE_KEY]: value });
      expect(readDemoPreference(store), value).toBe(false);
    }
  });

  it("the session id is remembered and read back", () => {
    const { store, data } = memoryStore();
    rememberSession(store, "sess-1");
    expect(data.get(DEMO_SESSION_KEY)).toBe("sess-1");
    expect(readRememberedSession(store)).toBe("sess-1");
  });

  it("an empty stored id is no session", () => {
    const { store } = memoryStore({ [DEMO_SESSION_KEY]: "" });
    expect(readRememberedSession(store)).toBeNull();
  });

  it("with no storage at all, or one that throws, nothing breaks and nothing is ON", () => {
    for (const store of [null, brokenStore]) {
      expect(readDemoPreference(store)).toBe(false);
      expect(readRememberedSession(store)).toBeNull();
      expect(() => writeDemoPreference(store, true)).not.toThrow();
      expect(() => rememberSession(store, "sess-1")).not.toThrow();
    }
  });

  it("browserStore is null where there is no window", () => {
    expect(browserStore()).toBeNull();
  });
});

describe("shouldAutoApplyDemo", () => {
  const on = { researcher: true, urlDemo: null, preferenceOn: true };

  it("applies for a researcher who left the switch on, on a URL without demo", () => {
    expect(shouldAutoApplyDemo(on)).toBe(true);
  });

  it("never for anyone else, whatever their browser has stored", () => {
    expect(shouldAutoApplyDemo({ ...on, researcher: false })).toBe(false);
  });

  it("not when the switch was left off, or never touched", () => {
    expect(shouldAutoApplyDemo({ ...on, preferenceOn: false })).toBe(false);
  });

  it("not over a demo link: the URL has already decided", () => {
    expect(shouldAutoApplyDemo({ ...on, urlDemo: "from-a-link" })).toBe(false);
  });
});

describe("the fetch wrappers", () => {
  it("listDemoSessionIds reads the ids from the researcher-only list", async () => {
    const { fetcher } = fakeApi(["a", "b"]);
    expect(await listDemoSessionIds(fetcher)).toEqual(["a", "b"]);
    expect(fetcher).toHaveBeenCalledWith(DEMO_SESSIONS_PATH);
    expect(DEMO_SESSIONS_PATH).toBe("/api/arena/demo-sessions");
  });

  it("listDemoSessionIds ignores rows without a usable id", async () => {
    const fetcher: Fetcher = async () =>
      json({ sessions: [{ id: "a" }, { id: 7 }, null, { label: "x" }, {}] });
    expect(await listDemoSessionIds(fetcher)).toEqual(["a"]);
  });

  it("listDemoSessionIds throws the server's message when refused", async () => {
    const fetcher: Fetcher = async () => json({ error: "Forbidden" }, 403);
    await expect(listDemoSessionIds(fetcher)).rejects.toThrow("Forbidden");
  });

  it("createDemoSession posts the label and returns the new id", async () => {
    const { fetcher } = fakeApi([], "made-1");
    expect(await createDemoSession(fetcher, "Researcher demo, 2026-10-12")).toBe(
      "made-1",
    );
    const [path, init] = fetcher.mock.calls[0];
    expect(path).toBe(DEMO_SESSIONS_PATH);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      label: "Researcher demo, 2026-10-12",
    });
  });

  it("createDemoSession throws when refused, or when no id comes back", async () => {
    await expect(
      createDemoSession(async () => json({ error: "Forbidden" }, 403), "x"),
    ).rejects.toThrow("Forbidden");
    await expect(
      createDemoSession(async () => json({ session: {} }), "x"),
    ).rejects.toThrow(/demo session/i);
    await expect(
      createDemoSession(async () => new Response("<html>", { status: 502 }), "x"),
    ).rejects.toThrow(/demo session/i);
  });
});

describe("ensureDemoSession", () => {
  it("reuses the remembered session when the server still lists it, and creates nothing", async () => {
    const { store, data } = memoryStore({ [DEMO_SESSION_KEY]: "kept" });
    const api = fakeApi(["other", "kept"]);
    const id = await ensureDemoSession({
      store,
      fetcher: api.fetcher,
      today: TODAY,
    });
    expect(id).toBe("kept");
    expect(api.gets()).toHaveLength(1);
    expect(api.posts()).toHaveLength(0);
    expect(data.get(DEMO_SESSION_KEY)).toBe("kept");
  });

  it("creates a new one when the remembered session is no longer listed, and remembers the new one", async () => {
    const { store, data } = memoryStore({ [DEMO_SESSION_KEY]: "gone" });
    const api = fakeApi(["other"], "fresh");
    const id = await ensureDemoSession({
      store,
      fetcher: api.fetcher,
      today: TODAY,
    });
    expect(id).toBe("fresh");
    expect(api.posts()).toHaveLength(1);
    expect(JSON.parse(String(api.posts()[0][1]?.body))).toEqual({
      label: "Researcher demo, 2026-10-12",
    });
    expect(data.get(DEMO_SESSION_KEY)).toBe("fresh");
  });

  it("creates one when nothing is remembered, without asking for the list first", async () => {
    const { store, data } = memoryStore();
    const api = fakeApi(["other"], "first");
    const id = await ensureDemoSession({
      store,
      fetcher: api.fetcher,
      today: TODAY,
    });
    expect(id).toBe("first");
    expect(api.gets()).toHaveLength(0);
    expect(api.posts()).toHaveLength(1);
    expect(data.get(DEMO_SESSION_KEY)).toBe("first");
  });

  it("the second turn-on reuses what the first one created", async () => {
    const { store } = memoryStore();
    const first = fakeApi([], "made-once");
    await ensureDemoSession({ store, fetcher: first.fetcher, today: TODAY });

    const second = fakeApi(["made-once"], "must-not-be-made");
    const id = await ensureDemoSession({
      store,
      fetcher: second.fetcher,
      today: TODAY,
    });
    expect(id).toBe("made-once");
    expect(second.posts()).toHaveLength(0);
  });

  it("does not trust a remembered id it could not check: a failed list fails the turn-on", async () => {
    const { store, data } = memoryStore({ [DEMO_SESSION_KEY]: "unchecked" });
    const fetcher = vi.fn<Fetcher>(async () => json({ error: "Forbidden" }, 403));
    await expect(
      ensureDemoSession({ store, fetcher, today: TODAY }),
    ).rejects.toThrow("Forbidden");
    // Nothing was created, and the remembered id was left alone.
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(data.get(DEMO_SESSION_KEY)).toBe("unchecked");
  });

  it("fails rather than invent a session when the create is refused", async () => {
    const { store, data } = memoryStore();
    const fetcher: Fetcher = async () => json({ error: "Forbidden" }, 403);
    await expect(
      ensureDemoSession({ store, fetcher, today: TODAY }),
    ).rejects.toThrow("Forbidden");
    expect(data.has(DEMO_SESSION_KEY)).toBe(false);
  });

  it("still works with no storage: a session is created, just not remembered", async () => {
    const api = fakeApi([], "unremembered");
    expect(
      await ensureDemoSession({
        store: null,
        fetcher: api.fetcher,
        today: TODAY,
      }),
    ).toBe("unremembered");
  });
});

describe("episodeHasUnsavedInput (when the switch asks first)", () => {
  const blank: EpisodeInput = {
    coldLocked: false,
    coldAnswer: "",
    englishGloss: "",
    instructionIg: "",
    winner: null,
    failureTagsA: [],
    failureTagsB: [],
    edited: false,
    explanation: "",
  };

  it("a fresh episode has nothing to lose: the switch just switches", () => {
    expect(episodeHasUnsavedInput(blank)).toBe(false);
    expect(
      episodeHasUnsavedInput({ ...blank, coldAnswer: "  ", explanation: "\n" }),
    ).toBe(false);
  });

  it("an own answer being typed, not yet locked", () => {
    expect(episodeHasUnsavedInput({ ...blank, coldAnswer: "ukọlọ" })).toBe(
      true,
    );
    expect(episodeHasUnsavedInput({ ...blank, englishGloss: "its meaning" })).toBe(
      true,
    );
    expect(episodeHasUnsavedInput({ ...blank, instructionIg: "ukọlọ?" })).toBe(
      true,
    );
  });

  it("a LOCKED own answer with nothing after it does not ask: the draft holds it under the prompt", () => {
    expect(
      episodeHasUnsavedInput({
        ...blank,
        coldLocked: true,
        coldAnswer: "ukọlọ",
        englishGloss: "its meaning",
      }),
    ).toBe(false);
  });

  it("a picked winner, a tag on either side, an edit, or an explanation", () => {
    expect(episodeHasUnsavedInput({ ...blank, winner: "a" })).toBe(true);
    expect(episodeHasUnsavedInput({ ...blank, winner: "tie" })).toBe(true);
    expect(episodeHasUnsavedInput({ ...blank, failureTagsA: ["grammar"] })).toBe(
      true,
    );
    expect(episodeHasUnsavedInput({ ...blank, failureTagsB: ["grammar"] })).toBe(
      true,
    );
    expect(episodeHasUnsavedInput({ ...blank, edited: true })).toBe(true);
    expect(episodeHasUnsavedInput({ ...blank, explanation: "B is wrong." })).toBe(
      true,
    );
  });
});

describe("skipAndFlagAreSent", () => {
  it("counted mode sends a skip or a flag, demo never does", () => {
    expect(skipAndFlagAreSent(false)).toBe(true);
    expect(skipAndFlagAreSent(true)).toBe(false);
  });

  it("the page says plainly that nothing was saved", () => {
    for (const message of [DEMO_SKIP_NOT_SAVED, DEMO_FLAG_NOT_SAVED]) {
      expect(message).toMatch(/^Demo: nothing was saved\. /);
    }
    expect(DEMO_SKIP_NOT_SAVED).not.toBe(DEMO_FLAG_NOT_SAVED);
  });
});
