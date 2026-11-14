import { prisma } from "@/lib/prisma";
import { isMissingTable } from "@/lib/answer-revisions";
import {
  itemOutcome,
  summarise,
  syllableRows,
  type AgreementSummary,
  type ItemStatus,
} from "@/lib/tone/agreement";
import {
  isToneOnlyChange,
  projectToneOnto,
  storedTone,
  wordsOf,
} from "@/lib/tone/tone";

/**
 * TONE-MARK PASS 2, THE DATABASE SIDE.
 *
 * Pass 1 is never edited, overwritten or deleted here. This file does not
 * read or write the pass-1 tables at all: an item carries the pass-1 text as
 * a snapshot taken when the set was loaded, and everything a marker does
 * lands in TonePass, TonePassAssignment and TonePassAgreed.
 *
 * Independence: a task never says who wrote the first version, who else is
 * marking it, or what they wrote. A person is never served an item twice.
 */

export const TONE_INSTRUCTION =
  "Pass 2: add tone marks. This is a second pass over answers that are already done. Some are yours, some are from other people. Add tone marks only. The first version stays saved.";

export const MAX_TONE_CHARS = 20000;
export const MAX_TONE_NOTE_CHARS = 500;
/** One item cannot add more than this to a person's time (30 minutes). */
export const MAX_ACTIVE_SECONDS = 30 * 60;

export interface ToneResult {
  status: number;
  body: Record<string, unknown>;
}
const fail = (
  status: number,
  error: string,
  extra: object = {},
): ToneResult => ({
  status,
  body: { error, ...extra },
});

export interface ToneTask {
  itemId: string;
  promptText: string;
  /** The pass-1 text, read-only. */
  firstVersion: string;
  /** The marker's own saved copy, when reopening it ("Edit previous"). */
  mine: {
    text: string;
    unsureWords: number[];
    note: string | null;
    flagged: boolean;
  } | null;
}

