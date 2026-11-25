import { describe, it, expect } from "vitest";
import { MAX_STALLS, uploadInParts, type PartAnswer } from "./upload-parts";

/** A fake server that follows the PUT rules: it appends only at what it holds. */
function server(total: number) {
  let held = 0;
  const sent: { offset: number; size: number }[] = [];
  return {
    sent,
    get held() {
      return held;
    },
    put: async (part: Blob, offset: number, t: number): Promise<PartAnswer> => {
      expect(t).toBe(total);
      sent.push({ offset, size: part.size });
      if (offset === 0) held = part.size;
      else if (offset === held) held += part.size;
      return { received: held, complete: held === total };
    },
  };
}

const blob = (n: number) => new Blob([new Uint8Array(n)]);

describe("uploadInParts", () => {
  it("sends a long take in order, in parts of the given size, and ends at 100%", async () => {
    const s = server(10);
    const seen: number[] = [];
    await uploadInParts(blob(10), s.put, (p) => seen.push(p), 4);
    expect(s.sent).toEqual([
      { offset: 0, size: 4 },
      { offset: 4, size: 4 },
      { offset: 8, size: 2 },
    ]);
    expect(seen.at(-1)).toBe(100);
    expect(seen.every((p, i) => i === 0 || p >= seen[i - 1])).toBe(true);
  });

  it("carries on from what the server says it holds, not from what it sent", async () => {
    // The answer to part 2 was lost the first time: the server already holds 8.
    let calls = 0;
    const sent: number[] = [];
    await uploadInParts(
      blob(10),
      async (part, offset) => {
        sent.push(offset);
        calls += 1;
        if (calls === 1) return { received: 8, complete: false };
        return { received: offset + part.size, complete: offset + part.size === 10 };
      },
      () => undefined,
      4,
    );
    expect(sent).toEqual([0, 8]);
  });

  it("gives up after repeated answers that do not move forward", async () => {
    let calls = 0;
    await expect(
      uploadInParts(
        blob(10),
        async () => {
          calls += 1;
          return { received: 0, complete: false };
        },
        () => undefined,
        4,
      ),
    ).rejects.toThrow(/not moving/);
    expect(calls).toBe(MAX_STALLS);
  });

  it("refuses to spin when the server holds everything but does not call it complete", async () => {
    await expect(
      uploadInParts(blob(10), async () => ({ received: 10, complete: false }), () => undefined, 4),
    ).rejects.toThrow(/did not finish/);
  });

  it("refuses an empty take", async () => {
    await expect(
      uploadInParts(blob(0), async () => ({ received: 0, complete: true }), () => undefined),
    ).rejects.toThrow(/empty/);
  });
});
