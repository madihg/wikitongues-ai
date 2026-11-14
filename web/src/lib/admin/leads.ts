import { isOwner } from "@/lib/personas";

/**
 * Research leads: the people who may see pay and people data.
 *
 * The RESEARCHER role is wider than "runs the project". Annotators who use
 * the speaker side of the platform hold it too. Hours per person, the weekly
 * table and its CSV, who is running out of prompts and who has gone quiet are
 * not for them. Those are shown only to the owner and to the accounts whose
 * email is in RESEARCH_LEADS (comma separated). Unset, or empty, means the
 * owner only.
 *
 * Server only: the variable is read per call, on the server, and its value
 * never leaves it. The browser learns one boolean about the signed-in account
 * (GET /api/admin/lead) so the sidebar can hide a link the server would
 * refuse anyway.
 */

export function researchLeadEmails(): string[] {
  return (process.env.RESEARCH_LEADS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

export function isResearchLead(email?: string | null): boolean {
  if (!email) return false;
  if (isOwner(email)) return true;
  return researchLeadEmails().includes(email.trim().toLowerCase());
}
