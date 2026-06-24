"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { EvalBucket } from "@prisma/client";
import { bucketLabel } from "@/lib/buckets";
import { InfoTip } from "@/components/info-tip";
import { ToneKeyboard } from "@/components/tone-keyboard";
import { wordDiff } from "@/lib/diff";

type Winner = "a" | "b" | "tie" | "both_inadequate";
type Step = "prompt" | "pairwise" | "score";

interface RefEntry {
  topic: string;
  content: string;
  source: string;
}

interface TaskData {
  prompt: {
    id: string;
    promptId: string;
    bucket: EvalBucket;
    language: string;
    text: string;
    targetCulture: string | null;
    expectedCulturalContext: string | null;
  };
  goldFirst: boolean;
  watchFor: string;
  scoring: "subjective" | "factual";
  reference: { note: string | null; entries: RefEntry[] } | null;
  outputA: { id: string; text: string };
  outputB: { id: string; text: string };
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
    label: "Cultural accuracy",
    notesKey: "notesCulturalAccuracy",
  },
  {
    key: "linguisticAuthenticity",
    label: "Linguistic authenticity",
    notesKey: "notesLinguisticAuthenticity",
  },
  {
    key: "culturalNormAdherence",
    label: "Cultural-norm adherence",
    notesKey: "notesCulturalNormAdherence",
  },
  {
    key: "factualCorrectness",
    label: "Factual correctness",
    notesKey: "notesFactualCorrectness",
  },
] as const;

const WINNER_OPTIONS: { value: Winner; label: string; hint: string }[] = [
  { value: "a", label: "Output A", hint: "1" },
  { value: "b", label: "Output B", hint: "2" },
  { value: "tie", label: "Tie — both adequate", hint: "3" },
  {
    value: "both_inadequate",
    label: "Both inadequate",
    hint: "4",
  },
];

