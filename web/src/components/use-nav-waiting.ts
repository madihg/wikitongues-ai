"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { NavWaiting } from "@/lib/waiting";

const KEYS = ["annotate", "speech", "record", "listen", "check", "fix"] as const;

/** Reads the endpoint's answer. Anything unexpected is "not known" (null),
 *  never zero: a wrong zero would tell someone their queue is empty. */
export function parseNavWaiting(body: unknown): NavWaiting | null {
  const w = (body as { waiting?: unknown } | null)?.waiting;
  if (!w || typeof w !== "object") return null;
  const out = {} as NavWaiting;
  for (const k of KEYS) {
    const n = (w as Record<string, unknown>)[k];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
    out[k] = n;
  }
  return out;
}

/**
 * What is waiting for the signed-in person (GET /api/annotator/waiting).
 * Null while unknown, on any failure, and always for a research lead, who
 * the server answers with no counts. Asked again when the page changes and
 * when a clip is saved, so finishing a task moves the number.
 */
export function useNavWaiting(on: boolean): NavWaiting | null {
  const pathname = usePathname();
  const [waiting, setWaiting] = useState<NavWaiting | null>(null);
  useEffect(() => {
    if (!on) return;
    let live = true;
    const load = () => {
      fetch("/api/annotator/waiting")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => live && setWaiting(parseNavWaiting(j)))
        .catch(() => undefined);
    };
    load();
    window.addEventListener("lab:clip-saved", load);
    return () => {
      live = false;
      window.removeEventListener("lab:clip-saved", load);
    };
  }, [on, pathname]);
  return on ? waiting : null;
}
