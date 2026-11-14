import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sanitizeDialect } from "@/lib/dialects";
import {
  cleanTranslation,
  MAX_TRANSLATION_CHARS,
  MIN_TRANSLATION_CHARS,
} from "@/lib/speech/limits";
import {
  attachReasons,
  diffToSegments,
  nfc,
  reasonKeyFor,
  sanitizeSegments,
  segmentHasReason,
  segmentsEnvelope,
  type EditSegment,
  type ReasonMap,
} from "@/lib/edit-segments";
import {
  EDITABLE_FIELDS,
  LOCKED_MESSAGE,
  MAX_FIELD_CHARS,
  REQUIRED_FIELDS,
  canEditField,
  changedFields,
  cleanSaveId,
  firstVersion,
  isMissingTable,
  lockedKeysIn,
  needsFix,
  CLIP_TEXT_FIELDS,
  newSaveId,
  staleClipIds,
  storedText,
  type ClipLite,
  type FieldChange,
  type RevisionTarget,
} from "@/lib/answer-revisions";

/**
 * THE EDIT LOG'S DATABASE SIDE. One function saves an edit for both doors:
 * the author's route (/api/annotator/answers/[type]/[id]) and the
 * researcher's (/api/admin/annotations/[type]/[id]). Both therefore refuse
 * the same things and write the same revision rows.
 *
 * Every read and write names its columns (select), never the whole row:
 * production may lag the client on a newly added nullable column, and
 * returning every scalar then fails the request.
 */

export interface EditResult {
  status: number;
  body: Record<string, unknown>;
}

const fail = (status: number, error: string): EditResult => ({
  status,
  body: { error },
});

interface Parent {
  annotatorId: string;
  isDemo: boolean;
  /** Current values of the editable text fields. */
  current: Record<string, string | null>;
  /** Prompt keys this row may be filed under (cuid and public code). */
  promptKeys: string[];
  /** Edit rows only. */
  originalText?: string;
  segments?: unknown;
}

async function loadParent(
  type: RevisionTarget,
  id: string,
): Promise<Parent | null> {
  if (type === "cold") {
    const r = await prisma.coldAuthorAnswer.findUnique({
      where: { id },
      select: {
        annotatorId: true,
        isDemo: true,
        answerText: true,
        englishGloss: true,
        englishTranslation: true,
        dialect: true,
        instructionIg: true,
        promptId: true,
        prompt: { select: { promptId: true } },
      },
    });
    if (!r) return null;
    return {
      annotatorId: r.annotatorId,
      isDemo: r.isDemo,
      current: {
        answerText: r.answerText,
        englishGloss: r.englishGloss,
        englishTranslation: r.englishTranslation,
        dialect: r.dialect,
        instructionIg: r.instructionIg,
      },
      promptKeys: [r.promptId, r.prompt?.promptId].filter(
        (k): k is string => !!k,
      ),
    };
  }
  if (type === "edit") {
    const r = await prisma.outputEdit.findUnique({
      where: { id },
      select: {
        annotatorId: true,
        isDemo: true,
        originalText: true,
        correctedText: true,
        rationale: true,
        segments: true,
        promptId: true,
      },
    });
    if (!r) return null;
    return {
      annotatorId: r.annotatorId,
      isDemo: r.isDemo,
      current: { correctedText: r.correctedText, rationale: r.rationale },
      promptKeys: [r.promptId],
      originalText: r.originalText,
      segments: r.segments,
    };
  }
  if (type === "pairwise") {
    const r = await prisma.pairwiseComparison.findUnique({
      where: { id },
      select: {
        annotatorId: true,
        isDemo: true,
        explanation: true,
        promptId: true,
      },
    });
    if (!r) return null;
    return {
      annotatorId: r.annotatorId,
      isDemo: r.isDemo,
      current: { explanation: r.explanation },
      promptKeys: [r.promptId],
    };
  }
  const r = await prisma.speechComparison.findUnique({
    where: { id },
    select: { annotatorId: true, isDemo: true, note: true, promptId: true },
  });
  if (!r) return null;
  return {
    annotatorId: r.annotatorId,
    isDemo: r.isDemo,
    current: { note: r.note },
    promptKeys: [r.promptId],
  };
}

/** The stored segments of an edit row, in a fixed key order, so two envelopes
 *  compare equal whatever order the database returns their keys in. */
