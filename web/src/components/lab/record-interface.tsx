"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_BYTES, type Tier } from "@/lib/speech/limits";
import { sha256Hex } from "@/lib/speech/recorder";
import {
  ConsentGate,
  type ConsentDoc,
  type ConsentFlags,
} from "./consent-gate";
import {
  AnswerBox,
  Countdown,
  RecordButton,
  SaveBar,
  TierChoice,
  Timer,
  UploadProgress,
  VoiceCloningOptIn,
} from "./record-parts";
import { useRecorder } from "./use-recorder";

/**
 * The Record page. One column, mobile first:
 *   1. the prompt, then the researcher's own answer (or a box to write and
 *      lock one first);
 *   2. one primary control, the 56px record button, with the elapsed time and
 *      a countdown for the last five seconds of the 30;
 *   3. after stop: the take plays back inline; Keep, Re-record or Discard;
 *   4. after Keep: the tier choice (three cards, NOTHING pre-selected) and an
 *      unchecked voice cloning box. Save stays disabled until a tier is
 *      chosen. Save uploads (a progress bar replaces the buttons). The row is
 *      created with the chosen tier, so the clip is never stored without one.
 * Recording is disabled until the consent for the current text version is on
 * record. A failed save keeps the take and the locked answer and offers
 * Try again; it never creates a second row for the same take.
 */

interface QueueTask {
  prompt: { id: string; promptId: string; text: string; bucket: string };
  ownAnswer: { id: string; text: string; dialect: string | null } | null;
  source: "own_answer" | "no_answer";
}

type ConsentState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "needed";
      doc: ConsentDoc;
    }
  | {
      status: "granted";
      doc: ConsentDoc;
      grant: { commercialLicensing: boolean; voiceCloning: boolean };
    };

type QueueState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "complete" }
  | { status: "task"; task: QueueTask };

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; pct: number }
  | { status: "saved" }
  | { status: "error"; message: string };

interface Saved {
  id: string;
  uploadUrl: string;
  coldAuthorAnswerId: string | null;
}

