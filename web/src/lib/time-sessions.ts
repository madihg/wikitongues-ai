/**
 * Time-on-platform estimation.
 *
 * There is no session tracking (JWT auth, no heartbeats, no presence pings) -
 * time spent is DERIVED from the timestamps of recorded annotation work.
 * Consecutive events close together are treated as one continuous work
 * session; a lead-in is added to every session to cover the reading/typing
 * that PRECEDES its first recorded submission. This is an ESTIMATE: someone
 * who reads and thinks without ever submitting is invisible to it.
 */

export interface SessionizeOptions {
  /** Events at most this many minutes apart are folded into the same session. */
  gapMinutes?: number;
  /** Added to every session's duration - the reading/writing before its first submission. */
  leadInMinutes?: number;
}

export interface SessionSummary {
  totalMinutes: number;
  sessionCount: number;
  lastActive: Date | null;
}

const DEFAULT_OPTS: Required<SessionizeOptions> = {
  gapMinutes: 30,
  leadInMinutes: 5,
};

/**
 * Cluster timestamps into sessions and estimate total time spent.
 *
 * Timestamps are sorted, then consecutive events whose gap is <= gapMinutes
 * are merged into one session. A session's duration is the span from its
 * first to its last event, plus leadInMinutes - so even a singleton session
 * (a single recorded event) counts as leadInMinutes, never zero, since some
 * reading/writing necessarily preceded that one submission.
 */
export function sessionize(
  timestamps: Date[],
  opts: SessionizeOptions = {},
): SessionSummary {
  const { gapMinutes, leadInMinutes } = { ...DEFAULT_OPTS, ...opts };

  if (timestamps.length === 0) {
    return { totalMinutes: 0, sessionCount: 0, lastActive: null };
  }

  const sorted = [...timestamps].sort((a, b) => a.getTime() - b.getTime());
  const gapMs = gapMinutes * 60_000;

  let sessionCount = 0;
  let totalMinutes = 0;
  let sessionStart = sorted[0];
  let sessionEnd = sorted[0];

  const closeSession = () => {
    const spanMinutes =
      (sessionEnd.getTime() - sessionStart.getTime()) / 60_000;
    totalMinutes += spanMinutes + leadInMinutes;
    sessionCount++;
  };

  for (let i = 1; i < sorted.length; i++) {
    const t = sorted[i];
    if (t.getTime() - sessionEnd.getTime() <= gapMs) {
      sessionEnd = t;
    } else {
      closeSession();
      sessionStart = t;
      sessionEnd = t;
    }
  }
  closeSession();

  return {
    totalMinutes: Math.round(totalMinutes),
    sessionCount,
    lastActive: sorted[sorted.length - 1],
  };
}

/**
 * Total estimated minutes from only the timestamps at or after `since`.
 * Filters the raw timestamps to the window first, then sessionizes the
 * remainder - simple, and close enough for a "last N days" rollup. A
 * session straddling the boundary loses the portion before it, so this
 * undercounts slightly rather than overcounting.
 */
export function minutesSince(
  timestamps: Date[],
  since: Date,
  opts: SessionizeOptions = {},
): number {
  const windowed = timestamps.filter((t) => t.getTime() >= since.getTime());
  return sessionize(windowed, opts).totalMinutes;
}

/** Format minutes as "2h 15m" / "2h" / "45m" / "0m". */
export function formatMinutes(totalMinutes: number): string {
  const n = Math.max(0, Math.round(totalMinutes));
  if (n === 0) return "0m";
  const hours = Math.floor(n / 60);
  const minutes = n % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
