"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { EvalBucket } from "@prisma/client";
import {
  bucketLabel,
  RUBRIC_V2,
  RUBRIC_ANCHORS,
  axisAnchors,
} from "@/lib/buckets";
import { InfoTip } from "@/components/info-tip";
import { ToneKeyboard } from "@/components/tone-keyboard";
import { wordDiff } from "@/lib/diff";

type Winner = "a" | "b" | "tie" | "both_inadequate";
type Step = "prompt" | "pairwise" | "score";
/** Per-axis rubric value: 0-5 score, "na" = not applicable, null = unanswered. */
type AxisVal = number | "na" | null;

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
  /** Rubric axes in-scope for this prompt category (others default to N/A). */
  applicableAxes: string[];
  reference: { note: string | null; entries: RefEntry[] } | null;
  outputA: { id: string; text: string };
  outputB: { id: string; text: string };
}

/**
 * Read a fetch Response as JSON without ever throwing. A serverless 500/504 or a
 * proxy error page returns HTML, and a blind `res.json()` on that throws the
 * cryptic "Unexpected token '<'..." error that reads as a mysterious JSON bug.
 * This returns a usable object with an `error` string instead.
 */
async function safeJson(
  res: Response,
): Promise<Record<string, unknown> & { error?: string }> {
  const text = await res.text().catch(() => "");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {
      error: res.ok
        ? "Unexpected server response."
        : `Server error (${res.status}). Please try again.`,
    };
  }
}

interface Progress {
  completed: number;
  total: number;
}

const WINNER_OPTIONS: { value: Winner; label: string; hint: string }[] = [
  { value: "a", label: "Output A", hint: "1" },
  { value: "b", label: "Output B", hint: "2" },
  { value: "tie", label: "Tie — both adequate", hint: "3" },
  { value: "both_inadequate", label: "Both inadequate", hint: "4" },
];

const emptyAxisVals = (): Record<string, AxisVal> =>
  Object.fromEntries(RUBRIC_V2.map((a) => [a.key, null]));

/** Draft persistence: an episode in progress survives navigation away and
 *  flaky connections (form-reset bug from the 2026-07-02 call). */
interface EpisodeDraft {
  step: Step;
  coldAnswer: string;
  coldLocked: boolean;
  winner: Winner | null;
  confidence: number | null;
  explanation: string;
  axisVals: Record<string, AxisVal>;
  axisNotes: Record<string, string>;
  editWinner: string;
  editSeededFor: "a" | "b" | null;
  tieTarget: "a" | "b";
  tieEdit: string;
  salvage: string;
}

function draftKeyFor(task: TaskData): string {
  return `wt-episode-${task.outputA.id}:${task.outputB.id}`;
}

