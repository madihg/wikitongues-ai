"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClipChoice } from "@/lib/speech/clip-choice";
import type { ConsentDoc, ConsentFlags } from "./consent-gate";

/**
 * The researcher's consent state for the Lab, shared by the Record page and
 * the episode's "Say it" block so both read and write it the same way.
 * GET /api/lab/consent says whether the current text version is on record;
 * accept posts the four separate answers (nothing pre-checked, see
 * ConsentGate). A 428 from a clip save sends the state back to "needed".
 *
 * It also carries the clip choice ("What happens to your clips?"), asked once
 * straight after consent and remembered (GET and PUT
 * /api/lab/speech/clip-choice). The choice is asked again whenever consent
 * is: accepting a consent text clears it here, as the server does.
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

/**
 * The remembered clip choice.
 *   loading      not known yet
 *   needed       the speaker has not chosen (or must choose again)
 *   set          chosen: used for every clip until they change it
 *   unavailable  the server could not say; each clip then asks, as it always
 *                did, so a clip is still never saved without a tier
 */
export type ClipChoiceState =
  | { status: "loading" }
  | { status: "needed" }
  | { status: "set"; choice: ClipChoice }
  | { status: "unavailable" };

export function useLabConsent() {
  const [consent, setConsent] = useState<ConsentState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clipChoice, setClipChoice] = useState<ClipChoiceState>({
    status: "loading",
  });
  const [choiceBusy, setChoiceBusy] = useState(false);
  const [choiceError, setChoiceError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await api("/api/lab/speech/clip-choice").catch(() => null);
      if (!live) return;
      if (!r || !r.ok || !r.json) {
        setClipChoice({ status: "unavailable" });
        return;
      }
      const choice = (r.json as { choice?: ClipChoice | null }).choice;
      // A choice the page already holds (just saved) is never overwritten by
      // the slower first load.
      setClipChoice((c) =>
        c.status !== "loading"
          ? c
          : choice
            ? { status: "set", choice }
            : { status: "needed" },
      );
    })();
    return () => {
      live = false;
    };
  }, []);

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
      // A new consent asks the clip choice again (the server reads an older
      // choice as not chosen). If the choice could not be loaded, leave it.
      setClipChoice((c) =>
        c.status === "unavailable" ? c : { status: "needed" },
      );
    },
    [consent],
  );

  /**
   * Remember the choice for every clip from now on. Resolves true when it is
   * saved. A 428 means consent is needed again first.
   */
  const saveClipChoice = useCallback(async (choice: ClipChoice) => {
    setChoiceBusy(true);
    setChoiceError(null);
    const r = await api("/api/lab/speech/clip-choice", {
      method: "PUT",
      body: choice,
    }).catch(() => null);
    setChoiceBusy(false);
    if (!r || !r.ok) {
      if (r?.status === 428) {
        setConsent((c) =>
          c.status === "granted" ? { status: "needed", doc: c.doc } : c,
        );
      }
      setChoiceError(
        (r?.json?.error as string) ?? "Could not save your choice. Try again.",
      );
      return false;
    }
    setClipChoice({ status: "set", choice });
    return true;
  }, []);

  /** A clip save answered 428: the consent text moved on; ask again. */
  const needAgain = useCallback(() => {
    setConsent((c) =>
      c.status === "granted" ? { status: "needed", doc: c.doc } : c,
    );
  }, []);

  return {
    consent,
    busy,
    error,
    accept,
    needAgain,
    clipChoice,
    choiceBusy,
    choiceError,
    saveClipChoice,
  };
}
