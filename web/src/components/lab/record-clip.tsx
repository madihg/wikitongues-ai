"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LANGUAGE_LABEL,
  MAX_BYTES,
  type SpeechLanguage,
  type Tier,
} from "@/lib/speech/limits";
import { analyseBlob } from "@/lib/speech/analyse-client";
import type { QualityMetrics } from "@/lib/speech/analyse";
import { SaveError, saveClip, type SavedRow } from "@/lib/speech/save-clip";
import { baseMime } from "@/lib/speech/storage";
import {
  Countdown,
  RecordButton,
  SaveBar,
  TierChoice,
  Timer,
  UploadProgress,
  VoiceCloningOptIn,
} from "./record-parts";
import { TakeFeedback } from "./take-feedback";
import { useRecorder, type Take } from "./use-recorder";

/**
 * One clip, start to finish: record, hear it back with feedback, Keep or
 * Re-record or Discard, choose what happens to it (nothing pre-selected),
 * Save. It is the ONE component behind every recording in the Lab: the
 * Record page uses two of them (Igala, then English) and the episode's "Say
 * it" block uses two more. It owns the take and its upload, and tells its
 * parent only what the parent needs: that a clip was saved, whether it is
 * busy, and the answer id the first save created.
 *
 * Saving is two steps. POST /api/lab/speech/recording creates the row (tier,
 * language, metrics) and returns the audio URL; then the bytes go up as the
 * body of PUT to that URL. A failed save keeps the take and offers Try
 * again, and never creates a second row for the same take: the row id is
 * kept, and a second PUT that finds the audio already stored counts as done.
 */

export interface ClipAnswerRef {
  /** An existing locked answer of the researcher's, for this prompt. */
  coldAuthorAnswerId?: string;
  /** A locked answer to create with the clip (the Record page's own-answer box). */
  answerText?: string;
}

export interface RecordClipProps {
  language: SpeechLanguage;
  promptCode: string;
  /** The words to say, shown above the record button. */
  textToRead: string;
  /** Shown above the words (for example "Your answer" or the no-meaning note). */
  textLabel: string;
  /** Igala text renders in the Igala face. */
  textIsIgala: boolean;
  /** What the speaker is meant to say, for the syllable and pace estimate. */
  syllableText: string;
  /** Null for the episode block: the clip is attached to the answer after submit. */
  answer: ClipAnswerRef | null;
  dialect?: string | null;
  demoSessionId?: string | null;
  /** True once consent is on record for the current text version. */
  consentOk: boolean;
  /** Why recording is off when it is (consent, answer not locked), or null. */
  offReason: string | null;
  licensedAllowed: boolean;
  cloningAllowed: boolean;
  /** Another clip of this prompt is uploading: wait, so one answer row is made. */
  blocked?: boolean;
  onSaved: (clip: { id: string; coldAuthorAnswerId: string | null }) => void;
  onBusyChange?: (busy: boolean) => void;
  /** The server said consent is needed again (428). */
  onConsentRequired?: () => void;
}

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; pct: number }
  | { status: "saved" }
  | { status: "error"; message: string };

/** PUT the audio as the request body, with progress. */
function putAudio(
  url: string,
  blob: Blob,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", baseMime(blob.type));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
    };
    xhr.onload = () => {
      // 409: an earlier attempt already stored this clip. That is success.
      if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 409) {
        resolve();
        return;
      }
      let message = `Upload failed (${xhr.status}).`;
      try {
        const j = JSON.parse(xhr.responseText) as { error?: string };
        if (j.error) message = j.error;
      } catch {
        /* keep the generic message */
      }
      reject(new Error(message));
    };
    xhr.onerror = () =>
      reject(new Error("Upload failed. Check your connection."));
    xhr.send(blob);
  });
}

const BUTTON =
  "min-h-[44px] cursor-pointer rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-sunken focus-visible:outline-none focus-visible:shadow-[var(--ring)]";
