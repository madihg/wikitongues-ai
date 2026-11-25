"use client";

import { useEffect, useRef } from "react";

/**
 * What a screen of the one Annotate flow (work-flow.tsx) may be given. Used
 * on its own page, a screen gets none of these and behaves as it always did.
 */
export interface WorkScreenProps {
  /** No task of this kind is left (see useOnEmpty). */
  onEmpty?: () => void;
  /** One task of this kind was finished and saved: the stream may move on. */
  onDone?: () => void;
  /** False while the flow keeps this screen mounted but hidden. */
  active?: boolean;
}

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
