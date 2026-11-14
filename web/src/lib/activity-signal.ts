import type { Surface } from "@/lib/activity";

/**
 * A recording is running, or a clip is playing: work with no key press. The
 * recorder calls signalBusy; the activity beat (components/use-activity.ts)
 * listens. Nothing else crosses this line: no audio, no text, only "on" and
 * "off". With no listener the call does nothing, so the recorder works the
 * same on a page that does not count time.
 */
export type BusyKind = "recording" | "playing";
type Listener = (kind: BusyKind, on: boolean) => void;

const listeners = new Set<Listener>();

export function signalBusy(kind: BusyKind, on: boolean): void {
  for (const l of listeners) l(kind, on);
}

export function onBusy(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * A part of a page that is its own kind of work (the edit drawer) says so
 * while it is open. `openSurface` returns the function that closes it; the
 * newest one still open wins. Only the name of a kind of work crosses this
 * line, never which answer or what was typed.
 */
type SurfaceListener = (surface: Surface | null) => void;
const openSurfaces: { surface: Surface }[] = [];
const surfaceListeners = new Set<SurfaceListener>();

/** The kind of work an open overlay names, or null when none is open. */
export function surfaceOverride(): Surface | null {
  return openSurfaces.length > 0
    ? openSurfaces[openSurfaces.length - 1].surface
    : null;
}

export function openSurface(surface: Surface): () => void {
  const entry = { surface };
  openSurfaces.push(entry);
  for (const l of surfaceListeners) l(surfaceOverride());
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    const i = openSurfaces.indexOf(entry);
    if (i >= 0) openSurfaces.splice(i, 1);
    for (const l of surfaceListeners) l(surfaceOverride());
  };
}

export function onSurface(listener: SurfaceListener): () => void {
  surfaceListeners.add(listener);
  return () => {
    surfaceListeners.delete(listener);
  };
}