function storedSegments(raw: unknown): EditSegment[] {
  const list =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as { segments?: unknown }).segments
      : null;
  if (!Array.isArray(list)) return [];
  const out: EditSegment[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (
      typeof o.start !== "number" ||
      typeof o.end !== "number" ||
      typeof o.original !== "string" ||
      typeof o.replacement !== "string"
    ) {
      continue;
    }
    const seg: EditSegment = {
      start: o.start,
      end: o.end,
      original: o.original,
      replacement: o.replacement,
    };
    if (typeof o.reason === "string" && o.reason.trim()) seg.reason = o.reason;
    if (Array.isArray(o.reasonTags) && o.reasonTags.length > 0) {
      seg.reasonTags = o.reasonTags.filter(
        (t): t is string => typeof t === "string",
      );
    }
    out.push(seg);
  }
  return out;
}

function canonicalSegments(segs: EditSegment[]): string {
  return JSON.stringify(
    segmentsEnvelope(
      segs.map((s) => ({
        start: s.start,
        end: s.end,
        original: s.original,
        replacement: s.replacement,
        ...(s.reason ? { reason: s.reason } : {}),
        ...(s.reasonTags?.length ? { reasonTags: s.reasonTags } : {}),
      })),
    ),
  );
}

/** Keep the reasons already given on spans that still exist after a rewrite. */
function carryReasons(old: EditSegment[], next: EditSegment[]): EditSegment[] {
  const map: ReasonMap = {};
  old.forEach((s, i) => {
    if (segmentHasReason(s)) {
      map[reasonKeyFor(old, i)] = {
        tags: s.reasonTags ?? [],
        text: s.reason ?? "",
      };
    }
  });
  return attachReasons(next, map);
}

/**
 * Had the author already seen AI outputs for this prompt? Always yes for a
 * correction, a comparison or a Listen judgment (they exist only after the
 * outputs). For an own answer it is yes when the author has a comparison on
 * the prompt, and no for an answer written on the Record page with no
 * comparison yet.
 */
async function afterRevealFor(
  type: RevisionTarget,
  parent: Parent,
): Promise<boolean> {
  if (type !== "cold") return true;
  const seen = await prisma.pairwiseComparison.count({
    where: {
      annotatorId: parent.annotatorId,
      promptId: { in: parent.promptKeys },
    },
  });
  return seen > 0;
}

