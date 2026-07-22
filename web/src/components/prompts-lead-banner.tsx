"use client";

import { useSyncExternalStore } from "react";

/**
 * Info banner for the prompt catalogue, shown only on this researcher/lead-gated
 * page (see prompts/layout.tsx - RESEARCHER only). Agnes read this catalogue as
 * annotation work she owed; it isn't. This says so, plainly, and stays dismissed
 * once closed. Regular annotators never reach this page, so the copy can address
 * leads directly.
 *
 * Dismissal lives in localStorage and is read via useSyncExternalStore so there
 * is no setState-in-effect and no SSR/hydration mismatch (server assumes shown,
 * the client reconciles on mount).
 */
const DISMISS_KEY = "wt-prompts-lead-banner-dismissed";

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function isDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function getServerSnapshot() {
  return false;
}

function dismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // storage unavailable - non-fatal, banner just returns next load
  }
  listeners.forEach((l) => l());
}

export function PromptsLeadBanner() {
  const dismissed = useSyncExternalStore(
    subscribe,
    isDismissed,
    getServerSnapshot,
  );

  if (dismissed) return null;

  return (
    <div className="mb-6 flex items-start justify-between gap-4 rounded-lg border border-info/30 bg-info-subtle p-4">
      <p className="text-sm leading-relaxed text-text-secondary">
        <span className="font-semibold text-text-primary">
          This catalogue is view/edit access for leads
        </span>{" "}
        - there is no annotation work to do here. Your annotation happens in
        Annotate.
      </p>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 cursor-pointer rounded-md border border-border-strong px-2.5 py-1 text-xs text-text-tertiary hover:bg-surface-sunken"
      >
        Got it
      </button>
    </div>
  );
}
