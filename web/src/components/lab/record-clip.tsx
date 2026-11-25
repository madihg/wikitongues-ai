"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LANGUAGE_LABEL,
  MAX_BYTES,
  MAX_CLIP_BYTES,
  type SpeechLanguage,
  type Tier,
} from "@/lib/speech/limits";
import { uploadInParts, type PartAnswer } from "@/lib/speech/upload-parts";
import { STUDIO_TIER } from "@/lib/speech/studio";
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
import { studioClipKept } from "@/lib/speech/studio";
import { resolveClipChoice, type ClipChoice } from "@/lib/speech/clip-choice";
import { ClipChoiceChange, ClipChoiceLine } from "./tier-default";
import { LevelMeter, RecordLevelMeter } from "./level-meter";
import { readRoomReading } from "@/lib/speech/record-levels";
import { TakeFeedback } from "./take-feedback";
import { useRecorder, type Take } from "./use-recorder";

/**
 * One clip, start to finish: record, hear it back with feedback, Keep or
 * Re-record or Discard, then Save. What happens to the clip is the speaker's
 * remembered choice (asked once, after consent: tier-default.tsx), shown as
 * one quiet line with a Change link; Save is ready as soon as Keep is tapped.
 * With no remembered choice the three cards show on the clip, nothing
 * pre-selected, as they always did. Either way a clip is never saved without
 * a tier the speaker picked. It is the ONE component behind every recording in the Lab: the
 * Record page uses two of them (Igala, then English) and the episode's "Say
 * it" block uses two more. It owns the take and its upload, and tells its
 * parent only what the parent needs: that a clip was saved, whether it is
 * busy, and the answer id the first save created.
 *
 * Level feedback: a live bar under the Record button (quiet, good, too
 * loud), then the feedback card after Stop. Neither blocks: Keep is always
 * available. The capture settings the browser applied and the sitting's room
 * check are stored with the clip's take metrics.
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
  /** The words to say, shown above the record button. Empty: nothing shows. */
  textToRead: string;
  /**
   * Rendered under the heading, before the label and the words: the English
   * clip's short translation box (english-translation.tsx).
   */
  before?: React.ReactNode;
  /**
   * English clips only: the short English translation the speaker typed and
   * is reading. Sent with the clip, stored as the words it read, and saved on
   * the answer the first time.
   */
  englishTranslation?: string | null;
  /** A take exists (recorded or saving): the words being read must not change. */
  onTakeChange?: (hasTake: boolean) => void;
  /** The microphone is recording right now (the Annotate flow holds its tabs). */
  onRecordingChange?: (recording: boolean) => void;
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
  /**
   * The speaker's remembered clip choice, or null when there is none (then
   * the clip asks with the three cards). Never a platform default.
   */
  rememberedChoice?: ClipChoice | null;
  /**
   * Remember a new choice for every clip from now on ("All my clips from now
   * on"). Resolves true when saved. Absent: the Change panel offers only
   * "Only this clip".
   */
  onRememberChoice?: (choice: ClipChoice) => Promise<boolean>;
  /** Why remembering the choice failed, from the parent's save. */
  rememberError?: string | null;
  /** Another clip of this prompt is uploading: wait, so one answer row is made. */
  blocked?: boolean;
  /**
   * Studio mode (TTS voice sessions). The clip is one script line: it is saved
   * community_only with no tier choice, against the session, with the line as
   * its transcript, and is marked kept when the take check raised no warning.
   * The recorder runs raw (no echo cancelling or noise suppression) and a live
   * level meter shows while it records.
   */
  studio?: { sessionId: string; text: string };
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

/**
 * PUT the audio, with progress: as one request body when it fits (4 MB, as
 * every clip did before 2026-11-24), else in parts (lib/speech/upload-parts.ts).
 */
function putAudio(
  url: string,
  blob: Blob,
  onProgress: (pct: number) => void,
): Promise<void> {
  if (blob.size > MAX_BYTES) {
    return uploadInParts(
      blob,
      (part, offset, total, onLoaded) =>
        putAudioPart(url, part, blob.type, offset, total, onLoaded),
      onProgress,
    );
  }
  return putWhole(url, blob, onProgress);
}

