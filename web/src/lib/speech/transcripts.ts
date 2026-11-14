/**
 * The newest ASR transcript text for a clip, or null. SpeechTranscript is
 * added by the speech worker PR (model SpeechTranscript { recordingId,
 * modelRef, text, createdAt }). Until that migration is merged the Prisma
 * client has no such delegate, so the lookup is guarded: a missing delegate
 * (or a table that is not there yet) reads as "no transcript", and this file
 * type-checks with or without the model.
 */

interface TranscriptDelegate {
  findFirst(args: {
    where: { recordingId: string };
    orderBy: { createdAt: "desc" };
    select: { text: true };
  }): Promise<{ text: string } | null>;
}

export async function latestTranscript(
  db: object,
  recordingId: string,
): Promise<string | null> {
  const delegate = (db as { speechTranscript?: TranscriptDelegate })
    .speechTranscript;
  if (!delegate) return null;
  try {
    const row = await delegate.findFirst({
      where: { recordingId },
      orderBy: { createdAt: "desc" },
      select: { text: true },
    });
    return row?.text ?? null;
  } catch {
    return null;
  }
}
