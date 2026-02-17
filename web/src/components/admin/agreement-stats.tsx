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
  creativeDepth: "Creative Depth",
  factualCorrectness: "Factual Correctness",
};

const INTERPRETATION_COLORS: Record<string, string> = {
  Good: "bg-green-500",
  Tentative: "bg-yellow-500",
  Moderate: "bg-orange-500",
  Low: "bg-red-500",
};

const INTERPRETATION_TEXT_COLORS: Record<string, string> = {
  Good: "text-green-700",
  Tentative: "text-yellow-700",
  Moderate: "text-orange-700",
  Low: "text-red-700",
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
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="text-sm text-gray-400">Loading agreement data...</div>
      </div>
    );
  }

  const hasData = data.some((d) => d.alpha !== null);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">
        Inter-Annotator Agreement
      </h2>

      {!hasData ? (
        <p className="mt-4 text-sm text-gray-500">
          No multi-annotator data available yet. Agreement metrics require at
          least two annotators scoring the same items.
        </p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs font-medium uppercase tracking-wider text-gray-500">
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
                  <tr key={dim.dimension} className="border-b border-gray-50">
                    <td className="py-3 pr-4 font-medium text-gray-900">
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
                            "bg-gray-400"
                          }`}
                        />
                        <span
                          className={`text-sm font-medium ${
                            INTERPRETATION_TEXT_COLORS[dim.interpretation] ??
                            "text-gray-600"
                          }`}
                        >
                          {dim.interpretation}
                        </span>
                      </span>
                    </td>
                    <td className="py-3 text-right tabular-nums text-gray-600">
                      {dim.itemCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {note && <p className="mt-3 text-xs text-gray-400">{note}</p>}
        </>
      )}
    </div>
  );
}
