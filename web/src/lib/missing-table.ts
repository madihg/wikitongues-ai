/**
 * "The table is not there yet." Migrations in this repo are written by one
 * person and applied by another, later, so code that reads a new table must
 * keep working in the gap: a missing table reads as "no rows", never as a
 * crash. Covers a model query (Prisma P2021) and a raw query (Prisma P2010
 * carrying Postgres 42P01, undefined_table).
 */
export function isMissingTable(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const err = e as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
  if (err.code === "P2021") return true;
  if (err.code === "P2010") {
    if (err.meta?.code === "42P01") return true;
    return typeof err.message === "string" && err.message.includes("42P01");
  }
  return false;
}

/** Run a read; a missing table gives `fallback`. Every other error is thrown. */
export async function orIfMissing<T>(
  read: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await read();
  } catch (e) {
    if (isMissingTable(e)) return fallback;
    throw e;
  }
}
