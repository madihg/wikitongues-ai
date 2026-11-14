"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_TARGET_HOURS,
  STUDIO_CHECKLIST,
  STUDIO_SAMPLE_RATE,
  parseScript,
  type ScriptLine,
  type StudioSummary,
} from "@/lib/speech/studio";
import { ConsentGate } from "./consent-gate";
import { RecordClip } from "./record-clip";
import { useLabConsent } from "./use-lab-consent";

/**
 * The studio session page (PRD US-026, US-008, US-009): a checklist, a script
 * line reader that steps through a file the researcher picks or pastes (the
 * script is Igala text, so it lives in this page's memory only and is never
 * stored or sent anywhere but as the transcript of the clip just recorded),
 * one RecordClip per line in studio mode, a session summary, and the TTS
 * training launch and Synthesize action. Studio takes are 48 kHz mono where
 * the browser allows, saved community_only; ASR work records at 16 kHz.
 */

const BUTTON =
  "min-h-[44px] cursor-pointer rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-sunken focus-visible:outline-none focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY =
  "min-h-[44px] cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-hover focus-visible:outline-none focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50";
const CARD = "rounded-lg border border-border bg-surface p-4 sm:p-6";
const SESSION_KEY = "wt.studio.session";

// The current sitting lives in localStorage so a reload resumes it. A tiny
// external store keeps the server render (null) and the client in step.
const sessionListeners = new Set<() => void>();
const subscribeSession = (cb: () => void) => {
  sessionListeners.add(cb);
  return () => {
    sessionListeners.delete(cb);
  };
};
function readSession(): string {
  const stored = window.localStorage.getItem(SESSION_KEY);
  if (stored && /^[A-Za-z0-9_-]{8,64}$/.test(stored)) return stored;
  const id = newSessionId();
  window.localStorage.setItem(SESSION_KEY, id);
  return id;
}
function writeSession(id: string) {
  window.localStorage.setItem(SESSION_KEY, id);
  sessionListeners.forEach((l) => l());
}

function newSessionId(): string {
  const day = new Date().toISOString().slice(0, 10);
  const rand = Math.random().toString(36).slice(2, 8);
  return `studio-${day}-${rand}`;
}

const fmt = (minutes: number) => `${minutes.toFixed(1)} min`;

