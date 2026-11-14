import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { mockPrisma, mockRequireResearcher } = vi.hoisted(() => ({
  mockPrisma: {
    speakerProfile: { findUnique: vi.fn(), upsert: vi.fn() },
  },
  mockRequireResearcher: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/api-auth", () => ({ requireResearcher: mockRequireResearcher }));

import { GET, PUT } from "./route";

const original = process.env.SPEECH_LAB_ENABLED;
const put = (body: unknown) =>
  PUT(
    new Request("http://test/api/lab/speech/profile", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SPEECH_LAB_ENABLED = "1";
  mockRequireResearcher.mockResolvedValue({
    error: null,
    userId: "u1",
    role: "RESEARCHER",
  });
  mockPrisma.speakerProfile.findUnique.mockResolvedValue(null);
  mockPrisma.speakerProfile.upsert.mockImplementation(
    async (a: { update: object }) => a.update,
  );
});
afterEach(() => {
  if (original === undefined) delete process.env.SPEECH_LAB_ENABLED;
  else process.env.SPEECH_LAB_ENABLED = original;
});

describe("/api/lab/speech/profile", () => {
  it("404 with the flag off, 403 for a non-speaker", async () => {
    delete process.env.SPEECH_LAB_ENABLED;
    expect((await GET()).status).toBe(404);
    process.env.SPEECH_LAB_ENABLED = "1";
    mockRequireResearcher.mockResolvedValue({
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      userId: null,
      role: null,
    });
    expect((await put({ mayShareDemographics: false })).status).toBe(403);
    expect(mockPrisma.speakerProfile.upsert).not.toHaveBeenCalled();
  });

  it("GET returns an empty profile with sharing off when none is saved", async () => {
    const body = await (await GET()).json();
    expect(body.profile).toEqual({
      dialect: null,
      ageBand: null,
      gender: null,
      mayShareDemographics: false,
    });
  });

  it("PUT saves the caller's own row only, every field optional", async () => {
    const res = await put({ mayShareDemographics: false });
    expect(res.status).toBe(200);
    const arg = mockPrisma.speakerProfile.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: "u1" });
    expect(arg.update).toEqual({
      dialect: null,
      ageBand: null,
      gender: null,
      mayShareDemographics: false,
    });
  });

  it("PUT stores chosen values and the sharing choice", async () => {
    await put({
      dialect: "ankpa",
      ageBand: "30_44",
      gender: "woman",
      mayShareDemographics: true,
    });
    expect(mockPrisma.speakerProfile.upsert.mock.calls[0][0].update).toEqual({
      dialect: "ankpa",
      ageBand: "30_44",
      gender: "woman",
      mayShareDemographics: true,
    });
  });

  it("an empty string or null is prefer not to say", async () => {
    await put({
      dialect: "",
      ageBand: null,
      gender: "",
      mayShareDemographics: true,
    });
    expect(mockPrisma.speakerProfile.upsert.mock.calls[0][0].update).toMatchObject({
      dialect: null,
      ageBand: null,
      gender: null,
    });
  });

  it("400 on an unknown value, a missing sharing flag or a bad body", async () => {
    expect((await put({ ageBand: "ancient", mayShareDemographics: true })).status).toBe(400);
    expect((await put({ gender: "x", mayShareDemographics: true })).status).toBe(400);
    expect((await put({ dialect: "nowhere", mayShareDemographics: true })).status).toBe(400);
    expect((await put({ dialect: "ankpa" })).status).toBe(400);
    expect((await put("nope")).status).toBe(400);
    expect(mockPrisma.speakerProfile.upsert).not.toHaveBeenCalled();
  });
});