export async function applyAnswerEdit(args: {
  type: RevisionTarget;
  id: string;
  body: Record<string, unknown>;
  userId: string;
  role: string | null | undefined;
}): Promise<EditResult> {
  const { type, id, body, userId, role } = args;

  // The judgment is refused first, for every role and every row, before the
  // row is even read: nothing about who is asking changes this answer.
  if (lockedKeysIn(body).length > 0) return fail(405, LOCKED_MESSAGE);

  const named = Object.keys(body).filter((k) => k !== "saveId");
  const unknown = named.filter((k) => !EDITABLE_FIELDS[type].includes(k));
  if (unknown.length > 0) {
    return fail(400, `Unknown field: ${unknown.join(", ")}`);
  }
  if (named.length === 0) return fail(400, "Nothing to update");

  const parent = await loadParent(type, id);
  if (!parent) return fail(404, "Not found");
  const isAuthor = parent.annotatorId === userId;

  for (const field of named) {
    if (!canEditField({ role, isAuthor, type, field })) {
      return fail(
        403,
        isAuthor
          ? "This cannot be changed."
          : "You can only edit your own answers.",
      );
    }
  }

  // Text fields: strings, capped, required ones never emptied.
  const patch: Record<string, string | null> = {};
  for (const field of named) {
    if (field === "segments") continue;
    const raw = body[field];
    if (raw !== null && typeof raw !== "string") {
      return fail(400, `${field} must be text`);
    }
    if (typeof raw === "string" && raw.length > MAX_FIELD_CHARS) {
      return fail(400, `${field} is too long`);
    }
    let value = storedText(raw as string | null);
    if (field === "dialect") value = sanitizeDialect(value);
    // The short English translation keeps the shape the Record page gives
    // it: single spaces, 2 to 200 characters. It may be emptied.
    if (field === "englishTranslation" && value !== null) {
      value = cleanTranslation(value) || null;
      if (
        value !== null &&
        (value.length < MIN_TRANSLATION_CHARS ||
          value.length > MAX_TRANSLATION_CHARS)
      ) {
        return fail(
          400,
          `The short English translation must be ${MIN_TRANSLATION_CHARS} to ${MAX_TRANSLATION_CHARS} characters.`,
        );
      }
    }
    if (value === null && REQUIRED_FIELDS[type].includes(field)) {
      return fail(400, `${field} must be a non-empty string`);
    }
    patch[field] = value;
  }

  const changes: FieldChange[] = changedFields(parent.current, patch);
  const data: Record<string, unknown> = {};
  for (const c of changes) data[c.field] = c.after;

  // A correction keeps the editing-ground invariant on the stored row:
  // applying the segments to the original reproduces the corrected text.
  if (type === "edit") {
    const originalNfc = nfc(parent.originalText ?? "");
    const corrected =
      patch.correctedText ?? nfc(parent.current.correctedText ?? "");
    const textChanged = changes.some((c) => c.field === "correctedText");
    const old = storedSegments(parent.segments);
    let next: EditSegment[] | null = null;
    if ("segments" in body) {
      next = sanitizeSegments(body.segments, originalNfc, corrected);
      if (next === null) {
        return fail(
          400,
          "The reasons do not match the text. Reload the page and try again.",
        );
      }
    } else if (textChanged) {
      next = carryReasons(old, diffToSegments(originalNfc, corrected));
    }
    if (next !== null) {
      const before = parent.segments == null ? null : canonicalSegments(old);
      const after = canonicalSegments(next);
      if (before !== after) {
        changes.push({ field: "segments", before, after });
        data.segments = segmentsEnvelope(
          next,
        ) as unknown as Prisma.InputJsonValue;
      }
    }
    // Legacy rows may predate the NFC contract: re-store the NFC original so
    // the offsets address the text actually on the row.
    if (
      (textChanged || data.segments !== undefined) &&
      parent.originalText !== originalNfc
    ) {
      data.originalText = originalNfc;
    }
  }

  const saveId = cleanSaveId(body.saveId) ?? newSaveId();
  if (changes.length === 0) {
    return {
      status: 200,
      body: { success: true, changed: [], saveId, clipsStale: false },
    };
  }

  const afterReveal = await afterRevealFor(type, parent);
  const revisions = changes.map((c) => ({
    saveId,
    targetType: type,
    targetId: id,
    field: c.field,
    before: c.before,
    after: c.after,
    editorId: userId,
    authorId: parent.annotatorId,
    afterReveal,
    // Demo rows stay demo: the flag is copied, never set from the request.
    isDemo: parent.isDemo,
  }));

  const where = { id };
  const select = { id: true } as const;
  const update =
    type === "cold"
      ? prisma.coldAuthorAnswer.update({ where, data, select })
      : type === "edit"
        ? prisma.outputEdit.update({ where, data, select })
        : type === "pairwise"
          ? prisma.pairwiseComparison.update({ where, data, select })
          : prisma.speechComparison.update({ where, data, select });

  try {
    // The log first, then the row, in one transaction: an edit with no log
    // row never lands, and a log row with no edit never lands.
    await prisma.$transaction([
      prisma.answerRevision.createMany({ data: revisions }),
      update,
    ]);
  } catch (e) {
    if (isMissingTable(e)) {
      return fail(
        503,
        "Editing is not switched on yet. Please try again later.",
      );
    }
    if (
      typeof e === "object" &&
      e !== null &&
      (e as { code?: string }).code === "P2025"
    ) {
      return fail(404, "Not found");
    }
    console.error("answer edit failed:", e);
    return fail(500, "Could not save your changes. Please try again.");
  }

  // Clips that read the changed words are now out of date (never deleted).
  let clipsStale = false;
  if (
    type === "cold" &&
    changes.some((c) => CLIP_TEXT_FIELDS.includes(c.field))
  ) {
    try {
      // An Igala clip reads the answer. An English clip reads the short
      // translation when it recorded one (spokenText), else the meaning.
      const changed = (field: string) => changes.some((c) => c.field === field);
      const reads = [
        ...(changed("answerText") ? [{ language: "igala" }] : []),
        ...(changed("englishGloss")
          ? [{ language: "english", spokenText: null }]
          : []),
        ...(changed("englishTranslation")
          ? [{ language: "english", spokenText: { not: null } }]
          : []),
      ];
      clipsStale =
        (await prisma.speechRecording.count({
          where: { coldAuthorAnswerId: id, OR: reads },
        })) > 0;
    } catch {
      clipsStale = false;
    }
  }

  return {
    status: 200,
    body: {
      success: true,
      changed: changes.map((c) => c.field),
      saveId,
      clipsStale,
    },
  };
}

