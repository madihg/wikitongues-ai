"use client";

import { useState } from "react";

/**
 * Mark a train-side prompt as a tone minimal pair: the prompt code, the
 * spelling its clips are meant to say, and a foil that differs from it in
 * tone marks only. The Listen lane then asks "Which word did you hear?" for
 * that prompt. A frozen prompt is refused by the server.
 */
export function MinimalPairMarker() {
  const [code, setCode] = useState("");
  const [target, setTarget] = useState("");
  const [foil, setFoil] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/lab/speech/minimal-pairs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptId: code.trim(), targetSpelling: target, foilSpelling: foil }),
      });
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      setMessage(
        res.ok
          ? { ok: true, text: "Marked. Listen will ask which word was heard." }
          : { ok: false, text: res.status === 403 ? "That prompt cannot be used." : (j?.error ?? "Could not mark the prompt.") },
      );
      if (res.ok) {
        setTarget("");
        setFoil("");
      }
    } finally {
      setBusy(false);
    }
  };

  const INPUT =
    "mt-1 min-h-[44px] w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-base text-text-primary focus-visible:outline-none focus-visible:shadow-[var(--ring)]";
  const ready = code.trim() !== "" && target.trim() !== "" && foil.trim() !== "";

  return (
    <details className="rounded-lg border border-border bg-surface p-4">
      <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-semibold text-text-primary">
        Mark a tone minimal pair
      </summary>
      <div className="mt-3 space-y-3">
        <div>
          <label htmlFor="mp-code" className="text-sm text-text-secondary">
            Prompt code
          </label>
          <input id="mp-code" value={code} onChange={(e) => setCode(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label htmlFor="mp-target" className="text-sm text-text-secondary">
            Spelling the clips say
          </label>
          <input id="mp-target" value={target} onChange={(e) => setTarget(e.target.value)} className={`igala ${INPUT}`} />
        </div>
        <div>
          <label htmlFor="mp-foil" className="text-sm text-text-secondary">
            Same word, other tone marks
          </label>
          <input id="mp-foil" value={foil} onChange={(e) => setFoil(e.target.value)} className={`igala ${INPUT}`} />
        </div>
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => void submit()}
          className="min-h-[44px] cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast hover:bg-accent-hover focus-visible:outline-none focus-visible:shadow-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Marking..." : "Mark prompt"}
        </button>
        <p aria-live="polite" className={`text-sm ${message?.ok ? "text-success" : "text-danger"}`}>
          {message?.text ?? ""}
        </p>
      </div>
    </details>
  );
}
