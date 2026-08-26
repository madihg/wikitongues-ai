"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EvalBucket } from "@prisma/client";
import { bucketLabel } from "@/lib/buckets";
import { failureTagLabel } from "@/lib/failure-tags";
import {
  attachReasons,
  diffToSegments,
  editSaveLabel,
  nfc,
  reasonCoverage,
  reasonKeyFor,
  type ReasonMap,
} from "@/lib/edit-segments";
import {
  CORRECTIONS_ONBOARDED_KEY,
  ONBOARDING_EXAMPLE,
  PRACTICE_EXAMPLE,
} from "@/lib/corrections-onboarding";
import { SuggestingEditor } from "@/components/suggesting-editor";

/**
 * The Corrections lane (the editing ground, tasks/editing-ground-spec.md):
 * one AI answer the annotator already judged, fixed directly in "suggesting
 * mode" - changes render as struck-through/highlighted suggestions, each
 * changed region carrying two fields: the correct Igala (typed) and the
 * reason why (chips + free text, highly encouraged, never required).
 *
 * The lane inherits pairwise blindness: NO model name is shown anywhere. The
 * context strip replays the annotator's OWN verdict (their explanation, the
 * failure tags they gave this side) so they apply a judgment already made -
 * no cold re-reading of unfamiliar pairs.
 */

type CorrectionRole = "winner" | "tie" | "both_inadequate";

interface CorrectionTask {
  prompt: {
    id: string;
    promptId: string;
    bucket: EvalBucket | null;
    text: string;
    targetCulture: string | null;
  };
  output: { id: string; text: string };
  verdict: {
    role: CorrectionRole;
    explanation: string;
    failureTags: string[];
  };
}

const ROLE_LABEL: Record<CorrectionRole, string> = {
  winner: "You picked this as the winner",
  tie: "You judged this: Tie - both adequate",
  both_inadequate: "You judged this: Both inadequate",
};

/** Same never-throw JSON reader as the annotate flow. */
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

/** Draft persistence per output, same sessionStorage pattern as EpisodeDraft. */
interface CorrectionDraft {
  text: string;
  reasons: ReasonMap;
}

const draftKey = (modelOutputId: string) => `wt-edit-${modelOutputId}`;

function loadCorrectionDraft(modelOutputId: string): CorrectionDraft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(modelOutputId));
    return raw ? (JSON.parse(raw) as CorrectionDraft) : null;
  } catch {
    return null;
  }
}

// ─── First-run onboarding: three cards + a local-only practice round ─────────

// The worked example's reason card, pre-filled from the config constant -
// static, so computed once at module scope.
const EXAMPLE_REASONS: ReasonMap = (() => {
  const segments = diffToSegments(
    ONBOARDING_EXAMPLE.aiAnswer,
    ONBOARDING_EXAMPLE.correction,
  );
  if (segments.length === 0) return {};
  return {
    [reasonKeyFor(segments, 0)]: {
      tags: [ONBOARDING_EXAMPLE.reasonTag],
      text: ONBOARDING_EXAMPLE.reasonText,
    },
  };
})();

