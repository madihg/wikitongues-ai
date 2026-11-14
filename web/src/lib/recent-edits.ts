import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { orIfMissing } from "@/lib/missing-table";

/**
 * A person's latest saved edits, for "Recent Activity" on the Dashboard
 * (annotator experience spec 4.2: edits appear as rows of type "Edit"). One
 * entry per press of "Save changes" (the EDIT lane's AnswerRevision
 * contract: one saveId per save). Reads as empty until that table exists.
 * Only the prompt and the time are returned, never the text of the edit.
 */
export interface RecentEdit {
  prompt: string;
  createdAt: Date;
}

interface SaveRow {
  targetType: string;
  targetId: string;
  at: Date;
}

export async function loadRecentEdits(
  editorId: string,
  take = 6,
): Promise<RecentEdit[]> {
  const saves = await orIfMissing(
    () =>
      prisma.$queryRaw<SaveRow[]>(
        Prisma.sql`select min("targetType") as "targetType",
            min("targetId") as "targetId", min("createdAt") as at
          from "AnswerRevision"
          where "isDemo" = false and "editorId" = ${editorId}
          group by "saveId"
          order by at desc
          limit ${take}`,
      ),
    [] as SaveRow[],
  );
  if (saves.length === 0) return [];

  const ids = (type: string) =>
    saves.filter((s) => s.targetType === type).map((s) => s.targetId);
  const [cold, edits, pairwise, listen] = await Promise.all([
    ids("cold").length
      ? prisma.coldAuthorAnswer.findMany({
          where: { id: { in: ids("cold") } },
          select: { id: true, prompt: { select: { text: true } } },
        })
      : [],
    ids("edit").length
      ? prisma.outputEdit.findMany({
          where: { id: { in: ids("edit") } },
          select: {
            id: true,
            modelOutput: { select: { prompt: { select: { text: true } } } },
          },
        })
      : [],
    ids("pairwise").length
      ? prisma.pairwiseComparison.findMany({
          where: { id: { in: ids("pairwise") } },
          select: { id: true, promptId: true },
        })
      : [],
    ids("listen").length
      ? prisma.speechComparison.findMany({
          where: { id: { in: ids("listen") } },
          select: { id: true, prompt: { select: { text: true } } },
        })
      : [],
  ]);
  // PairwiseComparison stores the PUBLIC promptId string, not a key.
  const publicIds = [...new Set(pairwise.map((p) => p.promptId))];
  const byPublicId = new Map(
    publicIds.length
      ? (
          await prisma.prompt.findMany({
            where: { promptId: { in: publicIds } },
            select: { promptId: true, text: true },
          })
        ).map((p) => [p.promptId, p.text])
      : [],
  );
  const text = new Map<string, string>();
  for (const c of cold) text.set(`cold:${c.id}`, c.prompt?.text ?? "");
  for (const e of edits) {
    text.set(`edit:${e.id}`, e.modelOutput?.prompt?.text ?? "");
  }
  for (const p of pairwise) {
    text.set(`pairwise:${p.id}`, byPublicId.get(p.promptId) ?? p.promptId);
  }
  for (const l of listen) text.set(`listen:${l.id}`, l.prompt?.text ?? "");

  return saves.map((s) => ({
    prompt: text.get(`${s.targetType}:${s.targetId}`) || "(prompt removed)",
    createdAt: new Date(s.at),
  }));
}
