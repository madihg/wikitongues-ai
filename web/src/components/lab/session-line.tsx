"use client";

import { useEffect, useState } from "react";

/**
 * "Today: 6 clips kept, 2 re-recorded, 3 community-only, 3 licensed", under
 * the Lab header. Computed server-side from the researcher's own rows
 * (GET /api/lab/speech/today), so there is no new table; the browser only
 * says when "today" began (its local midnight). It refreshes when a clip is
 * saved anywhere on the page ("lab:clip-saved"). Quiet when it cannot load.
 */
export function SessionLine() {
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      fetch(
        `/api/lab/speech/today?since=${encodeURIComponent(midnight.toISOString())}`,
      )
        .then((res) => (res.ok ? res.json() : null))
        .then((j: { line?: string } | null) => {
          if (live && j && typeof j.line === "string") setLine(j.line);
        })
        // The line is a convenience; stay quiet when it cannot load.
        .catch(() => undefined);
    };
    load();
    window.addEventListener("lab:clip-saved", load);
    return () => {
      live = false;
      window.removeEventListener("lab:clip-saved", load);
    };
  }, []);

  return (
    <p
      aria-live="polite"
      data-testid="session-line"
      className="min-h-[1.25rem] border-b border-border bg-surface-sunken px-4 py-2 font-mono text-xs text-text-secondary sm:px-8"
    >
      {line ?? ""}
    </p>
  );
}
