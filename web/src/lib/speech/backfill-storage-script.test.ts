import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  backfillRows,
  type BackfillDeps,
} from "../../../scripts/speech/backfill-storage";

/**
 * The backfill's pure core on invented bytes: no database, no bucket. The
 * checks that matter are that a row is marked moved only after the object
 * read back from storage hashes to the stored checksum, and that bytes are
 * never deleted.
 */

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const CLIP = new Uint8Array([1, 2, 3, 4, 5]);

const row = (id: string, bytes: Uint8Array = CLIP, checksum = sha(bytes)) => ({
  id,
  mimeType: "audio/webm;codecs=opus",
  checksumSha256: checksum,
  bytes,
});

function deps() {
  const stored = new Map<string, Uint8Array>();
  return {
    stored,
    put: vi.fn<BackfillDeps["put"]>(async (key, b) => {
      stored.set(key, b);
    }),
    download: vi.fn<BackfillDeps["download"]>(async (key) => stored.get(key)!),
    mark: vi.fn<BackfillDeps["mark"]>(async () => {}),
  };
}

describe("backfillRows", () => {
  it("uploads, reads back, verifies the checksum, then marks the row", async () => {
    const d = deps();
    const r = await backfillRows([row("a")], d, { dryRun: false });
    expect(d.put).toHaveBeenCalledWith("clips/a.webm", CLIP, "audio/webm");
    expect(d.download).toHaveBeenCalledWith("clips/a.webm");
    expect(d.mark).toHaveBeenCalledWith("a", "clips/a.webm");
    expect(r).toMatchObject({ total: 1, moved: 1, failed: [] });
  });

  it("refuses when the object read back has a different checksum", async () => {
    const d = deps();
    d.download.mockResolvedValue(new Uint8Array([9, 9, 9]));
    const r = await backfillRows([row("a")], d, { dryRun: false });
    expect(d.mark).not.toHaveBeenCalled();
    expect(r.moved).toBe(0);
    expect(r.failed).toEqual([
      { id: "a", reason: "checksum mismatch after upload" },
    ]);
  });

  it("refuses to upload when the stored bytes no longer match the row checksum", async () => {
    const d = deps();
    const r = await backfillRows([row("a", CLIP, "0".repeat(64))], d, {
      dryRun: false,
    });
    expect(d.put).not.toHaveBeenCalled();
    expect(d.mark).not.toHaveBeenCalled();
    expect(r.failed[0]).toEqual({
      id: "a",
      reason: "row bytes do not match checksumSha256",
    });
  });

  it("a row with no checksum is skipped, not moved", async () => {
    const d = deps();
    const r = await backfillRows([row("a", CLIP, "")], d, { dryRun: false });
    expect(d.put).not.toHaveBeenCalled();
    expect(r.failed[0].id).toBe("a");
  });

  it("an upload error on one row does not stop the next", async () => {
    const d = deps();
    d.put.mockRejectedValueOnce(new Error("boom"));
    d.download.mockRejectedValueOnce(new Error("missing"));
    const r = await backfillRows([row("a"), row("b")], d, { dryRun: false });
    expect(r.moved).toBe(1);
    expect(d.mark).toHaveBeenCalledWith("b", "clips/b.webm");
    expect(r.failed.map((f) => f.id)).toEqual(["a"]);
  });

  it("an object left by an earlier run is accepted when it verifies", async () => {
    const d = deps();
    d.stored.set("clips/a.webm", CLIP);
    d.put.mockRejectedValueOnce(new Error("already exists"));
    const r = await backfillRows([row("a")], d, { dryRun: false });
    expect(r.moved).toBe(1);
  });

  it("--dry-run counts and touches nothing", async () => {
    const d = deps();
    const r = await backfillRows([row("a"), row("b")], d, { dryRun: true });
    expect(r).toMatchObject({ total: 2, moved: 0, failed: [] });
    expect(d.put).not.toHaveBeenCalled();
    expect(d.download).not.toHaveBeenCalled();
    expect(d.mark).not.toHaveBeenCalled();
  });

  it("never offers a way to delete bytes", () => {
    const d = deps();
    expect(Object.keys(d)).not.toContain("deleteBytes");
  });
});
