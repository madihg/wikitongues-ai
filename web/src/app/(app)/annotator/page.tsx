"use client";

import { useSession } from "next-auth/react";
import { HelpButton } from "@/components/help-button";
import { isResearcher } from "@/lib/personas";

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

export default function AnnotatorDashboard() {
  const { data: session } = useSession();
  const researcher = isResearcher(session?.user?.role, session?.user?.email);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary">Dashboard</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Welcome back, {session?.user?.name || session?.user?.email}
        </p>
      </div>

      <div
        className={`grid grid-cols-1 gap-6 ${researcher ? "md:grid-cols-3" : "md:grid-cols-1"}`}
      >
        <StatCard
          title="Pending Annotations"
          value="12"
          description="Pairwise comparisons and rubric scores awaiting your input"
        />
        {researcher && (
          <>
            <StatCard
              title="Pending Reviews"
              value="3"
              description="Handoff items flagged for human review"
            />
            <StatCard
              title="Prompts Managed"
              value="47"
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
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                {
                  prompt: "Greet an elder respectfully in Igala",
                  type: "Pairwise",
                  status: "Pending",
                  date: "Today",
                },
                {
                  prompt: "Render an Igala proverb about patience",
                  type: "Rubric",
                  status: "Pending",
                  date: "Today",
                },
                {
                  prompt: "Igala kinship terms for extended family",
                  type: "Pairwise",
                  status: "Completed",
                  date: "Yesterday",
                },
                {
                  prompt: "Cultural context for an Igala naming ceremony",
                  type: "Rubric",
                  status: "Completed",
                  date: "Jun 17",
                },
              ].map((row, i) => (
                <tr key={i} className="hover:bg-surface-sunken">
                  <td className="px-4 py-3 text-text-primary max-w-xs truncate">
                    {row.prompt}
                  </td>
                  <td className="px-4 py-3 text-text-tertiary">{row.type}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.status === "Pending"
                          ? "bg-warning-subtle text-warning"
                          : row.status === "Flagged"
                            ? "bg-danger-subtle text-danger"
                            : "bg-surface-sunken text-text-secondary"
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-tertiary">{row.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <HelpButton
        title="Dashboard"
        description="Your annotation dashboard shows an overview of your current workload. Pending Annotations are pairwise comparisons and rubric scores waiting for your input. Pending Reviews are AI outputs flagged as uncertain that need human verification. Prompts Managed shows the total number of prompts in the evaluation catalogue. Use the sidebar to navigate to each task."
      />
    </div>
  );
}