// ─── Reading an episode back for the drawer ─────────────────────────────────

export interface ClipInfo {
  id: string;
  language: string;
  durationMs: number;
  stale: boolean;
}

export type EditItem =
  | {
      type: "cold";
      id: string;
      createdAt: string;
      answerText: string;
      englishGloss: string | null;
      englishTranslation: string | null;
      dialect: string | null;
      instructionIg: string | null;
      provenance: string;
      needsFix: boolean;
      firstVersion: { text: string | null; savedAt: string } | null;
      clips: ClipInfo[];
    }
  | {
      type: "pairwise";
      id: string;
      createdAt: string;
      winner: string;
      explanation: string;
    }
  | {
      type: "edit";
      id: string;
      createdAt: string;
      onOutput: "A" | "B" | null;
      originalText: string;
      correctedText: string;
      rationale: string | null;
      segments: EditSegment[];
      needsFix: boolean;
    }
  | {
      type: "listen";
      id: string;
      createdAt: string;
      winner: string;
      note: string;
    };

export interface EditEpisode {
  promptText: string;
  items: EditItem[];
}

/**
 * The rows of one episode that belong to `userId`, starting from any one of
 * them: the own answer, the comparison and the corrections on the same
 * prompt. Owner only: someone else's row answers 403, for every role (a
 * researcher reads other people's rows in Annotations, as before).
 */
