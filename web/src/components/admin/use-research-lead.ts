"use client";

import { useEffect, useState } from "react";

/**
 * Ask the server whether the signed-in researcher is a research lead (GET
 * /api/admin/lead). Any failure reads as "no". It only decides whether the
 * sidebar lists People; the People page and its data routes check again on
 * the server.
 */
export async function probeResearchLead(
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const r = await fetchFn("/api/admin/lead");
    if (!r.ok) return false;
    const j = (await r.json()) as { lead?: boolean } | null;
    return j?.lead === true;
  } catch {
    return false;
  }
}

export function useResearchLead(eligible: boolean): boolean {
  const [lead, setLead] = useState(false);
  useEffect(() => {
    if (!eligible) return;
    let live = true;
    void probeResearchLead().then((v) => {
      if (live) setLead(v);
    });
    return () => {
      live = false;
    };
  }, [eligible]);
  return eligible && lead;
}
