import { nfc } from "@/lib/edit-segments";

/**
 * THE EDIT LOG'S PURE CORE (annotator experience spec, section 6).
 *
 * The rule: you can edit what you wrote, when you want. You cannot change
 * what you judged. Every save writes one AnswerRevision row per changed
 * field, with the exact before and after, and then updates the parent row as
 * before, so every screen and export keeps reading the parent row.
 *
 * This file holds what is true without a database: which fields exist, who
 * may change which, what counts as a change, and how the first version is
 * recovered from a list of revisions. The database side is
 * src/lib/answer-edit.ts. Column contract: out/edit/CONTRACT.md (Nov 13
 * program notes), read by the TIME lane, which counts these rows as work.
 */

export const REVISION_TARGETS = ["cold", "edit", "pairwise", "listen"] as const;
export type RevisionTarget = (typeof REVISION_TARGETS)[number];

export function isRevisionTarget(v: unknown): v is RevisionTarget {
  return (
    typeof v === "string" && (REVISION_TARGETS as readonly string[]).includes(v)
  );
}

/**
 * The fields an author may change, per kind of row. Adding a field is one
 * entry here (for example `englishTranslation` on cold, once its column
 * exists) plus its box in the drawer.
 */
export const EDITABLE_FIELDS: Record<RevisionTarget, readonly string[]> = {
  cold: ["answerText", "englishGloss", "dialect", "instructionIg"],
  edit: ["correctedText", "rationale", "segments"],
  pairwise: ["explanation"],
  listen: ["note"],
};

/** Fields that may be changed but never emptied: the episode required them. */
export const REQUIRED_FIELDS: Record<RevisionTarget, readonly string[]> = {
  cold: ["answerText"],
  edit: ["correctedText", "rationale"],
  pairwise: ["explanation"],
  listen: ["note"],
};

/**
 * What a researcher may change on ANOTHER person's row: the answer text
 * only, as before this shipped, now logged (decision 4: a researcher does
 * not edit another person's meaning or reason).
 */
export const RESEARCHER_FIELDS_ON_OTHERS: Record<
  RevisionTarget,
  readonly string[]
> = {
  cold: ["answerText"],
  edit: ["correctedText"],
  pairwise: [],
  listen: [],
};

/**
 * The judgment. A request that names any of these is refused with 405 for
 * every role, whatever else it carries: the choice was made blind, and
 * changing it later would change the scoreboard after the fact.
 */
export const LOCKED_KEYS: readonly string[] = [
  "winner",
  "confidence",
  "failureTagsA",
  "failureTagsB",
  "failureTags",
  "score",
  "scores",
  "axis",
  "axes",
  "axisScores",
  "rubric",
  "rubricScores",
  "reasonTags",
  "verdict",
];

/** Free text is capped, never silently cut: a longer value is refused. */
export const MAX_FIELD_CHARS = 20000;

export const LOCKED_MESSAGE =
  "The choice and the scores cannot be changed. Only the text can.";

export function lockedKeysIn(body: Record<string, unknown>): string[] {
  return LOCKED_KEYS.filter((k) => k in body);
}

/**
 * May this person change this field on this row?
 *   - the author: every editable field of the row, whatever their role
 *     (new for ANNOTATOR accounts);
 *   - a researcher who is not the author: answer text only;
 *   - anyone else: nothing.
 */
export function canEditField(args: {
  role: string | null | undefined;
  isAuthor: boolean;
  type: RevisionTarget;
  field: string;
}): boolean {
  const { role, isAuthor, type, field } = args;
  if (isAuthor) return EDITABLE_FIELDS[type].includes(field);
  if (role === "RESEARCHER") {
    return RESEARCHER_FIELDS_ON_OTHERS[type].includes(field);
  }
  return false;
}

/**
 * The stored shape of a text value: NFC, trimmed, and null when empty. Two
 * values that differ only by Unicode form (NFC against NFD) or by outer
 * whitespace are the same value, so they make no revision.
 */
export function storedText(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = nfc(v).trim();
  return t.length > 0 ? t : null;
}

