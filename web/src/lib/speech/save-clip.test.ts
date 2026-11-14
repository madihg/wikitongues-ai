import { describe, it, expect, vi } from "vitest";
import { SaveError, saveClip, type SaveDeps, type SavedRow } from "./save-clip";

const blob = new Blob(["audio"], { type: "audio/webm" });
const ROW = { id: "rec-1", audioUrl: "/api/lab/speech/recording/rec-1/audio" };

function deps(over: Partial<SaveDeps> = {}) {
  return {
    createRow: vi.fn(async () => ({
      ok: true,
      status: 201,
      json: { ...ROW, coldAuthorAnswerId: "ans-1" },
    })),
    putAudio: vi.fn(async () => undefined),
    ...over,
  } satisfies SaveDeps;
}

const run = (d: SaveDeps, existing: SavedRow | null = null) => {
  const onRow = vi.fn();
  const onProgress = vi.fn();
  const p = saveClip(d, {
    body: { promptId: "code_001", tier: "community_only" },
    blob,
    existing,
    onRow,
    onProgress,
  });
  return { p, onRow, onProgress };
};

describe("saveClip", () => {
  it("creates the row first, then PUTs the audio to the URL it returned", async () => {
    const d = deps();
    const { p, onRow } = run(d);
    const row = await p;
    expect(d.createRow).toHaveBeenCalledWith({
      promptId: "code_001",
      tier: "community_only",
    });
    expect(d.putAudio).toHaveBeenCalledWith(ROW.audioUrl, blob, expect.any(Function));
    expect(vi.mocked(d.createRow).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(d.putAudio).mock.invocationCallOrder[0],
    );
    expect(row).toEqual({ ...ROW, coldAuthorAnswerId: "ans-1" });
    expect(onRow).toHaveBeenCalledWith(row);
  });

  it("a failed PUT keeps the row, and the retry repeats only the PUT (never a second row)", async () => {
    const d = deps({
      putAudio: vi
        .fn()
        .mockRejectedValueOnce(new Error("Upload failed. Check your connection."))
        .mockResolvedValueOnce(undefined),
    });
    const first = run(d);
    await expect(first.p).rejects.toThrow("Upload failed");
    expect(first.onRow).toHaveBeenCalledTimes(1); // the caller now holds the row
    const held = first.onRow.mock.calls[0][0] as SavedRow;

    const second = run(d, held);
    await expect(second.p).resolves.toMatchObject({ id: "rec-1" });
    expect(d.createRow).toHaveBeenCalledTimes(1);
    expect(d.putAudio).toHaveBeenCalledTimes(2);
    expect(second.onRow).not.toHaveBeenCalled();
  });

  it("a refused row never reaches the PUT, and carries the status (428 is consent again)", async () => {
    const d = deps({
      createRow: vi.fn(async () => ({
        ok: false,
        status: 428,
        json: { error: "Consent is required before recording." },
      })),
    });
    const { p, onRow } = run(d);
    await expect(p).rejects.toMatchObject({
      name: "SaveError",
      status: 428,
      message: "Consent is required before recording.",
    });
    expect(d.putAudio).not.toHaveBeenCalled();
    expect(onRow).not.toHaveBeenCalled();
  });

  it("an unreadable or incomplete answer is a plain failure, not a crash", async () => {
    for (const json of [null, {}, { id: "x" }]) {
      const d = deps({
        createRow: vi.fn(async () => ({ ok: true, status: 201, json })),
      });
      await expect(run(d).p).rejects.toBeInstanceOf(SaveError);
      expect(d.putAudio).not.toHaveBeenCalled();
    }
  });

  it("passes progress through", async () => {
    const d = deps({
      putAudio: vi.fn(async (_u, _b, onProgress) => onProgress(55)),
    });
    const { p, onProgress } = run(d);
    await p;
    expect(onProgress).toHaveBeenCalledWith(55);
  });
});
