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
