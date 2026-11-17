/**
 * Honest time: the pure rules of the activity beat (annotator experience
 * spec, section 10). No DOM, no database, no clock of its own, so every rule
 * is testable.
 *
 * What counts: the clock runs while the tab is in front AND there was a key
 * press, a tap, a scroll, a recording or a clip playing in the last 5
 * minutes. Nothing about what was typed is ever seen here: the browser hands
 * this module times and a kind of work, never content.
 *
 * How it travels: the browser keeps a small ledger of active milliseconds
 * per minute per kind of work. A beat carries, for each minute it touches,
 * the TOTAL active seconds that browser has counted in that minute so far
 * (not a difference). The server keeps the greater of what it has and what
 * arrives. So a beat sent twice changes nothing, a beat sent late lands in
 * its own minute, and nothing can add up to more than 60 seconds per person
 * per minute.
 */

export const MINUTE_MS = 60_000;
/** The browser sends a beat this often while there is something to send. */
export const BEAT_INTERVAL_MS = 30_000;
/**
 * The clock pauses after this long with no input, recording or playback.
 * One minute, not five: pauses are not paid time (Halim, Nov 17 2026). A
 * minute is kept so reading a long answer between key presses still counts.
 */
export const IDLE_LIMIT_MS = MINUTE_MS;
/**
 * Time on researcher pages counts at a quarter (Halim, Nov 17 2026): it is
 * looking at the data, not adding to it. Applied when hours are read, so the
 * stored seconds stay what the browser measured.
 */
export const RESEARCH_PAY_SHARE = 0.25;
export const MAX_SECONDS_PER_MINUTE = 60;
/** Beats older than this are refused (a browser that was offline for days). */
export const LATE_LIMIT_MS = 24 * 60 * MINUTE_MS;
/** A beat may claim a minute this far ahead of the server clock, no further. */
export const FUTURE_SLACK_MS = 2 * MINUTE_MS;
/** A clock this far from the server's is treated as wrong and corrected. */
export const CLOCK_SKEW_LIMIT_MS = 2 * MINUTE_MS;
/** One request carries at most this many minute rows. */
export const MAX_BEATS_PER_REQUEST = 300;
/**
 * If the browser's timer did not fire for longer than this, the machine was
 * asleep or the tab was frozen. "Recording" or "playing" is not believed
 * across such a hole; only the plain 5 minute rule applies to it.
 */
export const MAX_TICK_GAP_MS = MINUTE_MS;

/** The kinds of work a beat can name. Stored as plain text. */
export const SURFACES = [
  "annotate",
  "corrections",
  "my_work",
  "record",
  "listen",
  "check",
  "tone",
  "edit",
  "rubric",
  "review",
  "dashboard",
  "research",
  "other",
] as const;
export type Surface = (typeof SURFACES)[number];

export function isSurface(v: unknown): v is Surface {
  return typeof v === "string" && (SURFACES as readonly string[]).includes(v);
}

/**
 * Which kind of work a page is. Unknown pages are "other", never dropped.
 *
 *   annotate     /annotator/annotate
 *   record       /speak (and its Profile tab), the old /lab/speech door, and
 *                the studio sittings at /lab/speech/studio
 *   listen       /speak/listen (and the old /lab/speech/listen door)
 *   check        /speak/check
 *   tone         /annotator/tone, and the researcher's side of the same pass
 *                at /admin/tone. Matched on a whole path segment, so a page
 *                whose name merely contains the letters is not tone work.
 *   my_work, corrections, rubric, review, dashboard: their own pages
 *   research     every other researcher page, including the Recordings and
 *                Rights tools under /lab/speech
 *   edit         never from a path: the edit drawer names it while it is
 *                open, on whichever page it was opened (see surfaceFor).
 */
export function surfaceForPath(pathname: string): Surface {
  const p = pathname.replace(/\/+$/, "") || "/";
  const under = (base: string) => p === base || p.startsWith(`${base}/`);
  if (/(^|\/)tone(-[^/]*)?(\/|$)/.test(p)) return "tone";
  if (under("/speak/listen") || under("/lab/speech/listen")) return "listen";
  if (under("/speak/check")) return "check";
  if (under("/lab/speech/recordings") || under("/lab/speech/rights")) {
    return "research";
  }
  if (under("/speak") || under("/lab/speech")) return "record";
  if (under("/annotator/annotate")) return "annotate";
  if (under("/annotator/corrections")) return "corrections";
  if (under("/annotator/history")) return "my_work";
  if (under("/annotator/rubric")) return "rubric";
  if (under("/annotator/review")) return "review";
  if (p === "/annotator") return "dashboard";
  if (under("/annotator") || under("/admin")) return "research";
  return "other";
}

/**
 * The kind of work right now: the page's, unless something on the page says
 * otherwise. The edit drawer is an overlay, not a page: while it is open the
 * work is editing an earlier answer, whichever queue it was opened from.
 */
