"use client";

import { useEffect, useRef } from "react";

/**
 * Tell the one Annotate flow (work-flow.tsx) that this kind of work has run
 * out, once each time it does, so the flow can offer the next kind. A screen
 * used on its own page passes no callback and nothing happens.
 */
export function useOnEmpty(empty: boolean, onEmpty?: () => void): void {
  const cb = useRef(onEmpty);
  useEffect(() => {
    cb.current = onEmpty;
  }, [onEmpty]);
  useEffect(() => {
    if (empty) cb.current?.();
  }, [empty]);
}
