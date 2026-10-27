import { describe, it, expect, afterEach } from "vitest";
import { buildOpenManifest, speakerPseudonym, toJsonl } from "./manifest";
import { licensedRow, openRow } from "./fixtures";
import { ORTHOGRAPHY_VERSION } from "./normalise";

const TONE = String.fromCharCode(0x301);

describe("buildOpenManifest", () => {
  it("emits the PRD fields for an exportable row", () => {
    const [line] = buildOpenManifest([
      openRow({
        dialect: "synthetic-dialect",
        coldAuthorAnswer: { answerText: `ba${TONE}do` },
      }),
    ]);
    expect(line).toMatchObject({
      clip: "clips/synthetic-1.webm",
      transcript: `ba${TONE}do`.normalize("NFC"),
      transcriptToneStripped: "bado",
      dialect: "synthetic-dialect",
      tier: "open",
      consentVersion: "2026-10-19-v1",
      fundingSource: "unknown",
      license: "CC-BY-4.0",
      orthographyVersion: ORTHOGRAPHY_VERSION,
    });
    expect(line.speaker).toMatch(/^spk_[0-9a-f]{12}$/);
  });

  it("an Igala clip's transcript is the locked answer and says igala", () => {
    const [line] = buildOpenManifest([
      openRow({
        coldAuthorAnswer: { answerText: "an answer", englishGloss: "its meaning" },
      }),
    ]);
    expect(line.language).toBe("igala");
    expect(line.transcript).toBe("an answer");
  });

  it("an English clip's transcript is the locked meaning, else the prompt text it was read from", () => {
    const base = {
      language: "english",
      coldAuthorAnswer: { answerText: "an answer", englishGloss: "  its meaning " },
      prompt: { isHoldout: false, split: "train", text: "Say hello." },
    };
    const [withGloss] = buildOpenManifest([openRow(base)]);
    expect(withGloss.language).toBe("english");
    expect(withGloss.transcript).toBe("its meaning");
    expect(withGloss.transcriptToneStripped).toBe("its meaning");

    const [noGloss] = buildOpenManifest([
      openRow({
        ...base,
        coldAuthorAnswer: { answerText: "an answer", englishGloss: "  " },
      }),
    ]);
    expect(noGloss.transcript).toBe("Say hello.");

    const [nothing] = buildOpenManifest([
      openRow({ ...base, coldAuthorAnswer: null, prompt: { isHoldout: false, split: "train" } }),
    ]);
    expect(nothing.transcript).toBeNull();
  });

  it("never carries the account id, a URL, or a consent id", () => {
    const text = toJsonl(buildOpenManifest([openRow()]));
    expect(text).not.toContain("speaker-account-1");
    expect(text).not.toContain("consent-1");
    expect(text).not.toMatch(/https?:/);
  });

  it("drops every row the guard refuses and keeps the rest", () => {
    const rows = [
      openRow({ id: "ok" }),
      openRow({ id: "a", tier: "community_only" }),
      openRow({ id: "b", isTestSet: true }),
      openRow({ id: "c", isDemo: true }),
      openRow({ id: "d", consentId: null }),
      openRow({ id: "e", reviewStatus: "bad_audio" }),
      openRow({ id: "f", prompt: { isHoldout: true, split: "test" } }),
      licensedRow({ id: "g" }),
    ];
    expect(buildOpenManifest(rows)).toHaveLength(1);
  });

  it("a row with no attached transcript still exports, with null transcripts", () => {
    const [line] = buildOpenManifest([openRow({ coldAuthorAnswer: null })]);
    expect(line.transcript).toBeNull();
    expect(line.transcriptToneStripped).toBeNull();
  });

  it("returns an empty list for no rows", () => {
    expect(buildOpenManifest([])).toEqual([]);
  });
});

describe("toJsonl", () => {
  it("writes one parseable object per line, newline-terminated", () => {
    const lines = buildOpenManifest([
      openRow({ id: "1" }),
      openRow({ id: "2" }),
    ]);
    const out = toJsonl(lines);
    expect(out.endsWith("\n")).toBe(true);
    const parsed = out
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(parsed).toHaveLength(2);
    expect(parsed[0].license).toBe("CC-BY-4.0");
  });

  it("is the empty string for no lines", () => {
    expect(toJsonl([])).toBe("");
  });
});

describe("speakerPseudonym", () => {
  const original = process.env.SPEECH_PSEUDONYM_SALT;
  afterEach(() => {
    if (original === undefined) delete process.env.SPEECH_PSEUDONYM_SALT;
    else process.env.SPEECH_PSEUDONYM_SALT = original;
  });

  it("is stable per speaker and differs between speakers", () => {
    expect(speakerPseudonym("a")).toBe(speakerPseudonym("a"));
    expect(speakerPseudonym("a")).not.toBe(speakerPseudonym("b"));
  });

  it("changes with the salt, so ids cannot be recomputed without it", () => {
    const before = speakerPseudonym("a");
    process.env.SPEECH_PSEUDONYM_SALT = "another-salt";
    expect(speakerPseudonym("a")).not.toBe(before);
  });

  it("labels a missing speaker unknown", () => {
    expect(speakerPseudonym(null)).toBe("spk_unknown");
  });
});
