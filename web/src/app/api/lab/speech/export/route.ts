import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";
import { buildOpenManifest, toJsonl } from "@/lib/speech/manifest";
import { loadOpenRows } from "@/lib/speech/open-rows";

/**
 * The OPEN manifest (GET /api/lab/speech/export): JSONL, one clip per line,
 * for the clips that may be published under CC-BY 4.0. Researcher-only; 404
 * when the flag is off.
 *
 * This is the ONLY export route, and it is OPEN only: LICENSED clips leave
 * through the future gated delivery path, and COMMUNITY-ONLY and test-set
 * clips leave by none. The shared query (open-rows.ts) narrows rows for
 * efficiency, but it is not the rule: every row goes through the shared guard (buildOpenManifest ->
 * canExportOpen), which re-checks tier, publishedOpenAt, test set, rights,
 * source, consent, review and the prompt's frozen status. A test feeds this
 * route rows the query would never return and proves the guard alone refuses
 * them.
 */

export async function GET() {
  const gate = await labGate();
  if (gate.error) return gate.error;

  const rows = await loadOpenRows(prisma);

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
