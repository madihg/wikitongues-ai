"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { EvalBucket } from "@prisma/client";
import {
  bucketLabel,
  bucketGoldHint,
  RUBRIC_V2,
  RUBRIC_ANCHORS,
  axisAnchors,
} from "@/lib/buckets";
import {
  FAILURE_TAGS,
  FAILURE_TAG_PROMPT,
  failureTagSides,
  missingFailureTagSides,
} from "@/lib/failure-tags";
import { IGALA_DIALECTS, DIALECT_STORAGE_KEY, isDialect } from "@/lib/dialects";
import { InfoTip } from "@/components/info-tip";
import { ToneKeyboard } from "@/components/tone-keyboard";
import { SuggestingEditor } from "@/components/suggesting-editor";
import {
  attachReasons,
  diffToSegments,
  nfc,
  type ReasonMap,
} from "@/lib/edit-segments";

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

// When both AI answers are inadequate, the written "why" is where the teaching
// signal lives, so it becomes required (this minimum char count) on that path.
// Failure tags are ADDITIVE to this, never a substitute: the chips give us the
// shape of the failure, the sentence gives us the fix. The same floor gates
// the English explanation that is required whenever a correction was made
// (2026-08-28 rework) - eleven corrections shipped with zero reasons before
// it, and the reason is the half that teaches the rule.
const EXPLANATION_MIN = 10;

// The plain-English meaning of a gold answer is required to lock it. Adoption
// was 43% (287 of 666) while it was optional, and an Igala sentence with no
// gloss can't be used as a lesson - nobody downstream knows what it says.
const GLOSS_MIN = 3;
const GLOSS_WHY =
  "This is what makes your Igala usable as a lesson - it tells us what the words mean.";

const WINNER_OPTIONS: { value: Winner; label: string; hint: string }[] = [
  { value: "a", label: "Output A", hint: "1" },
  { value: "b", label: "Output B", hint: "2" },
  { value: "tie", label: "Tie - both adequate", hint: "3" },
  { value: "both_inadequate", label: "Both inadequate", hint: "4" },
];

const emptyAxisVals = (): Record<string, AxisVal> =>
  Object.fromEntries(RUBRIC_V2.map((a) => [a.key, null]));

/** NFC-aware "was anything actually changed?": production model text arrives
 *  in both Unicode shapes, and an identical answer retyped on another keyboard
 *  must not count as an edit (the phantom-diff rule, src/lib/edit-segments.ts). */
const textDiffers = (a: string, b: string): boolean =>
  nfc(a.trim()) !== nfc(b.trim());

/** Draft persistence: an episode in progress survives navigation away and
 *  flaky connections (form-reset bug from the 2026-07-02 call). Older drafts
 *  may carry a `confidence` field from before the widget's removal - it is
 *  simply ignored on restore - and drafts from before the 2026-08-28 rework
 *  lack the rationale / nothingToCorrect fields, which restore as empty. */
interface EpisodeDraft {
  step: Step;
  coldAnswer: string;
  englishGloss: string;
  instructionIg: string;
  coldLocked: boolean;
  winner: Winner | null;
  explanation: string;
  failureTagsA: string[];
  failureTagsB: string[];
  axisVals: Record<string, AxisVal>;
  axisNotes: Record<string, string>;
  editWinner: string;
  editSeededFor: "a" | "b" | null;
  editReasons: ReasonMap;
  editRationale: string;
  nothingToCorrect: boolean;
  tieTarget: "a" | "b";
  tieEdit: string;
  tieReasons: ReasonMap;
  tieRationale: string;
  salvage: string;
  salvageGloss: string;
  markupTarget: "a" | "b";
  markupEdit: string;
  markupSeededFor: "a" | "b" | null;
  markupReasons: ReasonMap;
  markupRationale: string;
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
  const [skipping, setSkipping] = useState(false);
  const [demoSessionId, setDemoSessionId] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("prompt");

  // Cold authoring (gold-first): the annotator's own answer, written before the
  // models are revealed. Locked the moment AI answers are shown.
  const [coldAnswer, setColdAnswer] = useState("");
  // Lydia's two-box design: a plain-English "what it means / why" gloss that
  // travels with the Igala answer as training metadata (never merged into it).
  const [englishGloss, setEnglishGloss] = useState("");
  // Bonus (collapsed by default): the prompt/instruction itself rewritten in
  // Igala, so one episode can mint two training rows.
  const [instructionIg, setInstructionIg] = useState("");
  const [instructionOpen, setInstructionOpen] = useState(false);
  // The Igala variety this answer is written in. Deliberately NOT reset between
  // episodes and mirrored to localStorage - an annotator's dialect is a fact
  // about them, not about the prompt, so re-picking it every round is pure tax.
  const [dialect, setDialect] = useState("");
  const [coldLocked, setColdLocked] = useState(false);
  const coldRef = useRef<HTMLTextAreaElement>(null);
  const instructionRef = useRef<HTMLTextAreaElement>(null);

  // Pairwise. (The 1-4 confidence widget is gone: 1,166 of 1,170 all-time
  // comparisons sat at 4, including after it was made required - zero
  // information, one tap of tax per episode. Span-level uncertainty now lives
  // in the edit reason tag "unsure" instead. The API still ACCEPTS confidence
  // so stale clients never 400.)
  const [winner, setWinner] = useState<Winner | null>(null);
  const [explanation, setExplanation] = useState("");
  // Per-output failure tags. Kept per side (not per "loser") so switching the
  // pick doesn't lose work; which sides actually get SENT is decided at submit
  // time by failureTagSides(winner).
  const [failureTagsA, setFailureTagsA] = useState<string[]>([]);
  const [failureTagsB, setFailureTagsB] = useState<string[]>([]);

