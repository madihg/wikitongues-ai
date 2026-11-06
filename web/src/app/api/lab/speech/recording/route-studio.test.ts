import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    prompt: { findUnique: vi.fn() },
    consentGrant: { findFirst: vi.fn() },
    coldAuthorAnswer: { findFirst: vi.fn(), create: vi.fn() },
    speechRecording: { create: vi.fn() },
  },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { POST } from "./route";
import { CONSENT_VERSION } from "@/lib/speech/consent-text";

const original = process.env.SPEECH_LAB_ENABLED;

const post = (body: unknown) =>
  POST(
    new Request("http://test/api/lab/speech/recording", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const base = {
  promptId: "code_001",
  tier: "community_only",
  mimeType: "audio/webm;codecs=opus",
  durationMs: 4200,
};
const studio = {
  ...base,
  studioSessionId: "studio-2026-11-06-ab",
  studioText: "kwa gbo chi nwa kpe",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({ error: null, userId: "r1", role: "RESEARCHER" });
  mockPrisma.prompt.findUnique.mockResolvedValue({
    id: "p-1",
    promptId: "code_001",
    bucket: "orthography",
    isHoldout: false,
    split: "train",
  });
  mockPrisma.consentGrant.findFirst.mockResolvedValue({
    commercialLicensing: true,
    voiceCloning: false,
    speakerId: false,
    consent: { id: "c-1", version: CONSENT_VERSION, method: "written" },
  });
  mockPrisma.speechRecording.create.mockImplementation(
    async ({ data }: { data: { id: string } }) => ({ id: data.id }),
  );
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

const data = () => mockPrisma.speechRecording.create.mock.calls[0][0].data;
const created = () => mockPrisma.speechRecording.create.mock.calls.length;

describe("studio clips on POST /api/lab/speech/recording", () => {
  it("stores the session id and the script line, attaches no answer, and is community_only", async () => {
    const res = await post(studio);
    expect(res.status).toBe(201);
    expect(data()).toMatchObject({
      studioSessionId: "studio-2026-11-06-ab",
      studioText: "kwa gbo chi nwa kpe",
      sourceRef: "studio:studio-2026-11-06-ab",
      tier: "community_only",
      sourceType: "contributor",
      isDemo: false,
    });
    expect(data().coldAuthorAnswerId).toBeNull();
    expect(data().reviewStatus).toBeUndefined();
    expect(mockPrisma.coldAuthorAnswer.create).not.toHaveBeenCalled();
    expect(mockPrisma.coldAuthorAnswer.findFirst).not.toHaveBeenCalled();
  });

  it("sets reviewStatus keep only when the speaker kept the take after the check", async () => {
    await post({ ...studio, studioKeep: true });
    expect(data().reviewStatus).toBe("keep");
  });

  it("refuses any tier but community_only", async () => {
    expect((await post({ ...studio, tier: "licensed" })).status).toBe(400);
    expect((await post({ ...studio, tier: "open" })).status).toBe(400);
    expect(created()).toBe(0);
  });

  it("refuses a bad session id, a missing or empty line, and a non-boolean keep", async () => {
    expect((await post({ ...studio, studioSessionId: "bad id" })).status).toBe(400);
    expect((await post({ ...studio, studioText: "" })).status).toBe(400);
    expect((await post({ ...studio, studioText: undefined })).status).toBe(400);
    expect((await post({ ...studio, studioText: "x".repeat(2001) })).status).toBe(400);
    expect((await post({ ...studio, studioKeep: "true" })).status).toBe(400);
    expect(created()).toBe(0);
  });

  it("refuses a studio line for a frozen prompt, before consent is read", async () => {
    mockPrisma.prompt.findUnique.mockResolvedValue({
      id: "p-1",
      promptId: "code_001",
      bucket: "orthography",
      isHoldout: true,
      split: "train",
    });
    const res = await post(studio);
    expect(res.status).toBe(403);
    expect(mockPrisma.consentGrant.findFirst).not.toHaveBeenCalled();
    expect(created()).toBe(0);
  });

  it("428 without consent, like every other clip", async () => {
    mockPrisma.consentGrant.findFirst.mockResolvedValue(null);
    expect((await post(studio)).status).toBe(428);
  });

  it("parity: a request without a studio session writes no studio fields", async () => {
    await post({ ...base, studioKeep: true, studioText: "ignored without a session" });
    expect(data()).not.toHaveProperty("studioSessionId");
    expect(data()).not.toHaveProperty("studioText");
    expect(data()).not.toHaveProperty("sourceRef");
    expect(data().reviewStatus).toBeUndefined();
  });
});
