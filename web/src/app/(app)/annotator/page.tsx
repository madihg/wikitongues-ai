"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { HelpButton } from "@/components/help-button";
import { isResearcher } from "@/lib/personas";

interface RecentItem {
  prompt: string;
  type: string;
  status: string;
  date: string;
}

interface Summary {
  pending: number;
  completed: number;
  coldAnswers: number;
  promptsInCatalogue: number;
  pendingReviews: number;
  recent: RecentItem[];
}

function StatCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <h3 className="text-sm font-medium text-text-tertiary">{title}</h3>
      <p className="mt-2 text-3xl font-semibold text-text-primary">{value}</p>
      <p className="mt-1 text-sm text-text-tertiary">{description}</p>
    </div>
  );
}

/** "Today" / "Yesterday" / "Jul 2" from an ISO timestamp. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Pill colour by the comparison outcome / activity kind. */
function statusClass(status: string): string {
  if (status === "Both inadequate") return "bg-danger-subtle text-danger";
  if (status === "Tie") return "bg-warning-subtle text-warning";
  if (status === "Saved") return "bg-accent-subtle text-accent-text";
  return "bg-surface-sunken text-text-secondary";
}

export default function AnnotatorDashboard() {
  const { data: session } = useSession();
  const researcher = isResearcher(session?.user?.role, session?.user?.email);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/annotator/summary")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => setSummary(json))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const num = (v: number | undefined) =>
    loading ? "…" : error || v === undefined ? "—" : String(v);

  const recent = summary?.recent ?? [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary">Dashboard</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Welcome back, {session?.user?.name || session?.user?.email}
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger">
          Couldn&apos;t load your dashboard numbers. Refresh the page to try
          again.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <StatCard
          title="Queue Remaining"
          value={num(summary?.pending)}
          description="Pairwise comparisons still waiting for your input"
        />
        <StatCard
          title="Comparisons Completed"
          value={num(summary?.completed)}
          description="Blind pairwise judgments you've submitted"
        />
        <StatCard
          title="Gold Answers Written"
          value={num(summary?.coldAnswers)}
          description="Your own Igala answers authored before seeing any model"
        />
        {researcher && (
          <>
            <StatCard
              title="Reviews Pending"
              value={num(summary?.pendingReviews)}
              description="Handoff items flagged for human review"
            />
            <StatCard
              title="Prompts in Catalogue"
              value={num(summary?.promptsInCatalogue)}
              description="Total prompts in the Igala catalogue"
            />
          </>
        )}
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-sm font-medium text-text-secondary">
          Recent Activity
        </h2>
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-text-tertiary">
              Loading your activity…
            </div>
          ) : error ? (
            <div className="px-4 py-8 text-center text-sm text-text-tertiary">
              Couldn&apos;t load your activity. Refresh to try again.
            </div>
          ) : recent.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-tertiary">
              No activity yet. Head to the Annotate tab to begin — your
              submissions will show up here.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-sunken">
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                    Prompt
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                    Outcome
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recent.map((row, i) => (
                  <tr key={i} className="hover:bg-surface-sunken">
                    <td className="px-4 py-3 text-text-primary max-w-xs truncate">
                      {row.prompt}
                    </td>
                    <td className="px-4 py-3 text-text-tertiary">{row.type}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(
                          row.status,
                        )}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-tertiary">
                      {formatDate(row.date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <HelpButton
        title="Dashboard"
        description="Your annotation dashboard shows real, up-to-date numbers for your own work. Queue Remaining is how many pairwise comparisons are still waiting for you. Comparisons Completed and Gold Answers Written count what you've already submitted. Recent Activity lists your latest submissions. Demo/testing sessions are never counted here. Use the sidebar to navigate to each task."
      />
    </div>
  );
}
