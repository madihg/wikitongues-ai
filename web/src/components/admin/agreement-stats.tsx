"use client";

import { useEffect, useState } from "react";

interface AgreementDimension {
  dimension: string;
  alpha: number | null;
  interpretation: string;
  itemCount: number;
}

const DIMENSION_LABELS: Record<string, string> = {
  culturalAccuracy: "Cultural Accuracy",
  linguisticAuthenticity: "Linguistic Authenticity",
  culturalNormAdherence: "Cultural-norm adherence",
  factualCorrectness: "Factual Correctness",
};

const INTERPRETATION_COLORS: Record<string, string> = {
  Good: "bg-success",
  Tentative: "bg-warning",
  Moderate: "bg-warning",
  Low: "bg-danger",
};

const INTERPRETATION_TEXT_COLORS: Record<string, string> = {
  Good: "text-success",
  Tentative: "text-warning",
  Moderate: "text-warning",
  Low: "text-danger",
};

export function AgreementStats() {
  const [data, setData] = useState<AgreementDimension[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/agreement")
      .then((res) => res.json())
      .then((json) => {
        setData(json.agreement ?? []);
        setNote(json.note ?? "");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="text-sm text-text-muted">Loading agreement data...</div>
      </div>
    );
  }

  const hasData = data.some((d) => d.alpha !== null);

  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-text-primary">
        Inter-Annotator Agreement
      </h2>

      {!hasData ? (
        <p className="mt-4 text-sm text-text-tertiary">
          No multi-annotator data available yet. Agreement metrics require at
          least two annotators scoring the same items.
        </p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  <th className="py-3 pr-4">Dimension</th>
                  <th className="py-3 pr-4 text-right">
                    Krippendorff&apos;s alpha
                  </th>
                  <th className="py-3 pr-4">Interpretation</th>
                  <th className="py-3 text-right">Items</th>
                </tr>
              </thead>
              <tbody>
                {data.map((dim) => (
                  <tr key={dim.dimension} className="border-b border-border">
                    <td className="py-3 pr-4 font-medium text-text-primary">
                      {DIMENSION_LABELS[dim.dimension] ?? dim.dimension}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {dim.alpha !== null ? dim.alpha.toFixed(3) : "--"}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full ${
                            INTERPRETATION_COLORS[dim.interpretation] ??
                            "bg-text-muted"
                          }`}
                        />
                        <span
                          className={`text-sm font-medium ${
                            INTERPRETATION_TEXT_COLORS[dim.interpretation] ??
                            "text-text-secondary"
                          }`}
                        >
                          {dim.interpretation}
                        </span>
                      </span>
                    </td>
                    <td className="py-3 text-right tabular-nums text-text-secondary">
                      {dim.itemCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {note && <p className="mt-3 text-xs text-text-muted">{note}</p>}
        </>
      )}
    </div>
  );
}
