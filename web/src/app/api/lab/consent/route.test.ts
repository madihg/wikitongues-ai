import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    consent: { upsert: vi.fn() },
    consentGrant: { create: vi.fn(), findFirst: vi.fn() },
  },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { GET, POST } from "./route";
import {
  CONSENT_VERSION,
  consentTextFor,
  consentTextHash,
} from "@/lib/speech/consent-text";

const original = process.env.SPEECH_LAB_ENABLED;

function asResearcher() {
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "r1",
    role: "RESEARCHER",
  });
}

function post(body: unknown) {
  return POST(
    new Request("http://test/api/lab/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const valid = { accepted: true, version: CONSENT_VERSION };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  asResearcher();
  mockPrisma.consent.upsert.mockResolvedValue({
    id: "c1",
    version: CONSENT_VERSION,
    method: "written",
  });
  mockPrisma.consentGrant.create.mockResolvedValue({
    id: "g1",
    grantedAt: new Date("2026-10-19T00:00:00Z"),
  });
  mockPrisma.consentGrant.findFirst.mockResolvedValue(null);
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("/api/lab/consent gating", () => {
  it("404 for GET and POST when the flag is off", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    expect((await GET()).status).toBe(404);
    expect((await post(valid)).status).toBe(404);
    expect(mockPrisma.consentGrant.create).not.toHaveBeenCalled();
  });

  it("403 for GET and POST for a non-researcher", async () => {
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    });
    expect((await GET()).status).toBe(403);
    expect((await post(valid)).status).toBe(403);
    expect(mockPrisma.consent.upsert).not.toHaveBeenCalled();
  });
});

describe("POST /api/lab/consent", () => {
  it("records a grant with all four flags false when none is sent", async () => {
    const res = await post(valid);
    expect(res.status).toBe(201);
    expect(mockPrisma.consentGrant.create.mock.calls[0][0].data).toMatchObject({
      consentId: "c1",
      userId: "r1",
      commercialLicensing: false,
      crossBorder: false,
      voiceCloning: false,
      speakerId: false,
    });
  });

  it("records each flag separately", async () => {
    await post({ ...valid, voiceCloning: true });
    expect(mockPrisma.consentGrant.create.mock.calls[0][0].data).toMatchObject({
      commercialLicensing: false,
      crossBorder: false,
      voiceCloning: true,
      speakerId: false,
    });
  });

  it("stores the text verbatim with its sha256", async () => {
    await post(valid);
    const arg = mockPrisma.consent.upsert.mock.calls[0][0];
    const text = consentTextFor("written");
    expect(arg.create).toMatchObject({
      version: CONSENT_VERSION,
      language: "en",
      method: "written",
      text,
      textHash: consentTextHash(text),
    });
    expect(arg.where.version_language_method_textHash.textHash).toBe(
      consentTextHash(text),
    );
  });

  it("stores the oral script when the method is oral", async () => {
    await post({ ...valid, method: "oral" });
    expect(mockPrisma.consent.upsert.mock.calls[0][0].create.text).toBe(
      consentTextFor("oral"),
    );
  });

  it("400 unless accepted is exactly true", async () => {
    for (const accepted of [false, "true", 1, undefined]) {
      const res = await post({ version: CONSENT_VERSION, accepted });
      expect(res.status, String(accepted)).toBe(400);
    }
    expect(mockPrisma.consentGrant.create).not.toHaveBeenCalled();
  });

  it("409 when the speaker read an older version", async () => {
    const res = await post({ accepted: true, version: "2020-01-01-v0" });
    expect(res.status).toBe(409);
    expect(mockPrisma.consentGrant.create).not.toHaveBeenCalled();
  });

  it("400 for a non-boolean flag (the string false must never be a yes)", async () => {
    const res = await post({ ...valid, commercialLicensing: "false" });
    expect(res.status).toBe(400);
    expect(mockPrisma.consentGrant.create).not.toHaveBeenCalled();
  });

  it("400 for an unknown method and for a malformed body", async () => {
    expect((await post({ ...valid, method: "telepathy" })).status).toBe(400);
    expect((await post("not json")).status).toBe(400);
  });
});

describe("GET /api/lab/consent", () => {
  it("needsConsent with no grant, and ships the text and four questions", async () => {
    const body = await (await GET()).json();
    expect(body.needsConsent).toBe(true);
    expect(body.grant).toBeNull();
    expect(body.currentVersion).toBe(CONSENT_VERSION);
    expect(body.questions).toHaveLength(4);
    expect(body.written[0].id).toBe("withdraw");
  });

  it("returns the current grant and clears needsConsent when the version matches", async () => {
    mockPrisma.consentGrant.findFirst.mockResolvedValue({
      id: "g1",
      grantedAt: new Date("2026-10-19T00:00:00Z"),
      commercialLicensing: true,
      crossBorder: false,
      voiceCloning: false,
      speakerId: false,
      consent: { version: CONSENT_VERSION, method: "written" },
    });
    const body = await (await GET()).json();
    expect(body.needsConsent).toBe(false);
    expect(body.grant).toMatchObject({
      version: CONSENT_VERSION,
      commercialLicensing: true,
      crossBorder: false,
    });
    expect(mockPrisma.consentGrant.findFirst.mock.calls[0][0].where).toEqual({
      userId: "r1",
    });
  });

  it("needsConsent again when the stored grant is for an older version", async () => {
    mockPrisma.consentGrant.findFirst.mockResolvedValue({
      id: "g0",
      grantedAt: new Date("2026-01-01T00:00:00Z"),
      commercialLicensing: true,
      crossBorder: true,
      voiceCloning: true,
      speakerId: true,
      consent: { version: "2026-01-01-v0", method: "written" },
    });
    expect((await (await GET()).json()).needsConsent).toBe(true);
  });
});
