import { prisma } from "@/lib/prisma";
import { REJECTED_REVIEW_STATUSES } from "@/lib/speech/limits";
import { countRecordWaiting } from "@/lib/speech/record-queue";
import {
  nextListenRound,
  restrictedClipIds,
} from "@/lib/speech/listen-rounds";
import { staleRecordingIds } from "@/lib/answer-edit";
import { needsFix } from "@/lib/answer-revisions";
import { toneCount } from "@/lib/tone/tone-pass";
import { computeQueueState } from "@/lib/pairing";
import { loadQueueInputs } from "@/lib/queue-input";

/**
 * "Waiting for you" on the annotator Dashboard (annotator experience spec,
 * section 4.2): how much of each kind of work is waiting for this person.
 *
 * The rule the page lives by: every number equals the length of the queue
 * its card opens. So each count here either calls the queue's own loader or
 * asks the database the SAME question its queue route asks (the `where`
 * objects below are copies of the routes', and waiting.test.ts fails if
 * either side drifts), and counts the answer the way the route does.
 *
 *   Record  -> GET /api/lab/speech/next         (the Record queue's own
 *              loader: own answers with no clip, plus own answers that
 *              still miss the English clip)
 *   Listen  -> GET /api/lab/speech/listen/next  (progress.remaining: the
 *              person's open assigned rounds first, then the open queue)
 *   Check   -> GET /api/lab/speech/check/next   (progress.remaining, which
 *              leaves out a clip whose text changed after it was recorded)
 *   Tone    -> GET /api/annotator/tone/count    (waiting: items given to
 *              this person and not yet marked)
 *   Fix     -> GET /api/annotator/history?filter=fix (the same needsFix rule)
 *   Annotate comes from computeQueueState in the summary route, as before.
 */

/** Never count a frozen prompt: the filter every speech queue uses. */
const NOT_FROZEN = { isHoldout: false, split: { not: "test" as const } };

// ─── Record ──────────────────────────────────────────────────────────────
// The Record queue and this count share one loader (loadRecordQueue in
// lib/speech/record-queue.ts), so there is no second copy of the question.

// ─── Listen ──────────────────────────────────────────────────────────────

