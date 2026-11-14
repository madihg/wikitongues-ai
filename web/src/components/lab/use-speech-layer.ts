"use client";

import { useEffect, useState } from "react";

/**
 * Ask the server whether the speech layer is on for this account
 * (GET /api/lab/flags, `speech`). Any failure reads as off. The only request
 * the layer ever makes before it is switched on.
 */
export async function probeSpeechLayer(
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const r = await fetchFn("/api/lab/flags");
    if (!r.ok) return false;
    const j = (await r.json()) as { speech?: boolean } | null;
    return j?.speech === true;
  } catch {
    return false;
  }
}

/**
 * True when the speech layer is on for this account: the Speech Lab flag is
 * set and the account may use the speaker side (a researcher, or an annotator
 * when SPEECH_LAYER_ANNOTATORS is also set). The caller passes `eligible`
 * (canProbeSpeech(role)); a learner never asks. The server answers "false"
 * to an annotator while the layer flag is unset, so the episode renders as
 * it always has and no /api/lab/speech request is ever made. Any failure
 * reads as off.
 */
export function useSpeechLayer(eligible: boolean): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!eligible) return;
    let live = true;
    void probeSpeechLayer().then((v) => {
      if (live) setOn(v);
    });
    return () => {
      live = false;
    };
  }, [eligible]);
  // Derived, not stored: an account that stops being eligible reads as off.
  return eligible && on;
}

/**
 * How many of the account's own answers wait for a clip (GET
 * /api/lab/speech/waiting, `speech`). Any failure, or an answer that is not a
 * number, reads as "not known" (undefined), never as zero.
 */
export async function fetchSpeechWaiting(
  fetchFn: typeof fetch = fetch,
): Promise<number | undefined> {
  try {
    const r = await fetchFn("/api/lab/speech/waiting");
    if (!r.ok) return undefined;
    const j = (await r.json()) as { speech?: unknown } | null;
    return typeof j?.speech === "number" && Number.isFinite(j.speech)
      ? j.speech
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The number beside "Speech" in the sidebar. Asked only when speech is on for
 * the account (so an account without speech never makes the request), and
 * again whenever a clip is saved anywhere on the page ("lab:clip-saved").
 * While it is not known the sidebar shows no number.
 */
export function useSpeechWaiting(on: boolean): number | undefined {
  const [count, setCount] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!on) return;
    let live = true;
    const load = () => {
      void fetchSpeechWaiting().then((n) => {
        if (live && n !== undefined) setCount(n);
      });
    };
    load();
    window.addEventListener("lab:clip-saved", load);
    return () => {
      live = false;
      window.removeEventListener("lab:clip-saved", load);
    };
  }, [on]);
  return on ? count : undefined;
}