  // Rubric v2 (Lydia's axes): per-axis 0-5 or N/A, on the winner only.
  const [axisVals, setAxisVals] =
    useState<Record<string, AxisVal>>(emptyAxisVals());
  const [axisNotes, setAxisNotes] = useState<Record<string, string>>({});
  const [editWinner, setEditWinner] = useState("");
  // Which winner (a|b) editWinner was seeded from, so switching the pick re-seeds
  // instead of leaving the LOSING output's text staged as a "correction".
  const [editSeededFor, setEditSeededFor] = useState<"a" | "b" | null>(null);
  // Per-change reasons for the winner-edit suggestions (the editing ground).
  const [editReasons, setEditReasons] = useState<ReasonMap>({});
  // The English "why I made these corrections" (2026-08-28 rework). Required
  // whenever the winner edit has changed segments - eleven corrections landed
  // with zero reasons under the optional regime, and the reason is the half
  // that teaches the rule. Stored as OutputEdit.rationale.
  const [editRationale, setEditRationale] = useState("");
  // The explicit "nothing to correct" act (2026-08-28 rework): skipping the
  // correction is a deliberate button press, never a default. Cleared the
  // moment the annotator touches the editor - typing contradicts it.
  const [nothingToCorrect, setNothingToCorrect] = useState(false);

  // Tie: optionally correct one side
  const [tieTarget, setTieTarget] = useState<"a" | "b">("a");
  const [tieEdit, setTieEdit] = useState("");
  const [tieReasons, setTieReasons] = useState<ReasonMap>({});
  // Same required-when-changed English rationale as the winner path.
  const [tieRationale, setTieRationale] = useState("");

  // Both-inadequate markup: OPTIONALLY mark up one of the rejected AI answers
  // as suggestions. Secondary to the salvage rewrite (source-free-ish
  // authorship stays the anti-translationese core) - collapsed by default; a
  // made markup re-reveals itself.
  const [markupOpen, setMarkupOpen] = useState(false);
  const [markupTarget, setMarkupTarget] = useState<"a" | "b">("a");
  const [markupEdit, setMarkupEdit] = useState("");
  const [markupSeededFor, setMarkupSeededFor] = useState<"a" | "b" | null>(
    null,
  );
  const [markupReasons, setMarkupReasons] = useState<ReasonMap>({});
  // Same required-when-changed English rationale as the winner path.
  const [markupRationale, setMarkupRationale] = useState("");

  // Both-inadequate salvage rewrite. It has its own English gloss (not shared
  // with the cold answer's) because it is a DIFFERENT answer whenever it is
  // saved at all - a salvage identical to the cold answer is never sent.
  const [salvage, setSalvage] = useState("");
  const [salvageGloss, setSalvageGloss] = useState("");
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

