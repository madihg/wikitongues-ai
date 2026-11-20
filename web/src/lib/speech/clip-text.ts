import type { PrismaClient } from "@prisma/client";
import {
  CLIP_TEXT_FIELDS,
  isMissingTable,
  spokenTextMatches,
  staleClipIds,
} from "@/lib/answer-revisions";

/**
 * A clip is used only while its spoken text still matches the answer.
 *
 * Authors can now edit a submitted answer (the edit log, AnswerRevision). A
 * clip recorded before such an edit says words that are no longer the words
 * on the answer, and every manifest takes its transcript from the answer. So
 * a clip whose text changed would be paired with a transcript it does not
 * say. The Check queue already leaves such clips out; this is the same rule
 * for the dataset builder, the exam manifest and the open export. No clip is
 * deleted or altered: it is left out until the speaker records it again, or
 * puts the words back.
 *
 * Two checks, both in stored shape (NFC, trimmed):
 *   1. the edit log: the text as it stood when the clip was recorded against
 *      the text as it stands now (staleClipIds, src/lib/answer-revisions.ts);
 *   2. an English clip that recorded its own words (spokenText) against the
 *      answer's short translation as it stands now.
 */

/** What the rule needs to know about a clip. Rows that do not carry an
 *  answer id or a recording time (a studio clip, an imported clip) cannot
 *  have changed text and pass. */
export interface ClipTextRow {
  id: string;
  coldAuthorAnswerId?: string | null;
  language?: string | null;
  spokenText?: string | null;
  createdAt?: Date | string | null;
  coldAuthorAnswer?: { englishTranslation?: string | null } | null;
}

/** The edit log, when the caller's database handle carries it. */
export type RevisionDb = Partial<Pick<PrismaClient, "answerRevision">>;

/**
 * The ids of the clips whose text changed after they were recorded. A
 * database without the edit log table (the migration is not applied yet)
 * has no logged edits, so no clip is stale there. Any other failure is
 * raised: a dataset must not be built on a guess.
 */
export async function changedTextClipIds(
  db: RevisionDb,
  rows: ClipTextRow[],
): Promise<Set<string>> {
  const out = new Set<string>();
  for (const r of rows) {
    if (!spokenTextMatches(r, r.coldAuthorAnswer)) out.add(r.id);
  }

  const dated = rows.flatMap((r) =>
    r.coldAuthorAnswerId && r.createdAt
      ? [
          {
            id: r.id,
            coldAuthorAnswerId: r.coldAuthorAnswerId,
            language: r.language === "english" ? "english" : "igala",
            spokenText: r.spokenText ?? null,
            createdAt: r.createdAt,
          },
        ]
      : [],
  );
  if (dated.length === 0 || !db.answerRevision) return out;

  const answerIds = [...new Set(dated.map((c) => c.coldAuthorAnswerId))];
  let revisions: {
    targetId: string;
    field: string;
    before: string | null;
    after: string | null;
    createdAt: Date;
    id: string;
    saveId: string | null;
  }[];
  try {
    revisions = await db.answerRevision.findMany({
      where: {
        targetType: "cold",
        targetId: { in: answerIds },
        field: { in: [...CLIP_TEXT_FIELDS] },
      },
      select: {
        id: true,
        targetId: true,
        field: true,
        before: true,
        after: true,
        createdAt: true,
        saveId: true,
      },
    });
  } catch (e) {
    if (isMissingTable(e)) return out;
    throw e;
  }
  for (const id of staleClipIds(dated, revisions)) out.add(id);
  return out;
}

/** The rows whose spoken text still matches the answer, in their order. */
export async function dropChangedTextClips<T extends ClipTextRow>(
  db: RevisionDb,
  rows: T[],
): Promise<T[]> {
  const changed = await changedTextClipIds(db, rows);
  return changed.size === 0 ? rows : rows.filter((r) => !changed.has(r.id));
}