export function surfaceFor(
  pathname: string,
  override: Surface | null | undefined,
): Surface {
  return override ?? surfaceForPath(pathname);
}

// ─── Browser side: from moments to a ledger ──────────────────────────────

export interface ActivityFacts {
  /** The tab is in front (document.visibilityState === "visible"). */
  visible: boolean;
  /** A recording is running or a clip is playing. */
  busy: boolean;
  /** Time of the last key press, tap, click or scroll. Null: none yet. */
  lastInputAt: number | null;
}

/**
 * The part of [from, to] that counts as active, or null when none does.
 * Hidden tab: nothing. Recording or playing: all of it. Otherwise: up to one
 * minute after the last input.
 */
export function activeSpan(
  from: number,
  to: number,
  facts: ActivityFacts,
): [number, number] | null {
  if (!facts.visible || to <= from) return null;
  const believeBusy = facts.busy && to - from <= MAX_TICK_GAP_MS;
  const end = believeBusy
    ? to
    : Math.min(to, (facts.lastInputAt ?? -Infinity) + IDLE_LIMIT_MS);
  return end > from ? [from, end] : null;
}

/**
 * Active milliseconds per minute, kind of work and demo flag. Keys are
 * `${minuteStartMs}|${surface}|${demo ? 1 : 0}`. A plain object so it can be
 * kept in localStorage while the network is down.
 */
export type Ledger = Record<string, number>;

export function ledgerKey(minute: number, surface: Surface, demo: boolean) {
  return `${minute}|${surface}|${demo ? 1 : 0}`;
}

/** Add an active span to the ledger, split at minute boundaries. */
export function addSpan(
  ledger: Ledger,
  start: number,
  end: number,
  surface: Surface,
  demo = false,
): void {
  let t = start;
  while (t < end) {
    const minute = Math.floor(t / MINUTE_MS) * MINUTE_MS;
    const until = Math.min(end, minute + MINUTE_MS);
    const key = ledgerKey(minute, surface, demo);
    ledger[key] = Math.min(MINUTE_MS, (ledger[key] ?? 0) + (until - t));
    t = until;
  }
}

export interface Beat {
  /** Start of the minute, epoch milliseconds. */
  minute: number;
  surface: Surface;
  /** Total active seconds counted in that minute so far, 1 to 60. */
  activeSeconds: number;
  demo: boolean;
}

/** The ledger as beats, oldest minute first. Slices under half a second are left out. */
export function ledgerBeats(ledger: Ledger): Beat[] {
  const beats: Beat[] = [];
  for (const [key, ms] of Object.entries(ledger)) {
    const [minute, surface, demo] = key.split("|");
    const activeSeconds = Math.min(
      MAX_SECONDS_PER_MINUTE,
      Math.round(ms / 1000),
    );
    if (activeSeconds < 1 || !isSurface(surface)) continue;
    beats.push({
      minute: Number(minute),
      surface,
      activeSeconds,
      demo: demo === "1",
    });
  }
  return beats.sort((a, b) => a.minute - b.minute);
}

/** Merge two ledgers, keeping the greater value per key (never the sum). */
export function mergeLedgers(a: Ledger, b: Ledger): Ledger {
  const out: Ledger = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === "number" && v > (out[k] ?? 0)) out[k] = v;
  }
  return out;
}

/**
 * Drop what no longer needs keeping: minutes the server can no longer accept
 * (older than 24 hours), and, when `sentBefore` is given, minutes that are
 * finished and were in a beat the server confirmed.
 */
export function pruneLedger(
  ledger: Ledger,
  now: number,
  sentBefore?: number,
): Ledger {
  const out: Ledger = {};
  for (const [k, v] of Object.entries(ledger)) {
    const minute = Number(k.split("|")[0]);
    if (!Number.isFinite(minute)) continue;
    if (minute < now - LATE_LIMIT_MS) continue;
    if (sentBefore !== undefined && minute + MINUTE_MS <= sentBefore) continue;
    out[k] = v;
  }
  return out;
}

// ─── Server side: from a request body to rows ────────────────────────────

/**
 * Check and tidy the beats of one request. `sentAt` is the browser's clock
 * when it sent the request: if it is more than 2 minutes from the server's,
 * the browser's clock is wrong and every minute is shifted by the difference
 * (whole minutes), so a wrong clock does not cost a person their hours.
 * Minutes older than 24 hours or ahead of now are dropped and counted.
 */
