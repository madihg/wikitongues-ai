"use client";

import { useState, useEffect, useCallback } from "react";
import type { EvalBucket } from "@prisma/client";
import { bucketLabel } from "@/lib/buckets";
import { InfoTip } from "@/components/info-tip";

interface PromptData {
  id: string;
  promptId: string;
  bucket: EvalBucket;
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
  culturalNormAdherence: number;
  factualCorrectness: number;
  notesCulturalAccuracy: string;
  notesLinguisticAuthenticity: string;
  notesCulturalNormAdherence: string;
  notesFactualCorrectness: string;
}

const EMPTY_RUBRIC: RubricScores = {
  culturalAccuracy: 0,
  linguisticAuthenticity: 0,
  culturalNormAdherence: 0,
  factualCorrectness: 0,
  notesCulturalAccuracy: "",
  notesLinguisticAuthenticity: "",
  notesCulturalNormAdherence: "",
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
    key: "culturalNormAdherence",
    label: "Cultural-norm adherence",
    notesKey: "notesCulturalNormAdherence",
  },
  {
    key: "factualCorrectness",
    label: "Factual Correctness",
    notesKey: "notesFactualCorrectness",
  },
] as const;

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

  // Agnes's direct-edit field — corrected Igala per output (gold SFT targets).
  const [editA, setEditA] = useState("");
  const [editB, setEditB] = useState("");

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
      if (!res.ok) throw new Error("Failed to fetch next task");
      const data = await res.json();
      if (data.complete) {
        setIsComplete(true);
        setTask(null);
        if (data.progress) setProgress(data.progress);
      } else {
        setTask(data.task);
        setProgress(data.progress);
        setIsComplete(false);
        setEditA(data.task?.outputA?.text ?? "");
        setEditB(data.task?.outputB?.text ?? "");
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
    rubric.culturalNormAdherence > 0 &&
    rubric.factualCorrectness > 0;

  const handleSubmit = async () => {
    if (!task || !winner || submitting) return;
    if (!isRubricComplete(rubricA) || !isRubricComplete(rubricB)) return;

    // Only send edits that actually changed the model output.
    const edits: { modelOutputId: string; correctedText: string }[] = [];
    if (editA.trim() && editA.trim() !== task.outputA.text.trim())
      edits.push({
        modelOutputId: task.outputA.id,
        correctedText: editA.trim(),
      });
    if (editB.trim() && editB.trim() !== task.outputB.text.trim())
      edits.push({
        modelOutputId: task.outputB.id,
        correctedText: editB.trim(),
      });

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
          edits,
          rubricA: {
            modelOutputId: task.outputA.id,
            ...rubricA,
            notesCulturalAccuracy: rubricA.notesCulturalAccuracy || undefined,
            notesLinguisticAuthenticity:
              rubricA.notesLinguisticAuthenticity || undefined,
            notesCulturalNormAdherence:
              rubricA.notesCulturalNormAdherence || undefined,
            notesFactualCorrectness:
              rubricA.notesFactualCorrectness || undefined,
          },
          rubricB: {
            modelOutputId: task.outputB.id,
            ...rubricB,
            notesCulturalAccuracy: rubricB.notesCulturalAccuracy || undefined,
            notesLinguisticAuthenticity:
              rubricB.notesLinguisticAuthenticity || undefined,
            notesCulturalNormAdherence:
              rubricB.notesCulturalNormAdherence || undefined,
            notesFactualCorrectness:
              rubricB.notesFactualCorrectness || undefined,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Submission failed");
      }

      showToast(
        edits.length > 0
          ? `Saved — including ${edits.length} correction${edits.length > 1 ? "s" : ""}.`
          : "Annotation submitted.",
        "success",
      );

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
        <div className="text-sm text-text-tertiary">
          Loading next annotation task...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-danger">{error}</p>
        <button
          onClick={fetchNext}
          className="mt-4 cursor-pointer rounded-md bg-accent px-4 py-2 text-sm text-accent-contrast hover:bg-accent-hover"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="rounded-lg border border-success/30 bg-success-subtle p-8 text-center">
          <h2 className="text-lg text-success">All caught up</h2>
          <p className="mt-2 text-sm text-text-secondary">
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
  const textDir = isRtl ? "rtl" : "ltr";
  const textFont = "font-mono"; // renders Igala tone diacritics cleanly

  return (
    <div className="relative">
      {toast && (
        <div
          className={`fixed right-6 top-6 z-50 rounded-md px-4 py-3 text-sm font-medium text-white shadow-lg ${
            toast.type === "success" ? "bg-success" : "bg-danger"
          }`}
        >
          {toast.message}
        </div>
      )}

      {progress && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm text-text-secondary">
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
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{
                width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      <div className="mb-6 rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="inline-block rounded-full bg-accent-subtle px-3 py-1 text-xs font-medium text-accent-text">
            {bucketLabel(task.prompt.bucket)}
          </span>
          <span className="text-sm text-text-tertiary">
            {task.prompt.language}
            {task.prompt.targetCulture && ` / ${task.prompt.targetCulture}`}
          </span>
          <span className="font-mono text-xs text-text-muted">
            {task.prompt.promptId}
          </span>
        </div>
        <p className="mt-3 text-text-primary">{task.prompt.text}</p>
      </div>

      <div className="mb-6 flex items-center gap-4">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
            step === 1
              ? "bg-accent text-accent-contrast"
              : "bg-success text-white"
          }`}
        >
          {step === 1 ? "1" : "✓"}
        </div>
        <div className="text-sm font-medium text-text-secondary">
          Pairwise Comparison
        </div>
        <div className="h-px flex-1 bg-border" />
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
            step === 2
              ? "bg-accent text-accent-contrast"
              : "bg-surface-sunken text-text-tertiary"
          }`}
        >
          2
        </div>
        <div
          className={`flex items-center gap-2 text-sm font-medium ${step === 2 ? "text-text-secondary" : "text-text-muted"}`}
        >
          Rubric & Corrections
          <InfoTip width="w-80">
            Score each output 1-5 on four axes: cultural accuracy, linguistic
            authenticity, cultural-norm adherence (honorifics/register/taboo),
            and factual correctness.
          </InfoTip>
        </div>
      </div>

      {step === 1 && (
        <>
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
                className={`cursor-pointer rounded-lg border-2 bg-surface p-6 transition-colors ${
                  winner === value
                    ? "border-accent ring-1 ring-accent"
                    : "border-border hover:border-border-strong"
                }`}
                onClick={() => setWinner(value)}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-text-secondary">
                    {label}
                  </h3>
                  <span className="text-xs text-text-muted">
                    Press {key} to select
                  </span>
                </div>
                <div
                  className={`whitespace-pre-wrap text-sm leading-relaxed text-text-primary ${textFont}`}
                  dir={textDir}
                >
                  {output.text}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setWinner(value);
                  }}
                  className={`mt-4 w-full cursor-pointer rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    winner === value
                      ? "bg-accent text-accent-contrast"
                      : "border border-border-strong bg-surface text-text-secondary hover:bg-surface-sunken"
                  }`}
                >
                  {winner === value ? `${label} Selected` : `Select ${label}`}
                </button>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-text-secondary">
              Explanation{" "}
              <span className="text-text-muted">(minimum 20 characters)</span>
            </label>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Explain why you chose this output as the winner..."
              rows={3}
              className="mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-accent"
            />
            {explanation.length > 0 && explanation.trim().length < 20 && (
              <p className="mt-1 text-xs text-danger">
                {20 - explanation.trim().length} more characters needed
              </p>
            )}
          </div>

          <button
            onClick={handleProceedToRubric}
            disabled={!winner || explanation.trim().length < 20}
            className="mt-6 cursor-pointer rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-accent-contrast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue to Rubric & Corrections
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <button
            onClick={() => setStep(1)}
            className="mb-6 cursor-pointer text-sm text-text-tertiary hover:text-text-secondary"
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
                edit: editA,
                setEdit: setEditA,
              },
              {
                label: "Output B",
                rubric: rubricB,
                setRubric: setRubricB,
                output: task.outputB,
                edit: editB,
                setEdit: setEditB,
              },
            ].map(({ label, rubric, setRubric, output, edit, setEdit }) => {
              const changed =
                edit.trim() !== "" && edit.trim() !== output.text.trim();
              return (
                <div
                  key={label}
                  className="rounded-lg border border-border bg-surface p-6 shadow-sm"
                >
                  <h3 className="mb-2 text-sm font-semibold text-text-secondary">
                    {label}
                  </h3>
                  <div
                    className={`mb-4 max-h-32 overflow-y-auto rounded bg-surface-sunken p-3 text-xs leading-relaxed text-text-secondary ${textFont}`}
                    dir={textDir}
                  >
                    {output.text}
                  </div>

                  <div className="space-y-5">
                    {DIMENSIONS.map(({ key, label: dimLabel, notesKey }) => (
                      <div key={key}>
                        <div className="mb-2 text-sm font-medium text-text-secondary">
                          {dimLabel}
                        </div>
                        <div className="flex gap-2">
                          {[1, 2, 3, 4, 5].map((score) => (
                            <button
                              key={score}
                              onClick={() =>
                                setRubric((prev) => ({ ...prev, [key]: score }))
                              }
                              className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-sm font-medium transition-colors ${
                                rubric[key as keyof RubricScores] === score
                                  ? "bg-accent text-accent-contrast"
                                  : "border border-border-strong bg-surface text-text-secondary hover:bg-surface-sunken"
                              }`}
                            >
                              {score}
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={
                            (rubric[
                              notesKey as keyof RubricScores
                            ] as string) || ""
                          }
                          onChange={(e) =>
                            setRubric((prev) => ({
                              ...prev,
                              [notesKey]: e.target.value,
                            }))
                          }
                          placeholder="Optional notes..."
                          rows={1}
                          className="mt-2 w-full rounded-md border border-border px-2 py-1.5 text-xs text-text-secondary placeholder:text-text-muted focus-visible:border-accent"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Direct-edit field (Agnes) — corrected Igala becomes gold training data */}
                  <div className="mt-5 border-t border-border pt-4">
                    <div className="mb-2 flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm font-medium text-text-secondary">
                        Correct this response (optional)
                        <InfoTip width="w-80">
                          Rewriting the response the way a fluent speaker would
                          creates a gold SFT training target — the single
                          highest-value data the project collects.
                        </InfoTip>
                      </label>
                      {changed && (
                        <span className="rounded-full bg-success-subtle px-2 py-0.5 text-xs text-success">
                          edited
                        </span>
                      )}
                    </div>
                    <textarea
                      value={edit}
                      onChange={(e) => setEdit(e.target.value)}
                      rows={3}
                      dir={textDir}
                      className={`w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary focus-visible:border-accent ${textFont}`}
                    />
                    <p className="mt-1 text-xs text-text-muted">
                      Rewrite it the way a fluent speaker would. Your correction
                      is saved as a gold example.
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex items-center justify-end gap-4">
            <button
              onClick={handleSubmit}
              disabled={
                submitting ||
                !isRubricComplete(rubricA) ||
                !isRubricComplete(rubricB)
              }
              className="cursor-pointer rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-accent-contrast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Submitting..." : "Submit Annotation"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
