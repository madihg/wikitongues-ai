"use client";

import { useState, useEffect, useCallback } from "react";

interface PromptData {
  id: string;
  promptId: string;
  category: string;
  language: string;
  text: string;
  targetCulture: string | null;
}

interface OutputData {
  id: string;
  text: string;
}

interface TaskData {
  prompt: PromptData;
  outputA: OutputData;
  outputB: OutputData;
}

interface Progress {
  completed: number;
  total: number;
}

interface RubricScores {
  culturalAccuracy: number;
  linguisticAuthenticity: number;
  creativeDepth: number;
  factualCorrectness: number;
  notesCulturalAccuracy: string;
  notesLinguisticAuthenticity: string;
  notesCreativeDepth: string;
  notesFactualCorrectness: string;
}

const EMPTY_RUBRIC: RubricScores = {
  culturalAccuracy: 0,
  linguisticAuthenticity: 0,
  creativeDepth: 0,
  factualCorrectness: 0,
  notesCulturalAccuracy: "",
  notesLinguisticAuthenticity: "",
  notesCreativeDepth: "",
  notesFactualCorrectness: "",
};

const DIMENSIONS = [
  {
    key: "culturalAccuracy",
    label: "Cultural Accuracy",
    notesKey: "notesCulturalAccuracy",
  },
  {
    key: "linguisticAuthenticity",
    label: "Linguistic Authenticity",
    notesKey: "notesLinguisticAuthenticity",
  },
  {
    key: "creativeDepth",
    label: "Creative Depth",
    notesKey: "notesCreativeDepth",
  },
  {
    key: "factualCorrectness",
    label: "Factual Correctness",
    notesKey: "notesFactualCorrectness",
  },
] as const;

const CATEGORY_STYLES: Record<string, string> = {
  real_world_use: "bg-blue-100 text-blue-800",
  words_concepts: "bg-green-100 text-green-800",
  frontier_aspirations: "bg-purple-100 text-purple-800",
  abstract_vs_everyday: "bg-orange-100 text-orange-800",
};

const CATEGORY_LABELS: Record<string, string> = {
  real_world_use: "Real World Use",
  words_concepts: "Words & Concepts",
  frontier_aspirations: "Frontier Aspirations",
  abstract_vs_everyday: "Abstract vs Everyday",
};

function isRtlLanguage(language: string): boolean {
  const rtl = [
    "arabic",
    "ar",
    "hebrew",
    "he",
    "farsi",
    "fa",
    "persian",
    "urdu",
    "ur",
  ];
  return rtl.includes(language.toLowerCase());
}

