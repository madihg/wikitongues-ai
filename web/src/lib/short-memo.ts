/**
 * Keep one answer for a short while, per server instance.
 *
 * For a computation that reads a whole table and is asked for again and
 * again with the same result: the Today page's two model tiles each read the
 * full corpus (about 3.5 seconds each) on every load, and again when the
 * week toggle is pressed, though neither depends on the week.
 *
 * Callers that arrive while the first is still running share its promise,
 * so the work is done once. A failure is never kept: the next call tries
 * again. Nothing is shared between instances, so a number can be up to
 * `ttlMs` old, never older.
 */
export function shortMemo<T>(
  ttlMs: number,
  compute: () => Promise<T>,
  now: () => number = Date.now,
): () => Promise<T> {
  let held: { at: number; value: Promise<T> } | null = null;
  return () => {
    const t = now();
    if (held && t - held.at <= ttlMs) return held.value;
    const value = compute();
    const mine = { at: t, value };
    held = mine;
    value.catch(() => {
      if (held === mine) held = null;
    });
    return value;
  };
}
