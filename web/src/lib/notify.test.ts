import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { speechAlert: { findFirst: vi.fn(), create: vi.fn() } },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { notify } from "./notify";

const NOW = new Date("2026-11-07T02:30:00Z");
const saved = {
  key: process.env.RESEND_API_KEY,
  to: process.env.ALERT_EMAIL_TO,
};
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.RESEND_API_KEY;
  delete process.env.ALERT_EMAIL_TO;
  mockPrisma.speechAlert.findFirst.mockResolvedValue(null);
  mockPrisma.speechAlert.create.mockResolvedValue({ id: "a1" });
  fetchMock.mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const [k, v] of [
    ["RESEND_API_KEY", saved.key],
    ["ALERT_EMAIL_TO", saved.to],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("notify", () => {
  it("writes one row and sends no email when Resend is not configured", async () => {
    expect(await notify("job_failed", ["job j1 failed: HTTP 502"], { now: NOW, runId: "r1" })).toBe(true);
    expect(mockPrisma.speechAlert.create).toHaveBeenCalledWith({
      data: { kind: "job_failed", message: "job j1 failed: HTTP 502", runId: "r1" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dedupes: a second alert of the same kind the same night writes and sends nothing", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.ALERT_EMAIL_TO = "a@example.com";
    mockPrisma.speechAlert.findFirst.mockResolvedValue({ id: "earlier" });
    expect(await notify("cap_reached", ["spend 200.00"], { now: NOW })).toBe(false);
    expect(mockPrisma.speechAlert.create).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("looks for the same kind since the start of the UTC day", async () => {
    await notify("regressed", ["cer +1.5"], { now: NOW });
    expect(mockPrisma.speechAlert.findFirst).toHaveBeenCalledWith({
      where: { kind: "regressed", createdAt: { gte: new Date("2026-11-07T00:00:00Z") } },
      select: { id: true },
    });
  });

  it("sends one email through Resend's REST API when both env vars are set", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.ALERT_EMAIL_TO = "a@example.com, b@example.com";
    await notify("frozen_set_missing", ["0 exam clips"], { now: NOW });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.authorization).toBe("Bearer re_test");
    const body = JSON.parse(init.body);
    expect(body.to).toEqual(["a@example.com", "b@example.com"]);
    expect(body.subject).toBe("Igala speech loop: frozen_set_missing");
    expect(body.text).toBe("0 exam clips");
  });

  it("never throws: a failing database or email returns false or still counts the row", async () => {
    mockPrisma.speechAlert.create.mockRejectedValue(new Error("db down"));
    expect(await notify("job_failed", ["x"], { now: NOW })).toBe(false);

    mockPrisma.speechAlert.create.mockResolvedValue({ id: "a2" });
    process.env.RESEND_API_KEY = "re_test";
    process.env.ALERT_EMAIL_TO = "a@example.com";
    fetchMock.mockRejectedValue(new Error("network"));
    expect(await notify("job_failed", ["x"], { now: NOW })).toBe(true);
  });

  it("caps each line's length", async () => {
    await notify("job_failed", ["x".repeat(1000)], { now: NOW });
    expect(mockPrisma.speechAlert.create.mock.calls[0][0].data.message).toHaveLength(300);
  });
});
