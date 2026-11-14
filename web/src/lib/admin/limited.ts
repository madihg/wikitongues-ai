/**
 * Promise.all with a ceiling. A dashboard page asks many small questions of
 * the database at once; fired together they can hold every connection in the
 * pool and make another request wait until it times out. This runs the same
 * tasks at most `limit` at a time and returns their results in order, typed
 * like Promise.all. The first failure rejects, as Promise.all does.
 */
export async function allLimited<const T extends readonly (() => unknown)[]>(
  tasks: T,
  limit = 4,
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const results = new Array<unknown>(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(limit, 1), tasks.length) }, worker),
  );
  return results as { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> };
}
