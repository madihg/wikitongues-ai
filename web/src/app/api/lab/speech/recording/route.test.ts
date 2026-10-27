import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

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
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const valid = {
  promptId: "code_001",
  tier: "community_only",
  mimeType: "audio/webm;codecs=opus",
  durationMs: 4200,
};

const PROMPT = {
  id: "p-1",
  promptId: "code_001",
  bucket: "orthography",
  isHoldout: false,
  split: "train",
};
const GRANT = {
  commercialLicensing: true,
  voiceCloning: false,
  speakerId: false,
  consent: { id: "c-1", version: CONSENT_VERSION, method: "written" },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "r1",
    role: "RESEARCHER",
  });
  mockPrisma.prompt.findUnique.mockResolvedValue(PROMPT);
  mockPrisma.consentGrant.findFirst.mockResolvedValue(GRANT);
  mockPrisma.coldAuthorAnswer.findFirst.mockResolvedValue({ id: "ans-1" });
  mockPrisma.coldAuthorAnswer.create.mockResolvedValue({ id: "ans-new" });
  mockPrisma.speechRecording.create.mockImplementation(
    async ({ data }: { data: { id: string } }) => ({ id: data.id }),
  );
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

const created = () => mockPrisma.speechRecording.create.mock.calls.length;

describe("POST /api/lab/speech/recording: gating", () => {
  it("404 when the flag is off", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    expect((await post(valid)).status).toBe(404);
    expect(created()).toBe(0);
  });

  it("403 for a non-researcher", async () => {
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    });
    expect((await post(valid)).status).toBe(403);
    expect(created()).toBe(0);
  });
});