/** Read the error a refusal carries, or a plain one with the status. */
function refusal(xhr: XMLHttpRequest): Error {
  let message = `Upload failed (${xhr.status}).`;
  try {
    const j = JSON.parse(xhr.responseText) as { error?: string };
    if (j.error) message = j.error;
  } catch {
    /* keep the generic message */
  }
  return new Error(message);
}

/** One part of a take sent in parts; the server answers what it holds. */
function putAudioPart(
  url: string,
  part: Blob,
  type: string,
  offset: number,
  total: number,
  onLoaded: (loaded: number) => void,
): Promise<PartAnswer> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const sep = url.includes("?") ? "&" : "?";
    xhr.open("PUT", `${url}${sep}offset=${offset}&total=${total}`);
    xhr.setRequestHeader("Content-Type", baseMime(type));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onLoaded(e.loaded);
    };
    xhr.onload = () => {
      // 409: an earlier attempt already stored the whole clip. Done.
      if (xhr.status === 409) {
        resolve({ received: total, complete: true });
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const j = JSON.parse(xhr.responseText) as Partial<PartAnswer>;
          resolve({
            received: typeof j.received === "number" ? j.received : offset,
            complete: j.complete === true,
          });
        } catch {
          resolve({ received: offset, complete: false });
        }
        return;
      }
      reject(refusal(xhr));
    };
    xhr.onerror = () =>
      reject(new Error("Upload failed. Check your connection."));
    xhr.send(part);
  });
}

