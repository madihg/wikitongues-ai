import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockSession, mockPrisma } = vi.hoisted(() => ({
  mockSession: vi.fn(),
  mockPrisma: {
    activityPing: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));
vi.mock("next-auth", () => ({ getServerSession: mockSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { POST } from "./route";

const NOW = Date.UTC(2026, 10, 16, 9, 3, 0);
const M0 = Date.UTC(2026, 10, 16, 9, 0, 0);
const MIN = 60_000;

/**
 * A tiny stand-in for the table, so the dedupe and late-arrival rules are
 * tested through the route's own calls, not by reading its arguments.
 */
type Row = { userId: string; minute: Date; surface: string; isDemo: boolean; activeSeconds: number };
let table: Row[] = [];
const same = (r: Row, w: Partial<Row>) =>
  r.userId === w.userId &&
  r.minute.getTime() === (w.minute as Date).getTime() &&
  r.surface === w.surface &&
  r.isDemo === w.isDemo;

const post = (body: unknown) =>
  POST(
    new Request("http://test/api/activity/ping", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
const beat = (over: Record<string, unknown> = {}) => ({
  minute: M0,
  surface: "annotate",
  activeSeconds: 30,
  demo: false,
  ...over,
});
const total = (userId = "u1") =>
  table.filter((r) => r.userId === userId).reduce((n, r) => n + r.activeSeconds, 0);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  table = [];
  mockSession.mockResolvedValue({ user: { id: "u1", role: "ANNOTATOR" } });
  mockPrisma.activityPing.findMany.mockImplementation(
    async ({ where }: { where: { userId: string; minute: { in: Date[] } } }) =>
      table.filter(
        (r) =>
          r.userId === where.userId &&
          where.minute.in.some((m) => m.getTime() === r.minute.getTime()),
      ),
  );
  mockPrisma.activityPing.createMany.mockImplementation(
    async ({ data }: { data: Row[] }) => {
      let count = 0;
      for (const d of data) {
        if (table.some((r) => same(r, d))) continue; // skipDuplicates
        table.push({ ...d });
        count++;
      }
      return { count };
    },
  );
  mockPrisma.activityPing.updateMany.mockImplementation(
    async ({
      where,
      data,
    }: {
      where: Row & { activeSeconds: { lt: number } };
      data: { activeSeconds: number };
    }) => {
      let count = 0;
      for (const r of table) {
        if (same(r, where) && r.activeSeconds < where.activeSeconds.lt) {
          r.activeSeconds = data.activeSeconds;
          count++;
        }
      }
      return { count };
    },
  );
});
afterEach(() => vi.useRealTimers());

describe("POST /api/activity/ping", () => {
  it("401 when signed out, 400 for a body that is not a list of beats", async () => {
    mockSession.mockResolvedValue(null);
    expect((await post({ sentAt: NOW, beats: [beat()] })).status).toBe(401);
    mockSession.mockResolvedValue({ user: { id: "u1" } });
    expect((await post("not json")).status).toBe(400);
    expect((await post({ beats: "x" })).status).toBe(400);
    expect(table).toHaveLength(0);
  });

  it("stores a beat under the signed-in person, whatever the body claims", async () => {
    const res = await post({ sentAt: NOW, userId: "someone-else", beats: [beat()] });
    expect(await res.json()).toEqual({ ok: true, stored: 1, dropped: 0 });
    expect(table).toEqual([
      { userId: "u1", minute: new Date(M0), surface: "annotate", isDemo: false, activeSeconds: 30 },
    ]);
  });

  it("the same beat twice changes nothing", async () => {
    await post({ sentAt: NOW, beats: [beat()] });
    const again = await post({ sentAt: NOW, beats: [beat()] });
    expect((await again.json()).stored).toBe(0);
    expect(total()).toBe(30);
  });

  it("a later, greater total for the same minute raises the row; a smaller one does not lower it", async () => {
    await post({ sentAt: NOW, beats: [beat({ activeSeconds: 30 })] });
    await post({ sentAt: NOW, beats: [beat({ activeSeconds: 55 })] });
    expect(total()).toBe(55);
    await post({ sentAt: NOW, beats: [beat({ activeSeconds: 12 })] });
    expect(total()).toBe(55);
    expect(table).toHaveLength(1);
  });

  it("never more than 60 seconds per person per minute, across kinds of work", async () => {
    await post({ sentAt: NOW, beats: [beat({ activeSeconds: 50 })] });
    await post({ sentAt: NOW, beats: [beat({ surface: "listen", activeSeconds: 50 })] });
    expect(total()).toBe(60);
    // Another person has their own 60.
    mockSession.mockResolvedValue({ user: { id: "u2" } });
    await post({ sentAt: NOW, beats: [beat({ activeSeconds: 60 })] });
    expect(total("u2")).toBe(60);
  });

  it("beats that waited offline for 2 hours land in their own minutes", async () => {
    const late = Array.from({ length: 120 }, (_, i) =>
      beat({ minute: NOW - (120 - i) * MIN, activeSeconds: 60 }),
    );
    const res = await post({ sentAt: NOW, beats: late });
    expect(await res.json()).toEqual({ ok: true, stored: 120, dropped: 0 });
    expect(total()).toBe(120 * 60);
    expect(new Set(table.map((r) => r.minute.getTime())).size).toBe(120);
    expect(Math.min(...table.map((r) => r.minute.getTime()))).toBe(NOW - 120 * MIN);
  });

  it("refuses beats older than 24 hours or ahead of the clock, and says how many", async () => {
    const res = await post({
      sentAt: NOW,
      beats: [beat({ minute: NOW - 25 * 60 * MIN }), beat({ minute: NOW + 30 * MIN }), beat()],
    });
    expect(await res.json()).toEqual({ ok: true, stored: 1, dropped: 2 });
  });

  it("keeps a demo sitting apart, so it can be left out of invoices", async () => {
    await post({ sentAt: NOW, beats: [beat({ demo: true, activeSeconds: 20 })] });
    expect(table[0].isDemo).toBe(true);
  });

  it("before the migration is applied: 200, nothing stored, pending true", async () => {
    mockPrisma.activityPing.findMany.mockRejectedValue(
      Object.assign(new Error("table does not exist"), { code: "P2021" }),
    );
    const res = await post({ sentAt: NOW, beats: [beat()] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, stored: 0, dropped: 0, pending: true });
  });

  it("any other database error is not swallowed", async () => {
    mockPrisma.activityPing.findMany.mockRejectedValue(new Error("boom"));
    await expect(post({ sentAt: NOW, beats: [beat()] })).rejects.toThrow("boom");
  });
});