describe("POST /api/lab/speech/recording: refusals", () => {
  it("400 when the tier is missing (there is no default)", async () => {
    const { tier: _omit, ...noTier } = valid;
    void _omit;
    const res = await post(noTier);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/tier is required/);
    expect(created()).toBe(0);
  });

  it("400 for an empty or unknown tier", async () => {
    expect((await post({ ...valid, tier: "" })).status).toBe(400);
    expect((await post({ ...valid, tier: "public" })).status).toBe(400);
    expect((await post({ ...valid, tier: null })).status).toBe(400);
  });

  it("400 for a clip over 30 seconds, and none at exactly 30", async () => {
    expect((await post({ ...valid, durationMs: 30_001 })).status).toBe(400);
    expect((await post({ ...valid, durationMs: 30_000 })).status).toBe(201);
  });

  it("400 for a declared size over 4 MB, and none at exactly 4 MB", async () => {
    expect(
      (await post({ ...valid, sizeBytes: 4 * 1024 * 1024 + 1 })).status,
    ).toBe(400);
    expect((await post({ ...valid, sizeBytes: 4 * 1024 * 1024 })).status).toBe(
      201,
    );
  });

  it("400 for an unknown language; igala is the default; english is accepted", async () => {
    expect((await post({ ...valid, language: "french" })).status).toBe(400);
    expect((await post({ ...valid, language: 7 })).status).toBe(400);
    await post(valid);
    await post({ ...valid, language: "english" });
    const calls = mockPrisma.speechRecording.create.mock.calls;
    expect(calls[0][0].data.language).toBe("igala");
    expect(calls[1][0].data.language).toBe("english");
  });

  it("keeps sanitised quality metrics, drops junk, and never fails on them", async () => {
    const quality = {
      durationMs: 4100,
      leadingSilenceMs: 200,
      trailingSilenceMs: 400,
      speechShare: 0.8,
      rmsDbfs: -21.3,
      peakDbfs: -3,
      clippingShare: 0,
      syllables: 9,
      syllablesPerSecond: 2.4,
      retakes: 1,
      evil: "<script>",
    };
    expect((await post({ ...valid, quality })).status).toBe(201);
    expect((await post({ ...valid, quality: "nonsense" })).status).toBe(201);
    const calls = mockPrisma.speechRecording.create.mock.calls;
    expect(calls[0][0].data.quality).toMatchObject({
      durationMs: 4100,
      rmsDbfs: -21.3,
      retakes: 1,
    });
    expect(calls[0][0].data.quality).not.toHaveProperty("evil");
    expect(calls[1][0].data).not.toHaveProperty("quality");
  });

  it("400 for a non-audio mime type, a bad duration, or a malformed body", async () => {
    expect((await post({ ...valid, mimeType: "text/html" })).status).toBe(400);
    expect((await post({ ...valid, durationMs: 0 })).status).toBe(400);
    expect((await post({ ...valid, durationMs: 1.5 })).status).toBe(400);
    expect((await post({ ...valid, durationMs: "4200" })).status).toBe(400);
    expect((await post("not json")).status).toBe(400);
    expect((await post({ ...valid, promptId: undefined })).status).toBe(400);
  });

  it("404 for an unknown prompt", async () => {
    mockPrisma.prompt.findUnique.mockResolvedValue(null);
    expect((await post(valid)).status).toBe(404);
    expect(created()).toBe(0);
  });

  it("403 with no detail for a frozen prompt (isHoldout), before consent is even read", async () => {
    mockPrisma.prompt.findUnique.mockResolvedValue({
      ...PROMPT,
      isHoldout: true,
    });
    const res = await post(valid);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(mockPrisma.consentGrant.findFirst).not.toHaveBeenCalled();
    expect(created()).toBe(0);
  });

  it("403 for a prompt in split test", async () => {
    mockPrisma.prompt.findUnique.mockResolvedValue({
      ...PROMPT,
      split: "test",
    });
    expect((await post(valid)).status).toBe(403);
    expect(created()).toBe(0);
  });

  it("428 when there is no consent grant, or only one for an older version", async () => {
    mockPrisma.consentGrant.findFirst.mockResolvedValue(null);
    const none = await post(valid);
    expect(none.status).toBe(428);
    expect((await none.json()).code).toBe("consent_required");
    mockPrisma.consentGrant.findFirst.mockResolvedValue({
      ...GRANT,
      consent: { ...GRANT.consent, version: "2026-01-01-v0" },
    });
    expect((await post(valid)).status).toBe(428);
    expect(created()).toBe(0);
  });

  it("400 when the tier or an opt-in goes beyond the speaker's consent answers", async () => {
    mockPrisma.consentGrant.findFirst.mockResolvedValue({
      ...GRANT,
      commercialLicensing: false,
    });
    expect((await post({ ...valid, tier: "licensed" })).status).toBe(400);
    expect((await post({ ...valid, voiceCloningOptIn: true })).status).toBe(
      400,
    );
    expect((await post({ ...valid, speakerIdOptIn: true })).status).toBe(400);
    expect(created()).toBe(0);
  });

  it("400 for a non-boolean opt-in (the string false must never be a yes)", async () => {
    expect((await post({ ...valid, voiceCloningOptIn: "false" })).status).toBe(
      400,
    );
  });

  it("404 for an attached answer that is not the researcher's own for this prompt", async () => {
    mockPrisma.coldAuthorAnswer.findFirst.mockResolvedValue(null);
    expect(
      (await post({ ...valid, coldAuthorAnswerId: "someone-elses" })).status,
    ).toBe(404);
    expect(
      mockPrisma.coldAuthorAnswer.findFirst.mock.calls[0][0].where,
    ).toEqual({
      id: "someone-elses",
      annotatorId: "r1",
      promptId: "p-1",
    });
    expect(created()).toBe(0);
  });

  it("400 when both an answer id and answer text are sent, or the text is empty", async () => {
    expect(
      (await post({ ...valid, coldAuthorAnswerId: "a", answerText: "x" }))
        .status,
    ).toBe(400);
    expect((await post({ ...valid, answerText: "   " })).status).toBe(400);
  });
});