export function ChecklistCard({
  checked,
  onToggle,
}: {
  checked: Record<string, boolean>;
  onToggle: (key: string) => void;
}) {
  return (
    <fieldset className={CARD}>
      <legend className="px-1 text-sm font-semibold text-text-primary">
        Before you start
      </legend>
      <div className="mt-2 space-y-2">
        {STUDIO_CHECKLIST.map((item) => (
          <label
            key={item.key}
            className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-sm text-text-primary"
          >
            <input
              type="checkbox"
              checked={!!checked[item.key]}
              onChange={() => onToggle(item.key)}
              className="h-5 w-5 accent-[var(--accent)]"
            />
            {item.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SummaryCard({
  summary,
  hours,
}: {
  summary: StudioSummary | null;
  hours: number;
}) {
  const pctValue = summary ? Math.round(summary.percentOfTarget * 10) / 10 : 0;
  return (
    <section aria-label="Session summary" data-testid="studio-summary" className={CARD}>
      <h2 className="text-sm font-semibold text-text-primary">Session summary</h2>
      {summary ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-text-tertiary">Recorded this session</dt>
          <dd className="font-mono text-text-primary">
            {fmt(summary.session.recordedMinutes)} ({summary.session.clips} clips)
          </dd>
          <dt className="text-text-tertiary">Kept after the take check</dt>
          <dd className="font-mono text-text-primary">
            {fmt(summary.session.keptMinutes)} ({summary.session.keptClips} clips)
          </dd>
          <dt className="text-text-tertiary">Running total kept</dt>
          <dd className="font-mono text-text-primary">
            {fmt(summary.total.keptMinutes)} of {hours} h
          </dd>
        </dl>
      ) : (
        <p className="mt-2 text-sm text-text-tertiary">Loading the summary...</p>
      )}
      <div
        role="progressbar"
        aria-label="Kept minutes toward the target"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pctValue}
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
      >
        <div className="h-full bg-accent" style={{ width: `${pctValue}%` }} />
      </div>
    </section>
  );
}

interface Voices {
  jobs: Array<{ id: string; status: string; createdAt: string }>;
  candidates: Array<{ id: string; modelRef: string; createdAt: string }>;
}

export function StudioInterface() {
  const { consent, busy: consentBusy, error: consentError, accept, needAgain } =
    useLabConsent();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const sessionId = useSyncExternalStore(subscribeSession, readSession, () => null);
  const [hours, setHours] = useState(DEFAULT_TARGET_HOURS);
  const [script, setScript] = useState<{ lines: ScriptLine[]; unreadable: number } | null>(null);
  const [pasted, setPasted] = useState("");
  const [index, setIndex] = useState(0);
  const [saved, setSaved] = useState(false);
  const [summary, setSummary] = useState<StudioSummary | null>(null);
  const [voices, setVoices] = useState<Voices | null>(null);
  const [launch, setLaunch] = useState<{ phase: "idle" | "confirm" | "busy"; message: string | null }>({
    phase: "idle",
    message: null,
  });
  const [synth, setSynth] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Bumped after a save to re-read the summary.
  const [summaryTick, setSummaryTick] = useState(0);
  const [voicesTick, setVoicesTick] = useState(0);

  useEffect(() => {
    if (!sessionId) return;
    let live = true;
    void (async () => {
      const res = await fetch(
        `/api/lab/speech/studio?session=${encodeURIComponent(sessionId)}&hours=${hours}`,
      );
      if (live && res.ok) setSummary((await res.json()) as StudioSummary);
    })();
    return () => {
      live = false;
    };
  }, [sessionId, hours, summaryTick]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const res = await fetch("/api/speech/jobs/tts");
      if (live && res.ok) setVoices((await res.json()) as Voices);
    })();
    return () => {
      live = false;
    };
  }, [voicesTick]);

  const startNewSession = () => {
    writeSession(newSessionId());
    setSummary(null);
  };

  const loadScript = (text: string) => {
    setScript(parseScript(text));
    setIndex(0);
    setSaved(false);
  };

  const consentOk = consent.status === "granted";
  const allChecked = STUDIO_CHECKLIST.every((c) => checked[c.key]);
  const offReason = !consentOk
    ? consent.status === "error"
      ? null
      : "Read and accept the consent above to turn recording on."
    : !allChecked
      ? "Tick every item on the checklist to turn recording on."
      : null;

  const line = script && script.lines[index] ? script.lines[index] : null;

  const train = async () => {
    if (!sessionId) return;
    setLaunch({ phase: "busy", message: null });
    const res = await fetch("/api/speech/jobs/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studioSessionIds: [sessionId] }),
    });
    const j = (await res.json().catch(() => null)) as { error?: string; jobId?: string; clips?: number } | null;
    setLaunch({
      phase: "idle",
      message: res.ok
        ? `Training job ${j?.jobId} started on ${j?.clips} kept clips.`
        : (j?.error ?? "Could not start the job."),
    });
    setVoicesTick((n) => n + 1);
  };

  const synthesize = async (candidateId: string) => {
    setSynth("Starting...");
    const res = await fetch("/api/speech/jobs/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId }),
    });
    const j = (await res.json().catch(() => null)) as { error?: string; sentences?: number } | null;
    setSynth(res.ok ? `Synthesizing ${j?.sentences} sentences.` : (j?.error ?? "Could not start."));
  };

  return (
    <div className="space-y-6">
      {consent.status === "needed" && (
        <ConsentGate doc={consent.doc} busy={consentBusy} error={consentError} onAccept={accept} />
      )}
      {consent.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {consent.message}
        </p>
      )}

      <section className={CARD}>
        <h2 className="text-sm font-semibold text-text-primary">Recording format</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Studio takes are mono at {STUDIO_SAMPLE_RATE / 1000} kHz where the browser
          allows it, with echo cancelling, noise suppression and auto gain off. Each
          take shows the rate it was captured at. Clips for ASR work are recorded
          at 16 kHz. Every studio take is saved as community only.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="font-mono text-xs text-text-tertiary">
            Session {sessionId ?? "..."}
          </span>
          <button type="button" onClick={startNewSession} className={BUTTON}>
            Start a new session
          </button>
          <label className="flex min-h-[44px] items-center gap-2 text-text-secondary">
            Target hours
            <input
              type="number"
              min={0.5}
              max={100}
              step={0.5}
              value={hours}
              onChange={(e) => setHours(Math.max(0.5, Number(e.target.value) || DEFAULT_TARGET_HOURS))}
              className="min-h-[44px] w-24 rounded-md border border-border-strong bg-surface px-3 text-text-primary focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
            />
          </label>
        </div>
      </section>

      <ChecklistCard
        checked={checked}
        onToggle={(k) => setChecked((c) => ({ ...c, [k]: !c[k] }))}
      />

      <section className={CARD} aria-label="Script">
        <h2 className="text-sm font-semibold text-text-primary">Script</h2>
        <p className="mt-1 text-xs text-text-tertiary">
          Choose the file build-tts-script wrote, or paste its lines. It stays in
          this page and is never stored.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".jsonl,.json,.txt"
            aria-label="Script file"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) loadScript(await f.text());
            }}
          />
          <button type="button" onClick={() => fileRef.current?.click()} className={BUTTON}>
            Choose script file
          </button>
        </div>
        <label htmlFor="studio-paste" className="mt-3 block text-sm text-text-secondary">
          Or paste the lines
        </label>
        <textarea
          id="studio-paste"
          rows={3}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          className="mt-1 min-h-[44px] w-full rounded-md border border-border-strong bg-surface p-3 font-mono text-sm text-text-primary focus-visible:outline-none focus-visible:shadow-[var(--ring)]"
        />
        <button
          type="button"
          disabled={!pasted.trim()}
          onClick={() => {
            loadScript(pasted);
            setPasted("");
          }}
          className={`mt-2 ${BUTTON}`}
        >
          Use pasted lines
        </button>
        {script && (
          <p className="mt-3 text-sm text-text-secondary" aria-live="polite">
            {script.lines.length} lines loaded
            {script.unreadable > 0 ? `, ${script.unreadable} could not be read` : ""}.
          </p>
        )}
      </section>

      {line && sessionId && (
        <section aria-label="Script line" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs text-text-tertiary">
              Line {index + 1} of {script!.lines.length}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => {
                  setIndex((i) => i - 1);
                  setSaved(false);
                }}
                className={BUTTON}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={index >= script!.lines.length - 1}
                onClick={() => {
                  setIndex((i) => i + 1);
                  setSaved(false);
                }}
                className={BUTTON}
              >
                {saved ? "Next line" : "Skip"}
              </button>
            </div>
          </div>
          <RecordClip
            key={`${sessionId}-${index}`}
            language="igala"
            promptCode={line.promptCode}
            textToRead={line.text}
            textLabel="Read this line."
            textIsIgala
            syllableText={line.text}
            answer={null}
            studio={{ sessionId, text: line.text }}
            consentOk={consentOk}
            offReason={offReason}
            licensedAllowed={false}
            cloningAllowed={false}
            onConsentRequired={needAgain}
            onSaved={() => {
              setSaved(true);
              setSummaryTick((n) => n + 1);
            }}
          />
        </section>
      )}

      <SummaryCard summary={summary} hours={hours} />

      <section className={CARD} aria-label="Voices">
        <h2 className="text-sm font-semibold text-text-primary">Voices</h2>
        <p className="mt-1 text-xs text-text-tertiary">
          Training uses only the clips kept after the take check. It starts a job
          on the speech worker.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-live="polite">
          {launch.phase === "idle" && (
            <button
              type="button"
              disabled={!summary || summary.session.keptClips === 0}
              onClick={() => setLaunch({ phase: "confirm", message: null })}
              className={PRIMARY}
            >
              Train a voice from this session
            </button>
          )}
          {launch.phase === "confirm" && (
            <>
              <span className="text-sm text-text-secondary">
                Start a training job on {summary?.session.keptClips} kept clips?
              </span>
              <button type="button" onClick={() => void train()} className={PRIMARY}>
                Start training
              </button>
              <button
                type="button"
                onClick={() => setLaunch({ phase: "idle", message: null })}
                className={BUTTON}
              >
                Cancel
              </button>
            </>
          )}
          {launch.phase === "busy" && <span className="text-sm text-text-tertiary">Starting...</span>}
        </div>
        {launch.message && <p className="mt-2 text-sm text-text-secondary">{launch.message}</p>}

        {voices && voices.candidates.length > 0 && (
          <ul className="mt-4 space-y-2">
            {voices.candidates.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
              >
                <span className="font-mono text-xs text-text-secondary">{c.modelRef}</span>
                <button type="button" onClick={() => void synthesize(c.id)} className={BUTTON}>
                  Synthesize 50 sentences
                </button>
              </li>
            ))}
          </ul>
        )}
        {voices && voices.candidates.length === 0 && (
          <p className="mt-3 text-sm text-text-tertiary">
            No voice yet. {voices.jobs.length} training job{voices.jobs.length === 1 ? "" : "s"} so far.
          </p>
        )}
        {synth && (
          <p className="mt-2 text-sm text-text-secondary" aria-live="polite">
            {synth}
          </p>
        )}
      </section>
    </div>
  );
}