function loadDraft(key: string): EpisodeDraft | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as EpisodeDraft) : null;
  } catch {
    return null;
  }
}

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

  // Rubric v2 (Lydia's axes): per-axis 0-5 or N/A, on the winner only.
  const [axisVals, setAxisVals] =
    useState<Record<string, AxisVal>>(emptyAxisVals());
  const [axisNotes, setAxisNotes] = useState<Record<string, string>>({});
  const [editWinner, setEditWinner] = useState("");
  // Which winner (a|b) editWinner was seeded from, so switching the pick re-seeds
  // instead of leaving the LOSING output's text staged as a "correction".
  const [editSeededFor, setEditSeededFor] = useState<"a" | "b" | null>(null);
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
    setAxisVals(emptyAxisVals());
    setAxisNotes({});
    setEditWinner("");
    setEditSeededFor(null);
    setTieTarget("a");
    setTieEdit("");
    setSalvage("");
    setConsentBenchmark(true);
    setConsentTraining(true);
    setFlagOpen(false);
    setFlagReason("");
  }, []);

  const restoreDraft = useCallback((d: EpisodeDraft) => {
    setStep(d.step);
    setColdAnswer(d.coldAnswer);
    setColdLocked(d.coldLocked);
    setWinner(d.winner);
    setConfidence(d.confidence);
    setExplanation(d.explanation);
    setAxisVals({ ...emptyAxisVals(), ...d.axisVals });
    setAxisNotes(d.axisNotes ?? {});
    setEditWinner(d.editWinner);
    setEditSeededFor(d.editSeededFor ?? null);
    setTieTarget(d.tieTarget);
    setTieEdit(d.tieEdit);
    setSalvage(d.salvage);
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
      const data = (await safeJson(res)) as {
        error?: string;
        complete?: boolean;
        progress?: Progress;
        task?: TaskData;
      };
      if (!res.ok)
        throw new Error(data.error || "Failed to load the next task.");
      resetEpisode();
      if (data.complete || !data.task) {
        setIsComplete(true);
        setTask(null);
        if (data.progress) setProgress(data.progress);
      } else {
        setTask(data.task);
        setProgress(data.progress ?? null);
        setIsComplete(false);
        // Resume an in-progress episode for this exact pair, if one exists.
        const draft = loadDraft(draftKeyFor(data.task));
        if (draft) restoreDraft(draft);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to load annotation task. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [resetEpisode, restoreDraft]);

  useEffect(() => {
    fetchNext();
  }, [fetchNext]);

  // Autosave the episode draft so navigation or a dropped connection never
  // loses in-progress work.
  useEffect(() => {
    if (!task) return;
    const draft: EpisodeDraft = {
      step,
      coldAnswer,
      coldLocked,
      winner,
      confidence,
      explanation,
      axisVals,
      axisNotes,
      editWinner,
      editSeededFor,
      tieTarget,
      tieEdit,
      salvage,
    };
    try {
      sessionStorage.setItem(draftKeyFor(task), JSON.stringify(draft));
    } catch {
      // storage full/unavailable — non-fatal
    }
  }, [
    task,
    step,
    coldAnswer,
    coldLocked,
    winner,
    confidence,
    explanation,
    axisVals,
    axisNotes,
    editWinner,
    editSeededFor,
    tieTarget,
    tieEdit,
    salvage,
  ]);

  const clearDraft = useCallback(() => {
    if (!task) return;
    try {
      sessionStorage.removeItem(draftKeyFor(task));
    } catch {
      // ignore
    }
  }, [task]);

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
    // Seed the edit box with the CURRENT winner's text whenever the pick changed
    // (or on first entry). If the annotator already edited this same winner, keep
    // their text. This prevents the losing output's text from being saved as a
    // "correction" of the winner after an A<->B switch.
    if (
      (winner === "a" || winner === "b") &&
      task &&
      editSeededFor !== winner
    ) {
      setEditWinner(winner === "a" ? task.outputA.text : task.outputB.text);
      setEditSeededFor(winner);
    }
    setStep("score");
  }

  // In-scope axes for this prompt category (fallback: all axes).
  const inScope: string[] =
    task && task.applicableAxes.length > 0
      ? task.applicableAxes
      : RUBRIC_V2.map((a) => a.key);
  const inScopeAxes = RUBRIC_V2.filter((a) => inScope.includes(a.key));
  const offScopeAxes = RUBRIC_V2.filter((a) => !inScope.includes(a.key));

  // Every IN-SCOPE axis answered (score or explicit N/A), and at least one real
  // score anywhere (in- or off-scope). Off-scope axes are optional.
  const rubricComplete = () =>
    inScopeAxes.every((a) => axisVals[a.key] !== null) &&
    RUBRIC_V2.some((a) => typeof axisVals[a.key] === "number");

  const canSubmit = () => {
    if (!winner) return false;
    if (winner === "a" || winner === "b") return rubricComplete();
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
      // Send in-scope axes plus any off-scope axis the annotator chose to answer.
      payload.rubricAxes = RUBRIC_V2.filter(
        (a) => inScope.includes(a.key) || axisVals[a.key] !== null,
      ).map((a) => ({
        axis: a.key,
        score: axisVals[a.key] === "na" ? null : axisVals[a.key],
        note: axisNotes[a.key]?.trim() ? axisNotes[a.key].trim() : undefined,
      }));
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
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Submission failed");
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
      clearDraft();
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
      if (!res.ok)
        throw new Error((await safeJson(res)).error || "Flag failed");
      showToast("Prompt flagged. Loading the next one.", "success");
      clearDraft();
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

  const axisButtons = (axisKey: string) => (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => setAxisVals((p) => ({ ...p, [axisKey]: "na" }))}
        title="Not applicable — this axis is not relevant to this prompt"
        className={`flex h-9 cursor-pointer items-center justify-center rounded-md px-3 text-xs font-medium transition-colors ${
          axisVals[axisKey] === "na"
            ? "bg-info text-white"
            : "border border-border-strong bg-surface text-text-secondary hover:bg-surface-sunken"
        }`}
      >
        N/A
      </button>
      {[0, 1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          onClick={() => setAxisVals((p) => ({ ...p, [axisKey]: s }))}
          title={RUBRIC_ANCHORS[s]}
          className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-sm font-medium transition-colors ${
            axisVals[axisKey] === s
              ? "bg-accent text-accent-contrast"
              : "border border-border-strong bg-surface text-text-secondary hover:bg-surface-sunken"
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );

  const axisBlock = (axes: typeof RUBRIC_V2) =>
    axes.map((a) => {
      const anchors = axisAnchors(a.key);
      return (
        <div key={a.key}>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-secondary">
            {a.label}
            <InfoTip width="w-72">{a.description}</InfoTip>
          </div>
          {/* Worked 0 / 3 / 5 examples so it's clear what this axis rates. */}
          {anchors.length > 0 && (
            <div className="mb-2 space-y-1 rounded-md border border-border bg-surface-sunken px-3 py-2">
              {anchors.map((an) => {
                const chip =
                  an.score === 0
                    ? "bg-danger-subtle text-danger"
                    : an.score === 5
                      ? "bg-success-subtle text-success"
                      : "bg-warning-subtle text-warning";
                return (
                  <div
                    key={an.score}
                    className="flex items-start gap-2 text-xs leading-snug"
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[11px] font-semibold ${chip}`}
                    >
                      {an.score}
                    </span>
                    <span className="text-text-secondary">{an.text}</span>
                  </div>
                );
              })}
            </div>
          )}
          {axisButtons(a.key)}
          <textarea
            value={axisNotes[a.key] ?? ""}
            onChange={(e) =>
              setAxisNotes((p) => ({ ...p, [a.key]: e.target.value }))
            }
            placeholder="Optional note — what exactly is right or wrong…"
            rows={1}
            className="mt-2 w-full rounded-md border border-border px-2 py-1.5 text-xs text-text-secondary placeholder:text-text-muted focus-visible:border-accent"
          />
        </div>
      );
    });

  const inScopeLinguistic = inScopeAxes.filter((a) => a.pass === "linguistic");
  const inScopePragmatics = inScopeAxes.filter((a) => a.pass === "pragmatics");

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
              Flag &amp; skip
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
                You&apos;ll compare two AI answers blind, pick the better Igala
                (or say both are wrong), score it, and optionally correct it.
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
          <div className="mt-6 text-sm font-medium text-text-secondary">
            Which is the better Igala — or is neither good?
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
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

          {/* Explanation — encouraged, never required */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-text-secondary">
              Why? <span className="text-text-muted">(optional)</span>
            </label>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="What makes the Igala better — or both inadequate? Even a few words help."
              rows={3}
              className="mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-accent"
            />
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
              disabled={!winner || confidence === null}
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

          {/* Single-winner: rubric v2 on the winner + inline edit */}
          {(winner === "a" || winner === "b") && winnerOutput && (
            <div className="space-y-6">
              <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-secondary">
                  You picked {winner === "a" ? "Output A" : "Output B"} — score
                  it
                  <InfoTip width="w-80">
                    0 = completely wrong, 5 = you&apos;d say it exactly like
                    this. N/A = this axis isn&apos;t relevant to this prompt
                    (e.g. no idiom or honorific present). Hover a number for its
                    meaning.
                  </InfoTip>
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
                        invents a fact should still score low on meaning and
                        cultural relevance. Check it against the reference.
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

                {/* Pass 1: the language itself (in-scope axes only) */}
                {inScopeLinguistic.length > 0 && (
                  <>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                      The language
                    </div>
                    <div className="space-y-5">
                      {axisBlock(inScopeLinguistic)}
                    </div>
                  </>
                )}

                {/* Pass 2: pragmatics — the reflective second pass (in-scope) */}
                {inScopePragmatics.length > 0 && (
                  <>
                    <div className="mb-1 mt-7 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                      Thinking about the answer you just scored…
                    </div>
                    <div className="space-y-5">
                      {axisBlock(inScopePragmatics)}
                    </div>
                  </>
                )}

                {/* Off-scope axes: collapsed by default (this prompt category
                    usually doesn't need them, but you can score any that apply). */}
                {offScopeAxes.length > 0 && (
                  <details className="mt-6 rounded-md border border-border bg-surface-sunken px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium text-text-tertiary">
                      Other rubric axes (not usually relevant to this prompt) —
                      score only if they apply
                    </summary>
                    <div className="mt-4 space-y-5">
                      {axisBlock(offScopeAxes)}
                    </div>
                  </details>
                )}

                <p className="mt-4 text-xs text-text-muted">
                  0 = completely wrong · 5 = perfect · N/A = not relevant here.
                  Axes shown are the ones that matter for this prompt.
                </p>
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