/** PUT the clip to the signed URL as multipart (the form Storage expects). */
function putWithProgress(
  url: string,
  blob: Blob,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", blob);
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status}).`));
    xhr.onerror = () =>
      reject(new Error("Upload failed. Check your connection."));
    xhr.send(form);
  });
}

async function api(
  url: string,
  init?: { method: string; body: unknown },
): Promise<{
  ok: boolean;
  status: number;
  json: Record<string, unknown> | null;
}> {
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: init ? { "Content-Type": "application/json" } : undefined,
    body: init ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

export function RecordInterface() {
  const recorder = useRecorder();
  const [consent, setConsent] = useState<ConsentState>({ status: "loading" });
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  const [queue, setQueue] = useState<QueueState>({ status: "loading" });
  const [recorded, setRecorded] = useState(0);
  const excludeRef = useRef<string[]>([]);
  const demoRef = useRef<string | null>(null);

  const [draft, setDraft] = useState("");
  const [lockedText, setLockedText] = useState<string | null>(null);

  const [kept, setKept] = useState(false);
  // No default: nothing is pre-selected.
  const [tier, setTier] = useState<Tier | null>(null);
  const [voiceCloning, setVoiceCloning] = useState(false);
  const [upload, setUpload] = useState<UploadState>({ status: "idle" });
  const savedRef = useRef<Saved | null>(null);

  const loadNext = useCallback(async () => {
    setQueue({ status: "loading" });
    const qs = new URLSearchParams();
    if (demoRef.current) qs.set("demo", demoRef.current);
    if (excludeRef.current.length)
      qs.set("exclude", excludeRef.current.join(","));
    try {
      const r = await api(`/api/lab/speech/next?${qs.toString()}`);
      if (!r.ok)
        throw new Error(
          (r.json?.error as string) ?? "Could not load a prompt.",
        );
      const j = r.json as {
        complete: boolean;
        progress?: { recorded: number };
        task?: QueueTask;
      };
      setRecorded(j.progress?.recorded ?? 0);
      setQueue(
        j.complete || !j.task
          ? { status: "complete" }
          : { status: "task", task: j.task },
      );
    } catch (e) {
      setQueue({
        status: "error",
        message: e instanceof Error ? e.message : "Could not load a prompt.",
      });
    }
  }, []);

  useEffect(() => {
    demoRef.current = new URLSearchParams(window.location.search).get("demo");
    void (async () => {
      try {
        const r = await api("/api/lab/consent");
        if (!r.ok)
          throw new Error(
            (r.json?.error as string) ?? "Could not load consent.",
          );
        const j = r.json as unknown as ConsentDoc & {
          needsConsent: boolean;
          grant: { commercialLicensing: boolean; voiceCloning: boolean } | null;
        };
        setConsent(
          j.needsConsent || !j.grant
            ? { status: "needed", doc: j }
            : { status: "granted", doc: j, grant: j.grant },
        );
      } catch (e) {
        setConsent({
          status: "error",
          message: e instanceof Error ? e.message : "Could not load consent.",
        });
      }
    })();
    void loadNext();
  }, [loadNext]);

  const acceptConsent = async (flags: ConsentFlags) => {
    if (consent.status !== "needed") return;
    setConsentBusy(true);
    setConsentError(null);
    const r = await api("/api/lab/consent", {
      method: "POST",
      body: { accepted: true, version: consent.doc.currentVersion, ...flags },
    }).catch(() => null);
    setConsentBusy(false);
    if (!r || !r.ok) {
      setConsentError(
        (r?.json?.error as string) ?? "Could not save your consent. Try again.",
      );
      return;
    }
    setConsent({
      status: "granted",
      doc: consent.doc,
      grant: {
        commercialLicensing: flags.commercialLicensing,
        voiceCloning: flags.voiceCloning,
      },
    });
  };

  const task = queue.status === "task" ? queue.task : null;
  const answerText = task?.ownAnswer?.text ?? lockedText;
  const answerReady = answerText !== null;
  const consentOk = consent.status === "granted";
  const canRecord =
    consentOk &&
    answerReady &&
    recorder.supported &&
    upload.status !== "uploading" &&
    upload.status !== "saved";

  const resetTake = () => {
    recorder.reset();
    setKept(false);
    setTier(null);
    setVoiceCloning(false);
    setUpload({ status: "idle" });
    savedRef.current = null;
  };

  const nextPrompt = () => {
    resetTake();
    setDraft("");
    setLockedText(null);
    void loadNext();
  };

  const skip = () => {
    if (task) excludeRef.current.push(task.prompt.promptId);
    nextPrompt();
  };

  const save = async () => {
    const take = recorder.take;
    if (!take || !task || tier === null) return;
    if (take.blob.size > MAX_BYTES) {
      setUpload({
        status: "error",
        message: "This clip is over 5 MB. Record a shorter one.",
      });
      return;
    }
    setUpload({ status: "uploading", pct: 0 });
    try {
      let saved = savedRef.current;
      if (!saved) {
        const r = await api("/api/lab/speech/recording", {
          method: "POST",
          body: {
            promptId: task.prompt.promptId,
            tier,
            mimeType: take.mime,
            durationMs: take.durationMs,
            sampleRate: take.sampleRate,
            sizeBytes: take.blob.size,
            voiceCloningOptIn: voiceCloning,
            ...(task.ownAnswer
              ? { coldAuthorAnswerId: task.ownAnswer.id }
              : { answerText: lockedText }),
            ...(demoRef.current ? { demoSessionId: demoRef.current } : {}),
          },
        });
        if (!r.ok) {
          if (r.status === 428) {
            setConsent((c) =>
              c.status === "granted" ? { status: "needed", doc: c.doc } : c,
            );
          }
          throw new Error(
            (r.json?.error as string) ?? "Could not save the clip.",
          );
        }
        const j = r.json as {
          id: string;
          coldAuthorAnswerId: string | null;
          upload: { uploadUrl: string };
        };
        saved = {
          id: j.id,
          uploadUrl: j.upload.uploadUrl,
          coldAuthorAnswerId: j.coldAuthorAnswerId,
        };
        savedRef.current = saved;
      }
      await putWithProgress(saved.uploadUrl, take.blob, (pct) =>
        setUpload({ status: "uploading", pct }),
      );
      const checksum = await sha256Hex(take.blob);
      const c = await api(`/api/lab/speech/recording/${saved.id}`, {
        method: "PATCH",
        body: { sizeBytes: take.blob.size, checksumSha256: checksum },
      });
      // 409 means an earlier attempt already confirmed it: that is success.
      if (!c.ok && c.status !== 409) {
        throw new Error(
          (c.json?.error as string) ?? "Could not confirm the upload.",
        );
      }
      setUpload({ status: "saved" });
    } catch (e) {
      setUpload({
        status: "error",
        message: e instanceof Error ? e.message : "Could not save the clip.",
      });
    }
  };

  const recording = recorder.state === "recording";
  const hasTake = recorder.state === "recorded" && recorder.take;
  const licensedAllowed =
    consent.status === "granted" ? consent.grant.commercialLicensing : false;
  const cloningAllowed =
    consent.status === "granted" ? consent.grant.voiceCloning : false;

  return (
    <div className="space-y-6">
      {demoRef.current && (
        <p className="rounded-md border border-warning bg-warning-subtle px-3 py-2 text-sm text-text-primary">
          Demo session: clips recorded here are not counted.
        </p>
      )}

      {consent.status === "needed" && (
        <ConsentGate
          doc={consent.doc}
          busy={consentBusy}
          error={consentError}
          onAccept={acceptConsent}
        />
      )}
      {consent.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {consent.message}
        </p>
      )}

      {queue.status === "loading" && (
        <p className="text-sm text-text-tertiary">Loading a prompt...</p>
      )}
      {queue.status === "error" && (
        <div>
          <p role="alert" className="text-sm text-danger">
            {queue.message}
          </p>
          <button
            type="button"
            onClick={() => void loadNext()}
            className="mt-2 min-h-[44px] cursor-pointer rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-sunken"
          >
            Try again
          </button>
        </div>
      )}
      {queue.status === "complete" && (
        <p className="rounded-md border border-border bg-surface p-4 text-sm text-text-secondary">
          Nothing left to record right now. You have recorded {recorded}.
        </p>
      )}

      {task && (
        <section
          aria-label="Prompt"
          className="rounded-lg border border-border bg-surface p-4 sm:p-6"
        >
          <p className="font-mono text-xs text-text-tertiary">
            {task.prompt.promptId}
          </p>
          <p className="mt-1 text-base text-text-primary">{task.prompt.text}</p>

          <div className="mt-4 border-t border-border pt-4">
            {task.ownAnswer ? (
              <>
                <p className="text-sm font-semibold text-text-primary">
                  Your answer
                </p>
                <p className="igala mt-1 text-base text-text-primary">
                  {task.ownAnswer.text}
                </p>
              </>
            ) : lockedText !== null ? (
              <>
                <p className="text-sm font-semibold text-text-primary">
                  Your answer (locked)
                </p>
                <p className="igala mt-1 text-base text-text-primary">
                  {lockedText}
                </p>
              </>
            ) : (
              <AnswerBox
                value={draft}
                onChange={setDraft}
                onLock={() => setLockedText(draft.trim())}
              />
            )}
          </div>
        </section>
      )}

      <section
        aria-label="Recorder"
        className="rounded-lg border border-border bg-surface p-4 sm:p-6"
      >
        {upload.status === "uploading" ? (
          <UploadProgress pct={upload.pct} />
        ) : (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <RecordButton
              recording={recording}
              disabled={recording ? false : !canRecord || !!hasTake}
              onClick={() =>
                recording ? recorder.stop() : void recorder.start()
              }
            />
            <Timer elapsedMs={recorder.elapsedMs} recording={recording} />
            <Countdown elapsedMs={recorder.elapsedMs} />
          </div>
        )}

        {!consentOk && consent.status !== "error" && (
          <p className="mt-3 text-xs text-text-tertiary">
            Read and accept the consent above to turn recording on.
          </p>
        )}
        {consentOk && task && !answerReady && (
          <p className="mt-3 text-xs text-text-tertiary">
            Lock your answer to turn recording on.
          </p>
        )}
        {consentOk && !recorder.supported && (
          <p className="mt-3 text-xs text-text-tertiary">
            This browser cannot record audio. Try a current Chrome, Firefox or
            Safari.
          </p>
        )}
        {recorder.error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {recorder.error}
          </p>
        )}

        {hasTake &&
          upload.status !== "saved" &&
          upload.status !== "uploading" && (
            <div className="mt-4 space-y-4 border-t border-border pt-4">
              <audio
                controls
                src={recorder.take!.url}
                className="w-full"
                aria-label="Your recording"
              />
              {!kept && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setKept(true)}
                    className="min-h-[44px] cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-hover"
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetTake();
                      if (canRecord) void recorder.start();
                    }}
                    className="min-h-[44px] cursor-pointer rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-sunken"
                  >
                    Re-record
                  </button>
                  <button
                    type="button"
                    onClick={resetTake}
                    className="min-h-[44px] cursor-pointer rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-sunken"
                  >
                    Discard
                  </button>
                </div>
              )}

              {kept && (
                <div className="space-y-3">
                  <TierChoice
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
                      busy={false}
                      onSave={() => void save()}
                    />
                    <button
                      type="button"
                      onClick={() => setKept(false)}
                      className="min-h-[44px] cursor-pointer rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-sunken"
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
                className="mt-2 min-h-[44px] cursor-pointer rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-sunken"
              >
                Try again
              </button>
            </div>
          )}
          {upload.status === "saved" && (
            <div>
              <p className="text-sm font-medium text-success">
                Saved. Thank you.
              </p>
              <button
                type="button"
                onClick={nextPrompt}
                className="mt-2 min-h-[44px] cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-hover"
              >
                Next prompt
              </button>
            </div>
          )}
        </div>
      </section>

      {task &&
        !recording &&
        upload.status !== "uploading" &&
        upload.status !== "saved" && (
          <button
            type="button"
            onClick={skip}
            className="inline-flex min-h-[44px] cursor-pointer items-center text-sm text-text-tertiary underline-offset-2 hover:text-text-secondary hover:underline"
          >
            Skip this prompt
          </button>
        )}
    </div>
  );
}
