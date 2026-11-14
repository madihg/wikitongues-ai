import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockSession, mockPrisma } = vi.hoisted(() => ({
  mockSession: vi.fn(),
  mockPrisma: { timeNote: { create: vi.fn() } },
}));
vi.mock("next-auth", () => ({ getServerSession: mockSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new Request("http://test/api/annotator/time-note", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-13T12:00:00Z"));
  mockSession.mockResolvedValue({ user: { id: "agnes" } });
  mockPrisma.timeNote.create.mockResolvedValue({});
});
afterEach(() => vi.useRealTimers());

describe("POST /api/annotator/time-note", () => {
  it("401 when signed out", async () => {
    mockSession.mockResolvedValue(null);
    expect((await post({ day: "2026-11-12", note: "x" })).status).toBe(401);
  });

  it("saves the note under the signed-in person, on the week of the day named", async () => {
    const res = await post({ day: "2026-11-04", note: "  I fixed old answers all day.  " });
    expect(await res.json()).toEqual({ ok: true });
    expect(mockPrisma.timeNote.create).toHaveBeenCalledWith({
      data: {
        userId: "agnes",
        weekStart: new Date("2026-11-01T23:00:00Z"), // Mon 2 Nov, 00:00 Lagos
        day: "2026-11-04",
        note: "I fixed old answers all day.",
      },
    });
  });

  it("refuses a day that is not a date, in the future or older than 90 days, and an empty or very long note", async () => {
    for (const body of [
      { day: "yesterday", note: "x" },
      { day: "2026-11-20", note: "x" },
      { day: "2026-07-01", note: "x" },
      { day: "2026-11-12", note: "   " },
      { day: "2026-11-12", note: "x".repeat(501) },
    ]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(mockPrisma.timeNote.create).not.toHaveBeenCalled();
  });

  it("before the migration is applied it says so plainly and saves nothing", async () => {
    mockPrisma.timeNote.create.mockRejectedValue(
      Object.assign(new Error("no table"), { code: "P2021" }),
    );
    const res = await post({ day: "2026-11-12", note: "x" });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/not switched on yet/);
  });
});
