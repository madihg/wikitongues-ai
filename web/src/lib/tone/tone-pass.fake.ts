/**
 * An in-memory stand-in for the Prisma calls the tone pass makes, for tests
 * only. It keeps real rows so a test can save, reopen and compare through
 * the same functions the routes use. The pass-1 tables are traps: any write
 * to them throws, and every call is recorded, so a test can prove pass 1 is
 * never written.
 */

type Row = Record<string, unknown>;

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (key.includes("_") && cond && typeof cond === "object") {
      // A compound unique key: { itemId_annotatorId: { itemId, annotatorId } }
      if (!matches(row, cond as Row)) return false;
      continue;
    }
    const value = row[key];
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as { in?: unknown[] };
      if (c.in && !c.in.includes(value)) return false;
    } else if (value !== cond) {
      return false;
    }
  }
  return true;
}

let clock = 0;
const tick = () => new Date(Date.UTC(2026, 10, 14, 9, 0, 0, clock++));

function table(rows: Row[], prefix: string) {
  const apply = (row: Row, data: Row) => {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === "object" && "increment" in (v as Row)) {
        row[k] =
          ((row[k] as number) ?? 0) +
          ((v as { increment: number }).increment ?? 0);
      } else {
        row[k] = v;
      }
    }
    if ("updatedAt" in row) row.updatedAt = tick();
  };
  const create = (data: Row) => {
    const row: Row = {
      id: `${prefix}${rows.length + 1}`,
      createdAt: tick(),
      ...data,
    };
    rows.push(row);
    return row;
  };
  return {
    rows,
    findUnique: async ({ where }: { where: Row }) =>
      rows.find((r) => matches(r, where)) ?? null,
    findMany: async ({ where }: { where?: Row } = {}) =>
      rows.filter((r) => matches(r, where)),
    count: async ({ where }: { where?: Row } = {}) =>
      rows.filter((r) => matches(r, where)).length,
    upsert: async ({
      where,
      create: c,
      update,
    }: {
      where: Row;
      create: Row;
      update: Row;
    }) => {
      const row = rows.find((r) => matches(r, where));
      if (row) {
        apply(row, update);
        return row;
      }
      // Column defaults the database would fill in.
      return create({
        ...(prefix === "tp" ? { updatedAt: tick() } : {}),
        ...(prefix === "ag" ? { agreedAt: tick() } : {}),
        ...c,
      });
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) => apply(r, data));
      return { count: hit.length };
    },
    deleteMany: async ({ where }: { where: Row }) => {
      const hit = rows.filter((r) => matches(r, where));
      for (const r of hit) rows.splice(rows.indexOf(r), 1);
      return { count: hit.length };
    },
  };
}

/** A pass-1 table: reads are allowed and recorded, writes throw. */
function pass1(rows: Row[], name: string, calls: string[]) {
  const write = (method: string) => async () => {
    calls.push(`${name}.${method}`);
    throw new Error(`pass 1 was written: ${name}.${method}`);
  };
  return {
    rows,
    findMany: async ({ where }: { where?: Row } = {}) => {
      calls.push(`${name}.findMany`);
      return rows.filter((r) => matches(r, where));
    },
    findUnique: async ({ where }: { where: Row }) => {
      calls.push(`${name}.findUnique`);
      return rows.find((r) => matches(r, where)) ?? null;
    },
    create: write("create"),
    createMany: write("createMany"),
    update: write("update"),
    updateMany: write("updateMany"),
    upsert: write("upsert"),
    delete: write("delete"),
    deleteMany: write("deleteMany"),
  };
}

export function fakeToneDb(seed: {
  items?: Row[];
  assignments?: Row[];
  prompts?: Row[];
  users?: Row[];
  cold?: Row[];
  edits?: Row[];
}) {
  clock = 0;
  const pass1Calls: string[] = [];
  return {
    pass1Calls,
    tonePassItem: table(seed.items ?? [], "it"),
    tonePassAssignment: table(seed.assignments ?? [], "as"),
    tonePass: table([], "tp"),
    tonePassAgreed: table([], "ag"),
    prompt: table(seed.prompts ?? [], "pr"),
    user: table(seed.users ?? [], "us"),
    coldAuthorAnswer: pass1(seed.cold ?? [], "coldAuthorAnswer", pass1Calls),
    outputEdit: pass1(seed.edits ?? [], "outputEdit", pass1Calls),
  };
}