function OnboardingFlow({ onDone }: { onDone: () => void }) {
  const [card, setCard] = useState(0);
  const [practiceText, setPracticeText] = useState<string>(
    PRACTICE_EXAMPLE.aiAnswer,
  );
  const [practiceReasons, setPracticeReasons] = useState<ReasonMap>({});

  const practiceTried =
    nfc(practiceText.trim()) !== nfc(PRACTICE_EXAMPLE.aiAnswer) &&
    practiceText.trim().length > 0;

  const nextButton = (label = "Next") => (
    <button
      onClick={() => setCard((c) => c + 1)}
      className="mt-5 w-full cursor-pointer rounded-md bg-accent px-6 py-3 text-sm font-medium text-accent-contrast hover:bg-accent-hover sm:w-auto"
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-xl">
      {card === 0 && (
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-base font-semibold text-text-primary">
            A new way to fix AI answers
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">
            You will see one AI answer you already judged. Fix it the way you
            would actually say it - like marking a student&apos;s homework. Your
            changes show up as suggestions: what you removed is struck through,
            what you added is highlighted. Nothing is overwritten silently.
          </p>
          {nextButton("Show me an example")}
          <button
            onClick={onDone}
            // min-h-[44px]: text links are still thumb targets on a phone.
            className="mt-3 inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center text-xs text-text-tertiary underline-offset-2 hover:text-text-secondary hover:underline sm:w-auto sm:justify-start"
          >
            I&apos;ve done this before - skip the intro
          </button>
        </div>
      )}

      {card === 1 && (
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-base font-semibold text-text-primary">
            A real correction from the team
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            {ONBOARDING_EXAMPLE.promptText}
          </p>
          <div className="mt-3 rounded-md border border-border bg-surface-sunken px-3 py-2">
            <span className="text-xs font-medium text-text-tertiary">
              The AI wrote:
            </span>{" "}
            <span className="font-mono text-sm text-text-primary">
              {ONBOARDING_EXAMPLE.aiAnswer}
            </span>
          </div>
          <div className="mt-3">
            <SuggestingEditor
              original={ONBOARDING_EXAMPLE.aiAnswer}
              value={ONBOARDING_EXAMPLE.correction}
              onValueChange={() => {}}
              reasons={EXAMPLE_REASONS}
              onReasonsChange={() => {}}
              readOnly
            />
          </div>
          <p className="mt-3 text-xs text-text-muted">
            {ONBOARDING_EXAMPLE.credit}
          </p>
          {nextButton()}
        </div>
      )}

      {card === 2 && (
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-base font-semibold text-text-primary">
            Every change has two parts
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">
            The correct Igala (you just type it), and the reason why (tap a chip
            or write a few words - English or Igala both fine). The reason is
            highly encouraged, not required - it is the part that teaches the AI
            the rule and not just the fix.
          </p>
          {nextButton("Try it yourself")}
        </div>
      )}

      {card === 3 && (
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-base font-semibold text-text-primary">
            Practice round{" "}
            <span className="text-xs font-normal text-text-muted">
              (not saved anywhere)
            </span>
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            {PRACTICE_EXAMPLE.promptText}
          </p>
          <p className="mt-2 text-xs text-text-muted">
            Try fixing one word - watch it become a suggestion.
          </p>
          <SuggestingEditor
            original={PRACTICE_EXAMPLE.aiAnswer}
            value={practiceText}
            onValueChange={setPracticeText}
            reasons={practiceReasons}
            onReasonsChange={setPracticeReasons}
          />
          {!practiceTried && (
            <p className="mt-2 text-xs text-text-muted">
              Change anything above to see suggesting mode light up.
            </p>
          )}
          <button
            onClick={onDone}
            className="mt-5 w-full cursor-pointer rounded-md bg-accent px-6 py-3 text-sm font-medium text-accent-contrast hover:bg-accent-hover sm:w-auto"
          >
            Start correcting
          </button>
        </div>
      )}
    </div>
  );
}

// ─── The lane itself ─────────────────────────────────────────────────────────