export const listenClipsWhere = (restricted: string[] = []) => ({
  // The synthetic clips of assigned rounds never enter the open queue.
  ...(restricted.length > 0 ? { id: { notIn: restricted } } : {}),
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

/**
 * Clips from other speakers still to check: those whose answer has text and
 * whose text did not change after the clip was recorded (`stale`).
 */
export function checkRemaining(
  clips: { id?: string; coldAuthorAnswer: { answerText: string } | null }[],
  stale: Set<string> = new Set(),
): number {
  return clips.filter(
    (c) =>
      c.coldAuthorAnswer?.answerText.trim() &&
      !(c.id !== undefined && stale.has(c.id)),
  ).length;
}

// ─── Your answers to fix ─────────────────────────────────────────────────

/**
 * The Dashboard never opens to hundreds (decision 6): measured on 13 Nov
 * 2026, annotators had between 3 and 263 answers to fix. The card shows at
 * most this many; the rest wait behind them.
 */
export const FIX_HOME_CAP = 20;

/**
 * Own answers that need more: an answer with no English meaning, or a
 * correction with no reason or a reason under 20 characters. One rule,
 * needsFix in lib/answer-revisions.ts, which My Work's filter also uses, so
 * the card's number is the length of the list it opens.
 */
export function fixTotal(
  answers: { englishGloss: string | null }[],
  corrections: { rationale: string | null }[],
): number {
  return (
    answers.filter((a) =>
      needsFix({ kind: "cold", englishGloss: a.englishGloss }),
    ).length +
    corrections.filter((c) =>
      needsFix({ kind: "edit", rationale: c.rationale }),
    ).length
  );
}

// ─── Loading and the cards ───────────────────────────────────────────────

export interface WaitingCounts {
  annotate: number;
  record: number;
  listen: number;
  check: number;
  /**
   * Pass 2, tone marks: items given to this person and not yet marked. Zero
   * for anyone who was given none, so the card never shows an empty queue.
   */
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
  const listen = async (): Promise<number> => {
    // Assigned rounds come first, exactly as the Listen queue serves them:
    // while one is open and its prompt is not frozen, the queue's figure is
    // the number of open rounds.
    const assigned = await nextListenRound(prisma, userId);
    if (assigned) {
      const prompt = await prisma.prompt.findUnique({
        where: { id: assigned.round.promptId },
        select: { isHoldout: true, split: true },
      });
      if (prompt && !prompt.isHoldout && prompt.split !== "test") {
        return assigned.remaining;
      }
    }
    const restricted = await restrictedClipIds(prisma);
    const [clips, done] = await Promise.all([
      prisma.speechRecording.findMany({
        where: listenClipsWhere(restricted),
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
    ]);
    return listenRemaining(clips, done);
  };
  const check = async (): Promise<number> => {
    const mine = await prisma.speechCheck.findMany({
      where: checkedByMeWhere(userId),
      select: { recordingId: true },
    });
    const toCheck = await prisma.speechRecording.findMany({
      take: CHECK_MAX_CANDIDATES,
      where: checkClipsWhere(
        userId,
        mine.map((c) => c.recordingId),
      ),
      select: {
        id: true,
        coldAuthorAnswerId: true,
        language: true,
        createdAt: true,
        coldAuthorAnswer: { select: { answerText: true } },
      },
    });
    return checkRemaining(toCheck, await staleRecordingIds(toCheck));
  };
  const speech = async () => {
    if (!on.speech) return { record: 0, listen: 0, check: 0 };
    const [record, listenCount, checkCount] = await Promise.all([
      countRecordWaiting(userId),
      listen(),
      check(),
    ]);
    return { record, listen: listenCount, check: checkCount };
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
  // Tone items are given to named people, speech on or off. Nobody else has
  // any, and toneCount answers zero before its tables exist.
  const [s, total, tone] = await Promise.all([
    speech(),
    fix(),
    toneCount(userId),
  ]);
  return {
    ...s,
    tone: tone.waiting,
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
 * empty. Record and Listen open the tabs of the one Speech link (/speak),
 * for researchers and annotators alike; the old Lab paths redirect there.
 */
export function waitingCards(counts: WaitingCounts): WaitingCard[] {
  const speak = { record: "/speak", listen: "/speak/listen" };
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

/**
 * How many prompts Annotate would still serve this person: the same loader
 * and the same pure function as /api/annotations/next and the Dashboard's
 * summary, so the three can never show different numbers.
 */
export async function countAnnotateWaiting(annotatorId: string): Promise<number> {
  const [{ queuePrompts }, doneRows, skipRows] = await Promise.all([
    loadQueueInputs(),
    prisma.pairwiseComparison.findMany({
      where: { annotatorId, isDemo: false },
      select: { promptId: true },
    }),
    prisma.promptFlag.findMany({
      where: { annotatorId },
      select: { prompt: { select: { promptId: true } } },
    }),
  ]);
  return computeQueueState(
    queuePrompts,
    new Set(doneRows.map((r) => r.promptId)),
    new Set(skipRows.map((r) => r.prompt.promptId)),
  ).remaining.length;
}

/** The sidebar and the Speech tabs: one number per place a person works. */
export interface NavWaiting {
  annotate: number;
  /** Record + Listen + Check: what the Speech link opens onto. */
  speech: number;
  record: number;
  listen: number;
  check: number;
  /** Answers to fix, on My Work. */
  fix: number;
}

/**
 * What the navigation shows as waiting. Nothing for a research lead: a lead
 * reads the work, they are not handed a queue, so a count would be noise
 * (Halim, Nov 17 2026). Pure, so the rule is held by a test.
 */
export function navWaiting(
  counts: Pick<WaitingCounts, "annotate" | "record" | "listen" | "check" | "fixTotal">,
  who: { lead: boolean; speech: boolean },
): NavWaiting | null {
  if (who.lead) return null;
  const record = who.speech ? counts.record : 0;
  const listen = who.speech ? counts.listen : 0;
  const check = who.speech ? counts.check : 0;
  return {
    annotate: counts.annotate,
    speech: record + listen + check,
    record,
    listen,
    check,
    fix: counts.fixTotal,
  };
}
