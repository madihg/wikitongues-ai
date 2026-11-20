import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockPrisma, mockGate, mockLead, mockEdit } = vi.hoisted(() => ({
  mockPrisma: {
    speechRecording: { findUnique: vi.fn(), update: vi.fn() },
    speechCheck: { upsert: vi.fn() },
  },
  mockGate: vi.fn(),
  mockLead: vi.fn(),
  mockEdit: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/speech/lab-route", () => ({ labGate: mockGate }));
vi.mock("@/lib/admin/lead-route", () => ({ sessionIsLead: mockLead }));
vi.mock("@/lib/answer-edit", () => ({ applyAnswerEdit: mockEdit }));
vi.mock("next-auth", () => ({
  getServerSession: async () => ({ user: { id: "lead", role: "RESEARCHER" } }),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new Request("http://test/api/lab/speech/check/fix", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
const clip = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  annotatorId: "speaker",
  uploadedAt: new Date(),
  reviewStatus: "wrong_text",
  isDemo: false,
  language: "igala",
  coldAuthorAnswerId: "a1",
  prompt: { isHoldout: false, split: "train" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGate.mockResolvedValue({ error: null, userId: "lead" });
  mockLead.mockResolvedValue(true);
  mockPrisma.speechRecording.findUnique.mockResolvedValue(clip());
  mockPrisma.speechRecording.update.mockResolvedValue({ id: "c1" });
  mockPrisma.speechCheck.upsert.mockResolvedValue({ id: "k1" });
  mockEdit.mockResolvedValue({ status: 200, body: { changed: ["answerText"] } });
});
afterEach(() => vi.clearAllMocks());

describe("POST check/fix (research leads only)", () => {
  it("a checker who is not a lead is refused before anything is read", async () => {
    mockLead.mockResolvedValue(false);
    const res = await post({ recordingId: "c1", answerText: "new" });
    expect(res.status).toBe(403);
    expect(mockPrisma.speechRecording.findUnique).not.toHaveBeenCalled();
    expect(mockEdit).not.toHaveBeenCalled();
  });

  it("a lead's fix goes through the edit log with a save id naming the clip, and the clip then matches", async () => {
    const res = await post({ recordingId: "c1", answerText: "new" });
    expect(res.status).toBe(200);
    const args = mockEdit.mock.calls[0][0];
    expect(args).toMatchObject({ type: "cold", id: "a1", userId: "lead", role: "RESEARCHER" });
    expect(args.body.answerText).toBe("new");
    expect(args.body.saveId).toMatch(/^check-c1-[a-z0-9]{8}$/);
    expect(mockPrisma.speechCheck.upsert.mock.calls[0][0].update.verdict).toBe("matches");
    expect(mockPrisma.speechRecording.update.mock.calls[0][0].data).toEqual({ reviewStatus: "keep" });
  });

  it("refuses the lead's own clip, a frozen prompt, and a clip that is gone", async () => {
    mockPrisma.speechRecording.findUnique.mockResolvedValue(clip({ annotatorId: "lead" }));
    expect((await post({ recordingId: "c1", answerText: "x" })).status).toBe(403);
    mockPrisma.speechRecording.findUnique.mockResolvedValue(
      clip({ prompt: { isHoldout: false, split: "test" } }),
    );
    expect((await post({ recordingId: "c1", answerText: "x" })).status).toBe(403);
    mockPrisma.speechRecording.findUnique.mockResolvedValue(clip({ reviewStatus: "withdrawn" }));
    expect((await post({ recordingId: "c1", answerText: "x" })).status).toBe(404);
    expect(mockEdit).not.toHaveBeenCalled();
  });

  it("no change is a 400 and the verdict is left alone", async () => {
    mockEdit.mockResolvedValue({ status: 200, body: { changed: [] } });
    expect((await post({ recordingId: "c1", answerText: "same" })).status).toBe(400);
    expect(mockPrisma.speechCheck.upsert).not.toHaveBeenCalled();
  });

  it("a bad body is a 400", async () => {
    expect((await post({ recordingId: "c1" })).status).toBe(400);
    expect((await post({ answerText: "x" })).status).toBe(400);
  });
});
