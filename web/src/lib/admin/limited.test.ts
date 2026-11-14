import { describe, it, expect } from "vitest";
import { allLimited } from "./limited";

const tick = () => new Promise<void>((r) => setTimeout(r, 1));

describe("allLimited", () => {
  it("returns results in order, typed per task", async () => {
    const [a, b, c] = await allLimited([
      async () => 1,
      async () => "two",
      async () => [3],
    ]);
    expect(a + 1).toBe(2);
    expect(b.toUpperCase()).toBe("TWO");
    expect(c[0]).toBe(3);
  });

  it("never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    const task = async () => {
      running++;
      peak = Math.max(peak, running);
      await tick();
      running--;
      return peak;
    };
    await allLimited(
      Array.from({ length: 20 }, () => task),
      4,
    );
    expect(peak).toBe(4);
  });

  it("rejects when a task fails, and handles an empty list", async () => {
    await expect(
      allLimited([
        async () => 1,
        async () => {
          throw new Error("no");
        },
      ]),
    ).rejects.toThrow("no");
    expect(await allLimited([])).toEqual([]);
  });
});
