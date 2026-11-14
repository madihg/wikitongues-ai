import { prisma } from "@/lib/prisma";

/**
 * Alerts for the nightly speech loop. notify(kind, lines) writes one
 * SpeechAlert row (shown as a banner on /admin/speech) and, when RESEND_API_KEY
 * and ALERT_EMAIL_TO are both set, sends one email through Resend's REST API.
 * No SDK.
 *
 * One alert per kind per night (UTC day): a second call of the same kind on
 * the same day writes nothing and sends nothing. Lines hold ids and numbers,
 * never clip text; callers pass reasons and counts only. notify never throws:
 * an alert that cannot be sent must not fail the run that raised it.
 */

export const ALERT_KINDS = [
  "job_failed",
  "frozen_set_missing",
  "regressed",
  "two_skipped_nights",
  "cap_reached",
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

const MAX_LINE = 300;

export interface NotifyOptions {
  runId?: string | null;
  now?: Date;
}

/** True when a row was written (and an email attempted), false when deduped or failed. */
export async function notify(
  kind: AlertKind,
  lines: string[],
  opts: NotifyOptions = {},
): Promise<boolean> {
  try {
    const now = opts.now ?? new Date();
    const dayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const already = await prisma.speechAlert.findFirst({
      where: { kind, createdAt: { gte: dayStart } },
      select: { id: true },
    });
    if (already) return false;

    const message = lines.map((l) => l.slice(0, MAX_LINE)).join("\n");
    await prisma.speechAlert.create({
      data: { kind, message, runId: opts.runId ?? null },
    });
    await sendEmail(kind, message);
    return true;
  } catch {
    return false;
  }
}

async function sendEmail(kind: AlertKind, message: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;
  if (!key || !to) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.ALERT_EMAIL_FROM || "onboarding@resend.dev",
        to: to.split(",").map((a) => a.trim()).filter(Boolean),
        subject: `Igala speech loop: ${kind}`,
        text: message,
      }),
    });
  } catch {
    // The banner row is already written; a failed email is not a failed run.
  }
}
