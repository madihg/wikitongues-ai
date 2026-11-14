"use client";

import { useEffect, useState } from "react";
import { levelOf } from "@/lib/speech/studio";
import { BAR_EDGES, barPosition, barWord } from "@/lib/speech/record-levels";

/**
 * The studio's live level meter: peak and RMS of the microphone while a take
 * runs, with a clipping warning that stays up for two seconds after the last
 * clipped block, so a brief spike is not missed. LevelBar is the pure view;
 * LevelMeter reads the stream. The meter never blocks a take.
 */

const FLOOR_DB = -60;
const HOLD_MS = 2000;

const pct = (db: number) =>
  Math.max(0, Math.min(100, ((db - FLOOR_DB) / -FLOOR_DB) * 100));

export function LevelBar({
  peakDbfs,
  rmsDbfs,
  clipping,
}: {
  peakDbfs: number;
  rmsDbfs: number;
  clipping: boolean;
}) {
  const hot = peakDbfs > -6;
  return (
    <div data-testid="level-meter" className="space-y-1">
      <div
        role="meter"
        aria-label="Microphone level"
        aria-valuemin={FLOOR_DB}
        aria-valuemax={0}
        aria-valuenow={Number.isFinite(peakDbfs) ? Math.round(peakDbfs) : FLOOR_DB}
        className="relative h-3 w-full overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${
            clipping ? "bg-danger" : hot ? "bg-warning" : "bg-success"
          }`}
          style={{ width: `${pct(rmsDbfs)}%` }}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-text-primary"
          style={{ left: `${pct(peakDbfs)}%` }}
        />
      </div>
      <p aria-live="polite" className="min-h-5 text-xs">
        {clipping ? (
          <span data-testid="clipping-warning" className="font-medium text-danger">
            Clipping: move back from the microphone or turn the input down.
          </span>
        ) : (
          <span className="font-mono text-text-tertiary">
            peak {Number.isFinite(peakDbfs) ? Math.round(peakDbfs) : FLOOR_DB} dBFS
          </span>
        )}
      </p>
    </div>
  );
}

export function LevelMeter({ stream }: { stream: MediaStream | null }) {
  const [level, setLevel] = useState({
    peakDbfs: -Infinity,
    rmsDbfs: -Infinity,
    clipping: false,
  });

  useEffect(() => {
    if (!stream) return;
    const Ctx: typeof AudioContext | undefined =
      typeof AudioContext !== "undefined"
        ? AudioContext
        : (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let raf = 0;
    let lastClip = -Infinity;
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      const l = levelOf(buf);
      const now = performance.now();
      if (l.clipping) lastClip = now;
      setLevel({ ...l, clipping: now - lastClip < HOLD_MS });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      void ctx.close();
      setLevel({ peakDbfs: -Infinity, rmsDbfs: -Infinity, clipping: false });
    };
  }, [stream]);

  return <LevelBar {...level} />;
}

// ---- The speaker's level bar (every clip on Record and in Say it) ---------

const percent = (x: number) => `${Math.round(x * 1000) / 10}%`;

/**
 * The level bar under the Record button: three zones with a word under each
 * (quiet, good, too loud). The good zone is green and wide, because the bar
 * is linear in loudness, not in dB. A fill shows the level now and a small
 * mark stays at the loudest point reached, until the next take. Pure: props
 * in, markup out. It never blocks a take.
 *
 * `compact` is the small picture beside the numbers on the feedback card:
 * the same zones and the take's loudest point, no words under it.
 */
export function RecordLevelBar({
  peakDbfs,
  heldPeakDbfs,
  compact = false,
}: {
  /** The loudest sample of the block just heard; -Infinity when silent or idle. */
  peakDbfs: number;
  /** The loudest point reached in this take; -Infinity before any sound. */
  heldPeakDbfs: number;
  compact?: boolean;
}) {
  const heard = Number.isFinite(heldPeakDbfs);
  const word = heard ? barWord(heldPeakDbfs) : null;
  const { greenFrom, greenTo, redFrom } = BAR_EDGES;
  return (
    <div
      data-testid={compact ? "take-level-bar" : "record-level-bar"}
      data-zone={word ?? "idle"}
      className={compact ? "w-28 shrink-0" : "w-full"}
    >
      <div
        role="meter"
        aria-label={compact ? "Loudest point of this take" : "Microphone level"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(barPosition(heard ? heldPeakDbfs : -Infinity) * 100)}
        aria-valuetext={word ?? "no sound yet"}
        className={`relative w-full overflow-hidden rounded-full bg-surface-sunken ${compact ? "h-2" : "h-3"}`}
      >
        {/* The zones: quiet (plain), good (green), too loud (amber, then red). */}
        <div
          className="absolute inset-y-0 bg-success-subtle"
          style={{ left: percent(greenFrom), width: percent(greenTo - greenFrom) }}
        />
        <div
          className="absolute inset-y-0 bg-warning-subtle"
          style={{ left: percent(greenTo), width: percent(redFrom - greenTo) }}
        />
        <div
          className="absolute inset-y-0 bg-danger-subtle"
          style={{ left: percent(redFrom), width: percent(1 - redFrom) }}
        />
        {/* The level now. */}
        {!compact && (
          <div
            data-testid="level-fill"
            className={`absolute inset-y-0 left-0 rounded-full ${
              barWord(peakDbfs) === "too loud"
                ? "bg-danger"
                : barWord(peakDbfs) === "good"
                  ? "bg-success"
                  : "bg-text-tertiary"
            }`}
            style={{ width: percent(barPosition(peakDbfs)) }}
          />
        )}
        {/* The loudest point reached: it stays until the next take. */}
        {heard && (
          <div
            data-testid="level-peak-mark"
            className="absolute inset-y-0 w-0.5 bg-text-primary"
            style={{ left: percent(barPosition(heldPeakDbfs)) }}
          />
        )}
      </div>
      {!compact && (
        <div aria-hidden="true" className="relative mt-1 h-4 text-xs text-text-tertiary">
          <span
            className={`absolute left-0 ${word === "quiet" ? "font-medium text-text-primary" : ""}`}
          >
            quiet
          </span>
          <span
            className={`absolute -translate-x-1/2 ${word === "good" ? "font-medium text-success" : ""}`}
            style={{ left: percent((greenFrom + greenTo) / 2) }}
          >
            good
          </span>
          <span
            className={`absolute right-0 ${word === "too loud" ? "font-medium text-danger" : ""}`}
          >
            too loud
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The live bar: reads the microphone stream while a take runs. When the take
 * ends the fill drops and the peak mark stays; a new stream (the next take)
 * starts the mark again. With no Web Audio the bar simply stays empty, and
 * recording is not affected.
 */
export function RecordLevelMeter({ stream }: { stream: MediaStream | null }) {
  const [level, setLevel] = useState({
    peakDbfs: -Infinity,
    heldPeakDbfs: -Infinity,
  });

  useEffect(() => {
    if (!stream) return;
    const Ctx: typeof AudioContext | undefined =
      typeof AudioContext !== "undefined"
        ? AudioContext
        : (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
    if (!Ctx) return;
    let ctx: AudioContext;
    let source: MediaStreamAudioSourceNode;
    try {
      ctx = new Ctx();
      source = ctx.createMediaStreamSource(stream);
    } catch {
      return; // no meter; the take itself is unaffected
    }
    const analyser = ctx.createAnalyser();
    // About 21 ms of sound at 48 kHz, read every frame: the bar follows the
    // voice well inside a tenth of a second.
    analyser.fftSize = 1024;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let raf = 0;
    // A new take: the mark starts again, from the first frame heard.
    let held = -Infinity;
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      const { peakDbfs } = levelOf(buf);
      if (peakDbfs > held) held = peakDbfs;
      setLevel({ peakDbfs, heldPeakDbfs: held });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      void ctx.close();
      // The take is over: the level drops, the loudest point stays.
      setLevel({ peakDbfs: -Infinity, heldPeakDbfs: held });
    };
  }, [stream]);

  return <RecordLevelBar {...level} />;
}