/** PUT the whole take as one request body, with progress. */
function putWhole(
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
      reject(refusal(xhr));
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
    before,
    englishTranslation,
    onTakeChange,
    onRecordingChange,
    answer,
    dialect,
    demoSessionId,
    consentOk,
    offReason,
    licensedAllowed,
    cloningAllowed,
    rememberedChoice = null,
    onRememberChoice,
    rememberError = null,
    blocked = false,
    studio,
    onSaved,
    onBusyChange,
    onConsentRequired,
  } = props;

  const recorder = useRecorder({ raw: !!studio });
  const [kept, setKept] = useState(false);
  // The choice made on THIS clip (the cards below, or "Only this clip"). Null
  // until the speaker picks: nothing is chosen for them.
  const [chosenTier, setTier] = useState<Tier | null>(null);
  const [voiceCloning, setVoiceCloning] = useState(false);
  // What the clip is saved with: this clip's own choice if there is one,
  // else the speaker's remembered choice, else nothing (Save stays off).
  const choice = resolveClipChoice(
    chosenTier === null ? null : { tier: chosenTier, voiceCloning },
    rememberedChoice,
  );
  // A studio take has no choice to make: it is community_only.
  const tier: Tier | null = studio ? STUDIO_TIER : (choice?.tier ?? null);
  const cloningOptIn = !studio && choice?.voiceCloning === true && cloningAllowed;
  // The Change panel, open or shut, and whether "All my clips" is saving.
  const [changing, setChanging] = useState(false);
  const [remembering, setRemembering] = useState(false);
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
  // The parent usually passes an inline callback, so it must not be a
  // dependency: with it, every parent render re-ran this effect, the parent
  // stored a fresh object, rendered again, and the page looped ("Maximum
  // update depth exceeded", found on the first browser run, 2026-10-27).
  const onBusyChangeRef = useRef(onBusyChange);
  useEffect(() => {
    onBusyChangeRef.current = onBusyChange;
  });
  useEffect(() => {
    onBusyChangeRef.current?.(uploading);
  }, [uploading]);

  // Analyse each new take as soon as the recorder hands it over.
  const take = recorder.state === "recorded" ? recorder.take : null;
  // Tell the parent while words are being read or a take is held, through a
  // ref for the same reason as onBusyChange above.
  const onTakeChangeRef = useRef(onTakeChange);
  useEffect(() => {
    onTakeChangeRef.current = onTakeChange;
  });
  const holdsTake = recorder.state !== "idle";
  useEffect(() => {
    onTakeChangeRef.current?.(holdsTake);
  }, [holdsTake]);
  const onRecordingChangeRef = useRef(onRecordingChange);
  useEffect(() => {
    onRecordingChangeRef.current = onRecordingChange;
  });
  const recordingNow = recorder.state === "recording";
  useEffect(() => {
    onRecordingChangeRef.current?.(recordingNow);
  }, [recordingNow]);
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
    setChanging(false);
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
    if (take.blob.size > MAX_CLIP_BYTES) {
      setUpload({
        status: "error",
        message: "This clip is over 20 MB. Record it in two shorter takes.",
      });
      return;
    }
    setUpload({ status: "uploading", pct: 0 });
    const room = readRoomReading();
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
            voiceCloningOptIn: cloningOptIn,
            ...(metrics
              ? {
                  quality: {
                    ...metrics,
                    retakes: retakesRef.current,
                    // How the microphone was opened and what the browser
                    // applied, and the room check of this sitting if one ran.
                    capture: take.capture,
                    ...(room ? { room } : {}),
                  },
                }
              : {}),
            ...(studio
              ? {
                  studioSessionId: studio.sessionId,
                  studioText: studio.text,
                  studioKeep: studioClipKept(metrics),
                }
              : {}),
            ...(answer?.coldAuthorAnswerId
              ? { coldAuthorAnswerId: answer.coldAuthorAnswerId }
              : answer?.answerText
                ? { answerText: answer.answerText }
                : {}),
            ...(language === "english" && englishTranslation
              ? { englishTranslation }
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
      {before && <div className="mt-3">{before}</div>}
      <p className="mt-2 text-xs text-text-tertiary">{textLabel}</p>
      {textToRead && (
        <p
          data-testid="text-to-read"
          className={`${textIsIgala ? "igala " : ""}mt-1 text-base text-text-primary`}
        >
          {textToRead}
        </p>
      )}

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
        {studio && recording && (
          <div className="mt-3">
            <LevelMeter stream={recorder.stream} />
          </div>
        )}
        {/* The level bar, under the Record button: live while recording, and
            the loudest point stays marked until the next take. */}
        {!studio && upload.status !== "saved" && upload.status !== "uploading" && (
          <div className="mt-3">
            <RecordLevelMeter stream={recorder.stream} />
          </div>
        )}

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
          {take.stoppedAtLimit && (
            <p
              role="status"
              data-testid="stopped-at-limit"
              className="rounded-md border border-warning bg-warning-subtle px-3 py-2 text-sm text-text-primary"
            >
              The recording stopped at 5 minutes, the longest one take can
              be. If you had not finished, record it again a little faster.
            </p>
          )}
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
              {studio ? (
                <p className="text-sm text-text-secondary">
                  Saved as community only until the speaker&apos;s contract and
                  consent say otherwise.
                  {take.sampleRate ? ` Captured at ${take.sampleRate / 1000} kHz.` : ""}
                </p>
              ) : rememberedChoice === null ? (
                <>
                  <TierChoice
                    name={`tier-${language}`}
                    value={chosenTier}
                    onChange={setTier}
                    licensedAllowed={licensedAllowed}
                  />
                  <VoiceCloningOptIn
                    checked={voiceCloning}
                    allowed={cloningAllowed}
                    onChange={setVoiceCloning}
                  />
                </>
              ) : changing ? (
                <ClipChoiceChange
                  name={`tier-${language}`}
                  current={choice}
                  licensedAllowed={licensedAllowed}
                  cloningAllowed={cloningAllowed}
                  busy={remembering}
                  error={rememberError}
                  onOnlyThis={(c) => {
                    setTier(c.tier);
                    setVoiceCloning(c.voiceCloning);
                    setChanging(false);
                  }}
                  onAll={
                    onRememberChoice
                      ? (c) => {
                          setRemembering(true);
                          void onRememberChoice(c).then((ok) => {
                            setRemembering(false);
                            if (!ok) return;
                            // The remembered choice now covers this clip too.
                            setTier(null);
                            setVoiceCloning(false);
                            setChanging(false);
                          });
                        }
                      : undefined
                  }
                  onCancel={() => setChanging(false)}
                />
              ) : (
                choice && (
                  <ClipChoiceLine
                    choice={{ ...choice, voiceCloning: cloningOptIn }}
                    onChange={() => setChanging(true)}
                  />
                )
              )}
              <div className="flex flex-wrap items-center gap-2">
                <SaveBar
                  tier={changing ? null : tier}
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
