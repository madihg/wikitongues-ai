"use client";

import { useSession } from "next-auth/react";
import { HelpButton } from "@/components/help-button";

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
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="text-sm font-medium text-gray-500">{title}</h3>
      <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
    </div>
  );
}

export default function AnnotatorDashboard() {
  const { data: session } = useSession();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Welcome back, {session?.user?.name || session?.user?.email}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <StatCard
          title="Pending Annotations"
          value="12"
          description="Pairwise comparisons and rubric scores awaiting review"
        />
        <StatCard
          title="Pending Reviews"
          value="3"
          description="Handoff items flagged for human review"
        />
        <StatCard
          title="Prompts Managed"
          value="47"
          description="Total prompts in the catalogue"
        />
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-sm font-medium text-gray-700">
          Recent Activity
        </h2>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Prompt
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                {
                  prompt: "Describe a traditional Basque greeting",
                  type: "Pairwise",
                  status: "Pending",
                  date: "Today",
                },
                {
                  prompt: "Translate proverb about rain and seasons",
                  type: "Rubric",
                  status: "Pending",
                  date: "Today",
                },
                {
                  prompt: "Explain kinship terms in Swahili culture",
                  type: "Review",
                  status: "Flagged",
                  date: "Yesterday",
                },
                {
                  prompt: "Cultural context for Quechua harvest ceremonies",
                  type: "Pairwise",
                  status: "Completed",
                  date: "Feb 17",
                },
                {
                  prompt: "Nuances of formal vs informal address in Arabic",
                  type: "Rubric",
                  status: "Completed",
                  date: "Feb 16",
                },
              ].map((row, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900 max-w-xs truncate">
                    {row.prompt}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{row.type}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.status === "Pending"
                          ? "bg-yellow-50 text-yellow-700"
                          : row.status === "Flagged"
                            ? "bg-red-50 text-red-700"
                            : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{row.date}</td>
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
