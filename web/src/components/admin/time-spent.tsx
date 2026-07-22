"use client";

import { useEffect, useState } from "react";
import { InfoTip } from "@/components/info-tip";
import { formatMinutes } from "@/lib/time-sessions";

interface TimeSpentUser {
  id: string;
  name: string;
  email: string;
  role: string;
  totalMinutes: number;
  sessionCount: number;
  lastActive: string | null;
  last7DaysMinutes: number;
}

/** "Today" / "Yesterday" / "Jul 2" from an ISO timestamp, "--" when absent. */
function formatLastActive(iso: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Title-cased role label for the muted pill, e.g. "RESEARCHER" -> "Researcher". */
function roleLabel(role: string): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

export function TimeSpent() {
  const [data, setData] = useState<TimeSpentUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/time-spent")
      .then((res) => res.json())
      .then((json) => setData(json.users ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="text-sm text-text-muted">
          Loading time-on-platform data...
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
        Time on Platform
        <InfoTip width="w-80">
          Estimated from annotation activity: submissions within 30 minutes of
          each other count as one continuous session, plus a small lead-in for
          the reading and writing before each session&apos;s first submission.
          People who browse without submitting are not captured.
        </InfoTip>
      </h2>

      {data.length === 0 ? (
        <p className="mt-4 text-sm text-text-tertiary">
          No annotation activity yet.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium uppercase tracking-wider text-text-tertiary">
                <th className="py-3 pr-4">Person</th>
                <th className="py-3 pr-4 text-right">Total time</th>
                <th className="py-3 pr-4 text-right">Last 7 days</th>
                <th className="py-3 pr-4 text-right">Sessions</th>
                <th className="py-3 text-right">Last active</th>
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id} className="border-b border-border">
                  <td className="py-3 pr-4 font-medium text-text-primary">
                    <div className="flex items-center gap-2">
                      <span>{u.name}</span>
                      {u.role !== "ANNOTATOR" && (
                        <span className="inline-block rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-text-tertiary">
                          {roleLabel(u.role)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-text-secondary">
                    {formatMinutes(u.totalMinutes)}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-text-secondary">
                    {formatMinutes(u.last7DaysMinutes)}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums text-text-secondary">
                    {u.sessionCount}
                  </td>
                  <td className="py-3 text-right text-text-tertiary">
                    {formatLastActive(u.lastActive)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
