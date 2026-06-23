"use client";

import { useState } from "react";
import { InfoTip } from "@/components/info-tip";

type ExportType = "pairwise" | "rubric" | "report";

const EXPORTS: { type: ExportType; label: string; description: string }[] = [
  {
    type: "pairwise",
    label: "Export Pairwise Data (CSV)",
    description: "All pairwise comparison results",
  },
  {
    type: "rubric",
    label: "Export Rubric Scores (CSV)",
    description: "All rubric scoring data",
  },
  {
    type: "report",
    label: "Export Report (Markdown)",
    description: "Summary benchmark report",
  },
];

export function ExportPanel() {
  const [downloading, setDownloading] = useState<ExportType | null>(null);

  async function handleExport(type: ExportType) {
    setDownloading(type);
    try {
      const res = await fetch(`/api/admin/export/${type}`);
      if (!res.ok) {
        throw new Error("Export failed");
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="(.+)"/);
      const filename =
        filenameMatch?.[1] ?? `export.${type === "report" ? "md" : "csv"}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Silently handle -- user will see no file downloaded
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
        Export Data
        <InfoTip width="w-80">
          Download collected data for offline analysis. (For model-training
          exports — clean DPO pairs from pairwise picks and SFT targets from
          edits — use the Model Arena&apos;s Fine-tune jobs, which exclude
          held-out prompts.)
        </InfoTip>
      </h2>

      <div className="mt-4 flex flex-wrap gap-3">
        {EXPORTS.map((exp) => (
          <button
            key={exp.type}
            onClick={() => handleExport(exp.type)}
            disabled={downloading !== null}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-secondary shadow-sm transition-colors hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              className="h-4 w-4 text-text-muted"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
            {downloading === exp.type ? "Downloading..." : exp.label}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-text-muted">
        Exports include all available data across all languages and epochs.
      </p>
    </div>
  );
}