export function CorrectionsInterface() {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [task, setTask] = useState<CorrectionTask | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [skipping, setSkipping] = useState(false);

  const [value, setValue] = useState("");
  const [reasons, setReasons] = useState<ReasonMap>({});
  const [consentBenchmark, setConsentBenchmark] = useState(true);
  const [consentTraining, setConsentTraining] = useState(true);

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
    try {
      setOnboarded(!!localStorage.getItem(CORRECTIONS_ONBOARDED_KEY));
    } catch {
      setOnboarded(true); // storage unavailable: skip straight to the queue
    }
  }, []);

  const fetchNext = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/edits/next");
      const data = (await safeJson(res)) as {
        error?: string;
        complete?: boolean;
        progress?: { waiting: number };
        task?: CorrectionTask;
      };
      if (!res.ok)
        throw new Error(data.error || "Failed to load the next correction.");
      setWaiting(data.progress?.waiting ?? 0);
      if (data.complete || !data.task) {
        setIsComplete(true);
        setTask(null);
      } else {
        setIsComplete(false);
        setTask(data.task);
        setConsentBenchmark(true);
        setConsentTraining(true);
        const draft = loadCorrectionDraft(data.task.output.id);
        setValue(draft?.text ?? data.task.output.text);
        setReasons(draft?.reasons ?? {});
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (onboarded) fetchNext();
  }, [onboarded, fetchNext]);

  // Draft autosave, keyed per output (wt-edit-<modelOutputId>).
  useEffect(() => {
    if (!task) return;
    try {
      sessionStorage.setItem(
        draftKey(task.output.id),
        JSON.stringify({ text: value, reasons } satisfies CorrectionDraft),
      );
    } catch {
      // storage full/unavailable - non-fatal
    }
  }, [task, value, reasons]);

  const clearDraft = useCallback(() => {
    if (!task) return;
    try {
      sessionStorage.removeItem(draftKey(task.output.id));
    } catch {
      // ignore
    }
  }, [task]);

  const changed =
    !!task &&
    value.trim().length > 0 &&
    nfc(value.trim()) !== nfc(task.output.text).trim();

  // Segments-with-reasons exactly as they will be submitted, for the save
  // label ("the nudge, not the gate" - never disabled by missing reasons).
  const submitSegments = useMemo(() => {
    if (!task || !changed) return [];
    return attachReasons(
      diffToSegments(task.output.text, value.trim()),
      reasons,
    );
  }, [task, changed, value, reasons]);
  const coverage = reasonCoverage(submitSegments);
  const saveLabel = changed ? editSaveLabel(submitSegments) : "Save";
  const saveWithoutReasons = changed && coverage.given === 0;

  async function handleSave() {
    if (!task || !changed || submitting || skipping) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/edits/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelOutputId: task.output.id,
          correctedText: value.trim(),
          segments: submitSegments,
          consentBenchmark,
          consentTraining,
        }),
      });
      const data = await safeJson(res);
      if (res.status === 409) {
        // Raced with yourself in another tab - the queue has moved on.
        showToast(
          data.error || "You have already corrected this one.",
          "error",
        );
        clearDraft();
        await fetchNext();
        return;
      }
      if (!res.ok) throw new Error(data.error || "Could not save.");
      showToast(
        coverage.given > 0
          ? "Correction saved - your reasons teach the AI the rule."
          : "Correction saved.",
        "success",
      );
      clearDraft();
      await fetchNext();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSkip() {
    if (!task || submitting || skipping) return;
    setSkipping(true);
    try {
      const res = await fetch("/api/edits/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptId: task.prompt.promptId }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "Could not skip.");
      showToast("Skipped - loading the next one.", "success");
      clearDraft();
      await fetchNext();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not skip.", "error");
    } finally {
      setSkipping(false);
    }
  }

  if (onboarded === null) return null;

  if (!onboarded) {
    return (
      <OnboardingFlow
        onDone={() => {
          try {
            localStorage.setItem(CORRECTIONS_ONBOARDED_KEY, "1");
          } catch {
            // non-fatal
          }
          setOnboarded(true);
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-text-tertiary">
          Loading your next correction…
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
          className="mt-4 inline-flex min-h-[44px] cursor-pointer items-center rounded-md bg-accent px-4 py-2 text-sm text-accent-contrast hover:bg-accent-hover"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isComplete || !task) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="rounded-lg border border-success/30 bg-success-subtle p-8 text-center">
          <h2 className="text-lg text-success">All caught up</h2>
          <p className="mt-2 text-sm text-text-secondary">
            No corrections waiting right now. Every answer you judge in Annotate
            can send new ones here.
          </p>
          <a
            href="/annotator/annotate"
            className="mt-4 inline-flex min-h-[44px] items-center rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-contrast hover:bg-accent-hover"
          >
            Go to Annotate &rarr;
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-2xl">
      {toast && (
        <div
          className={`fixed right-6 top-6 z-50 rounded-md px-4 py-3 text-sm font-medium text-white shadow-lg ${
            toast.type === "success" ? "bg-success" : "bg-danger"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="mb-4 text-sm text-text-secondary">
        {waiting} waiting for your corrections
      </div>

      {/* Prompt card */}
      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {task.prompt.bucket && (
            <span className="inline-block rounded-full bg-accent-subtle px-3 py-1 text-xs font-medium text-accent-text">
              {bucketLabel(task.prompt.bucket)}
            </span>
          )}
          <span className="font-mono text-xs text-text-muted">
            {task.prompt.promptId}
          </span>
        </div>
        <p className="mt-3 text-sm text-text-primary">{task.prompt.text}</p>
      </div>

      {/* The AI answer being corrected (no model name - the lane stays blind) */}
      <div className="mt-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="text-xs font-medium text-text-tertiary">
          The AI answer
        </div>
        <div className="mt-2 whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-text-primary">
          {task.output.text}
        </div>

        {/* Context strip: the annotator's own verdict, replayed. */}
        <div className="mt-3 rounded-md border border-border bg-surface-sunken px-3 py-2">
          <p className="text-xs font-semibold text-text-secondary">
            {ROLE_LABEL[task.verdict.role]}
          </p>
          {task.verdict.explanation.trim() && (
            <p className="mt-1 text-xs text-text-secondary">
              &ldquo;{task.verdict.explanation}&rdquo;
            </p>
          )}
          {task.verdict.failureTags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {task.verdict.failureTags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-border-strong bg-surface px-2 py-0.5 text-[11px] text-text-secondary"
                >
                  {failureTagLabel(t)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* The editing ground */}
      <div className="mt-4 rounded-lg border border-border bg-surface p-5 shadow-sm">
        <label className="text-sm font-medium text-text-secondary">
          Fix it the way you would actually say it
        </label>
        <SuggestingEditor
          original={task.output.text}
          value={value}
          onValueChange={setValue}
          reasons={reasons}
          onReasonsChange={setReasons}
        />

        {/* Consent - same copy as the episode, once text differs */}
        {changed && (
          <div className="mt-5 rounded-lg border border-border bg-surface-sunken p-4">
            <div className="text-sm font-medium text-text-secondary">
              How may we use what you wrote?
            </div>
            {/* min-h-[44px] rows + size-5 boxes: consent is tapped on phones */}
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

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            onClick={handleSave}
            disabled={!changed || submitting || skipping}
            className={`cursor-pointer rounded-md px-6 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
              saveWithoutReasons
                ? "border border-border-strong bg-surface text-text-secondary hover:bg-surface-sunken"
                : "bg-accent text-accent-contrast hover:bg-accent-hover"
            }`}
          >
            {submitting ? "Saving…" : saveLabel}
          </button>
          <button
            onClick={handleSkip}
            disabled={submitting || skipping}
            // min-h-[44px]: the skip link is a full-size thumb target too.
            className="inline-flex min-h-[44px] cursor-pointer items-center text-sm text-text-tertiary underline-offset-2 hover:text-text-secondary hover:underline disabled:opacity-40"
          >
            {skipping ? "Skipping…" : "Skip - nothing to fix here"}
          </button>
        </div>
        {saveWithoutReasons && (
          <p className="mt-2 text-xs text-text-muted">
            Reasons teach the AI the rule, not just the fix - even two words
            help, English or Igala.
          </p>
        )}
      </div>
    </div>
  );
}
