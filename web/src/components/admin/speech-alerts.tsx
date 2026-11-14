import type { AlertRow } from "@/lib/speech/dashboard-data";

/** Unread alerts from the last three days, newest first. Ids and numbers only. */
export function SpeechAlerts({ alerts }: { alerts: AlertRow[] }) {
  if (alerts.length === 0) return null;
  return (
    <div role="status" className="space-y-2">
      {alerts.map((a) => (
        <div
          key={a.id}
          className="rounded-lg border border-warning bg-warning-subtle px-4 py-3 text-sm text-text-primary"
        >
          <p className="font-semibold">
            {a.kind.replaceAll("_", " ")}{" "}
            <span className="font-normal text-text-tertiary">
              {a.createdAt.slice(0, 16).replace("T", " ")} UTC
            </span>
          </p>
          <p className="mt-0.5 whitespace-pre-line text-text-secondary">{a.message}</p>
        </div>
      ))}
    </div>
  );
}