  // Remembered dialect, restored once on mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DIALECT_STORAGE_KEY);
      if (saved && isDialect(saved)) setDialect(saved);
    } catch {
      // storage unavailable - the select just starts empty
    }
  }, []);

  function updateDialect(value: string) {
    setDialect(value);
    try {
      if (value) localStorage.setItem(DIALECT_STORAGE_KEY, value);
      else localStorage.removeItem(DIALECT_STORAGE_KEY);
    } catch {
      // non-fatal - the value still applies to this episode
    }
  }

  function toggleFailureTag(side: "a" | "b", key: string) {
    const setter = side === "a" ? setFailureTagsA : setFailureTagsB;
    setter((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  const resetEpisode = useCallback(() => {
    setStep("prompt");
    setColdAnswer("");
    setEnglishGloss("");
    setInstructionIg("");
    setInstructionOpen(false);
    setColdLocked(false);
    setWinner(null);
    setExplanation("");
    setFailureTagsA([]);
    setFailureTagsB([]);
    setAxisVals(emptyAxisVals());
    setAxisNotes({});
    setEditWinner("");
    setEditSeededFor(null);
    setEditReasons({});
    setEditRationale("");
    setNothingToCorrect(false);
    setTieTarget("a");
    setTieEdit("");
    setTieReasons({});
    setTieRationale("");
    setMarkupOpen(false);
    setMarkupTarget("a");
    setMarkupEdit("");
    setMarkupSeededFor(null);
    setMarkupReasons({});
    setMarkupRationale("");
    setSalvage("");
    setSalvageGloss("");
    setConsentBenchmark(true);
    setConsentTraining(true);
    setFlagOpen(false);
    setFlagReason("");
  }, []);

  const restoreDraft = useCallback((d: EpisodeDraft) => {
    setStep(d.step);
    setColdAnswer(d.coldAnswer);
    setEnglishGloss(d.englishGloss ?? "");
    setInstructionIg(d.instructionIg ?? "");
    setInstructionOpen(Boolean(d.instructionIg?.trim()));
    setColdLocked(d.coldLocked);
    setWinner(d.winner);
    setExplanation(d.explanation);
    setFailureTagsA(d.failureTagsA ?? []);
    setFailureTagsB(d.failureTagsB ?? []);
    setAxisVals({ ...emptyAxisVals(), ...d.axisVals });
    setAxisNotes(d.axisNotes ?? {});
    setEditWinner(d.editWinner);
    setEditSeededFor(d.editSeededFor ?? null);
    setEditReasons(d.editReasons ?? {});
    setEditRationale(d.editRationale ?? "");
    setNothingToCorrect(d.nothingToCorrect ?? false);
    setTieTarget(d.tieTarget);
    setTieEdit(d.tieEdit);
    setTieReasons(d.tieReasons ?? {});
    setTieRationale(d.tieRationale ?? "");
    setMarkupTarget(d.markupTarget ?? "a");
    setMarkupEdit(d.markupEdit ?? "");
    setMarkupSeededFor(d.markupSeededFor ?? null);
    setMarkupReasons(d.markupReasons ?? {});
    setMarkupRationale(d.markupRationale ?? "");
    setSalvage(d.salvage);
    setSalvageGloss(d.salvageGloss ?? "");
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
      englishGloss,
      instructionIg,
      coldLocked,
      winner,
      explanation,
      failureTagsA,
      failureTagsB,
      axisVals,
      axisNotes,
      editWinner,
      editSeededFor,
      editReasons,
      editRationale,
      nothingToCorrect,
      tieTarget,
      tieEdit,
      tieReasons,
      tieRationale,
      salvage,
      salvageGloss,
      markupTarget,
      markupEdit,
      markupSeededFor,
      markupReasons,
      markupRationale,
    };
    try {
      sessionStorage.setItem(draftKeyFor(task), JSON.stringify(draft));
    } catch {
      // storage full/unavailable - non-fatal
    }
  }, [
    task,
    step,
    coldAnswer,
    englishGloss,
    instructionIg,
    coldLocked,
    winner,
    explanation,
    failureTagsA,
    failureTagsB,
    axisVals,
    axisNotes,
    editWinner,
    editSeededFor,
    editReasons,
    editRationale,
    nothingToCorrect,
    tieTarget,
    tieEdit,
    tieReasons,
    tieRationale,
    salvage,
    salvageGloss,
    markupTarget,
    markupEdit,
    markupSeededFor,
    markupReasons,
    markupRationale,
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

  // 2026-08-28 rework: the correction happens right after the A/B choice, on
  // the same page - so the suggesting editor seeds the moment the pick lands
  // on a side it wasn't seeded for (click, keyboard, or draft restore alike).
  // Switching picks re-seeds AND clears the correction state: the old
  // winner's markup, reasons, rationale, and "nothing to correct" must never
  // survive onto a different output (the editSeededFor rule).
  useEffect(() => {
    if (!task || (winner !== "a" && winner !== "b")) return;
    if (editSeededFor === winner) return;
    setEditWinner(winner === "a" ? task.outputA.text : task.outputB.text);
    setEditSeededFor(winner);
    setEditReasons({});
    setEditRationale("");
    setNothingToCorrect(false);
  }, [task, winner, editSeededFor]);

  function revealModels() {
    setColdLocked(true);
    setStep("pairwise");
  }

  // On the "both inadequate" path the explanation is required (that is where the
  // teaching signal lives), so it gates both Continue and Submit.
  const explanationOk =
    winner !== "both_inadequate" ||
    explanation.trim().length >= EXPLANATION_MIN;

  // An Igala gold answer is only lockable once its plain-English meaning is
  // there too. No answer written = nothing to gloss (skipping stays allowed).
  const glossOk = !coldAnswer.trim() || englishGloss.trim().length >= GLOSS_MIN;

  // A salvage rewrite identical to the already-locked cold answer is not a
  // second data point and is never sent - so it needs no second gloss either.
  const salvageDuplicatesCold =
    coldLocked &&
    coldAnswer.trim().length > 0 &&
    salvage.trim() === coldAnswer.trim();
  const salvageWillSave =
    winner === "both_inadequate" &&
    salvage.trim().length > 0 &&
    !salvageDuplicatesCold;
  const salvageGlossOk =
    !salvageWillSave || salvageGloss.trim().length >= GLOSS_MIN;

  // Which outputs are offered failure chips, given the current pick.
  const tagSides = failureTagSides(winner);

  // (i) of the post-verdict sequence (2026-08-28 rework): saying WHY the
  // rejected output lost is REQUIRED - at least one tag on every side the
  // verdict rejects (the loser on a/b, both on both_inadequate, none on tie).
  // Same pure rule the server enforces (missingFailureTagSides), so the
  // Continue gate and the API's 400 can never disagree.
  const missingTags = missingFailureTagSides(
    winner,
    failureTagsA,
    failureTagsB,
  );
  const tagsOk = !missingTags.a && !missingTags.b;

  // (ii)+(iii): the correction on the CHOSEN output. A made fix requires its
  // English "why"; skipping requires the explicit "nothing to correct" act.
  const winnerEdited = !!(
    winnerOutput &&
    editWinner.trim() &&
    textDiffers(editWinner, winnerOutput.text)
  );
  const editRationaleOk =
    !winnerEdited || editRationale.trim().length >= EXPLANATION_MIN;
  const correctionResolved =
    winner !== "a" && winner !== "b"
      ? true
      : winnerEdited
        ? editRationaleOk
        : nothingToCorrect;

  // Tie and both-inadequate corrections stay optional, but once MADE they
  // carry the same required English rationale as the winner path.
  const tieSource = task
    ? tieTarget === "a"
      ? task.outputA
      : task.outputB
    : null;
  const tieEdited = !!(
    tieSource &&
    tieEdit.trim() &&
    textDiffers(tieEdit, tieSource.text)
  );
  const tieRationaleOk =
    !tieEdited || tieRationale.trim().length >= EXPLANATION_MIN;

  const markupSource = task
    ? markupTarget === "a"
      ? task.outputA
      : task.outputB
    : null;
  const markupMade = !!(
    markupSource &&
    markupEdit.trim() &&
    textDiffers(markupEdit, markupSource.text)
  );
  const markupRationaleOk =
    !markupMade || markupRationale.trim().length >= EXPLANATION_MIN;

  function proceedToScore() {
    // The whole post-verdict sequence gates Continue: verdict, required
    // loser tags, the resolved correction (fixed-with-why or the explicit
    // "nothing to correct"), and the both-inadequate explanation.
    if (!winner || !explanationOk || !tagsOk || !correctionResolved) return;
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
    if (!explanationOk) return false; // both_inadequate requires a written why
    if (!tagsOk) return false; // the required WHY on every rejected side
    if (!salvageGlossOk) return false; // a saved rewrite needs its meaning
    if (winner === "a" || winner === "b")
      // Rubric on the winner plus the resolved correction step (a fix with
      // its English why, or the explicit "nothing to correct" act).
      return rubricComplete() && correctionResolved;
    if (winner === "tie") return tieRationaleOk;
    return markupRationaleOk; // both_inadequate: a made markup needs its why
  };

  async function handleSubmit() {
    if (!task || !winner || submitting || !canSubmit()) return;
    setSubmitting(true);

    // Segments-with-reasons for whichever markup this episode sends: derived
    // fresh from (original, trimmed corrected) at submit so they always match
    // the correctedText the server verifies against. A reason whose segment
    // vanished on the trim is dropped (documented, acceptable).
    const segmentsFor = (original: string, corrected: string, r: ReasonMap) =>
      attachReasons(diffToSegments(original, corrected), r);

    const payload: Record<string, unknown> = {
      promptId: task.prompt.promptId,
      modelOutputAId: task.outputA.id,
      modelOutputBId: task.outputB.id,
      winner,
      explanation: explanation.trim(),
      // Only the sides the current pick actually offers chips for. Toggling
      // between picks keeps the chips on screen, but a side that became the
      // WINNER must never ship the failure tags it collected as a loser.
      failureTagsA: tagSides.a ? failureTagsA : [],
      failureTagsB: tagSides.b ? failureTagsB : [],
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
      if (winnerOutput && textDiffers(editWinner, winnerOutput.text)) {
        payload.edit = {
          correctedText: editWinner.trim(),
          segments: segmentsFor(
            winnerOutput.text,
            editWinner.trim(),
            editReasons,
          ),
          // The required English "why I made these corrections" (2026-08-28
          // rework) - stored as OutputEdit.rationale, validated server-side.
          rationale: editRationale.trim(),
          consentBenchmark,
          consentTraining,
        };
      }
    } else if (winner === "tie") {
      const target = tieTarget === "a" ? task.outputA : task.outputB;
      if (tieEdit.trim() && textDiffers(tieEdit, target.text)) {
        // Keep the honest "tie" winner; attach the correction to the chosen side.
        payload.edit = {
          modelOutputId: target.id,
          correctedText: tieEdit.trim(),
          segments: segmentsFor(target.text, tieEdit.trim(), tieReasons),
          rationale: tieRationale.trim(),
          consentBenchmark,
          consentTraining,
        };
      }
    } else if (winner === "both_inadequate") {
      // Optional markup of one rejected AI answer (the editing ground's
      // secondary path here - the salvage rewrite below stays primary). Both
      // may be sent together: they are different artifacts.
      const markupOut = markupTarget === "a" ? task.outputA : task.outputB;
      if (markupEdit.trim() && textDiffers(markupEdit, markupOut.text)) {
        payload.edit = {
          modelOutputId: markupOut.id,
          correctedText: markupEdit.trim(),
          segments: segmentsFor(
            markupOut.text,
            markupEdit.trim(),
            markupReasons,
          ),
          rationale: markupRationale.trim(),
          consentBenchmark,
          consentTraining,
        };
      }
      // If the salvage rewrite is identical to the already-locked cold answer,
      // it's not a second data point - skip it and let coldAuthor (below) carry
      // it alone, since that row has the stronger provenance (speaker-authored,
      // source-free, written before reveal). Only send both when the texts
      // differ, which is legitimate: an initial answer plus a correction made
      // after seeing why both AI outputs failed. `salvageWillSave` encodes that
      // same rule, and is what gates the required gloss.
      if (salvageWillSave) {
        payload.salvageAnswer = {
          answerText: salvage.trim(),
          englishGloss: salvageGloss.trim(),
          instructionIg: instructionIg.trim() || undefined,
          dialect: dialect || undefined,
          consentBenchmark,
          consentTraining,
        };
      }
    }

    // Included whenever a cold answer was actually locked before reveal -
    // gold-first buckets require it, but it's equally valid (and equally
    // valuable) when volunteered on any other bucket.
    if (coldLocked && coldAnswer.trim()) {
      payload.coldAuthor = {
        answerText: coldAnswer.trim(),
        englishGloss: englishGloss.trim() || undefined,
        instructionIg: instructionIg.trim() || undefined,
        dialect: dialect || undefined,
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
      // A cold answer is the single highest-value artifact this episode can
      // produce, so it gets its own acknowledgement rather than being folded
      // into a generic "extras" list. Fall back to client-side knowledge
      // (coldLocked) if the API response ever omits coldSaved.
      const gotColdAnswer = data.coldSaved ?? (coldLocked && coldAnswer.trim());
      const extras: string[] = [];
      if (data.editsSaved) extras.push("a correction");
      if (data.salvageSaved) extras.push("a rewrite");
      if (gotColdAnswer) {
        showToast(
          "Gold answer saved - this is what teaches the model real Igala.",
          "success",
        );
      } else {
        showToast(
          extras.length
            ? `Saved - including ${extras.join(" and ")}.`
            : "Annotation submitted.",
          "success",
        );
      }
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

  // Skip this prompt entirely (no judgement recorded). Contract with the
  // in-parallel endpoint: POST /api/annotations/skip { promptId } -> 200.
  async function skipPrompt() {
    if (!task || skipping || submitting) return;
    setSkipping(true);
    try {
      const res = await fetch("/api/annotations/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptId: task.prompt.promptId }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Could not skip this prompt.");
      showToast("Skipped - loading the next prompt.", "success");
      clearDraft();
      await fetchNext();
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Could not skip this prompt.",
        "error",
      );
    } finally {
      setSkipping(false);
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

  // Persistent numbered step bar. The three-state machine (prompt/pairwise/score)
  // maps onto four plain-English stages; on the pairwise screen the highlight
  // advances from "Compare" to "Why & fix" once a winner is picked - tagging
  // the loser and correcting the chosen output now happen right there.
  const STAGES = ["Your answer", "Compare", "Why & fix", "Score"] as const;
  const activeStage =
    step === "prompt" ? 0 : step === "pairwise" ? (winner ? 2 : 1) : 3;

  const goldHint = bucketGoldHint(task.prompt.bucket);

  // A locked cold answer already IS a gold correction, so the in-episode
  // editor gets a context line instead of a second demand - but the explicit
  // fix-or-nothing choice still applies (a deliberate act, not a default).
  const hasColdGold = coldLocked && coldAnswer.trim().length > 0;

  // Both-inadequate markup: a made markup re-reveals its disclosure.
  const showMarkup = markupOpen || markupMade;

  // Shown under the lock/skip buttons when an Igala answer is written but its
  // English meaning is missing - the one thing that now blocks locking.
  const glossNeededHint = !glossOk ? (
    <p className="mt-2 text-xs text-accent-text">
      Add the English meaning above to lock your answer - a few words is enough.
      (Or clear the Igala box to skip this one.)
    </p>
  ) : null;

  // The two labeled boxes (Lydia's design) plus the collapsed bonus field,
  // shared by the gold-first and optional authoring branches of the first step.
  const authoringBoxes = (
    <>
      {goldHint && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-accent/30 bg-accent-subtle px-3 py-2 text-xs text-accent-text">
          <span className="shrink-0 font-semibold">For this one:</span>
          <span>{goldHint}</span>
        </div>
      )}

      {/* Box 1 - the Igala answer (prominent, required to lock) */}
      <label className="mt-4 block text-sm font-medium text-text-secondary">
        Your answer in Igala
      </label>
      <textarea
        ref={coldRef}
        value={coldAnswer}
        onChange={(e) => setColdAnswer(e.target.value)}
        rows={3}
        placeholder="Write the ideal Igala answer in your own words…"
        className={`mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-accent ${textFont}`}
      />
      <ToneKeyboard
        targetRef={coldRef}
        value={coldAnswer}
        onValueChange={setColdAnswer}
      />

      {/* Box 2 - plain-English gloss. REQUIRED to lock: an Igala sentence with
          no meaning attached can't be used as a lesson by anyone downstream. */}
      <label className="mt-4 block text-sm font-medium text-text-secondary">
        What it means / why, in English{" "}
        <span className="text-accent-text">(required)</span>
      </label>
      <p className="mt-1 text-xs text-text-muted">{GLOSS_WHY}</p>
      <textarea
        value={englishGloss}
        onChange={(e) => setEnglishGloss(e.target.value)}
        rows={2}
        placeholder="In plain English - what your answer means, or why you'd say it this way."
        className="mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-secondary placeholder:text-text-muted focus-visible:border-accent"
      />

      {/* Dialect - remembered across episodes, so this is a one-time pick. */}
      <label className="mt-4 block text-sm font-medium text-text-secondary">
        Which Igala is this?{" "}
        <span className="font-normal text-text-muted">(optional)</span>
      </label>
      <select
        value={dialect}
        onChange={(e) => updateDialect(e.target.value)}
        className="mt-2 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary"
      >
        <option value="">Choose your dialect…</option>
        {IGALA_DIALECTS.map((d) => (
          <option key={d.key} value={d.key}>
            {d.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-text-muted">
        We remember this, so you only pick it once.
      </p>

      {/* Bonus - collapsed by default: the question itself, in Igala */}
      {instructionOpen ? (
        <div className="mt-4">
          <label className="block text-sm font-medium text-text-secondary">
            How would an Igala speaker ask this question?{" "}
            <span className="font-normal text-text-muted">(optional)</span>
          </label>
          <p className="mt-1 text-xs text-text-muted">
            This doubles what the AI learns from your answer.
          </p>
          <textarea
            ref={instructionRef}
            value={instructionIg}
            onChange={(e) => setInstructionIg(e.target.value)}
            rows={2}
            placeholder="The question itself, in Igala…"
            className={`mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-accent ${textFont}`}
          />
          <ToneKeyboard
            targetRef={instructionRef}
            value={instructionIg}
            onValueChange={setInstructionIg}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setInstructionOpen(true)}
          className="mt-3 cursor-pointer text-xs font-medium text-accent-text underline-offset-2 hover:underline"
        >
          Bonus - write the question itself in Igala (optional)
        </button>
      )}
    </>
  );

  const stepBar = (
    <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-2">
      {STAGES.map((label, i) => {
        const done = i < activeStage;
        const current = i === activeStage;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                current
                  ? "bg-accent text-accent-contrast"
                  : done
                    ? "bg-accent-subtle text-accent-text"
                    : "bg-surface-sunken text-text-muted"
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold ${
                  current
                    ? "bg-accent-contrast text-accent"
                    : done
                      ? "bg-accent-text text-accent-subtle"
                      : "bg-border text-text-tertiary"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              {label}
            </div>
            {i < STAGES.length - 1 && (
              <span className="hidden text-text-muted sm:inline">&rarr;</span>
            )}
          </div>
        );
      })}
    </div>
  );

  const axisButtons = (axisKey: string) => (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => setAxisVals((p) => ({ ...p, [axisKey]: "na" }))}
        title="Not applicable - this axis is not relevant to this prompt"
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
            placeholder="Optional note - what exactly is right or wrong…"
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
            Nothing here is saved to training data or the benchmark - it&apos;s
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

      {stepBar}

      {/* First screen only: plain-English framing of the whole episode. */}
      {step === "prompt" && !coldLocked && (
        <div className="mb-6 rounded-lg border border-accent/30 bg-accent-subtle p-5">
          <p className="text-sm leading-relaxed text-accent-text">
            <span className="font-semibold">
              You are teaching an AI to speak Igala.
            </span>{" "}
            Each round: write how YOU would say it, pick the better of two AI
            attempts, tag why the other one lost, then fix the one you picked
            (or confirm it needs no fixes) and say in English why you changed
            what you changed. Your Igala, your tags, and your explanations are
            the lessons the AI learns from.
          </p>
        </div>
      )}

      {/* Prompt card - bucket label, the task, and the watch-for line. */}
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

      {/* STEP: prompt / cold-authoring (two-box gold answer) */}
      {step === "prompt" && (
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          {coldLocked ? (
            // Reached via the pairwise step's Back button (or a restored draft
            // with coldLocked already true): the annotator has now SEEN both AI
            // outputs, so the textareas and lock/skip buttons must not reappear -
            // editing here would silently break the source-free guarantee.
            <>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                First - how would YOU say it?
              </h3>
              {coldAnswer.trim() ? (
                <div className="mt-3 rounded-md border border-border bg-surface-sunken px-4 py-2 text-xs text-text-tertiary">
                  <span className="font-medium text-text-secondary">
                    Your locked answer:
                  </span>{" "}
                  <span className={textFont}>{coldAnswer}</span>
                  {englishGloss.trim() && (
                    <p className="mt-2 text-text-secondary">
                      <span className="font-medium">Means:</span> {englishGloss}
                    </p>
                  )}
                  {instructionIg.trim() && (
                    <p className="mt-2 text-text-secondary">
                      <span className="font-medium">
                        In Igala, the question:
                      </span>{" "}
                      <span className={textFont}>{instructionIg}</span>
                    </p>
                  )}
                  <p className="mt-2 text-text-muted">
                    Your answer is locked - it was written before you saw the AI
                    outputs, which is exactly what makes it valuable.
                  </p>
                </div>
              ) : (
                <p className="mt-1 text-sm text-text-secondary">
                  You skipped writing your own answer, and you&apos;ve already
                  seen the AI outputs - writing one now wouldn&apos;t be
                  source-free, so it&apos;s no longer offered here.
                </p>
              )}
              <button
                onClick={() => setStep("pairwise")}
                className="mt-4 cursor-pointer rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-accent-contrast hover:bg-accent-hover"
              >
                Back to the AI outputs
              </button>
            </>
          ) : task.goldFirst ? (
            <>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                First - how would YOU say it?
                <InfoTip width="w-80">
                  Your own answer, written without any model in view, is
                  source-free gold: it doesn&apos;t inherit the translationese
                  of an AI answer the way an edit does. This is the single
                  highest-value record on this bucket.
                </InfoTip>
              </h3>
              <p className="mt-1 text-sm text-text-secondary">
                Your own answer is the most valuable thing you can give: the
                model can only learn real Igala from real speakers. Even one
                sentence helps.
              </p>
              {authoringBoxes}
              <button
                onClick={revealModels}
                disabled={!glossOk}
                className="mt-5 cursor-pointer rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-accent-contrast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                {coldAnswer.trim()
                  ? "Lock my answer & reveal the AI outputs"
                  : "Skip & reveal the AI outputs"}
              </button>
              {glossNeededHint}
              <p className="mt-2 text-xs text-text-muted">
                Once revealed, your answer is locked so it stays source-free.
              </p>
            </>
          ) : (
            <>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                First - how would YOU say it?
                <InfoTip width="w-80">
                  Your own answer, written without any model in view, is
                  source-free gold: it doesn&apos;t inherit the translationese
                  of an AI answer the way an edit does. Optional here, but still
                  the most valuable thing you can leave on this prompt.
                </InfoTip>
              </h3>
              <p className="mt-1 text-sm text-text-secondary">
                Your own answer is the most valuable thing you can give: the
                model can only learn real Igala from real speakers. Even one
                sentence helps.
              </p>
              {authoringBoxes}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  onClick={revealModels}
                  disabled={!coldAnswer.trim() || !glossOk}
                  className="cursor-pointer rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-accent-contrast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Lock my answer &amp; reveal the AI outputs
                </button>
                {/* Skipping stays available, but not as a side door around the
                    required meaning: a typed answer would otherwise be locked
                    and submitted with no gloss at all. */}
                <button
                  onClick={revealModels}
                  disabled={!glossOk}
                  className="cursor-pointer rounded-md border border-border-strong bg-surface px-6 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Skip - just show me the outputs
                </button>
              </div>
              {glossNeededHint}
              <p className="mt-2 text-xs text-text-muted">
                Once revealed, your answer is locked so it stays source-free.
              </p>
            </>
          )}

          {/* Quiet secondary action: skip this prompt entirely (first step only) */}
          {!coldLocked && (
            <div className="mt-6 border-t border-border pt-4">
              <button
                onClick={skipPrompt}
                disabled={skipping}
                className="cursor-pointer text-xs text-text-tertiary underline-offset-2 hover:text-text-secondary hover:underline disabled:opacity-40"
              >
                {skipping ? "Skipping…" : "Skip this prompt"}
              </button>
            </div>
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
              <div key={value} className="flex flex-col gap-3">
                <div
                  className={`flex-1 cursor-pointer rounded-lg border-2 bg-surface p-6 transition-colors ${
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

                {/* Failure tags for THIS output - (i) of the post-verdict
                    sequence. Appears once the pick makes it relevant: both
                    sides on "both inadequate", the losing side only when a
                    winner was chosen - and at least one tag per shown side is
                    REQUIRED before continuing (2026-08-28 rework: the WHY is
                    the signal, e.g. "this is Yoruba"). Outside the card, so
                    tapping a chip never also re-picks the winner. */}
                {tagSides[value] && (
                  <div className="rounded-lg border border-border bg-surface-sunken p-3">
                    <p className="text-xs font-semibold text-text-secondary">
                      {winner === "both_inadequate"
                        ? `${label} - what is wrong with it?`
                        : `${label} lost - why?`}{" "}
                      <span className="font-medium text-accent-text">
                        (required)
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      {FAILURE_TAG_PROMPT}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {FAILURE_TAGS.map((t) => {
                        const on = (
                          value === "a" ? failureTagsA : failureTagsB
                        ).includes(t.key);
                        return (
                          <button
                            key={t.key}
                            type="button"
                            title={t.hint}
                            aria-pressed={on}
                            onClick={() => toggleFailureTag(value, t.key)}
                            // min-h-10 = 40px: these chips are now a REQUIRED
                            // step, tapped with thumbs (house rule: >= 40px).
                            className={`inline-flex min-h-10 cursor-pointer items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                              on
                                ? "border-accent bg-accent text-accent-contrast"
                                : "border-border-strong bg-surface text-text-secondary hover:border-accent hover:text-accent-text"
                            }`}
                          >
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                    {(value === "a" ? missingTags.a : missingTags.b) && (
                      <p className="mt-2 text-xs text-accent-text">
                        Tap at least one - this is how the AI learns what went
                        wrong.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Winner choice incl. tie / both-inadequate */}
          <div className="mt-6 text-sm font-medium text-text-secondary">
            Which is the better Igala - or is neither good?
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {WINNER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setWinner(opt.value)}
                // min-h-[44px]: the verdict is the sequence's first tap.
                className={`min-h-[44px] cursor-pointer rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
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
              inadequate&quot; is honest data - and lets you write the correct
              version.
            </InfoTip>
          </div>

          {/* (ii)+(iii) of the post-verdict sequence (2026-08-28 rework):
              correct the CHOSEN output right here, right after the choice -
              no separate tab, no later screen, one scrolling page. Skipping
              is an explicit "nothing to correct" act, never a default; a
              made fix requires its English why (OutputEdit.rationale). */}
          {(winner === "a" || winner === "b") && winnerOutput && (
            <div className="mt-6 rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-6">
              <label className="flex items-center gap-2 text-sm font-medium text-text-secondary">
                Now fix {winner === "a" ? "Output A" : "Output B"} - the one you
                picked
                <InfoTip width="w-80">
                  Rewriting the winner the way a fluent speaker would creates a
                  gold training target. Your changes show up as suggestions,
                  each with a quick reason. If it is already exactly right, say
                  so with the button below.
                </InfoTip>
              </label>
              {hasColdGold && (
                <p className="mt-1 text-xs text-text-muted">
                  Your own answer from step 1 is already saved as gold - this is
                  only about whether the AI&apos;s winning answer itself needs
                  fixing.
                </p>
              )}
              <SuggestingEditor
                original={winnerOutput.text}
                value={editWinner}
                onValueChange={(v) => {
                  setEditWinner(v);
                  // Typing in the editor contradicts "nothing to correct".
                  if (nothingToCorrect) setNothingToCorrect(false);
                }}
                reasons={editReasons}
                onReasonsChange={setEditReasons}
              />

              {winnerEdited ? (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-text-secondary">
                    Why did you make these corrections? In English{" "}
                    <span className="text-accent-text">(required)</span>
                  </label>
                  <p className="mt-1 text-xs text-text-muted">
                    The tags on each change say what KIND of fix it is; this
                    sentence teaches the rule behind your fixes.
                  </p>
                  <textarea
                    value={editRationale}
                    onChange={(e) => setEditRationale(e.target.value)}
                    rows={2}
                    placeholder="e.g. 'nwu' is Igbo, not Igala - and the greeting needs the plural form."
                    className="mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-accent"
                  />
                  {!editRationaleOk && (
                    <p className="mt-1 text-xs text-accent-text">
                      A sentence in English is required with your corrections -
                      it is what turns a fix into a lesson.
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-3">
                  <button
                    type="button"
                    aria-pressed={nothingToCorrect}
                    onClick={() => setNothingToCorrect((v) => !v)}
                    className={`inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition-colors sm:w-auto ${
                      nothingToCorrect
                        ? "border-success bg-success-subtle text-success"
                        : "border-border-strong bg-surface text-text-secondary hover:bg-surface-sunken"
                    }`}
                  >
                    {nothingToCorrect
                      ? "✓ Nothing to correct - it is how I would say it"
                      : "Nothing to correct - it is how I would say it"}
                  </button>
                  <p className="mt-1.5 text-xs text-text-muted">
                    Fix the answer above, or tap this to confirm it needs no
                    fixes - one or the other, so we never have to guess.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* The "why" step - explicit and in English. Required when both AI
              answers are inadequate (that is where the teaching signal lives),
              encouraged otherwise. */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-text-secondary">
              Why? Explain in English{" "}
              {winner === "both_inadequate" ? (
                <span className="text-accent-text">(required)</span>
              ) : (
                <span className="text-text-muted">(encouraged)</span>
              )}
            </label>
            <p className="mt-1 text-sm text-text-secondary">
              Write in English - you are teaching the AI what good Igala looks
              like. Name the wrong words and give the right ones.
              {(tagSides.a || tagSides.b) && (
                <>
                  {" "}
                  {winner === "both_inadequate"
                    ? "The tags above say what KIND of mistake it is; this is where you give the right Igala. Both matter."
                    : "The tags say what KIND of mistake the loser made; add here anything they cannot - context, meaning, what to watch for."}
                </>
              )}
            </p>
            <div className="mt-2 rounded-md border border-border bg-surface-sunken px-3 py-2 text-xs text-text-secondary">
              <span className="font-medium text-text-primary">Example:</span>{" "}
              <span className="italic">
                In Igala, the word for &apos;morning&apos; is &apos;odudu&apos;.
              </span>
            </div>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Name what is wrong and give the right Igala. Even a sentence helps."
              rows={3}
              className="mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-accent"
            />
            {winner === "both_inadequate" && !explanationOk && (
              <p className="mt-1 text-xs text-text-tertiary">
                A short explanation is required when both answers are inadequate
                - it is the most useful thing you can leave here.
              </p>
            )}
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={() => setStep("prompt")}
              className="inline-flex min-h-[44px] cursor-pointer items-center text-sm text-text-tertiary hover:text-text-secondary"
            >
              &larr; Back
            </button>
            <button
              onClick={proceedToScore}
              disabled={
                !winner || !explanationOk || !tagsOk || !correctionResolved
              }
              className="min-h-[44px] cursor-pointer rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-accent-contrast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue
            </button>
          </div>
          {/* Say exactly which required act is missing - a silently disabled
              button on a phone reads as "the app is broken". */}
          {winner && (!tagsOk || !correctionResolved) && (
            <p className="mt-2 text-xs text-text-tertiary">
              {!tagsOk
                ? "To continue: tap at least one tag under the rejected output - the why is the lesson."
                : winnerEdited
                  ? "To continue: add the English why for your corrections."
                  : "To continue: fix the winner above, or tap 'Nothing to correct'."}
            </p>
          )}
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
                  You picked {winner === "a" ? "Output A" : "Output B"} - score
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
                      Reference - fact-check against this
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
                          No reference material on file - score on your own
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

                {/* Pass 2: pragmatics - the reflective second pass (in-scope) */}
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
                      Other rubric axes (not usually relevant to this prompt) -
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

              {/* The correction itself happened on the previous screen, right
                  after the verdict (2026-08-28 rework). Replay what was
                  decided so the score step never silently drops it. The
                  unresolved branch exists for drafts restored from before the
                  rework - the Continue gate makes it unreachable otherwise,
                  and Submit stays disabled until it is resolved. */}
              <div className="rounded-lg border border-border bg-surface-sunken p-4 text-sm text-text-secondary">
                {correctionResolved && winnerEdited ? (
                  <p>
                    Your corrections to the winner are staged and will be saved
                    with this episode.
                  </p>
                ) : correctionResolved ? (
                  <p>
                    You confirmed the winner needs no corrections. Go back if
                    you spot something after all.
                  </p>
                ) : (
                  <p className="text-accent-text">
                    The correction step is still open: go back to fix the winner
                    (with its English why), or confirm there is nothing to
                    correct.
                  </p>
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
                      setTieReasons({});
                      setTieRationale("");
                    }}
                    className={`min-h-[44px] cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors ${
                      tieTarget === t
                        ? "border-accent bg-accent text-accent-contrast"
                        : "border-border-strong bg-surface text-text-secondary hover:bg-surface-sunken"
                    }`}
                  >
                    Correct Output {t.toUpperCase()}
                  </button>
                ))}
              </div>
              <SuggestingEditor
                original={
                  (tieTarget === "a" ? task.outputA : task.outputB).text
                }
                value={tieEdit}
                onValueChange={setTieEdit}
                reasons={tieReasons}
                onReasonsChange={setTieReasons}
                placeholder="Optional correction…"
              />
              {/* A made correction carries its English why - same rule as
                  the winner path (required when suggestions exist). */}
              {tieEdited && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-text-secondary">
                    Why did you make these corrections? In English{" "}
                    <span className="text-accent-text">(required)</span>
                  </label>
                  <textarea
                    value={tieRationale}
                    onChange={(e) => setTieRationale(e.target.value)}
                    rows={2}
                    placeholder="What was wrong, and what rule does your fix follow?"
                    className="mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-accent"
                  />
                  {!tieRationaleOk && (
                    <p className="mt-1 text-xs text-accent-text">
                      A sentence in English is required with your corrections -
                      it is what turns a fix into a lesson.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Both inadequate: write the correct version from scratch */}
          {winner === "both_inadequate" && (
            <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
              <label className="flex items-center gap-2 text-sm font-medium text-text-secondary">
                Write the correct version (strongly encouraged)
                <InfoTip width="w-80">
                  Both AI answers were inadequate, so the most valuable thing
                  you can leave is the right answer in your own words - a clean
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

              {/* A saved rewrite is a gold answer like any other, so it carries
                  the same required English meaning. Hidden when the rewrite just
                  repeats the locked cold answer - that row is never sent, so
                  asking for its meaning twice would be busywork. */}
              {salvage.trim() && !salvageDuplicatesCold && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-text-secondary">
                    What it means in English{" "}
                    <span className="text-accent-text">(required)</span>
                  </label>
                  <p className="mt-1 text-xs text-text-muted">{GLOSS_WHY}</p>
                  <textarea
                    value={salvageGloss}
                    onChange={(e) => setSalvageGloss(e.target.value)}
                    rows={2}
                    placeholder="In plain English - what your answer means, or why you'd say it this way."
                    className="mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-secondary placeholder:text-text-muted focus-visible:border-accent"
                  />
                  {!salvageGlossOk && (
                    <p className="mt-1 text-xs text-accent-text">
                      Add the English meaning to save your rewrite - a few words
                      is enough.
                    </p>
                  )}
                </div>
              )}

              {salvage.trim() && salvageDuplicatesCold && (
                <p className="mt-3 text-xs text-text-muted">
                  Same as the answer you locked in step 1 - we keep that one,
                  with the meaning you already gave.
                </p>
              )}

              {/* Secondary, collapsed: mark up one rejected AI answer as
                  suggestions. The fresh rewrite above STAYS primary -
                  source-free-ish authorship is the anti-translationese core
                  and must not be demoted. Doing both is allowed: they are
                  different artifacts. */}
              <div className="mt-5 border-t border-border pt-4">
                {!showMarkup ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMarkupOpen(true);
                      if (markupSeededFor !== markupTarget) {
                        setMarkupEdit(
                          (markupTarget === "a" ? task.outputA : task.outputB)
                            .text,
                        );
                        setMarkupSeededFor(markupTarget);
                      }
                    }}
                    className="cursor-pointer text-xs font-medium text-accent-text underline-offset-2 hover:underline"
                  >
                    Or mark up one of the AI answers instead
                  </button>
                ) : (
                  <>
                    <p className="text-sm font-medium text-text-secondary">
                      Mark up one of the AI answers{" "}
                      <span className="font-normal text-text-muted">
                        (optional)
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      Fix it directly - your changes appear as suggestions, each
                      with a reason.
                    </p>
                    <div className="mt-3 flex gap-2">
                      {(["a", "b"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => {
                            setMarkupTarget(t);
                            // Re-seed on every side switch so the other
                            // side's text is never staged as this side's
                            // "correction" (the editSeededFor rule).
                            setMarkupEdit(
                              (t === "a" ? task.outputA : task.outputB).text,
                            );
                            setMarkupSeededFor(t);
                            setMarkupReasons({});
                            setMarkupRationale("");
                          }}
                          className={`min-h-[44px] cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors ${
                            markupTarget === t
                              ? "border-accent bg-accent text-accent-contrast"
                              : "border-border-strong bg-surface text-text-secondary hover:bg-surface-sunken"
                          }`}
                        >
                          Mark up Output {t.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <SuggestingEditor
                      original={
                        (markupTarget === "a" ? task.outputA : task.outputB)
                          .text
                      }
                      value={markupEdit}
                      onValueChange={setMarkupEdit}
                      reasons={markupReasons}
                      onReasonsChange={setMarkupReasons}
                    />
                    {/* A made markup carries its English why - same rule as
                        the winner path (required when suggestions exist). */}
                    {markupMade && (
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-text-secondary">
                          Why did you make these corrections? In English{" "}
                          <span className="text-accent-text">(required)</span>
                        </label>
                        <textarea
                          value={markupRationale}
                          onChange={(e) => setMarkupRationale(e.target.value)}
                          rows={2}
                          placeholder="What was wrong, and what rule does your fix follow?"
                          className="mt-2 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-accent"
                        />
                        {!markupRationaleOk && (
                          <p className="mt-1 text-xs text-accent-text">
                            A sentence in English is required with your
                            corrections - it is what turns a fix into a lesson.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Consent - only shown when something was authored */}
          {(coldAnswer.trim() ||
            (winner === "both_inadequate" && (salvage.trim() || markupMade)) ||
            (winner === "tie" && tieEdit.trim()) ||
            ((winner === "a" || winner === "b") && winnerEdited)) && (
            <div className="mt-6 rounded-lg border border-border bg-surface-sunken p-4">
              <div className="text-sm font-medium text-text-secondary">
                How may we use what you wrote?
              </div>
              {/* min-h-[44px] rows + size-5 boxes: consent is tapped on
                  phones (house rule: >= 40px touch targets). */}
              <label className="mt-1 flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  className="size-5"
                  checked={consentBenchmark}
                  onChange={(e) => setConsentBenchmark(e.target.checked)}
                />
                May appear in the public Igala benchmark
              </label>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  className="size-5"
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
              className="min-h-[44px] cursor-pointer rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-accent-contrast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Submitting…" : "Submit & next"}
            </button>
          </div>
          {/* Only for drafts restored from before the required-why rework:
              the Continue gate normally makes this state unreachable, but a
              silently disabled Submit would strand them here. */}
          {winner && (!tagsOk || !correctionResolved) && (
            <p className="mt-2 text-right text-xs text-text-tertiary">
              Something on the previous screen is still required - go back to
              finish the why-and-fix step.
            </p>
          )}
        </>
      )}
    </div>
  );
}