export function AnnotationInterface() {
  const [task, setTask] = useState<TaskData | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Step 1 state
  const [winner, setWinner] = useState<"a" | "b" | null>(null);
  const [explanation, setExplanation] = useState("");

  // Step 2 state
  const [step, setStep] = useState<1 | 2>(1);
  const [rubricA, setRubricA] = useState<RubricScores>({ ...EMPTY_RUBRIC });
  const [rubricB, setRubricB] = useState<RubricScores>({ ...EMPTY_RUBRIC });
  const [submitting, setSubmitting] = useState(false);

  // Toast state
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = useCallback(
    (message: string, type: "success" | "error") => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 3000);
    },
    [],
  );

  const fetchNext = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/annotations/next");
      if (!res.ok) {
        throw new Error("Failed to fetch next task");
      }
      const data = await res.json();
      if (data.complete) {
        setIsComplete(true);
        setTask(null);
        if (data.progress) setProgress(data.progress);
      } else {
        setTask(data.task);
        setProgress(data.progress);
        setIsComplete(false);
      }
    } catch {
      setError("Failed to load annotation task. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNext();
  }, [fetchNext]);

  // Keyboard shortcuts for step 1
  useEffect(() => {
    if (step !== 1 || !task) return;
    function handleKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLInputElement
      )
        return;
      if (e.key === "1") setWinner("a");
      if (e.key === "2") setWinner("b");
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [step, task]);

  const handleProceedToRubric = () => {
    if (!winner) return;
    if (explanation.trim().length < 20) return;
    setStep(2);
  };

  const isRubricComplete = (rubric: RubricScores) =>
    rubric.culturalAccuracy > 0 &&
    rubric.linguisticAuthenticity > 0 &&
    rubric.creativeDepth > 0 &&
    rubric.factualCorrectness > 0;

  const handleSubmit = async () => {
    if (!task || !winner || submitting) return;
    if (!isRubricComplete(rubricA) || !isRubricComplete(rubricB)) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/annotations/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptId: task.prompt.promptId,
          modelOutputAId: task.outputA.id,
          modelOutputBId: task.outputB.id,
          winner,
          explanation: explanation.trim(),
          rubricA: {
            modelOutputId: task.outputA.id,
            ...rubricA,
            notesCulturalAccuracy: rubricA.notesCulturalAccuracy || undefined,
            notesLinguisticAuthenticity:
              rubricA.notesLinguisticAuthenticity || undefined,
            notesCreativeDepth: rubricA.notesCreativeDepth || undefined,
            notesFactualCorrectness:
              rubricA.notesFactualCorrectness || undefined,
          },
          rubricB: {
            modelOutputId: task.outputB.id,
            ...rubricB,
            notesCulturalAccuracy: rubricB.notesCulturalAccuracy || undefined,
            notesLinguisticAuthenticity:
              rubricB.notesLinguisticAuthenticity || undefined,
            notesCreativeDepth: rubricB.notesCreativeDepth || undefined,
            notesFactualCorrectness:
              rubricB.notesFactualCorrectness || undefined,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Submission failed");
      }

      showToast("Annotation submitted successfully!", "success");

      // Reset state and fetch next
      setWinner(null);
      setExplanation("");
      setStep(1);
      setRubricA({ ...EMPTY_RUBRIC });
      setRubricB({ ...EMPTY_RUBRIC });
      await fetchNext();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Submission failed",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-gray-500">
          Loading next annotation task...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={fetchNext}
          className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center">
          <h2 className="text-lg font-semibold text-green-900">
            All caught up!
          </h2>
          <p className="mt-2 text-sm text-green-700">
            {progress
              ? `You have completed all ${progress.total} comparisons.`
              : "There are no annotation tasks available right now."}
          </p>
        </div>
      </div>
    );
  }

  if (!task) return null;

  const isRtl = isRtlLanguage(task.prompt.language);

  return (
    <div className="relative">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed right-6 top-6 z-50 rounded-md px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Progress bar */}
      {progress && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>
              {progress.completed} of {progress.total} comparisons completed
            </span>
            <span>
              {progress.total > 0
                ? Math.round((progress.completed / progress.total) * 100)
                : 0}
              %
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-gray-900 transition-all"
              style={{
                width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Prompt header */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <span
            className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
              CATEGORY_STYLES[task.prompt.category] ||
              "bg-gray-100 text-gray-800"
            }`}
          >
            {CATEGORY_LABELS[task.prompt.category] || task.prompt.category}
          </span>
          <span className="text-sm text-gray-500">
            {task.prompt.language}
            {task.prompt.targetCulture && ` / ${task.prompt.targetCulture}`}
          </span>
          <span className="text-xs text-gray-400">{task.prompt.promptId}</span>
        </div>
        <p className="mt-3 text-gray-900">{task.prompt.text}</p>
      </div>

      {/* Step indicator */}
      <div className="mb-6 flex items-center gap-4">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
            step === 1 ? "bg-gray-900 text-white" : "bg-green-600 text-white"
          }`}
        >
          {step === 1 ? "1" : "\u2713"}
        </div>
        <div className="text-sm font-medium text-gray-700">
          Pairwise Comparison
        </div>
        <div className="h-px flex-1 bg-gray-200" />
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
            step === 2 ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-500"
          }`}
        >
          2
        </div>
        <div
          className={`text-sm font-medium ${step === 2 ? "text-gray-700" : "text-gray-400"}`}
        >
          Rubric Scoring
        </div>
      </div>

      {step === 1 && (
        <>
          {/* Pairwise comparison */}
          <div className="grid gap-6 md:grid-cols-2">
            {[
              {
                label: "Output A",
                output: task.outputA,
                value: "a" as const,
                key: "1",
              },
              {
                label: "Output B",
                output: task.outputB,
                value: "b" as const,
                key: "2",
              },
            ].map(({ label, output, value, key }) => (
              <div
                key={value}
                className={`rounded-lg border-2 bg-white p-6 transition-colors ${
                  winner === value
                    ? "border-gray-900 ring-1 ring-gray-900"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">
                    {label}
                  </h3>
                  <span className="text-xs text-gray-400">
                    Press {key} to select
                  </span>
                </div>
                <div
                  className={`whitespace-pre-wrap text-sm leading-relaxed text-gray-800 ${
                    isRtl ? "font-serif" : ""
                  }`}
                  dir={isRtl ? "rtl" : "ltr"}
                >
                  {output.text}
                </div>
                <button
                  onClick={() => setWinner(value)}
                  className={`mt-4 w-full rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    winner === value
                      ? "bg-gray-900 text-white"
                      : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {winner === value ? `${label} Selected` : `Select ${label}`}
                </button>
              </div>
            ))}
          </div>

          {/* Explanation */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700">
              Explanation{" "}
              <span className="text-gray-400">(minimum 20 characters)</span>
            </label>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Explain why you chose this output as the winner..."
              rows={3}
              className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
            {explanation.length > 0 && explanation.trim().length < 20 && (
              <p className="mt-1 text-xs text-red-500">
                {20 - explanation.trim().length} more characters needed
              </p>
            )}
          </div>

          <button
            onClick={handleProceedToRubric}
            disabled={!winner || explanation.trim().length < 20}
            className="mt-6 rounded-md bg-gray-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue to Rubric Scoring
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <button
            onClick={() => setStep(1)}
            className="mb-6 text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back to pairwise comparison
          </button>

          <div className="grid gap-8 lg:grid-cols-2">
            {[
              {
                label: "Output A",
                rubric: rubricA,
                setRubric: setRubricA,
                output: task.outputA,
              },
              {
                label: "Output B",
                rubric: rubricB,
                setRubric: setRubricB,
                output: task.outputB,
              },
            ].map(({ label, rubric, setRubric, output }) => (
              <div
                key={label}
                className="rounded-lg border border-gray-200 bg-white p-6"
              >
                <h3 className="mb-2 text-sm font-semibold text-gray-700">
                  {label}
                </h3>
                <div
                  className={`mb-4 max-h-32 overflow-y-auto rounded bg-gray-50 p-3 text-xs leading-relaxed text-gray-600 ${
                    isRtl ? "font-serif" : ""
                  }`}
                  dir={isRtl ? "rtl" : "ltr"}
                >
                  {output.text}
                </div>

                <div className="space-y-5">
                  {DIMENSIONS.map(({ key, label: dimLabel, notesKey }) => (
                    <div key={key}>
                      <div className="mb-2 text-sm font-medium text-gray-700">
                        {dimLabel}
                      </div>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((score) => (
                          <button
                            key={score}
                            onClick={() =>
                              setRubric((prev) => ({ ...prev, [key]: score }))
                            }
                            className={`flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium transition-colors ${
                              rubric[key as keyof RubricScores] === score
                                ? "bg-gray-900 text-white"
                                : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                            }`}
                          >
                            {score}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={
                          (rubric[notesKey as keyof RubricScores] as string) ||
                          ""
                        }
                        onChange={(e) =>
                          setRubric((prev) => ({
                            ...prev,
                            [notesKey]: e.target.value,
                          }))
                        }
                        placeholder="Optional notes..."
                        rows={1}
                        className="mt-2 w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:border-gray-400 focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex items-center justify-end gap-4">
            <button
              onClick={handleSubmit}
              disabled={
                submitting ||
                !isRubricComplete(rubricA) ||
                !isRubricComplete(rubricB)
              }
              className="rounded-md bg-gray-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Submitting..." : "Submit Annotation"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
