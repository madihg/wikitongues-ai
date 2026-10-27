"use client";

import { useEffect, useState } from "react";

/**
 * True when the speech layer is on for this account: the Speech Lab flag is
 * set AND the account is a researcher. It only asks the server for
 * researchers (the caller passes `researcher`), and the server answers the
 * same "false" for anyone else, so an annotator's episode never shows it and
 * never even makes the request. Any failure reads as off.
 */
export function useSpeechLayer(researcher: boolean): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!researcher) return;
    let live = true;
    void fetch("/api/lab/flags")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { speech?: boolean } | null) => {
        if (live) setOn(j?.speech === true);
      })
      .catch(() => {
        if (live) setOn(false);
      });
    return () => {
      live = false;
    };
  }, [researcher]);
  // Derived, not stored: an account that stops being a researcher reads as off.
  return researcher && on;
}
