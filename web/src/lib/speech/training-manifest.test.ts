import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  buildTrainingManifest,
  buildEvalManifest,
} from "./training-manifest";
import { ORTHOGRAPHY_VERSION } from "./normalise";
import { speakerPseudonym } from "./manifest";
import { openRow } from "./fixtures";
import type { ManifestRow } from "./manifest";

const signedUrl = (key: string) => `https://signed.example/${key}?t=1`;
const opts = { scope: "internal", purpose: "asr", signedUrl } as const;

const HOUR = 3_600_000;
const row = (id: string, over: Partial<ManifestRow> = {}) =>
  openRow({ id, storagePath: `clips/${id}.webm`, ...over });

describe("buildTrainingManifest", () => {
  it("keeps only rows canTrain allows", () => {
    const rows = [
      row("ok"),
      row("test", { isTestSet: true }),
      row("demo", { isDemo: true }),
      row("bad", { reviewStatus: "bad_audio" }),
      row("frozen", { prompt: { isHoldout: true, split: "train" } }),
      row("noconsent", { consentId: null }),
    ];
    const m = buildTrainingManifest(rows, opts);
    expect(m.lines.map((l) => l.id)).toEqual(["ok"]);
  });

  it("a provider scope drops community_only rows", () => {
    const rows = [row("a"), row("c", { tier: "community_only" })];
    const m = buildTrainingManifest(rows, { ...opts, scope: "provider" });
    expect(m.lines.map((l) => l.id)).toEqual(["a"]);
  });

  it("line fields: signed url, transcript, stripped transcript, pseudonym", () => {
    const r = row("a", {
      dialect: "north",
      durationMs: 1500,
      coldAuthorAnswer: { answerText: "Ọ̀kpa mé" },
    });
    const [line] = buildTrainingManifest([r], opts).lines;
    expect(line).toEqual({
      id: "a",
      url: "https://signed.example/clips/a.webm?t=1",
      durationMs: 1500,
      language: "igala",
      transcript: "Ọ̀kpa mé".normalize("NFC"),
      transcriptStripped: "Ọkpa me".normalize("NFC"),
      speakerPseudonym: speakerPseudonym("speaker-account-1"),
      dialect: "north",
      tier: "open",
    });
  });

  it("asks for the object key when the clip lives in the bucket", () => {
    const r = { ...row("a"), storageKey: "bucket/a.webm" } as ManifestRow;
    const [line] = buildTrainingManifest([r], opts).lines;
    expect(line.url).toContain("bucket/a.webm");
  });

  it("a studio clip's transcript is the script line it read, and purpose tts keeps it", () => {
    const r = row("studio", {
      tier: "community_only",
      coldAuthorAnswer: null,
      studioText: "Kw\u00e0 gb\u1ecd",
    });
    const [line] = buildTrainingManifest([r], { ...opts, purpose: "tts" }).lines;
    expect(line.transcript).toBe("Kw\u00e0 gb\u1ecd".normalize("NFC"));
    expect(line.transcriptStripped).toBe("Kwa gb\u1ecd".normalize("NFC"));
    expect(line.tier).toBe("community_only");
  });

  it("a studio clip that is not kept, or sits on a frozen prompt, is still refused", () => {
    const m = buildTrainingManifest(
      [
        row("unreviewed", { studioText: "kwa gbo", reviewStatus: null }),
        row("frozen", { studioText: "kwa gbo", prompt: { isHoldout: true, split: "train" } }),
        row("exam", { studioText: "kwa gbo", isTestSet: true }),
      ],
      { ...opts, purpose: "tts" },
    );
    expect(m.lines).toEqual([]);
  });

  it("drops a clip with nothing to say (no transcript)", () => {
    const m = buildTrainingManifest(
      [row("a", { coldAuthorAnswer: null }), row("b")],
      opts,
    );
    expect(m.lines.map((l) => l.id)).toEqual(["b"]);
  });

  it("is deterministic: same rows, same version, whatever the order", () => {
    const rows = [row("b"), row("a"), row("c")];
    const one = buildTrainingManifest(rows, opts);
    const two = buildTrainingManifest([...rows].reverse(), opts);
    expect(one.version).toBe(two.version);
    expect(one.lines.map((l) => l.id)).toEqual(two.lines.map((l) => l.id));
  });

  it("version is sha256 of the sorted ids joined by newline, plus the orthography version", () => {
    const expected = createHash("sha256")
      .update(`a\nb\nc\n${ORTHOGRAPHY_VERSION}`)
      .digest("hex");
    expect(
      buildTrainingManifest([row("c"), row("a"), row("b")], opts).version,
    ).toBe(expected);
  });

  it("a different clip set gives a different version", () => {
    const a = buildTrainingManifest([row("a"), row("b")], opts).version;
    const b = buildTrainingManifest([row("a"), row("c")], opts).version;
    expect(a).not.toBe(b);
  });

  it("a refused row does not change the version", () => {
    const a = buildTrainingManifest([row("a")], opts).version;
    const b = buildTrainingManifest([row("a"), row("t", { isTestSet: true })], opts)
      .version;
    expect(a).toBe(b);
  });

  it("hours add up by total, tier, speaker and dialect", () => {
    const rows = [
      row("a", { durationMs: HOUR, annotatorId: "s1", dialect: "north" }),
      row("b", { durationMs: HOUR / 2, annotatorId: "s1", dialect: null }),
      row("c", {
        durationMs: HOUR / 2,
        annotatorId: "s2",
        dialect: "north",
        tier: "community_only",
        publishedOpenAt: null,
      }),
    ];
    const { hours } = buildTrainingManifest(rows, opts);
    expect(hours.total).toBeCloseTo(2);
    expect(hours.byTier.open).toBeCloseTo(1.5);
    expect(hours.byTier.community_only).toBeCloseTo(0.5);
    expect(hours.bySpeaker[speakerPseudonym("s1")]).toBeCloseTo(1.5);
    expect(hours.bySpeaker[speakerPseudonym("s2")]).toBeCloseTo(0.5);
    expect(hours.byDialect.north).toBeCloseTo(1.5);
    expect(hours.byDialect.unknown).toBeCloseTo(0.5);
    const sum = (o: Record<string, number>) =>
      Object.values(o).reduce((s, n) => s + n, 0);
    for (const part of [hours.byTier, hours.bySpeaker, hours.byDialect]) {
      expect(sum(part)).toBeCloseTo(hours.total);
    }
  });

  it("an empty set is a valid manifest with zero hours", () => {
    const m = buildTrainingManifest([], opts);
    expect(m.lines).toEqual([]);
    expect(m.hours.total).toBe(0);
  });
});

describe("buildEvalManifest", () => {
  it("includes test-set rows only", () => {
    const rows = [row("train"), row("exam", { isTestSet: true })];
    const m = buildEvalManifest(rows, opts);
    expect(m.lines.map((l) => l.id)).toEqual(["exam"]);
  });

  it("keeps a frozen-prompt test clip, refuses demo and rejected ones", () => {
    const rows = [
      row("frozen", {
        isTestSet: true,
        prompt: { isHoldout: true, split: "test" },
      }),
      row("demo", { isTestSet: true, isDemo: true }),
      row("bad", { isTestSet: true, reviewStatus: "wrong_text" }),
    ];
    expect(buildEvalManifest(rows, opts).lines.map((l) => l.id)).toEqual([
      "frozen",
    ]);
  });

  it("has its own version and hours", () => {
    const rows = [row("e1", { isTestSet: true, durationMs: HOUR })];
    const m = buildEvalManifest(rows, opts);
    expect(m.hours.total).toBeCloseTo(1);
    expect(m.version).toBe(buildEvalManifest(rows, opts).version);
  });
});
