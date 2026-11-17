import { describe, expect, it } from "vitest";
import { shortMemo } from "./short-memo";

describe("shortMemo", () => {
  it("computes once inside the window, again after it", async () => {
    let calls = 0;
    let clock = 0;
    const get = shortMemo(1000, async () => ++calls, () => clock);
    expect(await get()).toBe(1);
    clock = 1000;
    expect(await get()).toBe(1);
    clock = 1001;
    expect(await get()).toBe(2);
  });

  it("callers that overlap share one run", async () => {
    let calls = 0;
    const get = shortMemo(1000, async () => ++calls, () => 0);
    const [a, b] = await Promise.all([get(), get()]);
    expect([a, b, calls]).toEqual([1, 1, 1]);
  });

  it("a failure is not kept", async () => {
    let calls = 0;
    const get = shortMemo(
      1000,
      async () => {
        if (++calls === 1) throw new Error("down");
        return calls;
      },
      () => 0,
    );
    await expect(get()).rejects.toThrow("down");
    expect(await get()).toBe(2);
  });
});