export function AnnotationInterface() {
  const [task, setTask] = useState<TaskData | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [demoSessionId, setDemoSessionId] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("prompt");

  // Cold authoring (gold-first): the annotator's own answer, written before the
  // models are revealed. Locked the moment AI answers are shown.
  const [coldAnswer, setColdAnswer] = useState("");
  const [coldLocked, setColdLocked] = useState(false);
  const coldRef = useRef<HTMLTextAreaElement>(null);

  // Pairwise
  const [winner, setWinner] = useState<Winner | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [explanation, setExplanation] = useState("");

  // Score the winner
  const [rubric, setRubric] = useState<RubricScores>({ ...EMPTY_RUBRIC });
  const [editWinner, setEditWinner] = useState("");
  const editRef = useRef<HTMLTextAreaElement>(null);

  // Tie: optionally correct one side
  const [tieTarget, setTieTarget] = useState<"a" | "b">("a");
  const [tieEdit, setTieEdit] = useState("");
  const tieRef = useRef<HTMLTextAreaElement>(null);

  // Both-inadequate salvage rewrite
  const [salvage, setSalvage] = useState("");
  const salvageRef = useRef<HTMLTextAreaElement>(null);

  // One consent decision covers everything authored this episode.
  const [consentBenchmark, setConsentBenchmark] = useState(true);
  const [consentTraining, setConsentTraining] = useState(true);

  // Flag-prompt
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState("");

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

  useEffect(() => {
    const demo = new URLSearchParams(window.location.search).get("demo");
    setDemoSessionId(demo);
  }, []);

  const resetEpisode = useCallback(() => {
    setStep("prompt");
    setColdAnswer("");
    setColdLocked(false);
    setWinner(null);
    setConfidence(null);
    setExplanation("");
    setRubric({ ...EMPTY_RUBRIC });
    setEditWinner("");
    setTieTarget("a");
    setTieEdit("");
    setSalvage("");
    setConsentBenchmark(true);
    setConsentTraining(true);
    setFlagOpen(false);
    setFlagReason("");
  }, []);

  const fetchNext = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const demo = new URLSearchParams(window.location.search).get("demo");
      const url = demo
        ? `/api/annotations/next?demo=${encodeURIComponent(demo)}`
        : "/api/annotations/next";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch next task");
      const data = await res.json();
      resetEpisode();
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
  }, [resetEpisode]);

  useEffect(() => {
    fetchNext();
  }, [fetchNext]);

  // Keyboard winner selection on the pairwise step.
  useEffect(() => {
    if (step !== "pairwise" || !task) return;
    function handleKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLInputElement
      )
        return;
      if (e.key === "1") setWinner("a");
      if (e.key === "2") setWinner("b");
      if (e.key === "3") setWinner("tie");
      if (e.key === "4") setWinner("both_inadequate");
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [step, task]);

  const winnerOutput =
    !task || winner === null
      ? null
      : winner === "a"
        ? task.outputA
        : winner === "b"
          ? task.outputB
          : null;

  function revealModels() {
    setColdLocked(true);
    setStep("pairwise");
  }

  function proceedToScore() {
    if (!winner || confidence === null) return;
    if (explanation.trim().length < 20) return;
    if (winner === "a" && task) setEditWinner(task.outputA.text);
    if (winner === "b" && task) setEditWinner(task.outputB.text);
    setStep("score");
  }

  const lowScoreMissingNote = (r: RubricScores) =>
    DIMENSIONS.some((d) => {
      const score = r[d.key as keyof RubricScores] as number;
      const note = (r[d.notesKey as keyof RubricScores] as string) ?? "";
      return score > 0 && score <= 2 && note.trim().length === 0;
    });

  const rubricComplete = (r: RubricScores) =>
    r.culturalAccuracy > 0 &&
    r.linguisticAuthenticity > 0 &&
    r.culturalNormAdherence > 0 &&
    r.factualCorrectness > 0 &&
    !lowScoreMissingNote(r);

  const canSubmit = () => {
    if (!winner) return false;
    if (winner === "a" || winner === "b") return rubricComplete(rubric);
    return true; // tie / both_inadequate: pairwise + optional authoring is enough
  };

  async function handleSubmit() {
    if (!task || !winner || submitting || !canSubmit()) return;
    setSubmitting(true);

    const payload: Record<string, unknown> = {
      promptId: task.prompt.promptId,
      modelOutputAId: task.outputA.id,
      modelOutputBId: task.outputB.id,
      winner,
      confidence,
      explanation: explanation.trim(),
      demoSessionId: demoSessionId ?? undefined,
    };

    if (winner === "a" || winner === "b") {
      payload.rubric = {
        culturalAccuracy: rubric.culturalAccuracy,
        linguisticAuthenticity: rubric.linguisticAuthenticity,
        culturalNormAdherence: rubric.culturalNormAdherence,
        factualCorrectness: rubric.factualCorrectness,
        notesCulturalAccuracy: rubric.notesCulturalAccuracy || undefined,
        notesLinguisticAuthenticity:
          rubric.notesLinguisticAuthenticity || undefined,
        notesCulturalNormAdherence:
          rubric.notesCulturalNormAdherence || undefined,
        notesFactualCorrectness: rubric.notesFactualCorrectness || undefined,
      };
      if (winnerOutput && editWinner.trim() !== winnerOutput.text.trim()) {
        payload.edit = {
          correctedText: editWinner.trim(),
          consentBenchmark,
          consentTraining,
        };
      }
    } else if (winner === "tie") {
      const target = tieTarget === "a" ? task.outputA : task.outputB;
      if (tieEdit.trim() && tieEdit.trim() !== target.text.trim()) {
        // Keep the honest "tie" winner; attach the correction to the chosen side.
        payload.edit = {
          modelOutputId: target.id,
          correctedText: tieEdit.trim(),
          consentBenchmark,
          consentTraining,
        };
      }
    } else if (winner === "both_inadequate") {
      if (salvage.trim()) {
        payload.salvageAnswer = {
          answerText: salvage.trim(),
          consentBenchmark,
          consentTraining,
        };
      }
    }

    if (task.goldFirst && coldAnswer.trim()) {
      payload.coldAuthor = {
        answerText: coldAnswer.trim(),
        consentBenchmark,
        consentTraining,
      };
    }

    try {
      const res = await fetch("/api/annotations/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Submission failed");
      }
      const data = await res.json();
      const extras: string[] = [];
      if (data.editsSaved) extras.push("a correction");
      if (data.coldSaved) extras.push("your own answer");
      if (data.salvageSaved) extras.push("a rewrite");
      showToast(
        extras.length
          ? `Saved — including ${extras.join(" and ")}.`
          : "Annotation submitted.",
        "success",
      );
      await fetchNext();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Submission failed",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function submitFlag() {
    if (!task || flagReason.trim().length < 3) return;
    try {
      const res = await fetch("/api/annotations/flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptId: task.prompt.promptId,
          reason: flagReason.trim(),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Flag failed");
      showToast("Prompt flagged. Loading the next one.", "success");
      await fetchNext();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Flag failed", "error");
    }
  }

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

      {demoSessionId && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-warning/40 bg-warning-subtle px-4 py-2 text-sm text-warning">
          <span className="font-semibold">Demo mode</span>
          <span className="text-text-secondary">
            Nothing here is saved to training data or the benchmark — it&apos;s
            a walkthrough.
          </span>
        </div>
      )}

      {progress && !demoSessionId && (
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

      {/* Prompt card — bucket label, the task, and the watch-for line. */}
      <div className="mb-6 rounded-lg border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
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
          <button
            onClick={() => setFlagOpen((v) => !v)}
            className="shrink-0 cursor-pointer rounded-md border border-border-strong px-2.5 py-1 text-xs text-text-tertiary hover:bg-surface-sunken"
          >
            Flag prompt
          </button>
        </div>

        <p className="mt-3 text-text-primary">{task.prompt.text}</p>

        {task.watchFor && (
          <p className="mt-3 flex items-start gap-2 rounded-md bg-surface-sunken px-3 py-2 text-sm text-text-secondary">
            <span className="font-medium text-text-primary">Watch for:</span>
            {task.watchFor}
          </p>
        )}

        {flagOpen && (
          <div className="mt-3 flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center">
            <input
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              placeholder="What's wrong with this prompt? (malformed, untranslatable…)"
              className="flex-1 rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-accent"
            />
            <button
              onClick={submitFlag}
              disabled={flagReason.trim().length < 3}
              className="cursor-pointer rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              Flag & skip
            </button>
          </div>
        )}
      </div>

      {/* STEP: prompt / cold-authoring */}
      {step === "prompt" && (
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          {task.goldFirst ? (
            <>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                Before you see the AI answers — how would you say this?
                <InfoTip width="w-80">
                  Your own answer, written without any model in view, is
                  source-free gold: it doesn&apos;t inherit the translationese
                  of an AI answer the way an edit does. This is the single
                  highest-value record on this bucket.
                </InfoTip>
              </h3>
              <textarea
                ref={coldRef}
                value={coldAnswer}
                onChange={(e) => setColdAnswer(e.target.value)}
                rows={3}
                placeholder="Write the ideal Igala answer in your own words…"
                className={`mt-3 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-accent ${textFont}`}
              />
              <ToneKeyboard
                targetRef={coldRef}
                value={coldAnswer}
                onValueChange={setColdAnswer}
              />
              <button
                onClick={revealModels}
                className="mt-4 cursor-pointer rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-accent-contrast hover:bg-accent-hover"
              >
                {coldAnswer.trim()
                  ? "Lock my answer & reveal the AI outputs"
                  : "Skip & reveal the AI outputs"}
              </button>
              <p className="mt-2 text-xs text-text-muted">
                Once revealed, your answer is locked so it stays source-free.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-text-secondary">
                You&apos;ll compare two AI answers blind, pick the better Igala,
                score it, and optionally correct it.
              </p>
              <button
                onClick={revealModels}
                className="mt-4 cursor-pointer rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-accent-contrast hover:bg-accent-hover"
              >
                Reveal the two AI outputs
              </button>
            </>
          )}
        </div>
      )}

      {/* STEP: blind pairwise */}
      {step === "pairwise" && (
        <>
          {coldLocked && coldAnswer.trim() && (
            <div className="mb-4 rounded-md border border-border bg-surface-sunken px-4 py-2 text-xs text-text-tertiary">
              <span className="font-medium text-text-secondary">
                Your locked answer:
              </span>{" "}
              <span className={textFont}>{coldAnswer}</span>
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            {[
              { label: "Output A", output: task.outputA, value: "a" as const },
              { label: "Output B", output: task.outputB, value: "b" as const },
            ].map(({ label, output, value }) => (
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
                    Press {value === "a" ? "1" : "2"}
                  </span>
                </div>
                <div
                  className={`whitespace-pre-wrap text-sm leading-relaxed text-text-primary ${textFont}`}
                >
                  {output.text}
                </div>
              </div>
            ))}
          </div>

          {/* Winner choice incl. tie / both-inadequate */}
          <div className="mt-6 flex flex-wrap gap-2">
            {WINNER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setWinner(opt.value)}
                className={`cursor-pointer rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  winner === opt.value
                    ? "border-accent bg-accent text-accent-contrast"
                    : "border-border-strong bg-surface text-text-secondary hover:bg-surface-sunken"
                }`}
              >
                {opt.label}
                <span className="ml-2 text-xs opacity-60">{opt.hint}</span>
              </button>
            ))}
            <InfoTip width="w-80">
              On a base that can&apos;t yet spell Igala both answers are often
              wrong; forcing a winner manufactures noise. &quot;Both
              inadequate&quot; is honest data — and lets you write the correct
              version.
            </InfoTip>
          </div>

          {/* Confidence */}
          <div className="mt-6">
            <div className="text-sm font-medium text-text-secondary">
              How confident are you?
            </div>
            <div className="mt-2 flex gap-2">
              {[1, 2, 3, 4].map((c) => (
                <button
                  key={c}
                  onClick={() => setConfidence(c)}
                  className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-sm font-medium transition-colors ${
                    confidence === c
                      ? "bg-accent text-accent-contrast"
                      : "border border-border-strong bg-surface text-text-secondary hover:bg-surface-sunken"
                  }`}
                >
                  {c}
                </button>
              ))}
              <span className="self-center text-xs text-text-muted">
                1 = guess · 4 = certain
              </span>
            </div>
          </div>

          {/* Explanation */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-text-secondary">
              Why?{" "}
              <span className="text-text-muted">(minimum 20 characters)</span>
            </label>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Explain your choice — what makes the Igala better or both inadequate…"
              rows={3}
              className="mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-accent"
            />
            {explanation.length > 0 && explanation.trim().length < 20 && (
              <p className="mt-1 text-xs text-danger">
                {20 - explanation.trim().length} more characters needed
              </p>
            )}
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={() => setStep("prompt")}
              className="cursor-pointer text-sm text-text-tertiary hover:text-text-secondary"
            >
              &larr; Back
            </button>
            <button
              onClick={proceedToScore}
              disabled={
                !winner || confidence === null || explanation.trim().length < 20
              }
              className="cursor-pointer rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-accent-contrast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </>
      )}

      {/* STEP: score the winner / salvage */}
      {step === "score" && (
        <>
          <button
            onClick={() => setStep("pairwise")}
            className="mb-6 cursor-pointer text-sm text-text-tertiary hover:text-text-secondary"
          >
            &larr; Back to comparison
          </button>

          {/* Single-winner: rubric on the winner + inline edit */}
          {(winner === "a" || winner === "b") && winnerOutput && (
            <div className="space-y-6">
              <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
                <h3 className="mb-2 text-sm font-semibold text-text-secondary">
                  You picked {winner === "a" ? "Output A" : "Output B"} — score
                  it
                </h3>
                <div
                  className={`mb-4 max-h-32 overflow-y-auto rounded bg-surface-sunken p-3 text-xs leading-relaxed text-text-secondary ${textFont}`}
                >
                  {winnerOutput.text}
                </div>

                {/* Factual buckets: show a reference so fluency can't rescue a fact */}
                {task.scoring === "factual" && task.reference && (
                  <div className="mb-4 rounded-md border border-info/30 bg-info-subtle p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-info">
                      Reference — fact-check against this
                      <InfoTip width="w-80">
                        This is a factual bucket. A fluent-sounding answer that
                        invents a fact should still score low on factual
                        correctness. Check it against the reference.
                      </InfoTip>
                    </div>
                    {task.reference.note && (
                      <p className="mt-2 text-xs text-text-secondary">
                        {task.reference.note}
                      </p>
                    )}
                    {task.reference.entries.map((e, i) => (
                      <p key={i} className="mt-2 text-xs text-text-secondary">
                        <span className="font-medium text-text-primary">
                          {e.topic}:
                        </span>{" "}
                        {e.content}
                      </p>
                    ))}
                    {task.reference.entries.length === 0 &&
                      !task.reference.note && (
                        <p className="mt-2 text-xs text-text-muted">
                          No reference material on file — score on your own
                          knowledge.
                        </p>
                      )}
                  </div>
                )}

                <div className="space-y-5">
                  {DIMENSIONS.map(({ key, label, notesKey }) => {
                    const score = rubric[key as keyof RubricScores] as number;
                    const note =
                      (rubric[notesKey as keyof RubricScores] as string) || "";
                    const needsNote =
                      score > 0 && score <= 2 && note.trim().length === 0;
                    return (
                      <div key={key}>
                        <div className="mb-2 text-sm font-medium text-text-secondary">
                          {label}
                        </div>
                        <div className="flex gap-2">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <button
                              key={s}
                              onClick={() =>
                                setRubric((p) => ({ ...p, [key]: s }))
                              }
                              className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-sm font-medium transition-colors ${
                                score === s
                                  ? "bg-accent text-accent-contrast"
                                  : "border border-border-strong bg-surface text-text-secondary hover:bg-surface-sunken"
                              }`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={note}
                          onChange={(e) =>
                            setRubric((p) => ({
                              ...p,
                              [notesKey]: e.target.value,
                            }))
                          }
                          placeholder={
                            needsNote
                              ? "A low score needs a short reason…"
                              : "Optional notes…"
                          }
                          rows={1}
                          className={`mt-2 w-full rounded-md border px-2 py-1.5 text-xs text-text-secondary placeholder:text-text-muted focus-visible:border-accent ${
                            needsNote ? "border-danger" : "border-border"
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Inline edit of the winner, with a tone-aware diff */}
              <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
                <label className="flex items-center gap-2 text-sm font-medium text-text-secondary">
                  Correct this response (optional)
                  <InfoTip width="w-80">
                    Rewriting the winner the way a fluent speaker would creates
                    a gold SFT target. You edit only the winner — least work,
                    cleanest target.
                  </InfoTip>
                </label>
                <textarea
                  ref={editRef}
                  value={editWinner}
                  onChange={(e) => setEditWinner(e.target.value)}
                  rows={3}
                  className={`mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary focus-visible:border-accent ${textFont}`}
                />
                <ToneKeyboard
                  targetRef={editRef}
                  value={editWinner}
                  onValueChange={setEditWinner}
                />
                {editWinner.trim() &&
                  editWinner.trim() !== winnerOutput.text.trim() && (
                    <div className="mt-3">
                      <div className="mb-1 text-xs font-medium text-text-tertiary">
                        Your changes:
                      </div>
                      <p
                        className={`rounded bg-surface-sunken p-3 text-sm leading-relaxed ${textFont}`}
                      >
                        {wordDiff(winnerOutput.text, editWinner).map(
                          (seg, i) =>
                            seg.type === "same" ? (
                              <span key={i}>{seg.value}</span>
                            ) : seg.type === "added" ? (
                              <span
                                key={i}
                                className="rounded bg-success-subtle text-success"
                              >
                                {seg.value}
                              </span>
                            ) : (
                              <span
                                key={i}
                                className="rounded bg-danger-subtle text-danger line-through"
                              >
                                {seg.value}
                              </span>
                            ),
                        )}
                      </p>
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* Tie: optionally correct the stronger side */}
          {winner === "tie" && (
            <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
              <p className="text-sm text-text-secondary">
                You marked both adequate. Optionally correct the stronger one to
                gold (or just submit the tie).
              </p>
              <div className="mt-3 flex gap-2">
                {(["a", "b"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTieTarget(t);
                      setTieEdit(
                        (t === "a" ? task.outputA : task.outputB).text,
                      );
                    }}
                    className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors ${
                      tieTarget === t
                        ? "border-accent bg-accent text-accent-contrast"
                        : "border-border-strong bg-surface text-text-secondary hover:bg-surface-sunken"
                    }`}
                  >
                    Correct Output {t.toUpperCase()}
                  </button>
                ))}
              </div>
              <textarea
                ref={tieRef}
                value={tieEdit}
                onChange={(e) => setTieEdit(e.target.value)}
                rows={3}
                placeholder="Optional correction…"
                className={`mt-3 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary focus-visible:border-accent ${textFont}`}
              />
              <ToneKeyboard
                targetRef={tieRef}
                value={tieEdit}
                onValueChange={setTieEdit}
              />
            </div>
          )}

          {/* Both inadequate: write the correct version from scratch */}
          {winner === "both_inadequate" && (
            <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
              <label className="flex items-center gap-2 text-sm font-medium text-text-secondary">
                Write the correct version (strongly encouraged)
                <InfoTip width="w-80">
                  Both AI answers were inadequate, so the most valuable thing
                  you can leave is the right answer in your own words — a clean
                  gold target with no model text to inherit.
                </InfoTip>
              </label>
              <textarea
                ref={salvageRef}
                value={salvage}
                onChange={(e) => setSalvage(e.target.value)}
                rows={3}
                placeholder="The way a fluent speaker would actually say it…"
                className={`mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary focus-visible:border-accent ${textFont}`}
              />
              <ToneKeyboard
                targetRef={salvageRef}
                value={salvage}
                onValueChange={setSalvage}
              />
            </div>
          )}

          {/* Consent — only shown when something was authored */}
          {(coldAnswer.trim() ||
            (winner === "both_inadequate" && salvage.trim()) ||
            (winner === "tie" && tieEdit.trim()) ||
            ((winner === "a" || winner === "b") &&
              winnerOutput &&
              editWinner.trim() &&
              editWinner.trim() !== winnerOutput.text.trim())) && (
            <div className="mt-6 rounded-lg border border-border bg-surface-sunken p-4">
              <div className="text-sm font-medium text-text-secondary">
                How may we use what you wrote?
              </div>
              <label className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={consentBenchmark}
                  onChange={(e) => setConsentBenchmark(e.target.checked)}
                />
                May appear in the public Igala benchmark
              </label>
              <label className="mt-1 flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={consentTraining}
                  onChange={(e) => setConsentTraining(e.target.checked)}
                />
                May be used to train models
              </label>
            </div>
          )}

          <div className="mt-8 flex items-center justify-end">
            <button
              onClick={handleSubmit}
              disabled={submitting || !canSubmit()}
              className="cursor-pointer rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-accent-contrast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Submitting…" : "Submit & next"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
