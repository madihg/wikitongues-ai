import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockSession, mockWaiting, mockTone } = vi.hoisted(() => ({
  mockSession: vi.fn(),
  mockWaiting: {
    countAnnotateWaiting: vi.fn(),
    loadWaiting: vi.fn(),
  },
  mockTone: { toneCount: vi.fn() },
}));
vi.mock("next-auth", () => ({ getServerSession: mockSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/waiting", () => mockWaiting);
vi.mock("@/lib/tone/tone-pass", () => mockTone);

import { GET } from "./route";
import { DEFAULT_WORK_ORDER } from "@/lib/work-flow";

const env = { ...process.env };
const as = (role: string) =>
  mockSession.mockResolvedValue({ user: { id: "u1", role, email: "x@example.com" } });

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SPEECH_LAB_ENABLED;
  delete process.env.SPEECH_LAYER_ANNOTATORS;
  delete process.env.ANNOTATE_ORDER;
  as("ANNOTATOR");
  mockWaiting.countAnnotateWaiting.mockResolvedValue(30);
  mockWaiting.loadWaiting.mockResolvedValue({
    record: 12,
    listen: 2,
    check: 4,
    tone: 45,
    fix: 0,
    fixTotal: 0,
  });
  mockTone.toneCount.mockResolvedValue({ waiting: 45, done: 0 });
});
afterEach(() => {
  process.env = { ...env };
});

describe("GET /api/annotator/work", () => {
  it("401 without a session", async () => {
    mockSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("speech off: write and tone only, in the default order", async () => {
    const j = await (await GET()).json();
    expect(j.order).toEqual(DEFAULT_WORK_ORDER);
    expect(j.counts).toEqual({ write: 30, tone: 45 });
    expect(mockWaiting.loadWaiting).toHaveBeenCalledWith("u1", {
      speech: false,
      editing: false,
    });
  });

  it("speech on for an annotator only with the annotator layer flag too", async () => {
    process.env.SPEECH_LAB_ENABLED = "1";
    expect((await (await GET()).json()).counts.record).toBeUndefined();
    process.env.SPEECH_LAYER_ANNOTATORS = "1";
    const j = await (await GET()).json();
    expect(j.counts).toEqual({ write: 30, record: 12, check: 4, listen: 2, tone: 45 });
  });

  it("a researcher has speech with the lab flag alone", async () => {
    process.env.SPEECH_LAB_ENABLED = "1";
    as("RESEARCHER");
    const j = await (await GET()).json();
    expect(j.counts.record).toBe(12);
  });

  it("no Tone marks tab before items are given; given and all marked, a tab at zero", async () => {
    mockTone.toneCount.mockResolvedValue({ waiting: 0, done: 0 });
    expect((await (await GET()).json()).counts.tone).toBeUndefined();
    mockTone.toneCount.mockResolvedValue({ waiting: 0, done: 12 });
    expect((await (await GET()).json()).counts.tone).toBe(0);
  });

  it("the leads' order comes from ANNOTATE_ORDER, never hiding a kind", async () => {
    process.env.ANNOTATE_ORDER = "tone,write";
    const j = await (await GET()).json();
    expect(j.order).toEqual(["tone", "write", "record", "check", "listen"]);
  });
});
