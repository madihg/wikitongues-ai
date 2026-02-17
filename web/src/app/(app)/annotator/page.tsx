"use client";

import { useSession } from "next-auth/react";

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
          value="--"
          description="Pairwise comparisons and rubric scores awaiting review"
        />
        <StatCard
          title="Pending Reviews"
          value="--"
          description="Handoff items flagged for human review"
        />
        <StatCard
          title="Prompts Managed"
          value="--"
          description="Total prompts in the catalogue"
        />
      </div>
    </div>
  );
}
