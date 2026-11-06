import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { labGate } from "@/lib/speech/lab-route";
import { loadLedger } from "@/lib/speech/ledger";

/**
 * GET /api/speech/ledger: hours of kept, non-demo, non-withdrawn clips by
 * tier, speaker pseudonym, dialect and consent state. Researcher only (the
 * Lab gate: 404 flag off, 401, 403). Explicit selects, never audio bytes.
 */
export async function GET() {
  const gate = await labGate();
  if (gate.error) return gate.error;
  return NextResponse.json(await loadLedger(prisma));
}