export interface FieldChange {
  field: string;
  before: string | null;
  after: string | null;
}

/**
 * One change per field whose stored shape differs. `patch` holds only the
 * fields the request named; a field it does not name is never a change.
 */
export function changedFields(
  current: Record<string, string | null | undefined>,
  patch: Record<string, string | null | undefined>,
): FieldChange[] {
  const out: FieldChange[] = [];
  for (const field of Object.keys(patch)) {
    const before = storedText(current[field]);
    const after = storedText(patch[field]);
    if (before !== after) out.push({ field, before, after });
  }
  return out;
}

export interface RevisionLite {
  field: string;
  before: string | null;
  after: string | null;
  createdAt: Date | string;
  id?: string;
}

function at(r: RevisionLite): number {
  return typeof r.createdAt === "string"
    ? Date.parse(r.createdAt)
    : r.createdAt.getTime();
}

/** Oldest first; ties broken by id so the order is stable. */
export function sortRevisions<T extends RevisionLite>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => at(a) - at(b) || (a.id ?? "").localeCompare(b.id ?? ""),
  );
}

/**
 * The first version of a field: the `before` of its oldest revision. With no
 * revision the parent row still holds the first version, so `current` is it.
 * `edited` says which of the two it was.
 */
export function firstVersion(
  revisions: RevisionLite[],
  field: string,
  current: string | null,
): { text: string | null; edited: boolean; editCount: number } {
  const mine = sortRevisions(revisions.filter((r) => r.field === field));
  if (mine.length === 0) return { text: current, edited: false, editCount: 0 };
  return { text: mine[0].before, edited: true, editCount: mine.length };
}

/** A save id: one per press of "Save changes". The client may send its own
 *  (so one press that touches three rows shares one id); anything that is
 *  not a plain token is replaced. */
export function cleanSaveId(raw: unknown): string | null {
  return typeof raw === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(raw)
    ? raw
    : null;
}

export function newSaveId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** Prisma's "the table does not exist" (the migration is not applied yet). */
export function isMissingTable(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "P2021"
  );
}

/**
 * "Your answers to fix" (decision 6, the recommended rule): an own answer
 * with no English meaning, or a correction with no reason or a reason under
 * 20 characters. The count is measured before any home card shows it.
 */
export const SHORT_REASON_CHARS = 20;

export function needsFix(
  row:
    | { kind: "cold"; englishGloss: string | null | undefined }
    | { kind: "edit"; rationale: string | null | undefined }
    | { kind: "pairwise" },
): boolean {
  if (row.kind === "cold") return storedText(row.englishGloss) === null;
  if (row.kind === "edit") {
    return (storedText(row.rationale)?.length ?? 0) < SHORT_REASON_CHARS;
  }
  return false;
}

export interface ClipLite {
  id: string;
  coldAuthorAnswerId: string | null;
  language: string;
  createdAt: Date | string;
}

/**
 * Which clips read a text that changed after they were recorded. An Igala
 * clip reads the answer; an English clip reads the meaning. No clip is ever
 * deleted or altered: Check and the dataset builder leave these out until a
 * newer clip exists. `revisions` are cold-row revisions keyed by targetId.
 */
export function staleClipIds(
  clips: ClipLite[],
  revisions: (RevisionLite & { targetId: string })[],
): Set<string> {
  const latest = new Map<string, number>();
  for (const r of revisions) {
    if (r.field !== "answerText" && r.field !== "englishGloss") continue;
    const key = `${r.targetId}|${r.field}`;
    const t = at(r);
    if (t > (latest.get(key) ?? 0)) latest.set(key, t);
  }
  const out = new Set<string>();
  for (const c of clips) {
    if (!c.coldAuthorAnswerId) continue;
    const field = c.language === "english" ? "englishGloss" : "answerText";
    const changedAt = latest.get(`${c.coldAuthorAnswerId}|${field}`);
    const recordedAt =
      typeof c.createdAt === "string"
        ? Date.parse(c.createdAt)
        : c.createdAt.getTime();
    if (changedAt !== undefined && changedAt > recordedAt) out.add(c.id);
  }
  return out;
}