async function pendingItemIds(userId: string): Promise<string[]> {
  const [assigned, done] = await Promise.all([
    prisma.tonePassAssignment.findMany({
      where: { annotatorId: userId, skippedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { itemId: true },
    }),
    prisma.tonePass.findMany({
      where: { annotatorId: userId },
      select: { itemId: true },
    }),
  ]);
  const marked = new Set(done.map((d) => d.itemId));
  return assigned.map((a) => a.itemId).filter((id) => !marked.has(id));
}

/**
 * How many items wait for this person, and how many they have marked. The
 * sidebar line and the home card read this. Before the tables exist it
 * answers zero, so nothing shows and nothing breaks.
 */
export async function toneCount(
  userId: string,
): Promise<{ waiting: number; done: number }> {
  try {
    const [pending, done] = await Promise.all([
      pendingItemIds(userId),
      prisma.tonePass.count({ where: { annotatorId: userId } }),
    ]);
    return { waiting: pending.length, done };
  } catch (e) {
    if (isMissingTable(e)) return { waiting: 0, done: 0 };
    throw e;
  }
}

async function taskFor(
  itemId: string,
  mine: ToneTask["mine"],
): Promise<ToneTask | null> {
  const item = await prisma.tonePassItem.findUnique({
    where: { id: itemId },
    select: { id: true, promptId: true, sourceTextSnapshot: true },
  });
  if (!item) return null;
  const prompt = await prisma.prompt.findUnique({
    where: { id: item.promptId },
    select: { text: true },
  });
  return {
    itemId: item.id,
    promptText: prompt?.text ?? "",
    firstVersion: item.sourceTextSnapshot,
    mine,
  };
}

/**
 * The next item for this person, or the one they just saved when `reopen`
 * names it ("Edit previous"). Reopening only ever returns the person's own
 * saved copy.
 */
export async function nextToneTask(
  userId: string,
  reopen?: string | null,
): Promise<ToneResult> {
  try {
    if (reopen) {
      const saved = await prisma.tonePass.findUnique({
        where: { itemId_annotatorId: { itemId: reopen, annotatorId: userId } },
        select: {
          toneMarkedText: true,
          unsureWords: true,
          note: true,
          flaggedNonToneChange: true,
          flagText: true,
        },
      });
      if (!saved) return fail(404, "Not found");
      const task = await taskFor(reopen, {
        // A kept correction reopens as the marker typed it.
        text: saved.flagText ?? saved.toneMarkedText,
        unsureWords: saved.unsureWords,
        note: saved.note,
        flagged: saved.flaggedNonToneChange,
      });
      if (!task) return fail(404, "Not found");
      const pending = await pendingItemIds(userId);
      return {
        status: 200,
        body: {
          complete: false,
          task,
          progress: { remaining: pending.length },
        },
      };
    }
    const pending = await pendingItemIds(userId);
    const progress = { remaining: pending.length };
    if (pending.length === 0) {
      return { status: 200, body: { complete: true, progress } };
    }
    const task = await taskFor(pending[0], null);
    if (!task) return { status: 200, body: { complete: true, progress } };
    return { status: 200, body: { complete: false, task, progress } };
  } catch (e) {
    if (isMissingTable(e)) {
      return {
        status: 200,
        body: { complete: true, progress: { remaining: 0 } },
      };
    }
    throw e;
  }
}

/** Where the item stands after a save, kept in TonePassAgreed. A decision
 *  made by an adjudicator is never replaced by a count. */
async function refreshAgreed(itemId: string, required: number): Promise<void> {
  const [versions, existing] = await Promise.all([
    prisma.tonePass.findMany({
      where: { itemId },
      select: { toneMarkedText: true },
    }),
    prisma.tonePassAgreed.findUnique({
      where: { itemId },
      select: { method: true },
    }),
  ]);
  if (existing?.method === "adjudicated") return;
  const outcome = itemOutcome(
    versions.map((v) => v.toneMarkedText),
    required,
  );
  if (outcome.agreedText !== null && outcome.method !== null) {
    await prisma.tonePassAgreed.upsert({
      where: { itemId },
      create: {
        itemId,
        agreedText: outcome.agreedText,
        method: outcome.method,
      },
      update: {
        agreedText: outcome.agreedText,
        method: outcome.method,
        agreedAt: new Date(),
      },
      select: { id: true },
    });
  } else if (existing) {
    // A marker reopened a copy and the versions no longer agree: the counted
    // agreement is withdrawn, so no export carries a text nobody agrees on.
    await prisma.tonePassAgreed.deleteMany({
      where: { itemId, method: { in: ["exact", "majority"] } },
    });
  }
}

export async function saveTonePass(args: {
  userId: string;
  body: Record<string, unknown>;
}): Promise<ToneResult> {
  const { userId, body } = args;
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  if (!itemId) return fail(400, "itemId is required");
  if (typeof body.text !== "string" || body.text.trim().length === 0) {
    return fail(400, "The text cannot be empty.");
  }
  if (body.text.length > MAX_TONE_CHARS)
    return fail(400, "The text is too long.");
  const note =
    typeof body.note === "string" && body.note.trim()
      ? body.note.trim().slice(0, MAX_TONE_NOTE_CHARS)
      : null;
  const seconds =
    typeof body.activeSeconds === "number" &&
    Number.isFinite(body.activeSeconds)
      ? Math.max(
          0,
          Math.min(MAX_ACTIVE_SECONDS, Math.round(body.activeSeconds)),
        )
      : 0;

  try {
    const [item, assignment] = await Promise.all([
      prisma.tonePassItem.findUnique({
        where: { id: itemId },
        select: {
          id: true,
          sourceType: true,
          sourceId: true,
          sourceTextSnapshot: true,
          requiredMarkers: true,
        },
      }),
      prisma.tonePassAssignment.findUnique({
        where: { itemId_annotatorId: { itemId, annotatorId: userId } },
        select: { id: true },
      }),
    ]);
    if (!item) return fail(404, "Not found");
    // Only a person the item was given to may mark it.
    if (!assignment) return fail(403, "This item was not given to you.");

    const snapshot = item.sourceTextSnapshot;
    const toneOnly = isToneOnlyChange(snapshot, body.text);
    if (!toneOnly && body.keepAsCorrection !== true) {
      // The tone-only guard. The page asks: undo the other changes, or keep
      // them and flag them as a correction.
      return fail(409, "Something other than tone marks changed.", {
        code: "non_tone_change",
        undone: projectToneOnto(snapshot, body.text),
      });
    }
    const words = wordsOf(snapshot).length;
    const unsureWords = Array.isArray(body.unsureWords)
      ? [
          ...new Set(
            body.unsureWords.filter(
              (n): n is number =>
                typeof n === "number" &&
                Number.isInteger(n) &&
                n >= 0 &&
                n < words,
            ),
          ),
        ].sort((a, b) => a - b)
      : [];

    const data = {
      // A kept correction never enters the tone text: the tone text is the
      // marker's tone marks laid over the first version's own words.
      toneMarkedText: toneOnly
        ? storedTone(body.text)
        : projectToneOnto(snapshot, body.text),
      flaggedNonToneChange: !toneOnly,
      flagText: toneOnly ? null : storedTone(body.text),
      unsureWords,
      note,
    };
    const saved = await prisma.tonePass.upsert({
      where: { itemId_annotatorId: { itemId, annotatorId: userId } },
      create: {
        itemId,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        passNumber: 2,
        annotatorId: userId,
        sourceTextSnapshot: snapshot,
        activeSeconds: seconds,
        ...data,
      },
      // "Edit previous": the same row, updated. Time adds up.
      update: { ...data, activeSeconds: { increment: seconds } },
      select: { id: true },
    });
    await refreshAgreed(itemId, item.requiredMarkers);
    return {
      status: 200,
      body: { success: true, id: saved.id, flagged: !toneOnly },
    };
  } catch (e) {
    if (isMissingTable(e)) {
      return fail(503, "The tone pass is not switched on yet.");
    }
    console.error("tone pass save failed:", e);
    return fail(500, "Could not save. Please try again.");
  }
}

/** "Skip this one": the item does not come back to this person. A copy
 *  already saved is kept. */
export async function skipToneItem(
  userId: string,
  itemId: string,
): Promise<ToneResult> {
  try {
    const done = await prisma.tonePassAssignment.updateMany({
      where: { itemId, annotatorId: userId, skippedAt: null },
      data: { skippedAt: new Date() },
    });
    if (done.count === 0) return fail(404, "Not found");
    return { status: 200, body: { success: true } };
  } catch (e) {
    if (isMissingTable(e))
      return fail(503, "The tone pass is not switched on yet.");
    throw e;
  }
}

// ─── The researcher's side ──────────────────────────────────────────────────

export interface ToneAdminItem {
  itemId: string;
  setName: string;
  cells: string[];
  required: number;
  status: ItemStatus | "adjudicated";
  firstVersion: string;
  versions: {
    annotatorId: string;
    text: string;
    flagged: boolean;
    flagText: string | null;
    unsureWords: number[];
    note: string | null;
  }[];
  /** Positions (among the letters) where the versions give different tones. */
  differing: number[];
  agreed: { text: string; method: string } | null;
}

export interface ToneAdminData {
  summary: AgreementSummary;
  names: Record<string, string>;
  items: ToneAdminItem[];
  assigned: number;
  skipped: number;
}

export async function toneAdminData(): Promise<ToneAdminData> {
  const [items, passes, agreed, assignments] = await Promise.all([
    prisma.tonePassItem.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        setName: true,
        cells: true,
        requiredMarkers: true,
        sourceTextSnapshot: true,
      },
    }),
    prisma.tonePass.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        itemId: true,
        annotatorId: true,
        toneMarkedText: true,
        flaggedNonToneChange: true,
        flagText: true,
        unsureWords: true,
        note: true,
      },
    }),
    prisma.tonePassAgreed.findMany({
      select: { itemId: true, agreedText: true, method: true },
    }),
    prisma.tonePassAssignment.findMany({
      select: { annotatorId: true, skippedAt: true },
    }),
  ]);
  const byItem = new Map<string, typeof passes>();
  for (const p of passes) {
    byItem.set(p.itemId, [...(byItem.get(p.itemId) ?? []), p]);
  }
  const agreedBy = new Map(agreed.map((a) => [a.itemId, a]));
  const ids = [
    ...new Set([
      ...passes.map((p) => p.annotatorId),
      ...assignments.map((a) => a.annotatorId),
    ]),
  ];
  const users = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      })
    : [];

  const forSummary = items.map((i) => ({
    itemId: i.id,
    cells: i.cells,
    required: i.requiredMarkers,
    versions: (byItem.get(i.id) ?? []).map((p) => ({
      annotatorId: p.annotatorId,
      text: p.toneMarkedText,
    })),
  }));

  return {
    summary: summarise(forSummary),
    names: Object.fromEntries(users.map((u) => [u.id, u.name ?? u.id])),
    assigned: assignments.length,
    skipped: assignments.filter((a) => a.skippedAt !== null).length,
    items: items.map((i, n) => {
      const versions = byItem.get(i.id) ?? [];
      const a = agreedBy.get(i.id) ?? null;
      const outcome = itemOutcome(
        versions.map((v) => v.toneMarkedText),
        i.requiredMarkers,
      );
      return {
        itemId: i.id,
        setName: i.setName,
        cells: i.cells,
        required: i.requiredMarkers,
        status: a?.method === "adjudicated" ? "adjudicated" : outcome.status,
        firstVersion: i.sourceTextSnapshot,
        versions: versions.map((v) => ({
          annotatorId: v.annotatorId,
          text: v.toneMarkedText,
          flagged: v.flaggedNonToneChange,
          flagText: v.flagText,
          unsureWords: v.unsureWords,
          note: v.note,
        })),
        differing:
          versions.length >= 2
            ? syllableRows(forSummary[n].versions)
                .filter((r) => !r.agreed)
                .map((r) => r.position)
            : [],
        agreed: a ? { text: a.agreedText, method: a.method } : null,
      };
    }),
  };
}

