import { NextResponse } from "next/server";
import { requireResearcher } from "@/lib/api-auth";
import { isMissingTable } from "@/lib/answer-revisions";
import { toneAdminData } from "@/lib/tone/tone-pass";

/**
 * GET /api/admin/tone: the researcher's view of tone-mark pass 2. Items done
 * per marker, agreement per pair of markers and per coverage cell, and every
 * item with its versions side by side. Researcher only.
 */
export async function GET() {
  const { error } = await requireResearcher();
  if (error) return error;
  try {
    return NextResponse.json(await toneAdminData());
  } catch (e) {
    if (isMissingTable(e)) {
      return NextResponse.json({ notReady: true }, { status: 200 });
    }
    console.error("tone admin failed:", e);
    return NextResponse.json(
      { error: "Could not load the tone pass." },
      { status: 500 },
    );
  }
}
