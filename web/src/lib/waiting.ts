import { prisma } from "@/lib/prisma";
import { REJECTED_REVIEW_STATUSES } from "@/lib/speech/limits";

/**
 * "Waiting for you" on the annotator Dashboard (annotator experience spec,
 * section 4.2): how much of each kind of work is waiting for this person.
 *
 * The rule the page lives by: every number equals the length of the queue
 * its card opens. So each count here asks the database the SAME question its
 * queue route asks (the `where` objects below are copies of the routes', and
 * waiting.test.ts fails if either side drifts), and counts the answer the
 * way the route does.
 *
 *   Record  -> GET /api/lab/speech/next         (own answers with no clip)
 *   Listen  -> GET /api/lab/speech/listen/next  (progress.remaining)
 *   Check   -> GET /api/lab/speech/check/next   (progress.remaining)
 *   Annotate comes from computeQueueState in the summary route, as before.
 */

/** Never count a frozen prompt: the filter every speech queue uses. */
const NOT_FROZEN = { isHoldout: false, split: { not: "test" as const } };

// ─── Record ──────────────────────────────────────────────────────────────

export const recordedWhere = (annotatorId: string) => ({
  annotatorId,
  isDemo: false,
  language: "igala",
});

export const ownAnswersToRecordWhere = (
  annotatorId: string,
  recordedIds: string[],
) => ({
  annotatorId,
  isDemo: false,
  prompt: {
    ...NOT_FROZEN,
    language: "igala",
    id: { notIn: recordedIds },
    promptId: { notIn: [] as string[] },
  },
});

/** Own answers with no Igala clip yet: one per prompt, as the queue serves them. */
export function recordRemaining(answers: { promptId: string }[]): number {
  return new Set(answers.map((a) => a.promptId)).size;
}

// ─── Listen ──────────────────────────────────────────────────────────────

export const listenClipsWhere = () => ({
  uploadedAt: { not: null },
  prompt: NOT_FROZEN,
  OR: [{ isDemo: false }],
  AND: [
    {
      OR: [
        { reviewStatus: null },
        { reviewStatus: { notIn: [...REJECTED_REVIEW_STATUSES] } },
      ],
    },
  ],
});

export const listenDoneWhere = (annotatorId: string) => ({
  annotatorId,
  isDemo: false,
});

export interface ListenClip {
  id: string;
  promptId: string;
  language: string;
  annotatorId: string | null;
  modelOutputId: string | null;
  sourceType: string;
  sourceRef: string | null;
}

/**
 * Pairs of clips still to compare: one per prompt and language that has at
 * least two different voices and that this person has not judged.
 */
export function listenRemaining(
  clips: ListenClip[],
  done: { promptId: string; recordingA: { language: string } }[],
): number {
  const slot = (promptId: string, language: string) =>
    `${promptId}:${language}`;
  const judged = new Set(
    done.map((r) => slot(r.promptId, r.recordingA.language)),
  );
  const voices = new Map<string, Set<string>>();
  for (const c of clips) {
    const key = slot(c.promptId, c.language);
    if (judged.has(key)) continue;
    const voice =
      c.sourceType === "derived" || c.modelOutputId
        ? `synth:${c.sourceRef ?? c.modelOutputId ?? c.id}`
        : `human:${c.annotatorId ?? c.id}`;
    let set = voices.get(key);
    if (!set) voices.set(key, (set = new Set()));
    set.add(voice);
  }
  let n = 0;
  for (const set of voices.values()) if (set.size >= 2) n++;
  return n;
}

// ─── Check ───────────────────────────────────────────────────────────────

/** The Check queue looks at this many clips at most; so does the count. */
export const CHECK_MAX_CANDIDATES = 500;

export const checkedByMeWhere = (reviewerId: string) => ({
  reviewerId,
  isDemo: false,
});

export const checkClipsWhere = (reviewerId: string, checkedByMe: string[]) => ({
  uploadedAt: { not: null },
  language: "igala",
  coldAuthorAnswerId: { not: null },
  annotatorId: { not: null, notIn: [reviewerId] },
  id: { notIn: checkedByMe },
  OR: [{ isDemo: false }],
  AND: [{ OR: [{ reviewStatus: null }, { reviewStatus: "keep" }] }],
  prompt: NOT_FROZEN,
});

/** Clips from other speakers still to check: those whose answer has text. */
export function checkRemaining(
  clips: { coldAuthorAnswer: { answerText: string } | null }[],
): number {
  return clips.filter((c) => c.coldAuthorAnswer?.answerText.trim()).length;
}

// ─── Your answers to fix ─────────────────────────────────────────────────

/** A reason shorter than this needs more (decision 6, the recommended rule). */
export const SHORT_REASON_CHARS = 20;
/**
 * The Dashboard never opens to hundreds (decision 6): measured on 13 Nov
 * 2026, annotators had between 3 and 263 answers to fix. The card shows at
 * most this many; the rest wait behind them.
 */
export const FIX_HOME_CAP = 20;

const stored = (s: string | null | undefined) =>
  (s ?? "").normalize("NFC").trim();

/**
 * Own answers that need more: an answer with no English meaning, or a
 * correction with no reason or a reason under 20 characters. The same rule
 * as needsFix in the EDIT lane's lib/answer-revisions.ts, which My Work's
 * filter uses.
 */
export function fixTotal(
  answers: { englishGloss: string | null }[],
  corrections: { rationale: string | null }[],
): number {
  return (
    answers.filter((a) => stored(a.englishGloss) === "").length +
    corrections.filter((c) => stored(c.rationale).length < SHORT_REASON_CHARS)
      .length
  );
}