/** The adjudicator's decision. The agreed text must itself be tone-only
 *  against the first version: an adjudicator settles tone, not wording. */
export async function adjudicateTone(args: {
  adjudicatorId: string;
  body: Record<string, unknown>;
}): Promise<ToneResult> {
  const { adjudicatorId, body } = args;
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  if (!itemId) return fail(400, "itemId is required");
  if (typeof body.agreedText !== "string" || !body.agreedText.trim()) {
    return fail(400, "The agreed text cannot be empty.");
  }
  try {
    const item = await prisma.tonePassItem.findUnique({
      where: { id: itemId },
      select: { sourceTextSnapshot: true },
    });
    if (!item) return fail(404, "Not found");
    if (!isToneOnlyChange(item.sourceTextSnapshot, body.agreedText)) {
      return fail(
        400,
        "The agreed text may differ from the first version in tone marks only.",
      );
    }
    const data = {
      agreedText: storedTone(body.agreedText),
      method: "adjudicated",
      adjudicatorId,
      agreedAt: new Date(),
    };
    await prisma.tonePassAgreed.upsert({
      where: { itemId },
      create: { itemId, ...data },
      update: data,
      select: { id: true },
    });
    return { status: 200, body: { success: true } };
  } catch (e) {
    if (isMissingTable(e))
      return fail(503, "The tone pass is not switched on yet.");
    throw e;
  }
}