describe("POST /api/lab/speech/recording: happy path", () => {
  it("an answer written in the Lab is created with no consent pre-granted", async () => {
    const res = await post({ ...valid, coldAuthorAnswerId: undefined, answerText: "an answer" });
    expect(res.status).toBe(201);
    const data = mockPrisma.coldAuthorAnswer.create.mock.calls[0][0].data;
    expect(data.consentBenchmark).toBe(false);
    expect(data.consentTraining).toBe(false);
  });

  it("creates the row with the chosen tier and consent, and returns the audio URL", async () => {
    const res = await post({ ...valid, tier: "open", dialect: null });
    expect(res.status).toBe(201);
    const body = await res.json();
    const data = mockPrisma.speechRecording.create.mock.calls[0][0].data;

    expect(data).toMatchObject({
      promptId: "p-1",
      annotatorId: "r1",
      tier: "open",
      consentId: "c-1",
      consentVersion: CONSENT_VERSION,
      consentMethod: "written",
      voiceCloningOptIn: false,
      speakerIdOptIn: false,
      sourceType: "contributor",
      isTestSet: false,
      isDemo: false,
      demoSessionId: null,
      durationMs: 4200,
      sampleRate: 48000,
      mimeType: "audio/webm;codecs=opus",
    });
    // The path is clips/<id>.webm with the row's own id, and carries no text.
    expect(data.storagePath).toBe(`clips/${data.id}.webm`);
    // Rights and publication are never set here.
    expect(data).not.toHaveProperty("rightsStatus");
    expect(data).not.toHaveProperty("publishedOpenAt");
    expect(data).not.toHaveProperty("uploadedAt");

    expect(body.id).toBe(data.id);
    expect(body.audioUrl).toBe(`/api/lab/speech/recording/${data.id}/audio`);
    expect(body).not.toHaveProperty("upload");
    expect(body.limits).toEqual({
      maxBytes: 4 * 1024 * 1024,
      maxDurationMs: 30000,
    });
    // The row carries no audio yet: bytes come with the PUT, which also sets
    // uploadedAt.
    expect(data).not.toHaveProperty("bytes");
  });

  it("stores the row as community_only when the speaker chose that", async () => {
    await post(valid);
    expect(mockPrisma.speechRecording.create.mock.calls[0][0].data.tier).toBe(
      "community_only",
    );
  });

  it("allows licensed when the consent answers allow licensing", async () => {
    expect((await post({ ...valid, tier: "licensed" })).status).toBe(201);
    expect(mockPrisma.speechRecording.create.mock.calls[0][0].data.tier).toBe(
      "licensed",
    );
  });

  it("allows the cloning opt-in when consent allows it", async () => {
    mockPrisma.consentGrant.findFirst.mockResolvedValue({
      ...GRANT,
      voiceCloning: true,
    });
    await post({ ...valid, voiceCloningOptIn: true });
    expect(
      mockPrisma.speechRecording.create.mock.calls[0][0].data.voiceCloningOptIn,
    ).toBe(true);
  });

  it("attaches the researcher's own locked answer", async () => {
    await post({ ...valid, coldAuthorAnswerId: "ans-1" });
    expect(
      mockPrisma.speechRecording.create.mock.calls[0][0].data
        .coldAuthorAnswerId,
    ).toBe("ans-1");
    expect(mockPrisma.coldAuthorAnswer.create).not.toHaveBeenCalled();
  });

  it("locks a new answer in the same call when answerText is sent", async () => {
    const res = await post({
      ...valid,
      answerText: "  a new stand-in answer  ",
    });
    expect(res.status).toBe(201);
    expect(
      mockPrisma.coldAuthorAnswer.create.mock.calls[0][0].data,
    ).toMatchObject({
      promptId: "p-1",
      annotatorId: "r1",
      answerText: "a new stand-in answer",
      isDemo: false,
    });
    expect(
      mockPrisma.speechRecording.create.mock.calls[0][0].data
        .coldAuthorAnswerId,
    ).toBe("ans-new");
    expect((await res.json()).coldAuthorAnswerId).toBe("ans-new");
  });

  it("demo: stores isDemo true with the session id", async () => {
    await post({
      ...valid,
      demoSessionId: "sess-1",
      answerText: "demo answer",
    });
    expect(
      mockPrisma.speechRecording.create.mock.calls[0][0].data,
    ).toMatchObject({
      isDemo: true,
      demoSessionId: "sess-1",
    });
    expect(
      mockPrisma.coldAuthorAnswer.create.mock.calls[0][0].data,
    ).toMatchObject({
      isDemo: true,
      demoSessionId: "sess-1",
    });
  });
});