const PRIMARY =
  "min-h-[44px] cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-hover focus-visible:outline-none focus-visible:shadow-[var(--ring)]";

export function RecordClip(props: RecordClipProps) {
  const {
    language,
    promptCode,
    textToRead,
    textLabel,
    textIsIgala,
    syllableText,
    answer,
    dialect,
    demoSessionId,
    consentOk,
    offReason,
    licensedAllowed,
    cloningAllowed,
    blocked = false,
    onSaved,
    onBusyChange,
    onConsentRequired,
  } = props;

  const recorder = useRecorder();
  const [kept, setKept] = useState(false);
  const [tier, setTier] = useState<Tier | null>(null);
  const [voiceCloning, setVoiceCloning] = useState(false);
  const [upload, setUpload] = useState<UploadState>({ status: "idle" });
  // The analysis of one take, tagged with the take it belongs to so a new
  // take never shows the previous one's numbers.
  const [analysed, setAnalysed] = useState<{
    forTake: Take;
    metrics: QualityMetrics | null;
  } | null>(null);
  const savedRef = useRef<SavedRow | null>(null);
  // Takes thrown away before the one that is saved: the session line's
  // "re-recorded" count, stored in the clip's quality metrics.
  const retakesRef = useRef(0);

  const uploading = upload.status === "uploading";
  useEffect(() => {
    onBusyChange?.(uploading);
  }, [uploading, onBusyChange]);

  // Analyse each new take as soon as the recorder hands it over.
  const take = recorder.state === "recorded" ? recorder.take : null;
  useEffect(() => {
    if (!take) return;
    let live = true;
    void analyseBlob(take.blob, syllableText, language).then((m) => {
      if (live) setAnalysed({ forTake: take, metrics: m });
    });
    return () => {
      live = false;
    };
  }, [take, syllableText, language]);
  const done = analysed !== null && analysed.forTake === take;
  const metrics = done ? analysed.metrics : null;
  const analysis: "analysing" | "done" = take && !done ? "analysing" : "done";

  const dropTake = useCallback(() => {
    recorder.reset();
    setKept(false);
    setTier(null);
    setVoiceCloning(false);
    setUpload({ status: "idle" });
    savedRef.current = null;
  }, [recorder]);

  const canRecord =
    consentOk &&
    offReason === null &&
    recorder.supported &&
    !blocked &&
    upload.status !== "uploading" &&
    upload.status !== "saved";

  const save = async () => {
    if (!take || tier === null) return;
    if (take.blob.size > MAX_BYTES) {
      setUpload({
        status: "error",
        message: "This clip is over 4 MB. Record a shorter one.",
      });
      return;
    }
    setUpload({ status: "uploading", pct: 0 });
    try {
      const saved = await saveClip(
        {
          createRow: async (body) => {
            const res = await fetch("/api/lab/speech/recording", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            return {
              ok: res.ok,
              status: res.status,
              json: await res.json().catch(() => null),
            };
          },
          putAudio,
        },
        {
          body: {
            promptId: promptCode,
            language,
            tier,
            mimeType: take.mime,
            durationMs: take.durationMs,
            sampleRate: take.sampleRate,
            sizeBytes: take.blob.size,
            voiceCloningOptIn: voiceCloning,
            ...(metrics
              ? { quality: { ...metrics, retakes: retakesRef.current } }
              : {}),
            ...(answer?.coldAuthorAnswerId
              ? { coldAuthorAnswerId: answer.coldAuthorAnswerId }
              : answer?.answerText
                ? { answerText: answer.answerText }
                : {}),
            ...(dialect ? { dialect } : {}),
            ...(demoSessionId ? { demoSessionId } : {}),
          },
          blob: take.blob,
          existing: savedRef.current,
          onRow: (row) => {
            savedRef.current = row;
          },
          onProgress: (pct) => setUpload({ status: "uploading", pct }),
        },
      );
      setUpload({ status: "saved" });
      window.dispatchEvent(new Event("lab:clip-saved"));
      onSaved({ id: saved.id, coldAuthorAnswerId: saved.coldAuthorAnswerId });
    } catch (e) {
      if (e instanceof SaveError && e.status === 428) onConsentRequired?.();
      setUpload({
        status: "error",
        message: e instanceof Error ? e.message : "Could not save the clip.",
      });
    }
  };

  const recording = recorder.state === "recording";
  const label = LANGUAGE_LABEL[language];

  return (
    <section
      aria-label={`${label} clip`}
      data-testid={`clip-${language}`}
      className="rounded-lg border border-border bg-surface p-4 sm:p-6"
    >
      <h3 className="text-sm font-semibold text-text-primary">
        Say it in {label}
      </h3>
      <p className="mt-2 text-xs text-text-tertiary">{textLabel}</p>
      <p
        className={`${textIsIgala ? "igala " : ""}mt-1 text-base text-text-primary`}
      >
        {textToRead}
      </p>

      <div className="mt-4">
        {upload.status === "uploading" ? (
          <UploadProgress pct={upload.pct} />
        ) : upload.status !== "saved" ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <RecordButton
              recording={recording}
              disabled={recording ? false : !canRecord || !!take}
              onClick={() =>
                recording ? recorder.stop() : void recorder.start()
              }
            />
            <Timer elapsedMs={recorder.elapsedMs} recording={recording} />
            <Countdown elapsedMs={recorder.elapsedMs} />
          </div>
        ) : null}

        {offReason && upload.status !== "saved" && (
          <p className="mt-3 text-xs text-text-tertiary">{offReason}</p>
        )}
        {consentOk && offReason === null && !recorder.supported && (
          <p className="mt-3 text-xs text-text-tertiary">
            This browser cannot record audio. Try a current Chrome, Firefox or
            Safari.
          </p>
        )}
        {blocked && upload.status !== "saved" && (
          <p className="mt-3 text-xs text-text-tertiary">
            Waiting for the other clip to finish saving.
          </p>
        )}
        {recorder.error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {recorder.error}
          </p>
        )}
      </div>

      {take && upload.status !== "saved" && upload.status !== "uploading" && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <audio
            controls
            src={take.url}
            className="w-full"
            aria-label={`Your ${label} recording`}
          />
          <TakeFeedback metrics={metrics} status={analysis} />

          {!kept && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="keep-button"
                onClick={() => setKept(true)}
                className={PRIMARY}
              >
                Keep
              </button>
              <button
                type="button"
                onClick={() => {
                  retakesRef.current += 1;
                  dropTake();
                  if (canRecord) void recorder.start();
                }}
                className={BUTTON}
              >
                Re-record
              </button>
              <button
                type="button"
                onClick={() => {
                  retakesRef.current += 1;
                  dropTake();
                }}
                className={BUTTON}
              >
                Discard
              </button>
            </div>
          )}

          {kept && (
            <div className="space-y-3">
              <TierChoice
                name={`tier-${language}`}
                value={tier}
                onChange={setTier}
                licensedAllowed={licensedAllowed}
              />
              <VoiceCloningOptIn
                checked={voiceCloning}
                allowed={cloningAllowed}
                onChange={setVoiceCloning}
              />
              <div className="flex flex-wrap items-center gap-2">
                <SaveBar
                  tier={tier}
                  busy={blocked}
                  onSave={() => void save()}
                />
                <button
                  type="button"
                  onClick={() => setKept(false)}
                  className={BUTTON}
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div aria-live="polite" className="mt-3">
        {upload.status === "error" && (
          <div>
            <p role="alert" className="text-sm text-danger">
              {upload.message}
            </p>
            <button
              type="button"
              onClick={() => void save()}
              className={`mt-2 ${BUTTON}`}
            >
              Try again
            </button>
          </div>
        )}
        {upload.status === "saved" && (
          <p className="text-sm font-medium text-success">
            Saved ({label}). Thank you.
          </p>
        )}
      </div>
    </section>
  );
}
