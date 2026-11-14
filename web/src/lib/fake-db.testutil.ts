import { vi } from "vitest";

/**
 * A small in-memory stand-in for the Prisma client, for route tests that
 * need the SAME rows read by two routes (the parity tests). It understands
 * only the `where` shapes the hours loader and the home counts use: equality,
 * { gte, lt }, { not }, { in }, { notIn }, OR, AND, and a filter on a related
 * row (prompt: { ... }, matched against row.prompt). Anything else throws,
 * so a test cannot pass by accident on a filter this file does not
 * understand.
 */
type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const OPS = ["gte", "lt", "not", "in", "notIn"];

function matches(row: Row, where: Where | undefined): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    const v = row[key];
    if (cond === undefined) continue;
    if (key === "OR") {
      if (!(cond as Where[]).some((w) => matches(row, w))) return false;
      continue;
    }
    if (key === "AND") {
      if (!(cond as Where[]).every((w) => matches(row, w))) return false;
      continue;
    }
    const isOps =
      cond !== null &&
      typeof cond === "object" &&
      !(cond instanceof Date) &&
      Object.keys(cond).every((k) => OPS.includes(k));
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date) && !isOps) {
      // A filter on a related row.
      if (!matches((v ?? {}) as Row, cond as Where)) return false;
      continue;
    }
    if (cond === null || typeof cond !== "object" || cond instanceof Date) {
      const same =
        cond instanceof Date && v instanceof Date
          ? cond.getTime() === v.getTime()
          : cond === v;
      if (!same) return false;
      continue;
    }
    for (const [op, arg] of Object.entries(cond as Where)) {
      const t = (x: unknown) => (x instanceof Date ? x.getTime() : (x as number));
      if (op === "gte") {
        if (!(t(v) >= t(arg))) return false;
      } else if (op === "lt") {
        if (!(t(v) < t(arg))) return false;
      } else if (op === "not") {
        if (v === arg || (arg === null && v === undefined)) return false;
      } else if (op === "in") {
        const list = (arg as unknown[]).map(t);
        if (!list.includes(t(v))) return false;
      } else if (op === "notIn") {
        if ((arg as unknown[]).includes(v)) return false;
      } else {
        throw new Error(`fake-db: unsupported filter ${key}.${op}`);
      }
    }
  }
  return true;
}

export function fakeDb(tables: Record<string, Row[]>) {
  const model = (name: string) => {
    const rows = () => tables[name] ?? [];
    return {
      findMany: vi.fn(async (args: { where?: Where } = {}) =>
        rows().filter((r) => matches(r, args.where)),
      ),
      findFirst: vi.fn(
        async (args: { where?: Where; orderBy?: Record<string, "asc" | "desc"> } = {}) => {
          const found = rows().filter((r) => matches(r, args.where));
          const [field, dir] = Object.entries(args.orderBy ?? {})[0] ?? [];
          if (field) {
            found.sort((a, b) => {
              const d =
                (a[field] as Date).getTime() - (b[field] as Date).getTime();
              return dir === "desc" ? -d : d;
            });
          }
          return found[0] ?? null;
        },
      ),
      count: vi.fn(async (args: { where?: Where } = {}) =>
        rows().filter((r) => matches(r, args.where)).length,
      ),
      create: vi.fn(async (args: { data: Row }) => {
        (tables[name] ??= []).push(args.data);
        return args.data;
      }),
    };
  };
  const models = new Map<string, ReturnType<typeof model>>();
  const db = new Proxy(
    {
      /** The AnswerRevision read: a missing table unless the test adds rows. */
      $queryRaw: vi.fn(async () => {
        if (!tables.AnswerRevisionSaves) {
          throw Object.assign(new Error("relation does not exist"), {
            code: "P2010",
            meta: { code: "42P01" },
          });
        }
        return tables.AnswerRevisionSaves;
      }),
    } as Record<string, unknown>,
    {
      get(target, prop: string) {
        if (prop in target) return target[prop];
        let m = models.get(prop);
        if (!m) models.set(prop, (m = model(prop)));
        return m;
      },
    },
  );
  return db;
}
