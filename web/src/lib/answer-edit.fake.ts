/**
 * A small in-memory stand-in for the Prisma calls the edit log makes, for
 * tests only. It keeps real rows, so a test can save three edits and then
 * read the first version back through the same functions the routes use.
 * It understands exactly the where-shapes src/lib/answer-edit.ts sends.
 */

type Row = Record<string, unknown>;

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (key === "OR") {
      if (!(cond as Row[]).some((w) => matches(row, w))) return false;
      continue;
    }
    // A column the fixture leaves out is null, as in the database.
    const value = row[key] ?? null;
    if (cond && typeof cond === "object" && "in" in (cond as Row)) {
      if (!((cond as { in: unknown[] }).in ?? []).includes(value)) return false;
    } else if (cond && typeof cond === "object" && "not" in (cond as Row)) {
      if (value === ((cond as { not: unknown }).not ?? null)) return false;
    } else if (value !== (cond ?? null)) {
      return false;
    }
  }
  return true;
}

function table(rows: Row[]) {
  return {
    rows,
    findUnique: async ({ where }: { where: Row }) =>
      rows.find((r) => matches(r, where)) ?? null,
    findFirst: async ({ where }: { where?: Row }) =>
      rows.find((r) => matches(r, where)) ?? null,
    findMany: async ({ where }: { where?: Row } = {}) =>
      rows
        .filter((r) => matches(r, where))
        .sort(
          (a, b) =>
            (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime(),
        ),
    count: async ({ where }: { where?: Row } = {}) =>
      rows.filter((r) => matches(r, where)).length,
    update: async ({ where, data }: { where: Row; data: Row }) => {
      const row = rows.find((r) => matches(r, where));
      if (!row) throw Object.assign(new Error("not found"), { code: "P2025" });
      Object.assign(row, data);
      return { id: row.id };
    },
    createMany: async ({ data }: { data: Row[] }) => {
      for (const d of data) {
        rows.push({
          id: `rev${rows.length + 1}`,
          // One millisecond apart, so "oldest first" is well defined.
          createdAt: new Date(Date.UTC(2026, 10, 13, 9, 0, 0, rows.length)),
          ...d,
        });
      }
      return { count: data.length };
    },
  };
}

export function fakePrisma(seed: {
  cold?: Row[];
  edits?: Row[];
  pairwise?: Row[];
  listen?: Row[];
  prompts?: Row[];
  clips?: Row[];
}) {
  const db = {
    coldAuthorAnswer: table(seed.cold ?? []),
    outputEdit: table(seed.edits ?? []),
    pairwiseComparison: table(seed.pairwise ?? []),
    speechComparison: table(seed.listen ?? []),
    prompt: table(seed.prompts ?? []),
    speechRecording: table(seed.clips ?? []),
    answerRevision: table([]),
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return db;
}