export async function loadEditEpisode(args: {
  type: RevisionTarget;
  id: string;
  userId: string;
  withClips: boolean;
}): Promise<EditResult> {
  const { type, id, userId, withClips } = args;
  const parent = await loadParent(type, id);
  if (!parent) return fail(404, "Not found");
  if (parent.annotatorId !== userId) {
    return fail(403, "You can only edit your own answers.");
  }

  if (type === "listen") {
    const r = await prisma.speechComparison.findUnique({
      where: { id },
      select: {
        id: true,
        createdAt: true,
        winner: true,
        note: true,
        prompt: { select: { text: true } },
      },
    });
    if (!r) return fail(404, "Not found");
    const episode: EditEpisode = {
      promptText: r.prompt?.text ?? "",
      items: [
        {
          type: "listen",
          id: r.id,
          createdAt: r.createdAt.toISOString(),
          winner: r.winner,
          note: r.note,
        },
      ],
    };
    return { status: 200, body: { ...episode } };
  }

  const prompt = await prisma.prompt.findFirst({
    where: {
      OR: [
        { id: { in: parent.promptKeys } },
        { promptId: { in: parent.promptKeys } },
      ],
    },
    select: { id: true, promptId: true, text: true },
  });
  const keys = [
    ...new Set([
      ...parent.promptKeys,
      ...(prompt ? [prompt.id, prompt.promptId] : []),
    ]),
  ];

  // A counted prompt is judged once per person, so the prompt names the
  // episode. A demo row can repeat, so it is shown alone.
  const scope = { annotatorId: userId, isDemo: parent.isDemo };
  const only = parent.isDemo ? { id } : {};
  const [cold, pairwise, edits] = await Promise.all([
    parent.isDemo && type !== "cold"
      ? Promise.resolve([])
      : prisma.coldAuthorAnswer.findMany({
          where: { ...scope, ...only, promptId: { in: keys } },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            createdAt: true,
            answerText: true,
            englishGloss: true,
            englishTranslation: true,
            dialect: true,
            instructionIg: true,
            provenance: true,
          },
        }),
    parent.isDemo && type !== "pairwise"
      ? Promise.resolve([])
      : prisma.pairwiseComparison.findMany({
          where: { ...scope, ...only, promptId: { in: keys } },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            createdAt: true,
            winner: true,
            explanation: true,
            modelOutputAId: true,
            modelOutputBId: true,
          },
        }),
    parent.isDemo && type !== "edit"
      ? Promise.resolve([])
      : prisma.outputEdit.findMany({
          where: { ...scope, ...only, promptId: { in: keys } },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            createdAt: true,
            modelOutputId: true,
            originalText: true,
            correctedText: true,
            rationale: true,
            segments: true,
          },
        }),
  ]);

  const coldIds = cold.map((c) => c.id);
  let revisions: {
    id: string;
    targetId: string;
    field: string;
    before: string | null;
    after: string | null;
    createdAt: Date;
  }[] = [];
  if (coldIds.length > 0) {
    try {
      revisions = await prisma.answerRevision.findMany({
        where: { targetType: "cold", targetId: { in: coldIds } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          targetId: true,
          field: true,
          before: true,
          after: true,
          createdAt: true,
        },
      });
    } catch (e) {
      if (!isMissingTable(e)) throw e;
    }
  }

  let clips: {
    id: string;
    coldAuthorAnswerId: string | null;
    language: string;
    spokenText: string | null;
    durationMs: number;
    createdAt: Date;
  }[] = [];
  if (withClips && coldIds.length > 0) {
    try {
      // Never the audio itself: `bytes` is not selected.
      clips = await prisma.speechRecording.findMany({
        where: { coldAuthorAnswerId: { in: coldIds }, annotatorId: userId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          coldAuthorAnswerId: true,
          language: true,
          spokenText: true,
          durationMs: true,
          createdAt: true,
        },
      });
    } catch {
      clips = [];
    }
  }
  const stale = staleClipIds(clips, revisions);

  const sideOf = (outputId: string): "A" | "B" | null => {
    for (const p of pairwise) {
      if (p.modelOutputAId === outputId) return "A";
      if (p.modelOutputBId === outputId) return "B";
    }
    return null;
  };

  const items: EditItem[] = [
    ...cold.map((c): EditItem => {
      const first = firstVersion(
        revisions.filter((r) => r.targetId === c.id),
        "answerText",
        c.answerText,
      );
      return {
        type: "cold",
        id: c.id,
        createdAt: c.createdAt.toISOString(),
        answerText: c.answerText,
        englishGloss: c.englishGloss,
        englishTranslation: c.englishTranslation,
        dialect: c.dialect,
        instructionIg: c.instructionIg,
        provenance: c.provenance,
        needsFix: needsFix({ kind: "cold", englishGloss: c.englishGloss }),
        firstVersion: first.edited
          ? { text: first.text, savedAt: c.createdAt.toISOString() }
          : null,
        clips: clips
          .filter((k) => k.coldAuthorAnswerId === c.id)
          .map((k) => ({
            id: k.id,
            language: k.language,
            durationMs: k.durationMs,
            stale: stale.has(k.id),
          })),
      };
    }),
    ...pairwise.map((p): EditItem => ({
      type: "pairwise",
      id: p.id,
      createdAt: p.createdAt.toISOString(),
      winner: p.winner,
      explanation: p.explanation,
    })),
    ...edits.map((e): EditItem => ({
      type: "edit",
      id: e.id,
      createdAt: e.createdAt.toISOString(),
      onOutput: sideOf(e.modelOutputId),
      originalText: e.originalText,
      correctedText: e.correctedText,
      rationale: e.rationale,
      segments: storedSegments(e.segments),
      needsFix: needsFix({ kind: "edit", rationale: e.rationale }),
    })),
  ];

  const episode: EditEpisode = { promptText: prompt?.text ?? "", items };
  return { status: 200, body: { ...episode } };
}

/**
 * The clips whose words changed after they were recorded (see staleClipIds).
 * For the queues and builders that should leave such a clip out until it is
 * recorded again. It never fails its caller: if the log cannot be read (the
 * table is not there yet), no clip is treated as out of date.
 */
export async function staleRecordingIds(
  clips: ClipLite[],
): Promise<Set<string>> {
  const answerIds = [
    ...new Set(
      clips
        .map((c) => c.coldAuthorAnswerId)
        .filter((id): id is string => !!id),
    ),
  ];
  if (answerIds.length === 0) return new Set();
  try {
    const revisions = await prisma.answerRevision.findMany({
      where: {
        targetType: "cold",
        targetId: { in: answerIds },
        field: { in: [...CLIP_TEXT_FIELDS] },
      },
      select: {
        targetId: true,
        field: true,
        before: true,
        after: true,
        createdAt: true,
      },
    });
    return staleClipIds(clips, revisions);
  } catch {
    return new Set();
  }
}
