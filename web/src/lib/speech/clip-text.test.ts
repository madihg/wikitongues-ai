import { describe, it, expect, vi } from "vitest";
import { changedTextClipIds, dropChangedTextClips } from "./clip-text";
import {
  loadStudioRows,
  loadTestSetRows,
  loadTrainableRows,
} from "./loop-rows";
import { loadOpenRows } from "./open-rows";
import { buildOpenManifest } from "./manifest";
import { openRow } from "./fixtures";

/**
 * Seam c of the Nov 13 release: the dataset builder and the manifests skip a
 * clip whose text changed after it was recorded. A clip is used only while
 * its spoken text still matches the current answer text, after NFC.
 *
 * The story under test: a speaker recorded an answer, then edited the answer
 * in the new edit drawer, then recorded it again. Only the second clip says
 * what the answer says now. All texts are invented English placeholders.
 */

const T = (n: number) => new Date(Date.UTC(2026, 10, 13, 9, 0, n));

/** One answer, edited once at T(20). */
const revision = {
  id: "rev1",
  targetId: "ans-1",
  field: "answerText",
  before: "the market opens at dawn",
  after: "the market opens at noon",
  createdAt: T(20),
};

const clip = (
  id: string,
  createdAt: Date,
  over: Record<string, unknown> = {},
) =>
  openRow({
    id,
    storagePath: `clips/${id}.webm`,
    coldAuthorAnswer: { answerText: "the market opens at noon" },
    ...over,
    ...({ coldAuthorAnswerId: "ans-1", createdAt } as object),
  });

const before = clip("before-edit", T(10));
const after = clip("after-edit", T(30));
const untouched = openRow({
  id: "other-answer",
  storagePath: "clips/other-answer.webm",
  ...({ coldAuthorAnswerId: "ans-2", createdAt: T(5) } as object),
});

