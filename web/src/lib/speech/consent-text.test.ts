import { describe, it, expect } from "vitest";
import {
  CONSENT_QUESTIONS,
  CONSENT_VERSION,
  IGALA_PLACEHOLDER,
  ORAL_SECTIONS,
  WRITTEN_SECTIONS,
  consentTextFor,
  consentTextHash,
} from "./consent-text";

describe("consent text", () => {
  it("has the agreed version string", () => {
    expect(CONSENT_VERSION).toBe("2026-10-19-v1");
  });

  it("explains withdrawal FIRST, in both the written text and the oral script", () => {
    expect(WRITTEN_SECTIONS[0].id).toBe("withdraw");
    expect(ORAL_SECTIONS[0].id).toBe("withdraw");
    expect(WRITTEN_SECTIONS[0].body).toMatch(/withdraw at any time/i);
    expect(ORAL_SECTIONS[0].body).toMatch(/stop at any time/i);
  });

  it("states that Open is permanent, in both forms", () => {
    for (const method of ["written", "oral"] as const) {
      expect(consentTextFor(method)).toMatch(/open is permanent/i);
    }
  });

  it("states that opting out cannot untrain a model, in both forms", () => {
    for (const method of ["written", "oral"] as const) {
      expect(consentTextFor(method)).toMatch(/model that has already/i);
    }
  });

  it("says royalties exist for licensed clips", () => {
    expect(consentTextFor("written")).toMatch(/royalt/i);
    expect(consentTextFor("oral")).toMatch(/paid a share/i);
  });

  it("asks the four questions separately and says none is ticked", () => {
    expect(CONSENT_QUESTIONS.map((q) => q.key)).toEqual([
      "commercialLicensing",
      "crossBorder",
      "voiceCloning",
      "speakerId",
    ]);
    expect(consentTextFor("written")).toMatch(/None is ticked for you/);
    expect(consentTextFor("oral")).toMatch(/the answer is no/i);
  });

  it("keeps sentences short (simple English)", () => {
    for (const method of ["written", "oral"] as const) {
      const sentences = consentTextFor(method)
        .split(/(?<=[.?!])\s+|\n+/)
        .filter(Boolean);
      for (const s of sentences) {
        expect(s.split(/\s+/).length, s).toBeLessThanOrEqual(45);
      }
    }
  });

  it("has an Igala placeholder and no Igala text", () => {
    expect(IGALA_PLACEHOLDER).toMatch(/^\[Igala version/);
  });

  it("uses no em dashes", () => {
    for (const method of ["written", "oral"] as const) {
      expect(consentTextFor(method)).not.toContain(String.fromCharCode(0x2014));
    }
  });
});

describe("consentTextHash", () => {
  it("is a stable sha256 hex digest", () => {
    // sha256("abc"), the standard test vector.
    expect(consentTextHash("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(consentTextHash("abc")).toBe(consentTextHash("abc"));
  });

  it("differs between the written text and the oral script, and on any edit", () => {
    const w = consentTextHash(consentTextFor("written"));
    const o = consentTextHash(consentTextFor("oral"));
    expect(w).not.toBe(o);
    expect(consentTextHash(consentTextFor("written") + " ")).not.toBe(w);
    expect(w).toMatch(/^[0-9a-f]{64}$/);
  });
});
