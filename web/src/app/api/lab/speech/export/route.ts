import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";
import { buildOpenManifest, toJsonl } from "@/lib/speech/manifest";

/**
 * The OPEN manifest (GET /api/lab/speech/export): JSONL, one clip per line,
 * for the clips that may be published under CC-BY 4.0. Researcher-only; 404
 * when the flag is off.
 *
 * This is the ONLY export route, and it is OPEN only: LICENSED clips leave
 * through the future gated delivery path, and COMMUNITY-ONLY and test-set
 * clips leave by none. The query below narrows rows for efficiency, but it is
 * not the rule: every row goes through the shared guard (buildOpenManifest ->
 * canExportOpen), which re-checks tier, publishedOpenAt, test set, rights,
 * source, consent, review and the prompt's frozen status. A test feeds this
 * route rows the query would never return and proves the guard alone refuses
 * them.
 */

export async function GET() {
  const gate = await labGate();
  if (gate.error) return gate.error;

  const rows = await prisma.speechRecording.findMany({
    where: {
      tier: "open",
      publishedOpenAt: { not: null },
      isDemo: false,
      isTestSet: false,
      rightsStatus: "cleared",
      uploadedAt: { not: null },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      storagePath: true,
      mimeType: true,
      durationMs: true,
      sampleRate: true,
      annotatorId: true,
      dialect: true,
      tier: true,
      consentId: true,
      consentVersion: true,
      fundingSource: true,
      isTestSet: true,
      isDemo: true,
      rightsStatus: true,
      sourceType: true,
      publishedOpenAt: true,
      uploadedAt: true,
      reviewStatus: true,
      voiceCloningOptIn: true,
      prompt: { select: { isHoldout: true, split: true } },
      coldAuthorAnswer: { select: { answerText: true } },
    },
  });

  const body = toJsonl(buildOpenManifest(rows));
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="igala-speech-open-manifest.jsonl"',
      "Cache-Control": "no-store",
    },
  });
}