function db(
  rows: unknown[],
  revisions: unknown[] | (() => Promise<unknown[]>) = [revision],
) {
  return {
    speechRecording: { findMany: vi.fn().mockResolvedValue(rows) },
    consentGrant: { findMany: vi.fn().mockResolvedValue([]) },
    speakerProfile: { findMany: vi.fn().mockResolvedValue([]) },
    answerRevision: {
      findMany:
        typeof revisions === "function"
          ? vi.fn(revisions)
          : vi.fn().mockResolvedValue(revisions),
    },
  } as never;
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("a changed answer: the clip recorded before the edit is left out", () => {
  const rows = [before, after, untouched];

  it("the training rows", async () => {
    expect(ids(await loadTrainableRows(db(rows)))).toEqual([
      "after-edit",
      "other-answer",
    ]);
  });

  it("the exam rows", async () => {
    expect(ids(await loadTestSetRows(db(rows)))).toEqual([
      "after-edit",
      "other-answer",
    ]);
  });

  it("the studio rows of a voice job", async () => {
    expect(ids(await loadStudioRows(db(rows), ["sitting-1"]))).toEqual([
      "after-edit",
      "other-answer",
    ]);
  });

  it("the open export and its manifest", async () => {
    const lines = buildOpenManifest(await loadOpenRows(db(rows)));
    expect(lines.map((l) => l.clip)).toEqual([
      "clips/after-edit.webm",
      "clips/other-answer.webm",
    ]);
    // Without the rule the old clip would carry the new words as its transcript.
    expect(lines[0].transcript).toBe("the market opens at noon");
  });

  it("asks the log only about the answers the clips read, and only their spoken fields", async () => {
    const d = db(rows) as unknown as {
      answerRevision: { findMany: ReturnType<typeof vi.fn> };
    };
    await loadTrainableRows(d as never);
    expect(d.answerRevision.findMany).toHaveBeenCalledTimes(1);
    const { where } = d.answerRevision.findMany.mock.calls[0][0];
    expect(where.targetType).toBe("cold");
    expect([...where.targetId.in].sort()).toEqual(["ans-1", "ans-2"]);
    expect(where.field.in).toEqual([
      "answerText",
      "englishGloss",
      "englishTranslation",
    ]);
  });
});

describe("what does not make a clip stale", () => {
  it("an answer that was changed and then put back", async () => {
    const back = {
      ...revision,
      id: "rev2",
      before: "the market opens at noon",
      after: "the market opens at dawn",
      createdAt: T(25),
    };
    const out = await dropChangedTextClips(db([], [revision, back]), [
      before,
    ]);
    expect(ids(out)).toEqual(["before-edit"]);
  });

  it("a change of Unicode form or outer spaces alone", async () => {
    const nfd = "ẹ́";
    const formOnly = {
      ...revision,
      before: nfd.normalize("NFC"),
      after: ` ${nfd} `,
    };
    const out = await dropChangedTextClips(db([], [formOnly]), [before]);
    expect(ids(out)).toEqual(["before-edit"]);
  });

  it("a change to a field no clip reads", async () => {
    const dialect = { ...revision, field: "dialect" };
    const out = await dropChangedTextClips(db([], [dialect]), [before]);
    expect(ids(out)).toEqual(["before-edit"]);
  });

  it("a clip with no answer or no recording time (studio, imported) always passes", async () => {
    const studio = openRow({ id: "studio" });
    const d = db([]) as unknown as {
      answerRevision: { findMany: ReturnType<typeof vi.fn> };
    };
    expect(ids(await dropChangedTextClips(d as never, [studio]))).toEqual([
      "studio",
    ]);
    expect(d.answerRevision.findMany).not.toHaveBeenCalled();
  });
});

describe("English clips", () => {
  const english = (
    id: string,
    spokenText: string | null,
    englishTranslation: string | null,
  ) =>
    openRow({
      id,
      language: "english",
      spokenText,
      coldAuthorAnswer: {
        answerText: "x",
        englishGloss: "It means the market opens.",
        englishTranslation,
      },
      ...({ coldAuthorAnswerId: "ans-1", createdAt: T(10) } as object),
    });

  it("a clip that recorded its words is left out once the translation differs, log or no log", async () => {
    const rows = [
      english("same", "The market opens.", "The market opens."),
      english("form-only", "The market opens.", " The market opens. "),
      english("differs", "The market opens.", "The market is open at noon."),
      english("no-translation-now", "The market opens.", null),
    ];
    const changed = await changedTextClipIds({}, rows);
    expect([...changed]).toEqual(["differs"]);
  });

  it("an older clip that read the meaning follows the meaning", async () => {
    const meaning = {
      ...revision,
      field: "englishGloss",
      before: "It means the market opens.",
      after: "It means the market is open.",
    };
    const old = english("old-english", null, null);
    expect(ids(await dropChangedTextClips(db([], [meaning]), [old]))).toEqual(
      [],
    );
    // The Igala answer changing does not touch an English clip.
    expect(ids(await dropChangedTextClips(db([], [revision]), [old]))).toEqual([
      "old-english",
    ]);
  });
});

describe("when the edit log cannot be read", () => {
  it("no log table yet (migration not applied): nothing was edited, every clip passes", async () => {
    const missing = async () => {
      throw Object.assign(new Error("no table"), { code: "P2021" });
    };
    const out = await dropChangedTextClips(db([], missing), [before, after]);
    expect(ids(out)).toEqual(["before-edit", "after-edit"]);
  });

  it("any other failure stops the build: a dataset is never built on a guess", async () => {
    const down = async () => {
      throw new Error("connection lost");
    };
    await expect(
      dropChangedTextClips(db([], down), [before, after]),
    ).rejects.toThrow("connection lost");
  });

  it("a database handle without the log (older callers) passes every dated clip", async () => {
    const out = await dropChangedTextClips({}, [before, after]);
    expect(ids(out)).toEqual(["before-edit", "after-edit"]);
  });
});
