import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    speakerProfile: { findUnique: vi.fn(), upsert: vi.fn() },
    consentGrant: { findFirst: vi.fn() },
    speechRecording: { updateMany: vi.fn(), update: vi.fn() },
  },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { GET, PUT } from "./route";
import { CONSENT_VERSION } from "@/lib/speech/consent-text";

const original = process.env.SPEECH_LAB_ENABLED;
const put = (body: unknown) =>
  PUT(
    new Request("http://test/api/lab/speech/clip-choice", {
      method: "PUT",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
const grant = (over: Record<string, unknown> = {}) => ({
  grantedAt: new Date("2026-11-01T10:00:00Z"),
  withdrawn: false,
  commercialLicensing: true,
  voiceCloning: false,
  consent: { version: CONSENT_VERSION },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "u1",
    role: "RESEARCHER",
  });
  mockPrisma.consentGrant.findFirst.mockResolvedValue(grant());
  mockPrisma.speakerProfile.findUnique.mockResolvedValue(null);
  mockPrisma.speakerProfile.upsert.mockResolvedValue({ userId: "u1" });
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("GET /api/lab/speech/clip-choice", () => {
  it("404 with the flag off, 403 for a non-speaker, before any query", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    expect((await GET()).status).toBe(404);
    process.env.SPEECH_LAB_ENABLED = "1";
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    });
    expect((await GET()).status).toBe(403);
    expect(mockPrisma.speakerProfile.findUnique).not.toHaveBeenCalled();
  });

  it("says null (ask) for a speaker who never chose", async () => {
    expect(await (await GET()).json()).toEqual({ choice: null });
    mockPrisma.speakerProfile.findUnique.mockResolvedValue({
      defaultTier: null,
      defaultVoiceCloning: null,
      tierChosenAt: null,
    });
    expect(await (await GET()).json()).toEqual({ choice: null });
  });

  it("returns the remembered choice, reading only the caller's own row", async () => {
    mockPrisma.speakerProfile.findUnique.mockResolvedValue({
      defaultTier: "community_only",
      defaultVoiceCloning: false,
      tierChosenAt: new Date("2026-11-01T10:05:00Z"),
    });
    expect(await (await GET()).json()).toEqual({
      choice: { tier: "community_only", voiceCloning: false },
    });
    expect(mockPrisma.speakerProfile.findUnique.mock.calls[0][0].where).toEqual(
      { userId: "u1" },
    );
    expect(mockPrisma.consentGrant.findFirst.mock.calls[0][0].where).toEqual({
      userId: "u1",
    });
  });

  it("asks again after a new consent grant, a withdrawal, or with no consent", async () => {
    mockPrisma.speakerProfile.findUnique.mockResolvedValue({
      defaultTier: "open",
      defaultVoiceCloning: false,
      tierChosenAt: new Date("2026-11-01T10:05:00Z"),
    });
    for (const g of [
      grant({ grantedAt: new Date("2026-11-20T00:00:00Z") }),
      grant({ withdrawn: true }),
      grant({ consent: { version: "2026-01-01-v0" } }),
      null,
    ]) {
      mockPrisma.consentGrant.findFirst.mockResolvedValue(g);
      expect(await (await GET()).json()).toEqual({ choice: null });
    }
  });
});

describe("PUT /api/lab/speech/clip-choice", () => {
  it("remembers the choice with the time it was made", async () => {
    const before = Date.now();
    const res = await put({ tier: "community_only" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      choice: { tier: "community_only", voiceCloning: false },
    });
    const call = mockPrisma.speakerProfile.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ userId: "u1" });
    expect(call.update.defaultTier).toBe("community_only");
    expect(call.update.defaultVoiceCloning).toBe(false);
    expect(call.update.tierChosenAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(call.create).toMatchObject({ userId: "u1", defaultTier: "community_only" });
  });

  it("writes only the three choice columns, never the profile's other fields", async () => {
    await put({ tier: "open", dialect: "ankpa", mayShareDemographics: true });
    const call = mockPrisma.speakerProfile.upsert.mock.calls[0][0];
    expect(Object.keys(call.update).sort()).toEqual([
      "defaultTier",
      "defaultVoiceCloning",
      "tierChosenAt",
    ]);
  });

  it("changes no recording: every clip keeps the tier it was saved with", async () => {
    await put({ tier: "open" });
    expect(mockPrisma.speechRecording.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.speechRecording.update).not.toHaveBeenCalled();
    const src = readFileSync(join(__dirname, "route.ts"), "utf8");
    expect(src).not.toContain("prisma.speechRecording");
  });

  it("400 without a tier (there is no default), or with an unknown one", async () => {
    for (const body of [{}, { tier: null }, { tier: "public" }, "not json"]) {
      expect((await put(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(mockPrisma.speakerProfile.upsert).not.toHaveBeenCalled();
  });

  it("400 for a tier or opt-in the consent answers do not allow", async () => {
    mockPrisma.consentGrant.findFirst.mockResolvedValue(
      grant({ commercialLicensing: false }),
    );
    const licensed = await put({ tier: "licensed" });
    expect(licensed.status).toBe(400);
    expect((await licensed.json()).error).toBe(
      "Your consent answers do not allow licensing.",
    );
    const cloning = await put({ tier: "open", voiceCloning: true });
    expect(cloning.status).toBe(400);
    expect(mockPrisma.speakerProfile.upsert).not.toHaveBeenCalled();
  });

  it("428 with no consent for the current version, or after a withdrawal", async () => {
    for (const g of [
      null,
      grant({ withdrawn: true }),
      grant({ consent: { version: "2026-01-01-v0" } }),
    ]) {
      mockPrisma.consentGrant.findFirst.mockResolvedValue(g);
      const res = await put({ tier: "open" });
      expect(res.status).toBe(428);
      expect((await res.json()).code).toBe("consent_required");
    }
    expect(mockPrisma.speakerProfile.upsert).not.toHaveBeenCalled();
  });
});

describe("the profile form and the clip choice never overwrite each other", () => {
  it("the profile route's PUT selects and writes only its own four fields", () => {
    const src = readFileSync(join(__dirname, "..", "profile", "route.ts"), "utf8");
    for (const col of ["defaultTier", "defaultVoiceCloning", "tierChosenAt"]) {
      expect(src).not.toContain(col);
    }
  });
});

describe("the recording route still requires a tier on every clip", () => {
  it("no clip is saved without one, remembered choice or not", () => {
    const src = readFileSync(
      join(__dirname, "..", "recording", "route.ts"),
      "utf8",
    );
    expect(src).toContain('return bad("tier is required: open, licensed or community_only")');
    expect(src).not.toContain("defaultTier");
  });
});