export function normalizeBeats(
  raw: unknown,
  now: number,
  sentAt: number | null,
): { beats: Beat[]; dropped: number } {
  if (!Array.isArray(raw)) return { beats: [], dropped: 0 };
  const skew = sentAt === null ? 0 : now - sentAt;
  const shift =
    Math.abs(skew) > CLOCK_SKEW_LIMIT_MS
      ? Math.round(skew / MINUTE_MS) * MINUTE_MS
      : 0;
  const best = new Map<string, Beat>();
  let dropped = 0;
  for (const item of raw.slice(0, MAX_BEATS_PER_REQUEST)) {
    const b = item as Partial<Record<keyof Beat, unknown>> | null;
    const seconds = Math.floor(Number(b?.activeSeconds));
    const rawMinute = Number(b?.minute);
    if (
      !b ||
      !Number.isFinite(rawMinute) ||
      !Number.isFinite(seconds) ||
      seconds < 1
    ) {
      dropped++;
      continue;
    }
    const minute = Math.floor((rawMinute + shift) / MINUTE_MS) * MINUTE_MS;
    if (minute < now - LATE_LIMIT_MS || minute > now + FUTURE_SLACK_MS) {
      dropped++;
      continue;
    }
    const beat: Beat = {
      minute,
      surface: isSurface(b.surface) ? b.surface : "other",
      activeSeconds: Math.min(MAX_SECONDS_PER_MINUTE, seconds),
      demo: b.demo === true,
    };
    const key = ledgerKey(beat.minute, beat.surface, beat.demo);
    const seen = best.get(key);
    if (!seen || beat.activeSeconds > seen.activeSeconds) best.set(key, beat);
  }
  dropped += Math.max(0, raw.length - MAX_BEATS_PER_REQUEST);
  return {
    beats: [...best.values()].sort((a, b) => a.minute - b.minute),
    dropped,
  };
}

export interface StoredSlice {
  minute: number;
  surface: string;
  demo: boolean;
  activeSeconds: number;
}

/**
 * What to write for a set of beats, given what is stored for the same
 * minutes. A row only ever grows (the greater value wins), and the rows of
 * one minute never add up to more than 60 seconds.
 */
export function planWrites(
  stored: StoredSlice[],
  beats: Beat[],
): { create: Beat[]; raise: Beat[] } {
  const byMinute = new Map<number, Map<string, number>>();
  const slot = (surface: string, demo: boolean) => `${surface}|${demo ? 1 : 0}`;
  for (const s of stored) {
    let m = byMinute.get(s.minute);
    if (!m) byMinute.set(s.minute, (m = new Map()));
    m.set(slot(s.surface, s.demo), s.activeSeconds);
  }
  const create: Beat[] = [];
  const raise: Beat[] = [];
  for (const beat of beats) {
    let m = byMinute.get(beat.minute);
    if (!m) byMinute.set(beat.minute, (m = new Map()));
    const key = slot(beat.surface, beat.demo);
    const have = m.get(key);
    let others = 0;
    for (const [k, v] of m) if (k !== key) others += v;
    const allowed = Math.min(
      beat.activeSeconds,
      MAX_SECONDS_PER_MINUTE - others,
    );
    if (allowed < 1 || allowed <= (have ?? 0)) continue;
    m.set(key, allowed);
    (have === undefined ? create : raise).push({
      ...beat,
      activeSeconds: allowed,
    });
  }
  return { create, raise };
}

// ─── Reading: from rows to hours ─────────────────────────────────────────

export interface PingLite {
  minute: Date;
  activeSeconds: number;
  /** The kind of work. Only "research" changes the sum (RESEARCH_PAY_SHARE). */
  surface?: string | null;
}

/**
 * Total active seconds of a set of rows. The rows of one minute are added
 * and capped at 60 again here, so the figure holds even if two browsers
 * wrote the same minute at the same instant.
 */
export function sumActiveSeconds(pings: PingLite[]): number {
  const perMinute = new Map<number, number>();
  for (const p of pings) {
    const k = p.minute.getTime();
    const share = p.surface === "research" ? RESEARCH_PAY_SHARE : 1;
    perMinute.set(
      k,
      (perMinute.get(k) ?? 0) + Math.max(0, p.activeSeconds) * share,
    );
  }
  let total = 0;
  for (const s of perMinute.values()) {
    total += Math.min(MAX_SECONDS_PER_MINUTE, s);
  }
  return Math.round(total);
}

/** Sittings: runs of active minutes with no hole longer than `gapMinutes`. */
export function countSittings(pings: PingLite[], gapMinutes = 30): number {
  const minutes = [
    ...new Set(
      pings.filter((p) => p.activeSeconds > 0).map((p) => p.minute.getTime()),
    ),
  ].sort((a, b) => a - b);
  let sittings = 0;
  let last = -Infinity;
  for (const m of minutes) {
    if (m - last > gapMinutes * MINUTE_MS) sittings++;
    last = m;
  }
  return sittings;
}

/** "6 h 40 m", "9 h 05 m", "0 m": the figure an annotator reads. */
export function formatWorked(seconds: number): string {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} m`;
  return `${h} h ${String(m).padStart(2, "0")} m`;
}
