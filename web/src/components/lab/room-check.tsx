"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RECORD_LEVELS,
  ROOM_MESSAGE,
  readRoomReading,
  rmsDbfs,
  roomVerdict,
  writeRoomReading,
  type RoomReading,
} from "@/lib/speech/record-levels";
import { captureConstraints, captureMode } from "@/lib/speech/recorder";

/**
 * The room check: once per sitting, before the first clip. "Stay quiet for 3
 * seconds." It listens and answers with one line: the room is quiet, there
 * is some noise, or the room is noisy (then "Check again" or "Record
 * anyway"). It NEVER blocks: recording works whether or not it has run, and
 * whatever it says. Its reading is kept for the sitting and stored with each
 * clip saved after it. It runs again if the microphone changes.
 *
 * RoomCheckView is the pure view; RoomCheck listens.
 */

export type RoomCheckState =
  | { status: "idle" }
  | { status: "listening" }
  | { status: "done"; reading: RoomReading }
  /** "Record anyway" after a noisy answer: the line stays, the buttons go. */
  | { status: "dismissed"; reading: RoomReading }
  | { status: "unavailable" };

const BUTTON =
  "min-h-[44px] cursor-pointer rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-sunken focus-visible:outline-none focus-visible:shadow-[var(--ring)]";

const TONE = {
  quiet: "border-success bg-success-subtle",
  some_noise: "border-info bg-info-subtle",
  noisy: "border-warning bg-warning-subtle",
} as const;

export function RoomCheckView({
  state,
  onCheck,
  onRecordAnyway,
}: {
  state: RoomCheckState;
  onCheck: () => void;
  onRecordAnyway: () => void;
}) {
  return (
    <section
      aria-label="Room check"
      data-testid="room-check"
      className="rounded-lg border border-border bg-surface p-4"
    >
      <h3 className="text-sm font-semibold text-text-primary">Room check</h3>
      <div aria-live="polite" className="mt-2">
        {state.status === "idle" && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-text-secondary">
              Stay quiet for 3 seconds.
            </p>
            <button
              type="button"
              data-testid="room-check-start"
              onClick={onCheck}
              className={BUTTON}
            >
              Check my room
            </button>
          </div>
        )}
        {state.status === "listening" && (
          <p className="text-sm text-text-secondary">
            Listening. Stay quiet for 3 seconds.
          </p>
        )}
        {(state.status === "done" || state.status === "dismissed") && (
          <div className="space-y-3">
            <p
              data-testid="room-check-result"
              data-verdict={state.reading.verdict}
              className={`rounded-md border-l-4 px-3 py-2 text-sm text-text-primary ${TONE[state.reading.verdict]}`}
            >
              {ROOM_MESSAGE[state.reading.verdict]}
            </p>
            {state.status === "done" && state.reading.verdict === "noisy" && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={onCheck} className={BUTTON}>
                  Check again
                </button>
                <button
                  type="button"
                  onClick={onRecordAnyway}
                  className={BUTTON}
                >
                  Record anyway
                </button>
              </div>
            )}
          </div>
        )}
        {state.status === "unavailable" && (
          <p className="text-sm text-text-secondary">
            This browser could not check the room. You can still record.
          </p>
        )}
      </div>
    </section>
  );
}

/** Listen to the room for the check's length; resolves its noise level in dBFS. */
async function listenToRoom(): Promise<number> {
  const Ctx: typeof AudioContext | undefined =
    typeof AudioContext !== "undefined"
      ? AudioContext
      : (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
  if (!Ctx || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("no web audio");
  }
  // The same microphone settings the recorder uses, so the reading is of the
  // sound a clip would actually capture.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: captureConstraints(captureMode()),
  });
  const ctx = new Ctx();
  try {
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let sum = 0;
    let n = 0;
    const started = performance.now();
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        const elapsed = performance.now() - started;
        // The first moments after the microphone opens are not the room.
        if (elapsed >= RECORD_LEVELS.roomSettleMs) {
          analyser.getFloatTimeDomainData(buf);
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          n += buf.length;
        }
        if (elapsed >= RECORD_LEVELS.roomCheckMs) {
          clearInterval(timer);
          resolve();
        }
      }, 50);
    });
    source.disconnect();
    return rmsDbfs(sum, n);
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
  }
}

export function RoomCheck() {
  // Decided after mount so server and client markup agree.
  const [state, setState] = useState<RoomCheckState>({ status: "idle" });
  const busyRef = useRef(false);

  useEffect(() => {
    const reading = readRoomReading();
    if (reading) setState({ status: "dismissed", reading });
    // A different microphone is a different room reading: ask again.
    const onDevice = () => {
      if (busyRef.current) return;
      writeRoomReading(null);
      setState({ status: "idle" });
    };
    const devices = navigator.mediaDevices;
    devices?.addEventListener?.("devicechange", onDevice);
    return () => devices?.removeEventListener?.("devicechange", onDevice);
  }, []);

  const check = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setState({ status: "listening" });
    try {
      const noiseDbfs = Math.round((await listenToRoom()) * 10) / 10;
      const reading: RoomReading = {
        noiseDbfs,
        verdict: roomVerdict(noiseDbfs),
        at: new Date().toISOString(),
      };
      writeRoomReading(reading);
      setState({ status: "done", reading });
    } catch {
      setState({ status: "unavailable" });
    } finally {
      busyRef.current = false;
    }
  }, []);

  return (
    <RoomCheckView
      state={state}
      onCheck={() => void check()}
      onRecordAnyway={() =>
        setState((s) =>
          s.status === "done" ? { status: "dismissed", reading: s.reading } : s,
        )
      }
    />
  );
}