// ─── Loading and the cards ───────────────────────────────────────────────

export interface WaitingCounts {
  annotate: number;
  record: number;
  listen: number;
  check: number;
  /** Pass 2, tone marks. Zero until the tone pass is switched on. */
  tone: number;
  /** Answers to fix, capped at FIX_HOME_CAP. */
  fix: number;
  /** Answers to fix, all of them. */
  fixTotal: number;
}

/**
 * The speech and fix counts for one person. `speech`: the speech layer is on
 * for this account. `editing`: authors can edit their own answers (the edit
 * log exists); without it the fix card would open a list nobody can fix.
 */
export async function loadWaiting(
  userId: string,
  on: { speech: boolean; editing: boolean },
): Promise<Omit<WaitingCounts, "annotate">> {
  const speech = async () => {
    if (!on.speech) return { record: 0, listen: 0, check: 0 };
    const [recorded, clips, done, mine] = await Promise.all([
      prisma.speechRecording.findMany({
        where: recordedWhere(userId),
        select: { promptId: true },
      }),
      prisma.speechRecording.findMany({
        where: listenClipsWhere(),
        select: {
          id: true,
          promptId: true,
          language: true,
          annotatorId: true,
          modelOutputId: true,
          sourceType: true,
          sourceRef: true,
        },
      }),
      prisma.speechComparison.findMany({
        where: listenDoneWhere(userId),
        select: { promptId: true, recordingA: { select: { language: true } } },
      }),
      prisma.speechCheck.findMany({
        where: checkedByMeWhere(userId),
        select: { recordingId: true },
      }),
    ]);
    const recordedIds = [...new Set(recorded.map((r) => r.promptId))];
    const [answers, toCheck] = await Promise.all([
      prisma.coldAuthorAnswer.findMany({
        where: ownAnswersToRecordWhere(userId, recordedIds),
        select: { promptId: true },
      }),
      prisma.speechRecording.findMany({
        take: CHECK_MAX_CANDIDATES,
        where: checkClipsWhere(
          userId,
          mine.map((c) => c.recordingId),
        ),
        select: { coldAuthorAnswer: { select: { answerText: true } } },
      }),
    ]);
    return {
      record: recordRemaining(answers),
      listen: listenRemaining(clips, done),
      check: checkRemaining(toCheck),
    };
  };
  const fix = async () => {
    if (!on.editing) return 0;
    const [answers, corrections] = await Promise.all([
      prisma.coldAuthorAnswer.findMany({
        where: { annotatorId: userId, isDemo: false },
        select: { englishGloss: true },
      }),
      prisma.outputEdit.findMany({
        where: { annotatorId: userId, isDemo: false },
        select: { rationale: true },
      }),
    ]);
    return fixTotal(answers, corrections);
  };
  const [s, total] = await Promise.all([speech(), fix()]);
  return {
    ...s,
    tone: 0,
    fix: Math.min(total, FIX_HOME_CAP),
    fixTotal: total,
  };
}

export interface WaitingCard {
  key: "annotate" | "record" | "listen" | "check" | "tone" | "fix";
  title: string;
  value: number;
  line: string;
  href: string;
}

/** Where the fix card goes: My Work with the "to fix" filter on (EDIT lane). */
export const FIX_HREF = "/annotator/history?filter=fix";

export const WAITING_COPY = {
  heading: "Waiting for you",
  empty:
    "Nothing is waiting right now. We will add more soon. You can still improve your earlier answers in My Work.",
  fixCapped: `Missing a meaning or a reason. The first ${FIX_HOME_CAP} are shown.`,
} as const;

/**
 * The cards, in the order of the spec. A card shows only when its number is
 * above zero, except Annotate, which always shows so the page is never
 * empty. Researchers reach Record and Listen through the Lab paths they
 * already know; annotators through /speak. All of them keep resolving.
 */
export function waitingCards(
  counts: WaitingCounts,
  role: { researcher: boolean },
): WaitingCard[] {
  const speak = role.researcher
    ? { record: "/lab/speech", listen: "/lab/speech/listen" }
    : { record: "/speak", listen: "/speak/listen" };
  const all: WaitingCard[] = [
    {
      key: "annotate",
      title: "Annotate",
      value: counts.annotate,
      line: "Prompts to answer and compare",
      href: "/annotator/annotate",
    },
    {
      key: "record",
      title: "Record your answers",
      value: counts.record,
      line: "Answers you wrote that have no clip",
      href: speak.record,
    },
    {
      key: "listen",
      title: "Listen",
      value: counts.listen,
      line: "Pairs of clips to compare",
      href: speak.listen,
    },
    {
      key: "check",
      title: "Check",
      value: counts.check,
      line: "Clips from other speakers to check",
      href: "/speak/check",
    },
    {
      key: "tone",
      title: "Pass 2: tone marks",
      value: counts.tone,
      line: "Answers that need tone marks",
      href: "/annotator/tone",
    },
    {
      key: "fix",
      title: "Your answers to fix",
      value: counts.fix,
      line:
        counts.fixTotal > counts.fix
          ? WAITING_COPY.fixCapped
          : "Missing a meaning or a reason",
      href: FIX_HREF,
    },
  ];
  return all.filter((c) => c.key === "annotate" || c.value > 0);
}

/** Everything is at zero: the page says so in one line. */
export function nothingWaiting(counts: WaitingCounts): boolean {
  return (
    counts.annotate +
      counts.record +
      counts.listen +
      counts.check +
      counts.tone +
      counts.fix ===
    0
  );
}
