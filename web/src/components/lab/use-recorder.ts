"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_DURATION_MS } from "@/lib/speech/limits";
import {
  appliedCapture,
  captureConstraints,
  captureMode,
  pickRecorderMime,
  type CaptureSettings,
} from "@/lib/speech/recorder";

/** A finished take, held in memory until it is kept, re-recorded or discarded. */
export interface Take {
  blob: Blob;
  /** Object URL for the inline player; revoked when the take is dropped. */
  url: string;
  durationMs: number;
  sampleRate: number;
  mime: string;
  /** What was asked of the microphone and what the browser applied. */
  capture: CaptureSettings;
}

export type RecorderState = "idle" | "recording" | "recorded";

/**
 * MediaRecorder behind a small state machine: idle -> recording -> recorded.
 * Mime fallback comes from pickRecorderMime (webm opus, then mp4 on iOS
 * Safari). Capture asks for 48 kHz mono. The recorder hard-stops at 30
 * seconds (MAX_DURATION_MS) by itself, whatever the screen does. The
 * microphone is opened as captureMode() says: as it always was (echo
 * cancelling and noise suppression on) until NEXT_PUBLIC_SPEECH_CAPTURE is
 * set to "raw", which turns the browser's echo cancelling, noise suppression
 * and auto gain all off. `raw` (studio sessions) is always raw. The settings
 * the browser actually applied are read back and kept on the take, to be
 * stored with the clip (lib/speech/recorder.ts has the decision and the
 * reasons). Everything
 * (mic tracks, timer, object URL) is released on stop, reset and unmount.
 */
export function useRecorder(opts: { raw?: boolean } = {}) {
  // Every take may train a voice: the browser's own cleanup (echo cancelling,
  // noise suppression, auto gain) would be baked into it. Studio takes are
  // always raw; other takes follow captureMode() (unchanged until switched).
  const mode = opts.raw === true ? "raw" : captureMode();
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [take, setTake] = useState<Take | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The live microphone stream while recording, for a level meter (studio).
  const [stream, setStream] = useState<MediaStream | null>(null);
  // Decided after mount so server and client markup agree.
  const [supported, setSupported] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    setSupported(
      typeof MediaRecorder !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        pickRecorderMime((m) => MediaRecorder.isTypeSupported(m)) !== null,
    );
  }, []);

  const release = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const dropUrl = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    dropUrl();
    setTake(null);
    setElapsedMs(0);
    try {
      const mime = pickRecorderMime((m) => MediaRecorder.isTypeSupported(m));
      if (!mime) throw new Error("This browser cannot record audio.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: captureConstraints(mode),
      });
      streamRef.current = stream;
      setStream(stream);
      // Confirm what the browser really applied: it may ignore the request.
      const settings = stream.getAudioTracks()[0]?.getSettings();
      const sampleRate = settings?.sampleRate ?? 48000;
      const capture = appliedCapture(
        mode,
        settings as Record<string, unknown> | undefined,
        typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      );

      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const durationMs = Math.min(
          Math.round(performance.now() - startedAtRef.current),
          MAX_DURATION_MS,
        );
        release();
        const type = rec.mimeType || mime;
        const blob = new Blob(chunksRef.current, { type });
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setElapsedMs(durationMs);
        setTake({ blob, url, durationMs, sampleRate, mime: type, capture });
        setState("recorded");
      };
      recorderRef.current = rec;
      startedAtRef.current = performance.now();
      rec.start();
      setState("recording");
      timerRef.current = setInterval(() => {
        const e = performance.now() - startedAtRef.current;
        setElapsedMs(Math.min(e, MAX_DURATION_MS));
        // The hard stop: the recorder ends itself at 30 s.
        if (e >= MAX_DURATION_MS) stop();
      }, 100);
    } catch (e) {
      release();
      setState("idle");
      const denied = e instanceof DOMException && e.name === "NotAllowedError";
      setError(
        denied
          ? "Microphone access was blocked. Allow it in the browser, then try again."
          : e instanceof Error
            ? e.message
            : "Could not start recording.",
      );
    }
  }, [dropUrl, mode, release, stop]);

  const reset = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      rec.stop();
    }
    release();
    dropUrl();
    setTake(null);
    setElapsedMs(0);
    setState("idle");
  }, [dropUrl, release]);

  // Release the microphone and the object URL if the page goes away.
  useEffect(() => {
    return () => {
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.onstop = null;
        rec.stop();
      }
      release();
      dropUrl();
    };
  }, [dropUrl, release]);

  return { state, elapsedMs, take, error, supported, stream, start, stop, reset };
}
