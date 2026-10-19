import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canUseLab, speechLabEnabled } from "@/lib/lab-flags";

/**
 * What the signed-in account may see of the labs, for the sidebar (a client
 * component that cannot read a server env var). Always 200 for a signed-in
 * user: `speech` is true only when the flag is on AND the account is a
 * researcher, so an annotator's answer is the same "false" whether the flag
 * is on or off and reveals nothing about the lab.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    speech: speechLabEnabled() && canUseLab(session.user.role),
  });
}
