"use client";

import { useCallback, useEffect, useState } from "react";
import type { ConsentDoc, ConsentFlags } from "./consent-gate";

/**
 * The researcher's consent state for the Lab, shared by the Record page and
 * the episode's "Say it" block so both read and write it the same way.
 * GET /api/lab/consent says whether the current text version is on record;
 * accept posts the four separate answers (nothing pre-checked, see
 * ConsentGate). A 428 from a clip save sends the state back to "needed".
 */

export type ConsentGrant = { commercialLicensing: boolean; voiceCloning: boolean };

export type ConsentState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "needed"; doc: ConsentDoc }
  | { status: "granted"; doc: ConsentDoc; grant: ConsentGrant };

async function api(url: string, init?: { method: string; body: unknown }) {
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: init ? { "Content-Type": "application/json" } : undefined,
    body: init ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  return { ok: res.ok, status: res.status, json };
}

export function useLabConsent() {
  const [consent, setConsent] = useState<ConsentState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const r = await api("/api/lab/consent");
        if (!r.ok) {
          throw new Error((r.json?.error as string) ?? "Could not load consent.");
        }
        const j = r.json as unknown as ConsentDoc & {
          needsConsent: boolean;
          grant: ConsentGrant | null;
        };
        if (!live) return;
        setConsent(
          j.needsConsent || !j.grant
            ? { status: "needed", doc: j }
            : { status: "granted", doc: j, grant: j.grant },
        );
      } catch (e) {
        if (live) {
          setConsent({
            status: "error",
            message: e instanceof Error ? e.message : "Could not load consent.",
          });
        }
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const accept = useCallback(
    async (flags: ConsentFlags) => {
      if (consent.status !== "needed") return;
      setBusy(true);
      setError(null);
      const r = await api("/api/lab/consent", {
        method: "POST",
        body: { accepted: true, version: consent.doc.currentVersion, ...flags },
      }).catch(() => null);
      setBusy(false);
      if (!r || !r.ok) {
        setError(
          (r?.json?.error as string) ?? "Could not save your consent. Try again.",
        );
        return;
      }
      setConsent({
        status: "granted",
        doc: consent.doc,
        grant: {
          commercialLicensing: flags.commercialLicensing,
          voiceCloning: flags.voiceCloning,
        },
      });
    },
    [consent],
  );

  /** A clip save answered 428: the consent text moved on; ask again. */
  const needAgain = useCallback(() => {
    setConsent((c) =>
      c.status === "granted" ? { status: "needed", doc: c.doc } : c,
    );
  }, []);

  return { consent, busy, error, accept, needAgain };
}
