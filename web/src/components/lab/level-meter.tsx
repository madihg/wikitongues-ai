"use client";

import { useEffect, useState } from "react";
import { levelOf } from "@/lib/speech/studio";

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
