"use client";

import { useEffect, useState } from "react";

/**
 * Ask the server how many tone-mark items wait for this account
 * (GET /api/annotator/tone/count). Returns the number waiting when the
 * person has been given items (waiting or already marked), and null
 * otherwise, so the sidebar has no "Pass 2" line until someone is given
 * work. Any failure reads as null.
 */
export async function probeToneCount(
  fetchFn: typeof fetch = fetch,
): Promise<number | null> {
  try {
    const r = await fetchFn("/api/annotator/tone/count");
    if (!r.ok) return null;
    const j = (await r.json()) as { waiting?: number; done?: number } | null;
    const waiting = typeof j?.waiting === "number" ? j.waiting : 0;
    const done = typeof j?.done === "number" ? j.done : 0;
    return waiting + done > 0 ? waiting : null;
  } catch {
    return null;
  }
}

export function useToneCount(eligible: boolean): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!eligible) return;
    let live = true;
    void probeToneCount().then((v) => {
      if (live) setCount(v);
    });
    return () => {
      live = false;
    };
  }, [eligible]);
  return eligible ? count : null;
}
