/**
 * The researcher's Demo switch on the annotate page: everything it decides,
 * kept out of src/components/annotation-interface.tsx so it can be tested
 * without a browser. Pure functions, plus two thin fetch wrappers and two
 * thin storage wrappers that tests hand a fake.
 *
 * What the switch is for: a researcher walking through the real episode (to
 * check a question opened from the review drawer, or to show someone the
 * flow) must not add a judgment to the data. Demo is the existing mechanism
 * (a DemoSession id on the page URL; /api/annotations/submit then stores
 * every row with isDemo=true, and every consumer of the data excludes
 * those). Until now it could only be turned on from the Demo session page
 * under the arena. The switch does the same thing in place:
 *
 *   - ON:  reuse the demo session this browser remembers if the server still
 *          lists it, otherwise create one; put its id on the page URL.
 *   - OFF: take the id off the page URL.
 *   - The choice is remembered, so a question opened from the review drawer
 *     in a new tab lands in demo for a researcher who works in demo.
 */

export const DEMO_SESSION_KEY = "wt-demo-session";
export const DEMO_PREFERENCE_KEY = "wt-demo-on";
export const DEMO_SESSIONS_PATH = "/api/arena/demo-sessions";

/** The slice of Storage the switch uses. Null when the browser refuses
 *  storage: the switch still works, it just remembers nothing. */
export type KeyValueStore = Pick<Storage, "getItem" | "setItem"> | null;

/** fetch, narrowed to what the wrappers call, so a test can pass a fake. */
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Who gets the switch. The role alone, not the owner-by-email override that
 * src/lib/personas.ts adds for navigation: the two server gates the switch
 * depends on (requireResearcher on the demo-sessions API, and the pinned
 * prompt in /api/annotations/next) read the role alone, and a switch shown
 * to an account its first request refuses would be a broken control.
 */
export function canUseDemoSwitch(role?: string | null): boolean {
  return role === "RESEARCHER";
}

/** localStorage, or null where reading the property itself throws (storage
 *  blocked) or there is no window (the node test environment). */
export function browserStore(): KeyValueStore {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// ─── What this browser remembers ─────────────────────────────────────────────

export function readDemoPreference(store: KeyValueStore): boolean {
  try {
    return store?.getItem(DEMO_PREFERENCE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeDemoPreference(store: KeyValueStore, on: boolean): void {
  try {
    store?.setItem(DEMO_PREFERENCE_KEY, on ? "1" : "0");
  } catch {
    // Storage full or blocked: the switch still applies to this page.
  }
}

export function readRememberedSession(store: KeyValueStore): string | null {
  try {
    return store?.getItem(DEMO_SESSION_KEY) || null;
  } catch {
    return null;
  }
}

export function rememberSession(store: KeyValueStore, id: string): void {
  try {
    store?.setItem(DEMO_SESSION_KEY, id);
  } catch {
    // Not remembered: the next turn-on creates another session, no harm.
  }
}

/**
 * Whether the page should put itself in demo on load. Only for a researcher,
 * only when they left the switch on, and never over the URL: a `demo`
 * parameter that is already there has decided the matter. A researcher who
 * never touched the switch has no stored preference and stays in counted
 * mode, which is what the page did before the switch existed.
 */
export function shouldAutoApplyDemo(input: {
  researcher: boolean;
  urlDemo: string | null;
  preferenceOn: boolean;
}): boolean {
  return input.researcher && !input.urlDemo && input.preferenceOn;
}

// ─── The demo session behind the switch ──────────────────────────────────────

/** "Researcher demo, YYYY-MM-DD", in the researcher's own calendar day: the
 *  label is for a person reading the session list, not for a machine. */
export function demoSessionLabel(today: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Researcher demo, ${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

async function errorOf(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === "string" && body.error ? body.error : fallback;
}

/** The ids of the demo sessions the server lists (its latest 25). */
export async function listDemoSessionIds(fetcher: Fetcher): Promise<string[]> {
  const res = await fetcher(DEMO_SESSIONS_PATH);
  if (!res.ok) {
    throw new Error(await errorOf(res, "Could not read the demo sessions."));
  }
  const body = (await res.json().catch(() => null)) as {
    sessions?: unknown;
  } | null;
  if (!Array.isArray(body?.sessions)) return [];
  return body.sessions
    .map((s) => (s as { id?: unknown } | null)?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/** Create a demo session and return its id. */
export async function createDemoSession(
  fetcher: Fetcher,
  label: string,
): Promise<string> {
  const res = await fetcher(DEMO_SESSIONS_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  });
  if (!res.ok) {
    throw new Error(await errorOf(res, "Could not start a demo session."));
  }
  const body = (await res.json().catch(() => null)) as {
    session?: { id?: unknown };
  } | null;
  const id = body?.session?.id;
  if (typeof id !== "string" || !id) {
    throw new Error("Could not start a demo session.");
  }
  return id;
}

/**
 * The demo session to work under: the remembered one when the server still
 * lists it, otherwise a new one, which is then remembered.
 *
 * The remembered id is checked rather than trusted because an id is only a
 * string in localStorage: the session may have dropped off the server's
 * list, or the database may be a different one (a preview deployment), and
 * rows filed under a session nobody can find are harder to account for
 * later. One session is
 * reused across days on purpose, so a researcher's demo rows stay together
 * instead of a new session appearing with every flip of the switch.
 *
 * Throws when the list cannot be read or the session cannot be created; the
 * caller then leaves demo OFF, because an unconfirmed demo is not demo.
 */
export async function ensureDemoSession(deps: {
  store: KeyValueStore;
  fetcher: Fetcher;
  today: Date;
}): Promise<string> {
  const remembered = readRememberedSession(deps.store);
  if (remembered) {
    const listed = await listDemoSessionIds(deps.fetcher);
    if (listed.includes(remembered)) return remembered;
  }
  const id = await createDemoSession(
    deps.fetcher,
    demoSessionLabel(deps.today),
  );
  rememberSession(deps.store, id);
  return id;
}

// ─── Is there anything on screen to lose? ────────────────────────────────────

export interface EpisodeInput {
  coldLocked: boolean;
  coldAnswer: string;
  englishGloss: string;
  instructionIg: string;
  winner: string | null;
  failureTagsA: readonly string[];
  failureTagsB: readonly string[];
  /** A correction, rewrite or markup that differs from the output's text. */
  edited: boolean;
  explanation: string;
}

/**
 * Whether flipping the switch should ask first. Flipping reloads the
 * question, and the question that comes back can be a different one (demo
 * serves the head of the whole queue, counted mode the head of what is
 * left), so anything the person has put into the episode would leave the
 * screen: an own answer still being written, a picked winner, failure tags,
 * a correction, an explanation.
 *
 * A LOCKED own answer with nothing after it does not count: locking is the
 * act of finishing it, the episode draft holds it under the prompt, and it
 * comes back whenever that prompt does (src/lib/episode-draft.ts).
 */
export function episodeHasUnsavedInput(e: EpisodeInput): boolean {
  const typingOwnAnswer =
    !e.coldLocked &&
    (e.coldAnswer.trim().length > 0 ||
      e.englishGloss.trim().length > 0 ||
      e.instructionIg.trim().length > 0);
  return (
    typingOwnAnswer ||
    e.winner !== null ||
    e.failureTagsA.length > 0 ||
    e.failureTagsB.length > 0 ||
    e.edited ||
    e.explanation.trim().length > 0
  );
}
